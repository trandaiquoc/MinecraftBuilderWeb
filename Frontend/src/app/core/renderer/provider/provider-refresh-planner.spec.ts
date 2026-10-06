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
    }, { maxItems: 2, yield: async () => undefined });
    await vi.waitFor(() => expect(result).toBeDefined());
    expect(progress).toEqual([2, 4]);
    expect(result).toMatchObject({ jobs: [2, 4, 6, 8], yields: 1 });
  });

  it('cancels a superseded plan without publishing stale jobs', async () => {
    const planner = new ProviderRefreshPlanner<number, number>();
    const complete = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    planner.start([1, 2, 3], (value) => ({ considered: true, job: value }), { onComplete: complete }, { maxItems: 1, yield: async () => gate });
    await Promise.resolve();
    planner.start([9], (value) => ({ considered: true, job: value }), { onComplete: complete }, { yield: async () => undefined });
    release();
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(complete.mock.calls[0][0].jobs).toEqual([9]);
  });
});
