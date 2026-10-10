import type { DecorationRenderLifecycle } from '../visuals/decoration-render-lifecycle';
import type { RendererDiagnostics } from '../engine/renderer-diagnostics';
import type { YLayerRepresentationPrewarmOwner } from '../engine/y-layer-representation-prewarm-owner';
import type { ViewportTerrainWorkflowOwner } from '../terrain/viewport-terrain-workflow-owner';
import type { ViewportBlockHydrationPipeline } from './viewport-block-hydration-pipeline';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';

export type HydrationCancellationReason =
  | 'structure-sync-key-changed'
  | 'project-identity-changed'
  | 'in-place-project-mutation'
  | 'dispose';

export interface HydrationLifecycleScope {
  readonly isDisposed: () => boolean;
  readonly isSuspended: () => boolean;
  readonly isBackgroundPreparation: () => boolean;
  readonly isLayerPrewarming: () => boolean;
  readonly cancellationDiagnostics: () => Readonly<Record<string, unknown>>;
  readonly trace: (event: string, details: Readonly<Record<string, unknown>>) => void;
}

/** Owns hydration scheduling gates and the terminal cleanup of a generation transition. */
export class ViewportHydrationLifecycleOwner {
  constructor(
    private readonly pipeline: ViewportBlockHydrationPipeline<BlockHydrationJob>,
    private readonly prewarm: YLayerRepresentationPrewarmOwner,
    private readonly terrain: ViewportTerrainWorkflowOwner,
    private readonly decorations: DecorationRenderLifecycle,
    private readonly providerRefresh: { cancelPlanning(): void },
    private readonly diagnostics: RendererDiagnostics,
    private readonly scope: HydrationLifecycleScope,
    private readonly executionPort: import('./block-hydration-work-owner').HydrationExecutionPort<BlockHydrationJob>,
  ) {}

  beginProgress(lane = this.pipeline.lane): void {
    this.pipeline.setLane(lane);
    this.pipeline.setProgressLane(lane);
    this.pipeline.beginProgress(this.pipeline.generation, lane);
  }

  completePart(token: number, kind: 'block' | 'decoration', key: string): void {
    this.pipeline.completeProgress(token, kind, key);
  }

  completeBlockBatch(token: number, keys: readonly string[]): void {
    this.pipeline.completeProgressBatch(token, 'block', keys);
  }

  schedule(delay: boolean | number = false): void {
    if (
      this.scope.isDisposed() ||
      (this.scope.isSuspended() &&
        !this.scope.isBackgroundPreparation() &&
        !this.scope.isLayerPrewarming())
    )
      return;
    const effectiveDelay = this.scope.isBackgroundPreparation() && !delay ? true : delay;
    this.pipeline.schedule(() => this.pipeline.process(this.executionPort), effectiveDelay);
  }

  cancel(
    reason: HydrationCancellationReason = 'structure-sync-key-changed',
    context: Readonly<Record<string, unknown>> = {},
  ): void {
    this.prewarm.cancel();
    const previousGeneration = this.pipeline.generation;
    this.pipeline.advanceGeneration();
    const diagnostics = this.scope.cancellationDiagnostics();
    this.scope.trace('hydration-generation-start', {
      ...context,
      ...diagnostics,
      reason,
      previousGeneration,
      generation: this.pipeline.generation,
    });
    const wasCameraInteracting = diagnostics['cameraInteractionInProgress'] === true;
    if (wasCameraInteracting) this.diagnostics.record('cameraOnlyGenerationChanges');
    this.diagnostics.record('hydrationGenerations');
    if (this.pipeline.queuedWork() || this.pipeline.runningTotal)
      this.diagnostics.record('cancelledHydrations');
    this.pipeline.clearPendingWork();
    this.pipeline.clearPendingSignatures();
    this.terrain.resetGroups();
    this.pipeline.clearRunningOwnership();
    this.decorations.cancelPending();
    this.pipeline.clearBatchBudget();
    this.pipeline.cancelScheduledWork();
    this.pipeline.clearProgress();
    this.providerRefresh.cancelPlanning();
    this.pipeline.setLane('structural');
    this.pipeline.setProgressLane('structural');
    this.pipeline.resetProgress();
  }
}
