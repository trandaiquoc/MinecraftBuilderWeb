import type { HydrationWorkItem } from '../scheduling/hydration-work-coordinator';
import type { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import { ProviderRefreshCoordinator } from './provider-refresh-coordinator';
import { ProviderRefreshPlanner } from './provider-refresh-planner';
import type {
  ProviderRefreshPlannerProgress,
  ProviderRefreshPlannerResult,
} from './provider-refresh-planner';

export interface ProviderRefreshPlanDiagnostics {
  readonly processed: number;
  readonly total: number;
  readonly considered: number;
  readonly queued: number;
  readonly maxSliceMs: number;
  readonly yields: number;
  readonly durationMs: number;
}

export interface ProviderRefreshProgress {
  readonly total: number;
  readonly completed: number;
  readonly startedAt: number;
}

interface MutableProviderRefreshProgress {
  total: number;
  completed: number;
  startedAt: number;
}

export interface ProviderRefreshCandidateResult<TJob> {
  readonly considered: boolean;
  readonly job?: TJob;
}

export interface ProviderRefreshInput<P> {
  readonly previousProvider: P;
  readonly nextProvider: P;
}

export interface ProviderRefreshOptions<P, TInput, TJob extends HydrationWorkItem> {
  readonly isMissing: (candidate: TInput) => boolean;
  readonly isFluid: (candidate: TInput) => boolean;
  readonly reusableKey: (candidate: TInput, provider: P) => string | undefined;
  readonly createJob: (candidate: TInput, generation: number) => TJob;
  readonly onTrace?: (event: string, details: Readonly<Record<string, unknown>>) => void;
  readonly onStateChange?: () => void;
  readonly onScheduleHydration?: () => void;
}

/** Coordinates provider handoff planning, hydration enqueueing, and retired-provider lifetime. */
export class ViewportProviderRefreshPipeline<
  P extends { retain?(): void; release?(): void },
  TInput,
  TJob extends HydrationWorkItem,
> {
  readonly providers = new ProviderRefreshCoordinator<P>();
  private readonly planner = new ProviderRefreshPlanner<TInput, TJob>();
  private currentPlanGeneration = 0;
  private planning = false;
  private activeProgress?: MutableProviderRefreshProgress;
  private diagnostics: ProviderRefreshPlanDiagnostics = emptyPlanDiagnostics();
  private deferred?: { readonly previous: P; readonly next: P };

  constructor(private readonly hydrationPipeline: ViewportBlockHydrationPipeline<TJob>) {}

  get providerGeneration(): number {
    return this.providers.generation;
  }
  get planGeneration(): number {
    return this.currentPlanGeneration;
  }
  get isPlanning(): boolean {
    return this.planning;
  }
  get progress(): ProviderRefreshProgress | undefined {
    return this.activeProgress ? { ...this.activeProgress } : undefined;
  }
  get planningDiagnostics(): ProviderRefreshPlanDiagnostics {
    return this.diagnostics;
  }

  transition(previous: P | undefined, next: P | undefined): void {
    this.providers.transition(previous, next);
  }

  defer(previous: P, next: P): void {
    this.deferred = { previous: this.deferred?.previous ?? previous, next };
  }

  takeDeferred(): { readonly previous: P; readonly next: P } | undefined {
    const deferred = this.deferred;
    this.deferred = undefined;
    return deferred;
  }

  plan<TPlanInput extends TInput>(
    inputs: readonly TPlanInput[],
    classify: (input: TPlanInput, generation: number) => ProviderRefreshCandidateResult<TJob>,
    callbacks: {
      readonly onTrace?: (event: string, details: Readonly<Record<string, unknown>>) => void;
      readonly onStateChange?: () => void;
      readonly onScheduleHydration?: () => void;
    },
  ): number {
    this.planner.cancel();
    this.hydrationPipeline.clearPendingProviderRefreshWork();
    const generation = ++this.currentPlanGeneration;
    this.planning = true;
    this.activeProgress = undefined;
    this.diagnostics = emptyPlanDiagnostics();
    callbacks.onTrace?.('provider-refresh-planning-start', { generation });
    callbacks.onStateChange?.();

    this.planner.start(inputs, (input) => classify(input, generation), {
      onProgress: (progress: ProviderRefreshPlannerProgress) => {
        if (generation !== this.currentPlanGeneration) return;
        this.diagnostics = {
          ...this.diagnostics,
          processed: progress.processed,
          total: progress.total,
          considered: progress.considered,
          queued: progress.queued,
          maxSliceMs: progress.maxSliceMs,
          yields: progress.yields,
        };
        callbacks.onTrace?.('provider-refresh-planning-progress', { ...progress });
      },
      onComplete: (result) => this.completePlan(generation, inputs.length, result, callbacks),
      onCancel: () => {
        if (generation !== this.currentPlanGeneration) return;
        this.planning = false;
        this.activeProgress = undefined;
        callbacks.onTrace?.('provider-refresh-planning-cancel-terminal', { generation });
        callbacks.onStateChange?.();
      },
      onError: (error) => {
        if (generation !== this.currentPlanGeneration) return;
        this.planning = false;
        this.activeProgress = undefined;
        callbacks.onTrace?.('provider-refresh-planning-error-terminal', {
          generation,
          message: error instanceof Error ? error.message : String(error),
        });
        callbacks.onStateChange?.();
      },
    });
    return generation;
  }

  /** Builds provider-refresh candidates from representation inputs before handing jobs to hydration. */
  refresh<TCandidate extends TInput & ProviderRefreshInput<P>>(
    inputs: readonly TCandidate[],
    options: ProviderRefreshOptions<P, TCandidate, TJob>,
  ): number {
    return this.plan(
      inputs,
      (candidate, generation) => {
        if (options.isMissing(candidate)) return { considered: false };
        if (options.isFluid(candidate)) return { considered: true };
        const oldKey = options.reusableKey(candidate, candidate.previousProvider);
        const newKey = options.reusableKey(candidate, candidate.nextProvider);
        if (oldKey === newKey && oldKey !== undefined) return { considered: true };
        return { considered: true, job: options.createJob(candidate, generation) };
      },
      options,
    );
  }

  refreshRepresentations<E, V>(
    representations: Iterable<[string, E]>,
    visible: ReadonlyMap<string, V>,
    createInput: (key: string, entry: E, visibleEntry: V) => TInput & ProviderRefreshInput<P>,
    options: ProviderRefreshOptions<P, TInput & ProviderRefreshInput<P>, TJob>,
  ): number {
    const inputs: Array<TInput & ProviderRefreshInput<P>> = [];
    for (const [key, entry] of representations) {
      const visibleEntry = visible.get(key);
      if (visibleEntry) inputs.push(createInput(key, entry, visibleEntry));
    }
    return this.refresh(inputs, options);
  }

  completeJob(
    generation: number | undefined,
    callbacks: {
      readonly onTrace?: (event: string, details: Readonly<Record<string, unknown>>) => void;
      readonly onStateChange?: () => void;
    },
  ): void {
    if (generation !== this.currentPlanGeneration || !this.activeProgress) return;
    this.activeProgress.completed = Math.min(
      this.activeProgress.total,
      this.activeProgress.completed + 1,
    );
    const counts = this.hydrationPipeline.workCounts();
    if (!counts.providerRefreshQueued && !counts.providerRefreshRunning) {
      callbacks.onTrace?.('provider-refresh-end', {
        completed: this.activeProgress.completed,
        durationMs: performance.now() - this.activeProgress.startedAt,
      });
      this.activeProgress = undefined;
    }
    callbacks.onStateChange?.();
  }

  cancelPlanning(): void {
    this.currentPlanGeneration += 1;
    this.planner.cancel();
    this.hydrationPipeline.clearPendingProviderRefreshWork();
    this.planning = false;
    this.activeProgress = undefined;
  }

  releaseUnused(referenced: (provider: P) => boolean): void {
    this.providers.releaseUnused({ referenced });
  }

  retire(provider: P | undefined): void {
    this.providers.retire(provider);
  }

  dispose(referenced?: (provider: P) => boolean): void {
    this.cancelPlanning();
    this.providers.clear(referenced);
    this.deferred = undefined;
  }

  private completePlan(
    generation: number,
    inputCount: number,
    result: ProviderRefreshPlannerResult<TJob>,
    callbacks: {
      readonly onTrace?: (event: string, details: Readonly<Record<string, unknown>>) => void;
      readonly onStateChange?: () => void;
      readonly onScheduleHydration?: () => void;
    },
  ): void {
    if (generation !== this.currentPlanGeneration) return;
    this.planning = false;
    const queued = result.jobs.reduce(
      (count, job) => count + (this.hydrationPipeline.enqueueProviderRefresh(job) ? 1 : 0),
      0,
    );
    this.diagnostics = {
      processed: result.processed,
      total: inputCount,
      considered: result.considered,
      queued,
      maxSliceMs: result.maxSliceMs,
      yields: result.yields,
      durationMs: result.durationMs,
    };
    callbacks.onTrace?.('provider-refresh-planning-end', {
      generation,
      considered: result.considered,
      queued,
      processed: result.processed,
      durationMs: result.durationMs,
      maxSliceMs: result.maxSliceMs,
      yields: result.yields,
    });
    callbacks.onTrace?.('provider-refresh-queued', { queued });
    if (queued) {
      this.activeProgress = { total: queued, completed: 0, startedAt: performance.now() };
      callbacks.onTrace?.('provider-refresh-start', { queued });
    }
    callbacks.onStateChange?.();
    if (this.hydrationPipeline.queuedProviderRefreshWork()) callbacks.onScheduleHydration?.();
  }
}

function emptyPlanDiagnostics(): ProviderRefreshPlanDiagnostics {
  return {
    processed: 0,
    total: 0,
    considered: 0,
    queued: 0,
    maxSliceMs: 0,
    yields: 0,
    durationMs: 0,
  };
}
