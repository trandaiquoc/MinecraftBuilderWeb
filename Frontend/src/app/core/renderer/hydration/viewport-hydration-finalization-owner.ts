import type { ProjectDocument } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type {
  ViewportRenderOptions,
  ViewportHydrationProgress,
} from '../engine/viewport-engine-contracts';
import type { ViewportBlockIndexOwner } from '../engine/viewport-block-index-owner';
import type {
  RenderedBlockEntry,
  ViewportBlockRepresentationStore,
} from '../engine/viewport-block-representation-store';
import type { ViewportStructureReconciliationOwner } from '../engine/viewport-structure-reconciliation-owner';
import type {
  YLayerProjectionCoordinator,
  VisibleBlockProjectionEntry,
} from '../engine/y-layer-projection-coordinator';
import type { ViewportBlockHydrationPipeline } from './viewport-block-hydration-pipeline';
import type { ViewportHydrationLifecycleOwner } from './viewport-hydration-lifecycle-owner';
import type { ViewportHydrationSettlementOwner } from './viewport-hydration-settlement-owner';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { BlockRepresentationCommitOwner } from '../visuals/block-representation-commit-owner';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import type { ViewportTerrainWorkflowOwner } from '../terrain/viewport-terrain-workflow-owner';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import { isCompiledTerrainEntry } from '../terrain/terrain-classifier';
import type { TerrainHydrationCandidate } from '../terrain/viewport-terrain-workflow-owner';
import { coordinateNeighbors } from '../visibility/interior-occlusion';
import type { HydrationFinalizationSnapshot } from '../scheduling/hydration-progress-tracker';

export interface ViewportHydrationFinalizationScope {
  readonly project: () => ProjectDocument | undefined;
  readonly options: () => ViewportRenderOptions;
  readonly provider: () => BlockVisualProvider | undefined;
  readonly missingBlocksTerminal: () => boolean;
  readonly progress: () => ViewportHydrationProgress;
  readonly recordMissingAccountingInvariant: (checkpoint: string) => void;
}

export interface ViewportHydrationFinalizationDependencies {
  readonly blockIndex: ViewportBlockIndexOwner;
  readonly representations: ViewportBlockRepresentationStore;
  readonly hydration: ViewportBlockHydrationPipeline<BlockHydrationJob>;
  readonly projection: YLayerProjectionCoordinator;
  readonly culling: { has(key: string): boolean };
  readonly fluids: FluidRenderCoordinator;
  readonly terrainWorkflow: ViewportTerrainWorkflowOwner;
  readonly representationCommit: BlockRepresentationCommitOwner;
  readonly placeholders: PlaceholderBatchRenderer;
  readonly settlement: ViewportHydrationSettlementOwner;
  readonly reconciliation: ViewportStructureReconciliationOwner;
  readonly instances: StaticModelBatchRenderer;
  readonly lifecycle: ViewportHydrationLifecycleOwner;
  readonly instanceThreshold: number;
}

export interface ViewportHydrationFinalizationPorts {
  readonly removeRepresentation: (key: string, entry: RenderedBlockEntry) => void;
  readonly ensurePlaceholder: (key: string, entry: VisibleBlockProjectionEntry) => void;
  readonly removePlaceholder: (key: string) => void;
  readonly queuedDecorationWork: () => number;
}

/** Owns watchdog finalization evidence and repair of unresolved visible representations. */
export class ViewportHydrationFinalizationOwner {
  constructor(
    private readonly scope: ViewportHydrationFinalizationScope,
    private readonly owners: ViewportHydrationFinalizationDependencies,
    private readonly ports: ViewportHydrationFinalizationPorts,
  ) {}

  auditProgress(includeOwnership = true): ViewportHydrationProgress {
    this.scope.recordMissingAccountingInvariant('finalization-audit');
    const progress = this.scope.progress();
    const project = this.scope.project();
    if (!includeOwnership || !project || this.owners.projection.visibleProject !== project)
      return progress;

    let finalReadyBlocks = 0;
    let provisionalMissingBlocks = 0;
    let permanentMissingBlocks = 0;
    const entries = this.entries();
    for (const entry of entries) {
      const key = coordinateKey(entry.block.position);
      if (entry.block.kind === 'missing') {
        if (this.scope.missingBlocksTerminal()) permanentMissingBlocks += 1;
        else provisionalMissingBlocks += 1;
      } else {
        const rendered = this.owners.representations.get(key);
        if (
          this.owners.culling.has(key) ||
          (rendered && this.owners.settlement.hasCommittedBlockOwnership(key, rendered))
        ) {
          finalReadyBlocks += 1;
        }
      }
    }
    const expectedBlocks = entries.length;
    const finalization: HydrationFinalizationSnapshot = {
      expectedBlocks,
      finalReadyBlocks,
      provisionalMissingBlocks,
      permanentMissingBlocks,
      pendingBlocks: Math.max(
        0,
        expectedBlocks - finalReadyBlocks - provisionalMissingBlocks - permanentMissingBlocks,
      ),
    };
    return { ...progress, finalization };
  }

  reconcileAccounting(): void {
    const project = this.scope.project();
    if (!project || this.owners.projection.visibleProject !== project) return;
    const entries = this.entries();
    this.owners.settlement.adoptCommittedBlockOwnership(entries);
    this.requeueUnfinished(entries);
    this.owners.hydration.publishProgress(this.owners.hydration.progressSnapshot());
    if (this.owners.hydration.queuedWork() || this.ports.queuedDecorationWork()) {
      this.owners.lifecycle.schedule();
    }
  }

  private entries(): readonly VisibleBlockProjectionEntry[] {
    if (!this.owners.projection.hasDirectPresentation) return this.owners.projection.visibleEntries;
    const project = this.scope.project();
    return project
      ? this.owners.reconciliation.visibleBlocks(project, this.scope.options(), false)
      : [];
  }

  private requeueUnfinished(entries: readonly VisibleBlockProjectionEntry[]): void {
    const provider = this.scope.provider();
    const project = this.scope.project();
    if (!provider || !project || !entries.length) return;

    const {
      blockIndex,
      hydration,
      projection,
      representations,
      fluids,
      culling,
      terrainWorkflow,
      representationCommit,
      placeholders,
      settlement,
      reconciliation,
      instances,
      lifecycle,
    } = this.owners;
    const generation = hydration.generation;
    const options = this.scope.options();
    const worldContext = {
      visualRevisionKey: blockIndex.visualRevision,
      getBlock: (position: ProjectDocument['blocks'][number]['position']) =>
        blockIndex.get(position),
    };
    const visibleEntries = entries.filter(
      (entry) => !fluids.isClaimed(coordinateKey(entry.block.position)),
    );
    const visibleMap = new Map(
      visibleEntries.map((entry) => [coordinateKey(entry.block.position), entry] as const),
    );
    const queuedKeys = new Set(hydration.regularJobs().map((job) => job.key));
    const allowInstancing =
      visibleEntries.length >= this.owners.instanceThreshold || instances.batches.size > 0;
    const terrainCandidates: TerrainHydrationCandidate[] = [];
    let queuedAny = false;

    for (const entry of visibleEntries) {
      if (entry.block.kind === 'missing') continue;
      const key = coordinateKey(entry.block.position);
      if (culling.has(key) || queuedKeys.has(key) || hydration.hasRunningOwnership(key)) continue;
      const rendered = representations.get(key);
      if (
        rendered &&
        rendered.signature === entry.signature &&
        rendered.role === entry.role &&
        !hydration.hasPendingSignature(key) &&
        !terrainWorkflow.placeholderState.has(key) &&
        !placeholders.indices.has(key) &&
        settlement.hasCommittedBlockOwnership(key, rendered)
      )
        continue;

      hydration.clearPendingSignature(key);
      if (rendered) this.ports.removeRepresentation(key, rendered);
      this.ports.removePlaceholder(key);
      terrainWorkflow.placeholderState.delete(key);
      this.ports.ensurePlaceholder(key, entry);
      hydration.setPendingSignature(key, entry.signature);
      const terrainCandidate = reconciliation.terrainCandidate(key, entry, worldContext, options);
      if (terrainCandidate) {
        representationCommit.publish({
          key,
          block: entry.block,
          signature: entry.signature,
          role: entry.role,
          revision: 0,
          provider,
          reusableVisualKey: terrainCandidate.reusableKey,
        });
        terrainCandidates.push(terrainCandidate);
      } else {
        hydration.enqueueRegular({
          token: generation,
          projectionRevision: projection.revisionForKey(key),
          key,
          block: entry.block,
          signature: entry.signature,
          role: entry.role,
          worldContext,
          options,
          allowInstancing,
          surfaceFastPathEligible:
            options.exposedFaceRendering === true && isCompiledTerrainEntry(entry),
          surfaceVisibleEntries: visibleMap,
        });
      }
      queuedAny = true;
    }

    if (terrainCandidates.length) {
      const affected = new Map<string, ProjectDocument['blocks'][number]['position']>();
      for (const candidate of terrainCandidates) {
        affected.set(coordinateKey(candidate.next.block.position), candidate.next.block.position);
        for (const neighbor of coordinateNeighbors(candidate.next.block.position))
          affected.set(coordinateKey(neighbor), neighbor);
      }
      terrainWorkflow.scheduleWorkflowBatch(
        terrainCandidates,
        visibleEntries,
        [...affected.values()],
        false,
        false,
        'structural',
      );
      queuedAny = true;
    }
    if (queuedAny) {
      lifecycle.beginProgress();
      lifecycle.schedule();
    }
  }
}
