import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { coordinateKey } from '../../domain/coordinates';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { InstanceBatchRenderer } from '../batching/instance-batch-renderer';
import type { InstancePartTemplate } from '../batching/instance-template-cache';
import { SurfaceFaceBatchRenderer, type SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { RenderRegionPolicy } from '../batching/render-region-policy';
import { ChunkSurfaceRenderer, type TerrainSurfaceRecord } from '../terrain/chunk-surface-renderer';
import type { TerrainClassificationEntry } from '../terrain/terrain-classifier';
import { FluidChunkRenderer, type FluidChunkRecord, type FluidChunkVisualProvider } from '../fluids/fluid-chunk-renderer';
import type { FluidWorldLookup } from '../fluids/fluid-state';

export interface IsolateBlockVisualSnapshot {
  readonly key: string;
  readonly block: PlacedBlock;
  readonly terrain?: TerrainSurfaceRecord;
  readonly instanceTemplates?: readonly InstancePartTemplate[];
  readonly surfaceTemplates?: readonly SurfaceFaceTemplate[];
  readonly surfaceDirections?: ReadonlySet<SurfaceFaceDirection>;
  readonly fluid?: FluidChunkRecord;
  /** A standalone visual is cloned without taking ownership of its resources. */
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
}

export interface GroupIsolationDiagnostics {
  readonly active: boolean;
  readonly generation: number;
  readonly targetBlocks: number;
  readonly terrainChunks: number;
  readonly instanceMembers: number;
  readonly fluidVoxels: number;
  readonly standaloneObjects: number;
  readonly buildCount: number;
  readonly disposeCount: number;
  readonly lastBuildMs: number;
  readonly lastDisposeMs: number;
}

/**
 * Presentation-only isolate renderer. It never owns the canonical renderer's
 * caches, batches, hydration scope, or provider lifecycle.
 */
export class GroupIsolationPresentation {
  readonly root = new THREE.Group();
  private readonly diagnosticsState = { active: false, generation: 0, targetBlocks: 0, terrainChunks: 0, instanceMembers: 0, fluidVoxels: 0, standaloneObjects: 0, buildCount: 0, disposeCount: 0, lastBuildMs: 0, lastDisposeMs: 0 };
  private readonly regionPolicy = new RenderRegionPolicy(32);
  private readonly temporaryEntries = new Map<string, { object?: THREE.Object3D }>();
  private terrain?: ChunkSurfaceRenderer;
  private instances?: InstanceBatchRenderer;
  private surfaces?: SurfaceFaceBatchRenderer;
  private fluids?: FluidChunkRenderer;
  private onChanged?: () => void;

  constructor(private readonly canonicalRoot: THREE.Group, onChanged?: () => void) {
    this.root.name = 'groupIsolationPresentation';
    this.root.visible = false;
    this.onChanged = onChanged;
  }

  setChangeListener(listener: (() => void) | undefined): void { this.onChanged = listener; }

  activate(snapshot: GroupIsolationSnapshot): void {
    const started = typeof performance === 'undefined' ? 0 : performance.now();
    this.diagnosticsState.generation += 1;
    this.clearTemporary();
    this.diagnosticsState.active = true;
    this.canonicalRoot.visible = false;
    this.root.visible = true;
    this.diagnosticsState.targetBlocks = snapshot.blocks.length;
    this.diagnosticsState.buildCount += 1;
    this.build(snapshot, this.diagnosticsState.generation);
    this.diagnosticsState.lastBuildMs = started ? Math.max(0, performance.now() - started) : 0;
  }

  deactivate(): void {
    if (!this.diagnosticsState.active) return;
    const started = typeof performance === 'undefined' ? 0 : performance.now();
    this.diagnosticsState.generation += 1;
    this.clearTemporary();
    this.diagnosticsState.active = false;
    this.root.visible = false;
    this.canonicalRoot.visible = true;
    this.diagnosticsState.targetBlocks = 0;
    this.diagnosticsState.terrainChunks = 0;
    this.diagnosticsState.instanceMembers = 0;
    this.diagnosticsState.fluidVoxels = 0;
    this.diagnosticsState.standaloneObjects = 0;
    this.diagnosticsState.disposeCount += 1;
    this.diagnosticsState.lastDisposeMs = started ? Math.max(0, performance.now() - started) : 0;
    this.onChanged?.();
  }

  refresh(snapshot: GroupIsolationSnapshot): void {
    if (!this.diagnosticsState.active) return;
    this.activate(snapshot);
  }

  isActive(): boolean { return this.diagnosticsState.active; }
  objectsForKey(key: string): readonly THREE.Object3D[] {
    const object = this.temporaryEntries.get(key)?.object;
    return object ? [object] : [];
  }
  fluidCoordinateOwner(key: string): boolean { return this.fluids?.hasVoxel(key) ?? false; }
  diagnostics(): GroupIsolationDiagnostics { return { ...this.diagnosticsState }; }

  dispose(): void {
    this.diagnosticsState.generation += 1;
    this.clearTemporary();
    this.root.removeFromParent();
    this.diagnosticsState.active = false;
  }

  private build(snapshot: GroupIsolationSnapshot, generation: number): void {
    const terrainRecords = snapshot.blocks.flatMap((entry) => entry.terrain ? [entry.terrain] : []);
    if (terrainRecords.length) {
      this.terrain = new ChunkSurfaceRenderer({ blocksGroup: this.root, record: () => undefined, terrainAtlasMode: 'on' });
      const occupancy: TerrainClassificationEntry[] = terrainRecords.map((record) => ({ block: record.block, role: record.role === 'reference' ? 'reference' : 'normal', occlusionClass: 'opaque-full-cube' }));
      this.terrain.bulkUpsert(terrainRecords, occupancy, [], { initial: true });
      this.diagnosticsState.terrainChunks = this.terrain.chunkCount;
    }

    const instanceEntries = new Map<string, { object?: THREE.Object3D }>();
    const instanceBlocks = snapshot.blocks.filter((entry) => !!entry.instanceTemplates);
    if (instanceBlocks.length) {
      const localDiagnostics = new RendererDiagnostics();
      const borrowedGeometries = new Set(instanceBlocks.flatMap((entry) => (entry.instanceTemplates ?? []).map((template) => template.geometry)));
      this.instances = new InstanceBatchRenderer({
        blocksGroup: this.root,
        capacity: 32 ** 3,
        chunkKey: (position) => `${Math.floor(position.x / 32)},${Math.floor(position.y / 32)},${Math.floor(position.z / 32)}`,
        stableBounds: (region, envelope) => { const parts = region.split(',').map(Number); const origin = new THREE.Vector3((parts[0] || 0) * 32, (parts[1] || 0) * 32, (parts[2] || 0) * 32); return envelope.clone().translate(origin); },
        regionPolicy: this.regionPolicy,
        record: (name, delta = 1) => localDiagnostics.record(name as never, delta),
        getEntry: (key) => instanceEntries.get(key),
        setEntryObject: (key, batchKey, index, object) => { const entry = instanceEntries.get(key); if (entry) entry.object = object; },
        // Canonical templates are borrowed read-only. Dispose only merged
        // geometries created by this temporary renderer.
        disposeMergedTemplateGeometry: (template) => {
          if (template.ownsGeometry && !borrowedGeometries.has(template.geometry) && template.geometry.userData['mergedInstanceTemplateGeometry']) template.geometry.dispose();
        },
      });
      for (const entry of instanceBlocks) {
        const state = { object: undefined as THREE.Object3D | undefined };
        instanceEntries.set(entry.key, state);
        this.instances.addFromTemplates(entry.instanceTemplates!, entry.block.position, entry.key, 'cached-template');
        this.temporaryEntries.set(entry.key, state);
      }
      this.diagnosticsState.instanceMembers = instanceBlocks.length;
    }

    const surfaceBlocks = snapshot.blocks.filter((entry) => !!entry.surfaceTemplates?.length && !!entry.surfaceDirections);
    if (surfaceBlocks.length) {
      const surfaceEntries = new Map<string, { surfaceFaceMemberships?: readonly { batchKey: string; index: number }[] }>();
      this.surfaces = new SurfaceFaceBatchRenderer({
        blocksGroup: this.root,
        capacity: 32 ** 3,
        chunkKey: (position) => `${Math.floor(position.x / 32)},${Math.floor(position.y / 32)},${Math.floor(position.z / 32)}`,
        stableBounds: (region, envelope) => { const parts = region.split(',').map(Number); const origin = new THREE.Vector3((parts[0] || 0) * 32, (parts[1] || 0) * 32, (parts[2] || 0) * 32); return envelope.clone().translate(origin); },
        regionPolicy: this.regionPolicy,
        unitEnvelope: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)),
        record: () => undefined,
        getEntry: (key) => surfaceEntries.get(key),
      });
      for (const entry of surfaceBlocks) {
        const surfaceEntry = {};
        surfaceEntries.set(entry.key, surfaceEntry);
        this.surfaces.add(entry.block, entry.key, entry.surfaceTemplates!, entry.surfaceDirections!);
        this.temporaryEntries.set(entry.key, surfaceEntry);
      }
    }

    const fluidRecords = snapshot.blocks.flatMap((entry) => entry.fluid ? [entry.fluid] : []);
    if (fluidRecords.length && snapshot.fluidProvider) {
      this.fluids = new FluidChunkRenderer(this.root);
      this.fluids.setProvider(snapshot.fluidProvider);
      const records = new Map(fluidRecords.map((record) => [coordinateKey(record.block.position), record] as const));
      void this.fluids.sync(fluidRecords, { getBlock: snapshot.fluidWorld.getBlock, getDefinition: snapshot.fluidWorld.getDefinition, getOcclusionClass: snapshot.fluidWorld.getOcclusionClass }).then(() => {
        if (generation === this.diagnosticsState.generation && this.diagnosticsState.active) this.onChanged?.();
      });
      this.diagnosticsState.fluidVoxels = records.size;
    }

    for (const entry of snapshot.blocks) {
      if (entry.terrain || entry.instanceTemplates || entry.surfaceTemplates || entry.fluid || !entry.standalone) continue;
      const clone = entry.standalone.clone(true);
      this.root.add(clone);
      this.temporaryEntries.set(entry.key, { object: clone });
      this.diagnosticsState.standaloneObjects += 1;
    }
    for (const entry of snapshot.decorations) {
      if (!entry.object) continue;
      this.root.add(entry.object.clone(true));
    }
  }

  private clearTemporary(): void {
    this.terrain?.dispose(); this.terrain = undefined;
    this.instances?.clear(); this.instances = undefined;
    this.surfaces?.clear([]); this.surfaces = undefined;
    this.fluids?.dispose(); this.fluids = undefined;
    this.temporaryEntries.clear();
    for (const child of [...this.root.children]) this.root.remove(child);
  }
}
