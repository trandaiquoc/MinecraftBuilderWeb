import { describe, expect, it, vi } from 'vitest';
import { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import type { HydrationWorkItem } from '../scheduling/hydration-work-coordinator';
import { ViewportProviderRefreshPipeline } from './viewport-provider-refresh-pipeline';

interface Job extends HydrationWorkItem {
  readonly refreshGeneration: number;
}

describe('ViewportProviderRefreshPipeline', () => {
  const createHydrationPipeline = () => new ViewportBlockHydrationPipeline<Job>({
    concurrency: 2,
    regularReservedCapacity: 1,
    providerRefreshCapacity: 1,
  });

  it('plans provider work with its generation and completes progress from shared hydration ownership', async () => {
    const hydration = createHydrationPipeline();
    const work = hydration.work;
    const pipeline = new ViewportProviderRefreshPipeline<object, number, Job>(hydration);
    const schedule = vi.fn();
    const generation = pipeline.plan([4, 8], (value, planGeneration) => ({
      considered: true,
      job: { key: String(value), token: 3, refreshGeneration: planGeneration },
    }), { onScheduleHydration: schedule });

    expect(generation).toBe(1);
    expect(pipeline.isPlanning).toBe(false);
    expect(pipeline.planningDiagnostics).toMatchObject({ processed: 2, total: 2, queued: 2 });
    expect(pipeline.progress).toMatchObject({ total: 2, completed: 0 });
    expect(schedule).toHaveBeenCalledOnce();

    const first = work.takeNext(3)!;
    expect(first.refreshGeneration).toBe(generation);
    work.complete(first);
    pipeline.completeJob(generation, {});
    expect(pipeline.progress).toMatchObject({ total: 2, completed: 1 });

    const second = work.takeNext(3)!;
    work.complete(second);
    pipeline.completeJob(generation, {});
    expect(pipeline.progress).toBeUndefined();
  });

  it('retains retired providers until both representation and queued-work owners release them', () => {
    const hydration = createHydrationPipeline();
    type Provider = { retain(): void; release(): void };
    const pipeline = new ViewportProviderRefreshPipeline<Provider, never, Job>(hydration);
    const first: Provider = { retain: vi.fn<() => void>(), release: vi.fn<() => void>() };
    const second: Provider = { retain: vi.fn<() => void>(), release: vi.fn<() => void>() };
    pipeline.transition(undefined, first);
    pipeline.transition(first, second);
    expect(first.release).not.toHaveBeenCalled();
    expect(second.retain).toHaveBeenCalledOnce();

    let referenced = true;
    pipeline.releaseUnused((provider) => provider === first && referenced, () => false);
    expect(first.release).not.toHaveBeenCalled();
    referenced = false;
    pipeline.releaseUnused(() => false, () => false);
    expect(first.release).toHaveBeenCalledOnce();
  });

  it('coalesces deferred provider transitions from the first old provider to the latest provider', () => {
    const pipeline = new ViewportProviderRefreshPipeline<object, never, Job>(createHydrationPipeline());
    const oldProvider = {};
    const intermediate = {};
    const latest = {};
    pipeline.defer(oldProvider, intermediate);
    pipeline.defer(intermediate, latest);
    expect(pipeline.takeDeferred()).toEqual({ previous: oldProvider, next: latest });
    expect(pipeline.takeDeferred()).toBeUndefined();
  });

  it('returns provider-refresh progress as a detached snapshot', () => {
    const pipeline = new ViewportProviderRefreshPipeline<object, number, Job>(createHydrationPipeline());
    pipeline.plan([1], (value, generation) => ({ considered: true, job: { key: String(value), token: 3, refreshGeneration: generation } }), {});
    const progress = pipeline.progress as unknown as { completed: number };
    progress.completed = 99;
    expect(pipeline.progress?.completed).toBe(0);
  });

  it('classifies missing and reusable candidates inside the refresh workflow', () => {
    const hydration = createHydrationPipeline();
    const pipeline = new ViewportProviderRefreshPipeline<object, { key: string; missing?: boolean; previousProvider: object; nextProvider: object }, Job>(hydration);
    const oldProvider = {};
    const nextProvider = {};
    const schedule = vi.fn();
    pipeline.refresh([
      { key: 'missing', missing: true, previousProvider: oldProvider, nextProvider },
      { key: 'same', previousProvider: oldProvider, nextProvider },
      { key: 'changed', previousProvider: oldProvider, nextProvider },
    ], {
      isMissing: (candidate) => !!candidate.missing,
      isFluid: () => false,
      reusableKey: (candidate, provider) => candidate.key === 'same' ? 'same' : provider === oldProvider ? 'old' : 'new',
      createJob: (candidate, generation) => ({ key: candidate.key, token: 0, refreshGeneration: generation }),
      onScheduleHydration: schedule,
    });
    expect(hydration.work.providerRefreshJobs().map((job) => job.key)).toEqual(['changed']);
    expect(schedule).toHaveBeenCalledOnce();
  });
});
