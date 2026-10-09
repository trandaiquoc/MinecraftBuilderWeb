import { describe, expect, it, vi } from 'vitest';
import { ProviderRefreshPlanner } from './provider-refresh-planner';

describe('ProviderRefreshPlanner', () => {
  it('reports planning before completion and yields cooperatively', async () => {
    const planner = new ProviderRefreshPlanner<number, number>();
    const progress: number[] = [];
    let result: { jobs: readonly number[]; yields: number } | undefined;
    planner.start([1, 2, 3, 4], (value) => ({ considered: true, job: value * 2 }), {
      onProgress: (value) => progress.push(value.processed),
      onComplete: (value) => { result = value; },
    }, { maxMilliseconds: 60_000, maxItems: 2, yield: async () => undefined });
    await vi.waitFor(() => expect(result).toBeDefined());
    expect(progress).toEqual([2, 4]);
    expect(result).toMatchObject({ jobs: [2, 4, 6, 8], yields: 1 });
  });

  it('cancels a superseded plan without publishing stale jobs', async () => {
    const planner = new ProviderRefreshPlanner<number, number>();
    const complete = vi.fn();
    const cancelled = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    planner.start([1, 2, 3], (value) => ({ considered: true, job: value }), { onComplete: complete, onCancel: cancelled }, { maxItems: 1, yield: async () => gate });
    await Promise.resolve();
    planner.start([9], (value) => ({ considered: true, job: value }), { onComplete: complete }, { yield: async () => undefined });
    release();
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(complete.mock.calls[0][0].jobs).toEqual([9]);
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
  });

  it('completes a zero-work plan immediately', async () => {
    const planner = new ProviderRefreshPlanner<number, number>();
    const complete = vi.fn();
    planner.start([], () => ({ considered: true }), { onComplete: complete });
    await Promise.resolve();
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ jobs: [], queued: 0, processed: 0 }));
  });

  it('reports cancellation and errors as terminal planner outcomes', async () => {
    const planner = new ProviderRefreshPlanner<number, number>();
    const cancelled = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    planner.start([1, 2], (value) => ({ considered: true, job: value }), { onComplete: vi.fn(), onCancel: cancelled }, { maxItems: 1, yield: async () => gate });
    await Promise.resolve();
    planner.cancel();
    release();
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));

    const error = vi.fn();
    planner.start([1], () => { throw new Error('planner failed'); }, { onComplete: vi.fn(), onError: error });
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
