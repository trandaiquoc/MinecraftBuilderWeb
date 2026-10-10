import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { InstanceBatchRenderer } from '../batching/instance-batch-renderer';
import type { InstancePartTemplate } from '../batching/instance-template-cache';
import {
  SurfaceFaceBatchRenderer,
  type SurfaceFaceTemplate,
} from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { RenderRegionPolicy } from '../batching/render-region-policy';
import {
  ChunkSurfaceRenderer,
  type TerrainSettlement,
  type TerrainSurfaceRecord,
} from '../terrain/chunk-surface-renderer';
import type { TerrainClassificationEntry } from '../terrain/terrain-classifier';
import {
  FluidChunkRenderer,
  type FluidChunkRecord,
  type FluidChunkVisualProvider,
} from '../fluids/fluid-chunk-renderer';
import type { FluidWorldLookup } from '../fluids/fluid-state';

export interface IsolateBlockVisualSnapshot {
  readonly key: string;
  readonly block: PlacedBlock;
  readonly terrain?: TerrainSurfaceRecord;
  readonly instanceTemplates?: readonly InstancePartTemplate[];
  readonly surfaceTemplates?: readonly SurfaceFaceTemplate[];
  readonly surfaceDirections?: ReadonlySet<SurfaceFaceDirection>;
  readonly fluid?: FluidChunkRecord;
  readonly standalone?: THREE.Object3D;
}

export interface IsolateDecorationVisualSnapshot {
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly object?: THREE.Object3D;
}

export interface GroupIsolationSnapshot {
  readonly blocks: readonly IsolateBlockVisualSnapshot[];
  readonly decorations: readonly IsolateDecorationVisualSnapshot[];
  readonly fluidProvider?: FluidChunkVisualProvider;
  readonly fluidWorld: FluidWorldLookup;
  readonly isolateKeys?: ReadonlySet<string>;
}

export type GroupIsolationPresentationState = 'inactive' | 'preparing' | 'active';

export interface GroupIsolationDiagnostics {
  readonly active: boolean;
  readonly state: GroupIsolationPresentationState;
  readonly generation: number;
  readonly requestedGeneration: number;
  readonly activeGeneration: number;
  readonly requestedTargetBlocks: number;
  readonly activeTargetBlocks: number;
  readonly targetBlocks: number;
  readonly terrainChunks: number;
  readonly instanceMembers: number;
  readonly fluidVoxels: number;
  readonly standaloneObjects: number;
  readonly buildCount: number;
  readonly prepareCount: number;
  readonly commitCount: number;
  readonly cancelCount: number;
  readonly atomicSwapCount: number;
  readonly createdBundleCount: number;
  readonly disposeRequestedCount: number;
  readonly disposeCount: number;
  readonly disposedBundleCount: number;
  readonly activeBundleCount: number;
  readonly stagingBundleCount: number;
  readonly lastBuildMs: number;
  readonly lastSynchronousBuildMs: number;
  readonly lastSnapshotMs: number;
  readonly lastTerrainReadyMs: number;
  readonly lastFluidReadyMs: number;
  readonly lastTimeToReadyMs: number;
  readonly lastDisposeMs: number;
}

interface IsolationBundle {
  readonly generation: number;
  readonly snapshot: GroupIsolationSnapshot;
  readonly root: THREE.Group;
  readonly temporaryEntries: Map<string, { object?: THREE.Object3D }>;
  disposed: boolean;
  terrain?: ChunkSurfaceRenderer;
  instances?: InstanceBatchRenderer;
  surfaces?: SurfaceFaceBatchRenderer;
  fluids?: FluidChunkRenderer;
  terrainReady: Promise<TerrainSettlement>;
  fluidReady: Promise<void>;
  readonly preparedAt: number;
  terrainReadyMs: number;
  fluidReadyMs: number;
  readySynchronously: boolean;
  fluidFailed: boolean;
}

interface GroupIsolationPresentationListeners {
  readonly onChanged?: () => void;
  readonly onCommitted?: (keys: ReadonlySet<string>, generation: number) => void;
  readonly onDeactivated?: () => void;
  readonly onFailed?: (generation: number) => void;
}

/** Presentation-only isolate renderer with an atomic staging/active handoff. */
export class GroupIsolationPresentation {
  readonly root = new THREE.Group();
  private stateValue: GroupIsolationPresentationState = 'inactive';
  private generationValue = 0;
  private activeBundle?: IsolationBundle;
  private stagingBundle?: IsolationBundle;
  private listeners: GroupIsolationPresentationListeners;
  private readonly diagnosticsState = {
    active: false,
    state: 'inactive' as GroupIsolationPresentationState,
    generation: 0,
    requestedGeneration: 0,
    activeGeneration: 0,
    requestedTargetBlocks: 0,
    activeTargetBlocks: 0,
    targetBlocks: 0,
    terrainChunks: 0,
    instanceMembers: 0,
    fluidVoxels: 0,
    standaloneObjects: 0,
    buildCount: 0,
    prepareCount: 0,
    commitCount: 0,
    cancelCount: 0,
    atomicSwapCount: 0,
    createdBundleCount: 0,
    disposeRequestedCount: 0,
    disposeCount: 0,
    disposedBundleCount: 0,
    lastBuildMs: 0,
    lastSynchronousBuildMs: 0,
    lastSnapshotMs: 0,
    lastTerrainReadyMs: 0,
    lastFluidReadyMs: 0,
    lastTimeToReadyMs: 0,
    lastDisposeMs: 0,
  };
  private readonly regionPolicy = new RenderRegionPolicy(32);

  constructor(
    private readonly canonicalRoot: THREE.Group,
    listeners?: GroupIsolationPresentationListeners | (() => void),
  ) {
    this.root.name = 'groupIsolationPresentation';
    this.root.visible = false;
    this.listeners = typeof listeners === 'function' ? { onChanged: listeners } : (listeners ?? {});
  }

  setChangeListener(listener: (() => void) | undefined): void {
    this.listeners = { ...this.listeners, onChanged: listener };
  }

  prepare(snapshot: GroupIsolationSnapshot): void {
    const started = now();
    const generation = ++this.generationValue;
    this.diagnosticsState.generation = generation;
    this.diagnosticsState.requestedGeneration = generation;
    this.diagnosticsState.prepareCount += 1;
    this.diagnosticsState.targetBlocks = snapshot.blocks.length;
    this.diagnosticsState.requestedTargetBlocks = snapshot.blocks.length;
    this.diagnosticsState.lastSnapshotMs = Math.max(0, now() - started);
    if (this.stagingBundle) {
      this.diagnosticsState.cancelCount += 1;
      this.diagnosticsState.disposeRequestedCount += 1;
      this.disposeBundle(this.stagingBundle);
      this.stagingBundle = undefined;
    }
    this.stateValue = 'preparing';
    this.diagnosticsState.state = this.stateValue;
    this.diagnosticsState.active = !!this.activeBundle;
    if (!this.activeBundle) {
      this.root.visible = false;
      this.canonicalRoot.visible = true;
    }
    const bundle = this.buildBundle(snapshot, generation);
    this.stagingBundle = bundle;
    this.diagnosticsState.createdBundleCount += 1;
    this.diagnosticsState.buildCount += 1;
    this.diagnosticsState.lastSynchronousBuildMs = Math.max(0, now() - started);
    this.diagnosticsState.lastBuildMs = this.diagnosticsState.lastSynchronousBuildMs;
    const settle = () =>
      Promise.all([bundle.terrainReady, bundle.fluidReady]).then(([terrain]) => {
        if (generation !== this.generationValue || this.stagingBundle !== bundle) return;
        if (terrain.status === 'cancelled' || terrain.status === 'failed' || bundle.fluidFailed) {
          this.diagnosticsState.cancelCount += terrain.status === 'cancelled' ? 1 : 0;
          this.stagingBundle = undefined;
          this.diagnosticsState.disposeRequestedCount += 1;
          this.disposeBundle(bundle);
          this.stateValue = this.activeBundle ? 'active' : 'inactive';
          this.diagnosticsState.state = this.stateValue;
          this.diagnosticsState.active = !!this.activeBundle;
          this.diagnosticsState.targetBlocks = this.activeBundle?.snapshot.blocks.length ?? 0;
          this.diagnosticsState.requestedTargetBlocks = this.diagnosticsState.targetBlocks;
          this.diagnosticsState.activeTargetBlocks = this.activeBundle?.snapshot.blocks.length ?? 0;
          this.diagnosticsState.terrainChunks = this.activeBundle?.terrain?.chunkCount ?? 0;
          this.diagnosticsState.instanceMembers =
            this.activeBundle?.snapshot.blocks.filter((entry) => !!entry.instanceTemplates)
              .length ?? 0;
          this.diagnosticsState.fluidVoxels =
            this.activeBundle?.snapshot.blocks.filter((entry) => !!entry.fluid).length ?? 0;
          if (this.listeners.onFailed) this.listeners.onFailed(generation);
          else this.listeners.onChanged?.();
          return;
        }
        this.commit(bundle);
      });
    if (bundle.readySynchronously) this.commit(bundle);
    else void settle();
  }

  activate(snapshot: GroupIsolationSnapshot): void {
    this.prepare(snapshot);
  }

  deactivate(): void {
    const hadPresentation =
      !!this.activeBundle || !!this.stagingBundle || this.stateValue !== 'inactive';
    if (!hadPresentation) return;
    const started = now();
    ++this.generationValue;
    this.diagnosticsState.generation = this.generationValue;
    const staging = this.stagingBundle;
    const active = this.activeBundle;
    this.stagingBundle = undefined;
    this.activeBundle = undefined;
    this.root.visible = false;
    this.canonicalRoot.visible = true;
    this.stateValue = 'inactive';
    this.diagnosticsState.active = false;
    this.diagnosticsState.state = 'inactive';
    this.diagnosticsState.activeGeneration = 0;
    this.diagnosticsState.requestedTargetBlocks = 0;
    this.diagnosticsState.activeTargetBlocks = 0;
    this.diagnosticsState.targetBlocks = 0;
    this.diagnosticsState.terrainChunks = 0;
    this.diagnosticsState.instanceMembers = 0;
    this.diagnosticsState.fluidVoxels = 0;
    this.diagnosticsState.standaloneObjects = 0;
    this.diagnosticsState.disposeRequestedCount += (staging ? 1 : 0) + (active ? 1 : 0);
    this.diagnosticsState.lastDisposeMs = Math.max(0, now() - started);
    if (this.listeners.onDeactivated) this.listeners.onDeactivated();
    else this.listeners.onChanged?.();
    // Make the canonical scene available before releasing potentially large
    // temporary batches. A later prepare cannot observe these bundles because
    // the committed references were cleared above.
    void Promise.resolve().then(() => {
      if (staging) this.disposeBundle(staging);
      if (active) this.disposeBundle(active);
    });
  }

  refresh(snapshot: GroupIsolationSnapshot): void {
    if (this.stateValue !== 'inactive' || this.activeBundle) this.prepare(snapshot);
  }

  state(): GroupIsolationPresentationState {
    return this.stateValue;
  }
  /** True when a committed bundle is available, including while a refresh stages. */
  isActive(): boolean {
    return !!this.activeBundle;
  }
  activeKeys(): ReadonlySet<string> {
    return this.activeBundle?.snapshot.isolateKeys ?? new Set<string>();
  }
  objectsForKey(key: string): readonly THREE.Object3D[] {
    const object = this.activeBundle?.temporaryEntries.get(key)?.object;
    return object ? [object] : [];
  }
  fluidCoordinateOwner(key: string): boolean {
    return this.activeBundle?.fluids?.hasVoxel(key) ?? false;
  }
  diagnostics(): GroupIsolationDiagnostics {
    return {
      ...this.diagnosticsState,
      activeBundleCount: this.activeBundle ? 1 : 0,
      stagingBundleCount: this.stagingBundle ? 1 : 0,
    };
  }

  dispose(): void {
    this.deactivate();
    this.root.removeFromParent();
  }

  private commit(bundle: IsolationBundle): void {
    const old = this.activeBundle;
    this.stagingBundle = undefined;
    this.activeBundle = bundle;
    bundle.root.visible = true;
    if (old) old.root.visible = false;
    this.root.visible = true;
    this.canonicalRoot.visible = false;
    this.stateValue = 'active';
    this.diagnosticsState.active = true;
    this.diagnosticsState.state = 'active';
    this.diagnosticsState.activeGeneration = bundle.generation;
    this.diagnosticsState.activeTargetBlocks = bundle.snapshot.blocks.length;
    this.diagnosticsState.commitCount += 1;
    this.diagnosticsState.atomicSwapCount += 1;
    this.diagnosticsState.lastTerrainReadyMs = bundle.terrainReadyMs;
    this.diagnosticsState.lastFluidReadyMs = bundle.fluidReadyMs;
    this.diagnosticsState.lastTimeToReadyMs = Math.max(0, now() - bundle.preparedAt);
    this.diagnosticsState.lastBuildMs = this.diagnosticsState.lastTimeToReadyMs;
    this.diagnosticsState.terrainChunks = bundle.terrain?.chunkCount ?? 0;
    this.diagnosticsState.instanceMembers = bundle.snapshot.blocks.filter(
      (entry) => !!entry.instanceTemplates,
    ).length;
    this.diagnosticsState.fluidVoxels = bundle.snapshot.blocks.filter(
      (entry) => !!entry.fluid,
    ).length;
    this.diagnosticsState.standaloneObjects = bundle.snapshot.blocks.filter(
      (entry) =>
        !!entry.standalone &&
        !entry.terrain &&
        !entry.instanceTemplates &&
        !entry.surfaceTemplates &&
        !entry.fluid,
    ).length;
    if (old) {
      this.diagnosticsState.disposeRequestedCount += 1;
      this.disposeBundle(old);
    }
    if (this.listeners.onCommitted)
      this.listeners.onCommitted(this.activeKeys(), bundle.generation);
    else this.listeners.onChanged?.();
  }

  private buildBundle(snapshot: GroupIsolationSnapshot, generation: number): IsolationBundle {
    const root = new THREE.Group();
    root.name = `groupIsolationBundle-${generation}`;
    root.visible = false;
    this.root.add(root);
    const temporaryEntries = new Map<string, { object?: THREE.Object3D }>();
    const bundle: IsolationBundle = {
      generation,
      snapshot,
      root,
      temporaryEntries,
      disposed: false,
      terrainReady: Promise.resolve({ status: 'settled', failedKeys: [] }),
      fluidReady: Promise.resolve(),
      preparedAt: now(),
      terrainReadyMs: 0,
      fluidReadyMs: 0,
      readySynchronously: true,
      fluidFailed: false,
    };
    const terrainRecords = snapshot.blocks.flatMap((entry) =>
      entry.terrain ? [entry.terrain] : [],
    );
    if (terrainRecords.length) {
      bundle.terrain = new ChunkSurfaceRenderer({
        blocksGroup: root,
        record: () => undefined,
        terrainAtlasMode: 'on',
      });
      const occupancy: TerrainClassificationEntry[] = terrainRecords.map((record) => ({
        block: record.block,
        role: record.role === 'reference' ? 'reference' : 'normal',
        occlusionClass: 'opaque-full-cube',
      }));
      const terrainStarted = now();
      const terrainApply = bundle.terrain.bulkUpsert(terrainRecords, occupancy, [], {
        initial: true,
      });
      bundle.terrainReady = bundle.terrain.whenSettled().then((result) => {
        bundle.terrainReadyMs = Math.max(0, now() - terrainStarted);
        return result;
      });
      bundle.readySynchronously = !terrainApply.pending && terrainApply.failedKeys.length === 0;
      if (bundle.readySynchronously) bundle.terrainReadyMs = Math.max(0, now() - terrainStarted);
    }

    const instanceEntries = new Map<string, { object?: THREE.Object3D }>();
    const instanceBlocks = snapshot.blocks.filter((entry) => !!entry.instanceTemplates);
    if (instanceBlocks.length) {
      const localDiagnostics = new RendererDiagnostics();
      const borrowedGeometries = new Set(
        instanceBlocks.flatMap((entry) =>
          (entry.instanceTemplates ?? []).map((template) => template.geometry),
        ),
      );
      bundle.instances = new InstanceBatchRenderer({
        blocksGroup: root,
        capacity: 32 ** 3,
        chunkKey: (position) =>
          `${Math.floor(position.x / 32)},${Math.floor(position.y / 32)},${Math.floor(position.z / 32)}`,
        stableBounds: (region, envelope) => {
          const parts = region.split(',').map(Number);
          const origin = new THREE.Vector3(
            (parts[0] || 0) * 32,
            (parts[1] || 0) * 32,
            (parts[2] || 0) * 32,
          );
          return envelope.clone().translate(origin);
        },
        regionPolicy: this.regionPolicy,
        record: (name, delta = 1) => localDiagnostics.record(name as never, delta),
        getEntry: (key) => instanceEntries.get(key),
        setEntryObject: (key, _batchKey, _index, object) => {
          const entry = instanceEntries.get(key);
          if (entry) entry.object = object;
        },
        disposeMergedTemplateGeometry: (template) => {
          if (
            template.ownsGeometry &&
            !borrowedGeometries.has(template.geometry) &&
            template.geometry.userData['mergedInstanceTemplateGeometry']
          )
            template.geometry.dispose();
        },
      });
      for (const entry of instanceBlocks) {
        const state = { object: undefined as THREE.Object3D | undefined };
        instanceEntries.set(entry.key, state);
        bundle.instances.addFromTemplates(
          entry.instanceTemplates!,
          entry.block.position,
          entry.key,
          'cached-template',
        );
        temporaryEntries.set(entry.key, state);
      }
    }

    const surfaceBlocks = snapshot.blocks.filter(
      (entry) => !!entry.surfaceTemplates?.length && !!entry.surfaceDirections,
    );
    if (surfaceBlocks.length) {
      const surfaceEntries = new Map<
        string,
        { readonly surfaceFaceMemberships?: readonly { batchKey: string; index: number }[] }
      >();
      bundle.surfaces = new SurfaceFaceBatchRenderer({
        blocksGroup: root,
        capacity: 32 ** 3,
        chunkKey: (position) =>
          `${Math.floor(position.x / 32)},${Math.floor(position.y / 32)},${Math.floor(position.z / 32)}`,
        stableBounds: (region, envelope) => {
          const parts = region.split(',').map(Number);
          const origin = new THREE.Vector3(
            (parts[0] || 0) * 32,
            (parts[1] || 0) * 32,
            (parts[2] || 0) * 32,
          );
          return envelope.clone().translate(origin);
        },
        regionPolicy: this.regionPolicy,
        unitEnvelope: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)),
        record: () => undefined,
        getEntry: (key) => surfaceEntries.get(key),
      });
      for (const entry of surfaceBlocks) {
        const surfaceEntry = {};
        surfaceEntries.set(entry.key, surfaceEntry);
        bundle.surfaces.add(
          entry.block,
          entry.key,
          entry.surfaceTemplates!,
          entry.surfaceDirections!,
        );
        temporaryEntries.set(entry.key, surfaceEntry);
      }
    }

    const fluidRecords = snapshot.blocks.flatMap((entry) => (entry.fluid ? [entry.fluid] : []));
    if (fluidRecords.length && snapshot.fluidProvider) {
      bundle.readySynchronously = false;
      bundle.fluids = new FluidChunkRenderer(root);
      bundle.fluids.setProvider(snapshot.fluidProvider);
      const fluidStarted = now();
      bundle.fluidReady = bundle.fluids
        .sync(fluidRecords, {
          getBlock: snapshot.fluidWorld.getBlock,
          getDefinition: snapshot.fluidWorld.getDefinition,
          getOcclusionClass: snapshot.fluidWorld.getOcclusionClass,
        })
        .then(
          (result) => {
            bundle.fluidFailed = result.status !== 'committed';
            bundle.fluidReadyMs = Math.max(0, now() - fluidStarted);
          },
          () => {
            bundle.fluidFailed = true;
            bundle.fluidReadyMs = Math.max(0, now() - fluidStarted);
          },
        );
    }

    for (const entry of snapshot.blocks) {
      if (
        entry.terrain ||
        entry.instanceTemplates ||
        entry.surfaceTemplates ||
        entry.fluid ||
        !entry.standalone
      )
        continue;
      const clone = entry.standalone.clone(true);
      root.add(clone);
      temporaryEntries.set(entry.key, { object: clone });
    }
    for (const entry of snapshot.decorations) if (entry.object) root.add(entry.object.clone(true));
    return bundle;
  }

  private disposeBundle(bundle: IsolationBundle): void {
    if (bundle.disposed) return;
    bundle.disposed = true;
    this.diagnosticsState.disposeCount += 1;
    this.diagnosticsState.disposedBundleCount += 1;
    bundle.terrain?.dispose();
    bundle.instances?.clear();
    bundle.surfaces?.clear([]);
    bundle.fluids?.dispose();
    bundle.temporaryEntries.clear();
    for (const child of [...bundle.root.children]) bundle.root.remove(child);
    bundle.root.removeFromParent();
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
