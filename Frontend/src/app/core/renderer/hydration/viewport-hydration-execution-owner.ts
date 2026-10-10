import type { DecorationRenderLifecycle } from '../visuals/decoration-render-lifecycle';
import type { ViewportRuntimeTrace } from '../diagnostics/viewport-runtime-trace';
import type { RendererDiagnostics } from '../engine/renderer-diagnostics';
import type { YLayerProjectionCoordinator } from '../engine/y-layer-projection-coordinator';
import type { BlockRepresentationHydrationOwner } from '../visuals/block-representation-hydration-owner';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import type { HydrationExecutionPort } from './block-hydration-work-owner';
import type { ViewportBlockHydrationPipeline } from './viewport-block-hydration-pipeline';

export interface ViewportHydrationExecutionOptions {
  readonly syncBudgetMs: number;
  readonly interactiveSyncBudgetMs: number;
  readonly maxJobsPerBatch: number;
  readonly interactiveMaxJobsPerBatch: number;
}

export interface ViewportHydrationExecutionDependencies {
  readonly hydrationPipeline: ViewportBlockHydrationPipeline<BlockHydrationJob>;
  readonly blockRepresentationHydration: BlockRepresentationHydrationOwner;
  readonly providerRefreshPipeline: {
    readonly completeJob: (
      generation: number | undefined,
      callbacks: {
        readonly onTrace?: (event: string, details: Readonly<Record<string, unknown>>) => void;
        readonly onStateChange?: () => void;
      },
    ) => void;
  };
  readonly projection: YLayerProjectionCoordinator;
  readonly decorations: DecorationRenderLifecycle;
  readonly diagnostics: RendererDiagnostics;
  readonly runtimeTrace: () => ViewportRuntimeTrace | undefined;
  readonly isStopped: () => boolean;
  readonly isInteractive: () => boolean;
  readonly rollbackPartialInstanceVisual: (key: string) => void;
  readonly markHydrationFailure: (job: BlockHydrationJob, error: unknown) => void;
  readonly publishProviderRefreshProgress: () => void;
  readonly completeHydrationPart: (token: number, key: string) => void;
  readonly onLayerPrewarmComplete: (job: BlockHydrationJob, authoritative: boolean) => void;
}

/** Owns the adapter between viewport concerns and the generic hydration scheduler. */
export class ViewportHydrationExecutionOwner {
  readonly port: HydrationExecutionPort<BlockHydrationJob>;

  constructor(
    private readonly dependencies: ViewportHydrationExecutionDependencies,
    private readonly options: ViewportHydrationExecutionOptions,
  ) {
    this.port = this.createPort();
  }

  private createPort(): HydrationExecutionPort<BlockHydrationJob> {
    const d = this.dependencies;
    return {
      isStopped: d.isStopped,
      isInteractive: d.isInteractive,
      now: () => performance.now(),
      budgetMs: (interactive) =>
        interactive ? this.options.interactiveSyncBudgetMs : this.options.syncBudgetMs,
      interactiveJobLimit: () => this.options.interactiveMaxJobsPerBatch,
      jobLimit: () => this.options.maxJobsPerBatch,
      ownership: (job) => ({ revision: job.projectionRevision, signature: job.signature }),
      execute: (job, complete) => {
        if (job.providerRefresh) d.blockRepresentationHydration.refresh(job, complete);
        else d.blockRepresentationHydration.create(job, complete);
      },
      onBatchStart: () => d.diagnostics.record('hydrationBatches'),
      onJobStarted: (job, fairnessDeferrals) => this.onJobStarted(job, fairnessDeferrals),
      onExecutionFailure: (job, error) => {
        d.rollbackPartialInstanceVisual(job.key);
        if (!job.providerRefresh) d.markHydrationFailure(job, error);
      },
      onJobComplete: (job, authoritative) => this.onJobComplete(job, authoritative),
      processAdditionalWork: (generation, deadline) =>
        this.processDecorationBatch(generation, deadline),
      hasAdditionalWork: () => d.decorations.queuedCount > 0,
      onBatchDuration: (durationMs) =>
        d.runtimeTrace()?.recordDuration('processHydrationBatch', durationMs),
    };
  }

  private onJobStarted(job: BlockHydrationJob, fairnessDeferrals: number): void {
    const d = this.dependencies;
    if (fairnessDeferrals) d.diagnostics.record('hydrationFairnessDeferrals', fairnessDeferrals);
    if (d.isInteractive()) d.diagnostics.record('hydrationJobsStartedWhileCamera');
    if (job.layerPrewarm) d.diagnostics.record('yLayerRepresentationJobsStarted');
    else
      d.diagnostics.record(
        job.providerRefresh ? 'providerRefreshStarted' : 'regularHydrationStarted',
      );
    if (job.providerRefresh) {
      const counts = d.hydrationPipeline.workCounts();
      if (counts.regularQueued > 0) {
        d.diagnostics.record(
          'maxProviderRefreshRunningWhileRegularPending',
          Math.max(
            0,
            counts.providerRefreshRunning -
              d.diagnostics.snapshot().maxProviderRefreshRunningWhileRegularPending,
          ),
        );
      }
    }
  }

  private onJobComplete(job: BlockHydrationJob, authoritative: boolean): void {
    const d = this.dependencies;
    if (job.layerPrewarm) {
      d.onLayerPrewarmComplete(job, authoritative);
      return;
    }
    d.diagnostics.record(
      job.providerRefresh ? 'providerRefreshCompleted' : 'regularHydrationCompleted',
    );
    if (job.providerRefresh) {
      d.providerRefreshPipeline.completeJob(job.providerRefreshGeneration, {
        onTrace: (event, details) => d.runtimeTrace()?.record(event, details),
        onStateChange: d.publishProviderRefreshProgress,
      });
    }
    const currentVisible = d.projection.visibleEntry(job.key);
    const current =
      authoritative &&
      job.projectionRevision === d.projection.revisionForKey(job.key) &&
      currentVisible?.signature === job.signature &&
      currentVisible.role === job.role;
    if (!job.providerRefresh && !current) d.diagnostics.record('staleHydrationCompletionsIgnored');
    else if (!job.providerRefresh && job.block.kind !== 'missing')
      d.completeHydrationPart(job.token, job.key);
  }

  private processDecorationBatch(generation: number, deadline: number): void {
    const d = this.dependencies;
    const maxJobs = d.isInteractive()
      ? this.options.interactiveMaxJobsPerBatch
      : this.options.maxJobsPerBatch;
    const processed = d.decorations.processBatch(generation, deadline, maxJobs);
    if (d.isInteractive() && processed)
      d.diagnostics.record('hydrationJobsStartedWhileCamera', processed);
  }
}
export type { HydrationExecutionPort } from './block-hydration-work-owner';
