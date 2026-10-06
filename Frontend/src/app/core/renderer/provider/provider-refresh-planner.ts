import { CooperativeWorkBudget, yieldToBrowser } from '../../assets/cooperative-yield';

export interface ProviderRefreshPlannerProgress {
  readonly phase: 'planning';
  readonly processed: number;
  readonly total: number;
  readonly considered: number;
  readonly queued: number;
  readonly maxSliceMs: number;
  readonly yields: number;
}

export interface ProviderRefreshPlannerResult<T> {
  readonly jobs: readonly T[];
  readonly processed: number;
  readonly considered: number;
  readonly queued: number;
  readonly maxSliceMs: number;
  readonly yields: number;
  readonly durationMs: number;
}

export interface ProviderRefreshPlannerOptions {
  readonly maxMilliseconds?: number;
  readonly maxItems?: number;
  readonly yield?: (signal?: AbortSignal) => Promise<void>;
}

/** Bounded, cancellable provider handoff classification. */
export class ProviderRefreshPlanner<TInput, TJob> {
  private generation = 0;
  private controller?: AbortController;

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
  }

  start(
    inputs: readonly TInput[],
    classify: (input: TInput) => { readonly considered: boolean; readonly job?: TJob },
    callbacks: { readonly onStart?: (total: number) => void; readonly onProgress?: (progress: ProviderRefreshPlannerProgress) => void; readonly onComplete: (result: ProviderRefreshPlannerResult<TJob>) => void; readonly onCancel?: () => void; readonly onError?: (error: unknown) => void },
    options: ProviderRefreshPlannerOptions = {},
  ): void {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const budget = new CooperativeWorkBudget(options.maxMilliseconds ?? 8, options.maxItems ?? 64);
    const yieldWork = options.yield ?? yieldToBrowser;
    callbacks.onStart?.(inputs.length);
    void this.run(inputs, classify, callbacks, budget, yieldWork, controller.signal, generation).catch((error) => {
      if (controller.signal.aborted || generation !== this.generation) { callbacks.onCancel?.(); return; }
      callbacks.onError?.(error);
    });
  }

  private async run(
    inputs: readonly TInput[],
    classify: (input: TInput) => { readonly considered: boolean; readonly job?: TJob },
    callbacks: { readonly onProgress?: (progress: ProviderRefreshPlannerProgress) => void; readonly onComplete: (result: ProviderRefreshPlannerResult<TJob>) => void; readonly onCancel?: () => void },
    budget: CooperativeWorkBudget,
    yieldWork: (signal?: AbortSignal) => Promise<void>,
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    const startedAt = performance.now();
    let considered = 0;
    let yields = 0;
    let maxSliceMs = 0;
    const jobs: TJob[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      signal.throwIfAborted();
      if (generation !== this.generation) { callbacks.onCancel?.(); return; }
      const sliceStarted = performance.now();
      const result = classify(inputs[index]);
      if (result.considered) considered += 1;
      if (result.job !== undefined) jobs.push(result.job);
      const sliceDuration = performance.now() - sliceStarted;
      if (sliceDuration > maxSliceMs) maxSliceMs = sliceDuration;
      const processed = index + 1;
      if (processed === inputs.length || budget.shouldYieldNow()) {
        callbacks.onProgress?.({ phase: 'planning', processed, total: inputs.length, considered, queued: jobs.length, maxSliceMs, yields });
        if (processed < inputs.length) {
          yields += 1;
          budget.reset();
          await yieldWork(signal);
        }
      }
    }
    if (generation !== this.generation || signal.aborted) { callbacks.onCancel?.(); return; }
    this.controller = undefined;
    callbacks.onComplete({ jobs, processed: inputs.length, considered, queued: jobs.length, maxSliceMs, yields, durationMs: performance.now() - startedAt });
  }
}
