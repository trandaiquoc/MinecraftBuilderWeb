import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { visibleBlockEntries } from '../../editor/viewport/visible-blocks';
import { visibleLayerSet } from '../../editor/viewport/y-layer';
import type { LayerBlockIndex } from '../../editor/viewport/y-layer';
import { groupIdsOf } from '../../editor/groups/group-membership';
import type { FluidWorldLookup } from '../fluids/fluid-state';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import { fluidChunkKey } from '../fluids/fluid-mesh-core';
import type { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { BlockRepresentationCommitOwner } from '../visuals/block-representation-commit-owner';
import type { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import type { ViewportHydrationLifecycleOwner } from '../hydration/viewport-hydration-lifecycle-owner';
import type { RendererDiagnostics } from './renderer-diagnostics';
import type { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type {
  ViewportBlockRepresentationStore,
  RenderedBlockEntry,
} from './viewport-block-representation-store';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import type {
  YLayerProjectionCoordinator,
  VisibleBlockProjectionEntry,
} from './y-layer-projection-coordinator';
import type { ViewportStructureSyncState } from './viewport-structure-sync-state';
import type { ViewportHydrationSettlementOwner } from '../hydration/viewport-hydration-settlement-owner';
import { blockRenderSignature, canonicalRenderOptions } from './viewport-render-signatures';
import { planStructureReconciliation } from './structure-reconciliation-plan';
import type { ViewportInteriorCullingOwner } from '../visibility/viewport-interior-culling-owner';
import type { ChunkSurfaceRenderer } from '../terrain/chunk-surface-renderer';
import type { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import { isCompiledTerrainEntry, isTerrainRenderableEntry } from '../terrain/terrain-classifier';
import type {
  TerrainHydrationCandidate,
  ViewportTerrainWorkflowOwner,
} from '../terrain/viewport-terrain-workflow-owner';

type VisibleBlockEntry = VisibleBlockProjectionEntry;
type PlacedBlock = ProjectDocument['blocks'][number];

export interface ViewportStructureReconciliationPorts {
  readonly blockIndex: ViewportBlockIndexOwner;
  readonly representations: ViewportBlockRepresentationStore;
  readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>;
  readonly projection: YLayerProjectionCoordinator;
  readonly syncState: ViewportStructureSyncState;
  readonly culling: ViewportInteriorCullingOwner;
  readonly fluids: FluidRenderCoordinator;
  readonly terrain: ChunkSurfaceRenderer;
  readonly terrainWorkflow: ViewportTerrainWorkflowOwner;
  readonly instances: StaticModelBatchRenderer;
  readonly surfaces: SurfaceFaceBatchRenderer;
  readonly representationCommit: BlockRepresentationCommitOwner;
  readonly placeholders: PlaceholderBatchRenderer;
  readonly hydrationLifecycle: ViewportHydrationLifecycleOwner;
  readonly settlement: ViewportHydrationSettlementOwner;
  readonly diagnostics: RendererDiagnostics;
  readonly provider: () => BlockVisualProvider | undefined;
  readonly instanceThreshold: number;
  readonly layerIndex: () => LayerBlockIndex | undefined;
  readonly missingBlocksTerminal: () => boolean;
  readonly requestReusableVisualKey: (
    provider: BlockVisualProvider,
    block: PlacedBlock,
    world: { getBlock(position: VoxelCoordinate): PlacedBlock | undefined },
  ) => string | undefined;
  readonly removeRepresentation: (key: string, entry: RenderedBlockEntry) => void;
  readonly recordTrace: (event: string, details: Readonly<Record<string, unknown>>) => void;
  readonly recordInstanceOwnership: (
    phase: 'after-reconcile',
    key?: string,
    source?: 'reconcile',
  ) => void;
  readonly scheduleRender: () => void;
}

/** Owns canonical structure reconciliation into viewport block representations. */
export class ViewportStructureReconciliationOwner {
  constructor(private readonly ports: ViewportStructureReconciliationPorts) {}

  reconcile(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    full: boolean,
    providerGeneration: number,
    visibleOverride?: readonly VisibleBlockEntry[],
  ): void {
    const { diagnostics, blockIndex, representations, hydration, projection, syncState } =
      this.ports;
    this.ports.recordTrace('reconcile', { full, projectBlocks: project.blocks.length });
    diagnostics.record('structuralReconciles');
    if (full) diagnostics.record('fullReconcileFallbacks');
    hydration.compactWork();

    const world = this.worldContext();
    const prewarmed = visibleOverride
      ? undefined
      : projection.takePrewarmedVisible(project, options, providerGeneration);
    if (prewarmed && 'fallbackReason' in prewarmed) {
      this.ports.recordTrace('y-layer-prewarm-fallback', {
        reason: prewarmed.fallbackReason,
        projectId: project.id,
      });
    }
    const visible =
      visibleOverride ??
      (prewarmed && 'entries' in prewarmed
        ? prewarmed.entries
        : this.visibleBlocks(project, options));

    for (const [key, entry] of representations) {
      const canonical = blockIndex.get(entry.block.position);
      if (!canonical || blockRenderSignature(canonical) !== blockRenderSignature(entry.block))
        this.ports.removeRepresentation(key, entry);
      else this.ports.representationCommit.updateBlock(key, canonical);
    }

    this.setHydrationBlockScope(visible);
    projection.replaceVisible(project, options, visible);
    const allVisible = new Map(
      visible.map((entry) => [coordinateKey(entry.block.position), entry] as const),
    );
    const plan = planStructureReconciliation({
      visibleByKey: allVisible,
      representations: new Map(
        [...representations].filter(([, entry]) => entry.presentationVisible !== false),
      ),
      previousVisiblePositions: syncState.previousVisiblePositionsSnapshot(),
      pendingSignatureMatches: (key, signature) => hydration.pendingSignature(key) === signature,
      placeholderSignatures: this.ports.terrainWorkflow.placeholderState,
      providerAvailable: !!this.ports.provider(),
      full,
    });
    const changed = plan.changedKeys;
    this.syncFluidVisuals(
      project,
      visible,
      world,
      full ? undefined : plan.terrainAffectedPositions,
      options,
    );
    if (!full) this.ports.terrain.syncOccupancy(visible, plan.terrainAffectedPositions);
    this.ports.culling.updateFull(
      visible,
      full,
      changed,
      syncState.previousVisiblePositionsSnapshot(),
    );
    this.ports.settlement.adoptCommittedBlockOwnership(visible);

    const renderVisible = visible.filter((entry) => {
      if (this.ports.fluids.isClaimed(coordinateKey(entry.block.position))) return false;
      if (options.exposedFaceRendering === true && isTerrainRenderableEntry(entry)) return true;
      return !this.ports.culling.has(coordinateKey(entry.block.position));
    });
    const allowInstancing =
      renderVisible.length >= this.ports.instanceThreshold || this.ports.instances.batches.size > 0;
    const visibleMap = new Map(
      renderVisible.map((entry) => [coordinateKey(entry.block.position), entry] as const),
    );
    hydration.retainPending((job) => {
      const next = visibleMap.get(job.key);
      return job.layerPrewarm
        ? !next || job.signature === next.signature
        : !!next && job.signature === next.signature;
    });
    if (full) diagnostics.record('fullSceneRebuilds');
    const projectedLayers =
      options.layerY !== undefined && options.visibility !== undefined
        ? visibleLayerSet(
            options.layerY,
            project.blocks,
            options.visibility,
            options.layerIndex ?? this.ports.layerIndex(),
          )
        : undefined;

    for (const [key, entry] of representations) {
      if (entry.fluidChunkKey !== undefined || visibleMap.has(key)) continue;
      const canonical = blockIndex.get(entry.block.position);
      const hiddenLayer =
        canonical && projectedLayers && !projectedLayers.has(canonical.position.y);
      const retained =
        !!canonical &&
        blockRenderSignature(canonical) === blockRenderSignature(entry.block) &&
        (hiddenLayer || this.ports.representationCommit.setPresentationVisible(key, entry, false));
      if (!retained) {
        this.ports.removeRepresentation(key, entry);
        diagnostics.record('blockRemovals');
      }
      hydration.clearPendingSignature(key);
      this.ports.terrainWorkflow.clearPlaceholderSignature(key);
    }
    for (const key of this.ports.placeholders.indices.keys())
      if (!visibleMap.has(key)) this.ports.placeholders.remove(key);
    const retainedPrewarmKeys = new Set(
      hydration
        .regularJobs()
        .filter((job) => job.layerPrewarm)
        .map((job) => job.key),
    );
    for (const key of hydration.pendingKeys())
      if (!visibleMap.has(key) && !retainedPrewarmKeys.has(key))
        hydration.clearPendingSignature(key);
    for (const key of this.ports.terrainWorkflow.placeholderKeys())
      if (!visibleMap.has(key)) this.ports.terrainWorkflow.clearPlaceholderSignature(key);

    for (const [key, entry] of visibleMap) {
      const current = representations.get(key);
      const pendingSignature = hydration.pendingSignature(key);
      const placeholderSignature = this.ports.terrainWorkflow.placeholderSignature(key);
      if (current && current.signature === entry.signature && current.role === entry.role) {
        if (current.presentationVisible === false)
          this.ports.representationCommit.setPresentationVisible(key, current, true);
        this.ports.representationCommit.updateBlock(key, entry.block);
        this.ports.placeholders.remove(key);
        continue;
      }
      if (
        full ||
        !current ||
        current.signature !== entry.signature ||
        current.role !== entry.role
      ) {
        if (!current && pendingSignature === entry.signature) continue;
        if (!current && !this.ports.provider() && placeholderSignature === entry.signature)
          continue;
        changed.add(key);
      }
      if (!changed.has(key) && current) this.ports.placeholders.remove(key);
    }

    const changedEntries = [...changed]
      .map((key) => visibleMap.get(key))
      .filter((entry): entry is VisibleBlockEntry => !!entry);
    if (full) this.ensurePlaceholdersBulk(changedEntries);
    const terrainCandidates: TerrainHydrationCandidate[] = [];
    for (const key of changed) {
      const next = visibleMap.get(key);
      if (!next) continue;
      const previous = representations.get(key);
      if (previous) {
        this.ports.removeRepresentation(key, previous);
        diagnostics.record('blockUpdates');
      } else if (
        hydration.pendingSignature(key) === undefined &&
        this.ports.terrainWorkflow.placeholderSignature(key) === undefined
      ) {
        diagnostics.record('blockAdds');
      }
      if (!full) this.ensurePlaceholder(key, next.block, next.role);
      hydration.setPendingSignature(key, next.signature);
      diagnostics.record('blockVisualCreations');
      const provider = this.ports.provider();
      if (!provider) {
        hydration.clearPendingSignature(key);
        this.ports.terrainWorkflow.setPlaceholderSignature(key, next.signature);
        continue;
      }
      this.ports.terrainWorkflow.clearPlaceholderSignature(key);
      const candidate = this.terrainCandidate(key, next, world, options, provider);
      if (candidate) {
        this.ports.representationCommit.publish({
          key,
          block: next.block,
          signature: next.signature,
          role: next.role,
          revision: 0,
          provider,
          reusableVisualKey: candidate.reusableKey,
        });
        terrainCandidates.push(candidate);
      } else {
        hydration.enqueueRegular({
          token: hydration.generation,
          projectionRevision: projection.revisionForKey(key),
          key,
          block: next.block,
          signature: next.signature,
          role: next.role,
          worldContext: world,
          options,
          allowInstancing,
          surfaceFastPathEligible:
            options.exposedFaceRendering === true && isCompiledTerrainEntry(next),
          surfaceVisibleEntries: allVisible,
        });
      }
    }
    if (terrainCandidates.length)
      this.ports.terrainWorkflow.scheduleWorkflowBatch(
        terrainCandidates,
        visible,
        plan.terrainAffectedPositions,
        full,
        false,
        'structural',
      );

    this.prioritizeJobs();
    const previousMax = diagnostics.snapshot().maxPendingVisualJobs;
    const queued = hydration.queuedWork();
    if (queued > previousMax) diagnostics.record('maxPendingVisualJobs', queued - previousMax);
    this.ports.hydrationLifecycle.beginProgress();
    if (queued) this.ports.hydrationLifecycle.schedule();
    this.ports.representationCommit.reconcileInstances();
    syncState.replaceVisibleProjection(visible);
    this.ports.recordInstanceOwnership('after-reconcile', undefined, 'reconcile');
  }

  visibleEntry(block: PlacedBlock, options: ViewportRenderOptions): VisibleBlockEntry {
    const provider = this.ports.provider();
    return this.ports.projection.createVisibleEntry(
      block,
      options,
      provider?.occlusionClass?.(block) ?? 'unknown',
    );
  }

  visibleBlocks(
    project: ProjectDocument,
    options: ViewportRenderOptions,
    countScan = true,
  ): readonly VisibleBlockEntry[] {
    if (countScan) this.ports.diagnostics.record('fullVisibleScans');
    return visibleBlockEntries(project, {
      ...canonicalRenderOptions(options),
      layerIndex: options.layerIndex ?? this.ports.layerIndex(),
    }).map((block) => this.visibleEntry(block, options));
  }

  terrainCandidate(
    key: string,
    next: VisibleBlockEntry,
    world: { getBlock(position: VoxelCoordinate): PlacedBlock | undefined },
    options: ViewportRenderOptions,
    provider = this.ports.provider(),
  ): TerrainHydrationCandidate | undefined {
    if (!provider || options.exposedFaceRendering !== true || !isTerrainRenderableEntry(next))
      return undefined;
    const reusableKey = this.ports.requestReusableVisualKey(provider, next.block, world);
    return reusableKey ? { key, next, reusableKey, worldContext: world, provider } : undefined;
  }

  syncVisibleFluids(
    project: ProjectDocument | undefined,
    options: ViewportRenderOptions,
    visible?: readonly VisibleBlockEntry[],
    world?: FluidWorldLookup,
    changedPositions?: readonly VoxelCoordinate[],
  ): void {
    if (!project) return;
    this.syncFluidVisuals(
      project,
      visible ?? this.visibleBlocks(project, options),
      world ?? this.worldContext(),
      changedPositions,
      options,
    );
  }

  private syncFluidVisuals(
    project: ProjectDocument,
    visible: readonly VisibleBlockEntry[],
    world: FluidWorldLookup,
    changedPositions?: readonly VoxelCoordinate[],
    options?: ViewportRenderOptions,
  ): void {
    const provider = this.ports.provider();
    const layerResidentSync = options?.layerY !== undefined && options.visibility !== undefined;
    const fluidBlocks = layerResidentSync ? project.blocks : visible.map((entry) => entry.block);
    const records =
      provider?.fluidRenderResolver && provider.fluidTexture
        ? fluidBlocks.flatMap((block) => {
            const state = provider.fluidRenderResolver!.resolve(block, world);
            return state ? [{ block, state, role: 'normal' as const }] : [];
          })
        : [];
    const visibleByKey = new Map(
      visible.map((entry) => [coordinateKey(entry.block.position), entry] as const),
    );
    const nextKeys = new Set(records.map((record) => coordinateKey(record.block.position)));
    for (const key of this.ports.fluids.claimedKeys()) {
      if (nextKeys.has(key)) continue;
      if (this.ports.representations.get(key)?.fluidChunkKey !== undefined)
        this.ports.representationCommit.detachFluidClaim(key);
    }
    for (const record of records) {
      const key = coordinateKey(record.block.position);
      const entry = visibleByKey.get(key);
      if (!entry) continue;
      const previous = this.ports.representations.get(key);
      if (previous && previous.fluidChunkKey === undefined)
        this.ports.removeRepresentation(key, previous);
      this.ports.representationCommit.publish({
        key,
        block: entry.block,
        signature: entry.signature,
        role: entry.role,
        revision: 0,
        provider,
        fluidChunkKey: fluidChunkKey(entry.block.position),
      });
    }
    if (!records.length && !provider?.fluidRenderResolver) this.ports.fluids.clear();
    void this.ports.fluids
      .sync(records, world, this.ports.hydration.generation, changedPositions)
      .then(() => this.ports.scheduleRender());
  }

  private setHydrationBlockScope(entries: readonly VisibleBlockEntry[]): void {
    const { hydration } = this.ports;
    hydration.setBlockScope(entries.map((entry) => coordinateKey(entry.block.position)));
    for (const entry of entries) {
      const key = coordinateKey(entry.block.position);
      hydration.syncMissingBlockState(
        key,
        entry.block.kind === 'missing'
          ? this.ports.missingBlocksTerminal()
            ? 'permanent'
            : 'provisional'
          : 'resolved',
      );
    }
    hydration.refreshProgress();
  }

  private ensurePlaceholder(
    key: string,
    block: PlacedBlock,
    role: RenderedBlockEntry['role'],
  ): void {
    this.ports.placeholders.ensure(key, block.position, role, groupIdsOf(block));
  }

  private ensurePlaceholdersBulk(entries: readonly VisibleBlockEntry[]): void {
    this.ports.placeholders.ensureBulk(
      entries.map((entry) => ({
        key: coordinateKey(entry.block.position),
        position: entry.block.position,
        role: entry.role,
        groupIds: groupIdsOf(entry.block),
      })),
    );
  }

  worldContext(): {
    readonly visualRevisionKey: number;
    getBlock(position: VoxelCoordinate): PlacedBlock | undefined;
  } {
    return {
      visualRevisionKey: this.ports.blockIndex.visualRevision,
      getBlock: (position) => this.ports.blockIndex.get(position),
    };
  }

  private prioritizeJobs(): void {
    const jobs = this.ports.hydration.regularJobs();
    const normal = jobs.filter((job) => !job.layerPrewarm && job.role === 'normal');
    const reference = jobs.filter((job) => !job.layerPrewarm && job.role === 'reference');
    const prewarmAndMissing = jobs.filter((job) => job.layerPrewarm || job.role === 'missing');
    this.ports.hydration.replaceRegular([...normal, ...reference, ...prewarmAndMissing]);
  }
}
