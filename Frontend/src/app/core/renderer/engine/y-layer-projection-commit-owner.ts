import type { ProjectDocument } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type { HydrationBlockScopeDelta } from '../scheduling/hydration-progress-tracker';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { BlockRepresentationCommitOwner } from '../visuals/block-representation-commit-owner';
import type { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import type {
  FluidRenderCoordinator,
  ProjectionFluidChange,
} from '../fluids/fluid-render-coordinator';
import type { FluidWorldLookup } from '../fluids/fluid-state';
import { fluidChunkKey } from '../fluids/fluid-mesh-core';
import type { ViewportInteriorCullingOwner } from '../visibility/viewport-interior-culling-owner';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import type { ChunkSurfaceRenderer, TerrainBlockChange } from '../terrain/chunk-surface-renderer';
import type {
  ViewportTerrainWorkflowOwner,
  TerrainHydrationCandidate,
} from '../terrain/viewport-terrain-workflow-owner';
import { isCompiledTerrainEntry, isTerrainRenderableEntry } from '../terrain/terrain-classifier';
import type { RendererDiagnostics } from './renderer-diagnostics';
import type { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type {
  ViewportBlockRepresentationStore,
  RenderedBlockEntry,
} from './viewport-block-representation-store';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { blockRenderSignature } from './viewport-render-signatures';
import type {
  YLayerProjectionCoordinator,
  VisibleBlockProjectionEntry,
} from './y-layer-projection-coordinator';
import type { ViewportStructureSyncState } from './viewport-structure-sync-state';
import type { YLayerRepresentationPrewarmOwner } from './y-layer-representation-prewarm-owner';
import type { YLayerPresentationLifecycleOwner } from './y-layer-presentation-lifecycle-owner';

export interface YLayerProjectionCommitVisualPorts {
  readonly removeRepresentation: (key: string, entry: RenderedBlockEntry) => void;
  readonly removePlaceholder: (key: string) => void;
  readonly ensurePlaceholder: (
    key: string,
    block: ProjectDocument['blocks'][number],
    role: RenderedBlockEntry['role'],
  ) => void;
  readonly terrainCandidate: (
    key: string,
    entry: VisibleBlockProjectionEntry,
    world: {
      readonly visualRevisionKey: number;
      getBlock(
        position: import('../../domain/project.types').VoxelCoordinate,
      ): ProjectDocument['blocks'][number] | undefined;
    },
    options: ViewportRenderOptions,
  ) => TerrainHydrationCandidate | undefined;
  readonly applyBlockRole: (
    object: import('three').Object3D,
    role: 'normal' | 'reference',
    opacity: number,
  ) => void;
}

export interface YLayerProjectionCommitHydrationPorts {
  readonly beginProgress: () => void;
  readonly schedule: () => void;
}

export interface YLayerProjectionCommitPresentationPorts {
  readonly applyLayerPresentation: (
    project: ProjectDocument,
    options: ViewportRenderOptions,
  ) => void;
  readonly scheduleRender: () => void;
  readonly trace: (event: string, details: Readonly<Record<string, unknown>>) => void;
}

/** Applies committed layer deltas to representation owners and hydration accounting. */
export class YLayerProjectionCommitOwner {
  constructor(
    private readonly blockIndex: ViewportBlockIndexOwner,
    private readonly representations: ViewportBlockRepresentationStore,
    private readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>,
    private readonly projection: YLayerProjectionCoordinator,
    private readonly syncState: ViewportStructureSyncState,
    private readonly fluids: FluidRenderCoordinator,
    private readonly culling: ViewportInteriorCullingOwner,
    private readonly terrain: ChunkSurfaceRenderer,
    private readonly terrainWorkflow: ViewportTerrainWorkflowOwner,
    private readonly instances: StaticModelBatchRenderer,
    private readonly surfaces: SurfaceFaceBatchRenderer,
    private readonly representationCommit: BlockRepresentationCommitOwner,
    private readonly prewarm: YLayerRepresentationPrewarmOwner,
    private readonly presentation: YLayerPresentationLifecycleOwner,
    private readonly diagnostics: RendererDiagnostics,
    private readonly instanceThreshold: number,
    private readonly currentProvider: () => BlockVisualProvider | undefined,
    private readonly missingBlocksTerminal: () => boolean,
    private readonly visualPorts: YLayerProjectionCommitVisualPorts,
    private readonly hydrationPorts: YLayerProjectionCommitHydrationPorts,
    private readonly presentationPorts: YLayerProjectionCommitPresentationPorts,
  ) {}

  finishCooperativeWork(): void {
    this.terrain.flushPending();
    this.hydration.prioritizeRegularJobs((job) => job.role);
    this.hydrationPorts.beginProgress();
    if (this.hydration.queuedWork()) this.hydrationPorts.schedule();
  }

  apply(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    changedLayers: readonly number[],
    blockOverrides?: ReadonlyMap<number, readonly ProjectDocument['blocks'][number][]>,
    flushTerrain = true,
    publishProgress = true,
  ): void {
    const started = performance.now();
    const provider = this.currentProvider();
    const plan = this.projection.applyLayerDelta(
      project,
      options,
      changedLayers,
      blockOverrides,
      options.layerIndex,
      (block) => provider?.occlusionClass?.(block) ?? 'unknown',
    );
    const changes = plan.changes;
    const { addedVisible, removedVisible, roleChanged } = plan;
    const changedProjectionKeys = new Set(changes.keys());
    if (!changedProjectionKeys.size) {
      this.recordCommitDuration(started);
      return;
    }

    const added: string[] = [];
    const removed: string[] = [];
    const invalidated: string[] = [];
    const missing = new Map<string, 'resolved' | 'provisional' | 'permanent'>();
    for (const [key, change] of changes) {
      if (!change.before && change.after) added.push(key);
      else if (change.before && !change.after) removed.push(key);
      else if (change.before && change.after) invalidated.push(key);
      if (change.after)
        missing.set(
          key,
          change.after.block.kind === 'missing'
            ? this.missingBlocksTerminal()
              ? 'permanent'
              : 'provisional'
            : 'resolved',
        );
      if (change.after) this.syncState.rememberVisiblePosition(change.position);
      else this.syncState.forgetVisiblePosition(key);
    }
    const scopeDelta: HydrationBlockScopeDelta = {
      add: added,
      remove: removed,
      invalidate: invalidated,
      missing,
    };
    this.projection.markPendingKeys(changedProjectionKeys);
    this.hydration.applyBlockScopeDelta(scopeDelta, false);
    const cancelledPrewarmJobs = this.hydration
      .regularJobs()
      .filter((job) => job.layerPrewarm && changedProjectionKeys.has(job.key));
    this.hydration.removePendingKeys(changedProjectionKeys);
    for (const job of cancelledPrewarmJobs) this.prewarm.onHydrationCompleted(job, false);
    this.projection.bumpKeyRevisions(changedProjectionKeys);
    for (const key of changedProjectionKeys) {
      this.hydration.clearPendingSignature(key);
      this.terrainWorkflow.clearPlaceholderSignature(key);
    }

    const worldContext = {
      visualRevisionKey: this.blockIndex.visualRevision,
      getBlock: (position: import('../../domain/project.types').VoxelCoordinate) =>
        this.blockIndex.get(position),
    };
    const fluidKeys = this.applyFluidRepresentationDelta(changes, worldContext);
    this.culling.updateDelta(
      changes,
      (key) => this.projection.visibleEntry(key),
      this.projection.visibleEntriesByKey,
    );
    const terrainChanges: TerrainBlockChange[] = [];
    const allowInstancing =
      this.projection.visibleEntries.length >= this.instanceThreshold ||
      this.instances.batches.size > 0;
    for (const [key, change] of changes) {
      const current = this.representations.get(key);
      if (!change.after) {
        const canonicalBlock = this.blockIndex.get(change.position);
        const retained =
          current &&
          canonicalBlock &&
          blockRenderSignature(canonicalBlock) === blockRenderSignature(current.block) &&
          ((options.layerY !== undefined && options.visibility !== undefined) ||
            this.representationCommit.setPresentationVisible(key, current, false));
        if (current && !retained) this.visualPorts.removeRepresentation(key, current);
        else if (!current) this.terrain.remove(key);
        this.visualPorts.removePlaceholder(key);
        if (options.exposedFaceRendering === true)
          terrainChanges.push({ key, position: change.position, afterOpaque: false });
        continue;
      }
      if (fluidKeys.has(key)) continue;
      if (
        current &&
        current.signature === change.after.signature &&
        current.role === change.after.role
      ) {
        if (current.presentationVisible === false)
          this.representationCommit.setPresentationVisible(key, current, true);
        this.representationCommit.updateBlock(key, change.after.block);
        if (options.exposedFaceRendering === true)
          terrainChanges.push({
            key,
            position: change.position,
            afterOpaque: isCompiledTerrainEntry(change.after),
          });
        continue;
      }
      if (
        current &&
        current.role !== change.after.role &&
        blockRenderSignature(current.block) === blockRenderSignature(change.after.block) &&
        this.retargetRole(key, current, change.after, false, options)
      )
        continue;
      if (current) this.visualPorts.removeRepresentation(key, current);
      this.visualPorts.ensurePlaceholder(key, change.after.block, change.after.role);
      this.hydration.setPendingSignature(key, change.after.signature);
      if (!provider) {
        this.hydration.clearPendingSignature(key);
        this.terrainWorkflow.setPlaceholderSignature(key, change.after.signature);
        terrainChanges.push({ key, position: change.position, afterOpaque: false });
        continue;
      }
      this.terrainWorkflow.clearPlaceholderSignature(key);
      this.hydration.enqueueRegular({
        token: this.hydration.generation,
        projectionRevision: this.projection.revisionForKey(key),
        key,
        block: change.after.block,
        signature: change.after.signature,
        role: change.after.role,
        worldContext,
        options,
        allowInstancing,
        surfaceFastPathEligible:
          options.exposedFaceRendering === true && isCompiledTerrainEntry(change.after),
        surfaceVisibleEntries: this.projection.visibleEntriesByKey,
      });
      if (options.exposedFaceRendering === true)
        terrainChanges.push({
          key,
          position: change.position,
          afterOpaque: isCompiledTerrainEntry(change.after),
        });
    }
    if (terrainChanges.length)
      this.terrain.applyBlockChanges(
        terrainChanges,
        flushTerrain,
        [...changedProjectionKeys],
        !flushTerrain,
      );
    this.presentationPorts.applyLayerPresentation(project, options);
    if (publishProgress) {
      this.hydration.prioritizeRegularJobs((job) => job.role);
      this.hydrationPorts.beginProgress();
      if (this.hydration.queuedWork()) this.hydrationPorts.schedule();
    }
    if (flushTerrain) this.presentationPorts.scheduleRender();
    this.recordCommitDuration(started);
    this.presentationPorts.trace('y-layer-projection-delta', {
      layers: changedLayers,
      changedBlocks: changes.size,
      addedVisible: plan.addedVisible,
      removedVisible: plan.removedVisible,
      roleChanged: plan.roleChanged,
      projectionRevision: this.projection.revision,
      durationMs: performance.now() - started,
    });
  }

  private applyFluidRepresentationDelta(
    changes: ReadonlyMap<string, ProjectionFluidChange>,
    worldContext: FluidWorldLookup,
  ): ReadonlySet<string> {
    const provider = this.currentProvider();
    const resolver = provider?.fluidRenderResolver;
    if (!resolver || !provider?.fluidTexture) return new Set<string>();
    const plan = this.fluids.prepareProjectionDelta(changes, resolver, worldContext);
    this.diagnostics.record('yLayerProjectionFluidBlocksVisited', plan.visitedBlocks);
    for (const [key, change] of changes) {
      const current = this.representations.get(key);
      if (plan.afterKeys.has(key) && change.after) {
        if (current && current.fluidChunkKey === undefined)
          this.visualPorts.removeRepresentation(key, current);
        this.representationCommit.publish({
          key,
          block: change.after.block,
          signature: change.after.signature,
          role: change.after.role,
          revision: 0,
          provider,
          fluidChunkKey: fluidChunkKey(change.after.block.position),
        });
      } else if (current?.fluidChunkKey !== undefined)
        this.representationCommit.detachFluidClaim(key);
    }
    if (plan.changes.length)
      void this.fluids
        .syncDelta(
          plan.changes,
          [...changes.values()].map((change) => change.position),
          worldContext,
          this.hydration.generation,
        )
        .then(() => this.presentationPorts.scheduleRender());
    return plan.afterKeys;
  }

  private retargetRole(
    key: string,
    current: RenderedBlockEntry,
    next: VisibleBlockProjectionEntry,
    scheduleRender: boolean,
    options: ViewportRenderOptions,
  ): boolean {
    const role = next.role === 'reference' ? 'reference' : 'normal';
    const opacity = options.referenceOpacity ?? 0.28;
    if (current.terrainChunkKey !== undefined || this.terrain.has(key)) {
      if (!this.terrain.setRecordRole(key, role)) return false;
    } else if (current.fluidChunkKey !== undefined) return false;
    else if (current.instanceBatchKey !== undefined) {
      if (!this.instances.setMemberRole(key, role)) return false;
    } else if (current.surfaceFaceMemberships !== undefined) {
      if (!this.surfaces.setMemberRole(key, role, opacity)) return false;
      const memberships = this.surfaces.ownership.get(key);
      const object = memberships?.[0]
        ? this.surfaces.batches.get(memberships[0].batchKey)?.mesh
        : undefined;
      if (memberships && object)
        this.representationCommit.setSurfaceObject(key, memberships, object);
    } else if (current.object && current.object !== current.fallback) {
      this.visualPorts.applyBlockRole(current.object, role, opacity);
    } else return false;
    this.representationCommit.publish({
      ...current,
      block: next.block,
      signature: next.signature,
      role: next.role,
    });
    if (scheduleRender) this.presentationPorts.scheduleRender();
    return true;
  }

  private recordCommitDuration(started: number): void {
    const durationMs = performance.now() - started;
    this.diagnostics.record('yLayerProjectionCommitMs', durationMs);
    this.diagnostics.recordMax('yLayerProjectionMaxCommitMs', durationMs);
  }
}
