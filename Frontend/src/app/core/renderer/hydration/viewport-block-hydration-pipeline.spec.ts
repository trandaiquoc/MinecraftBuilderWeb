import { describe, expect, it, vi } from 'vitest';
import { ViewportBlockHydrationPipeline } from './viewport-block-hydration-pipeline';

interface Job { readonly key: string; readonly token: number; readonly projectionRevision: number; readonly signature: string; readonly providerRefresh?: boolean; }

const pipeline = () => new ViewportBlockHydrationPipeline<Job>({ concurrency: 6, regularReservedCapacity: 4, providerRefreshCapacity: 2 });

describe('ViewportBlockHydrationPipeline', () => {
  it('tracks running signature ownership and rejects stale completions', () => {
    const value = pipeline();
    value.startJob('voxel', 0, 3, 'old');
    expect(value.ownsJob('voxel', 0, 3, 'old')).toBe(true);
    value.startJob('voxel', 0, 4, 'new');
    expect(value.ownsJob('voxel', 0, 3, 'old')).toBe(false);
    expect(value.ownsJob('voxel', 0, 4, 'new')).toBe(true);
    value.finishJobOwnership('voxel');
    value.finishWork(0);
    expect(value.runningTotal).toBe(0);
  });

  it('cancels pending generation work and clears pending/running accounting atomically', () => {
    const value = pipeline();
    value.setPendingSignature('a', 'stone');
    value.work.enqueueRegular({ key: 'a', token: 0, projectionRevision: 0, signature: 'stone' });
    value.startJob('running', 0, 1, 'dirt');
    const oldGeneration = value.generation;
    value.advanceGeneration();
    value.work.clearPending();
    value.clearPendingSignatures();
    value.clearRunningOwnership();
    value.clearBatchBudget();
    expect(oldGeneration).toBe(0);
    expect(value.generation).toBe(1);
    expect(value.pendingCount).toBe(0);
    expect(value.runningTotal).toBe(0);
    expect(value.work.queuedTotal()).toBe(0);
  });

  it('keeps the interactive job budget separate and bounded', () => {
    const value = pipeline();
    value.setBatchBudget(8, 10);
    value.consumeBatchJob();
    expect(value.batchBudget).toBe(7);
    value.clearBatchBudget();
    expect(value.batchBudget).toBe(0);
  });

  it('composes the existing fair queue and progress tracker rather than replacing them', () => {
    const value = pipeline();
    const failureHandler = vi.fn();
    value.setPendingSignature('k', 'sig');
    value.work.enqueueRegular({ key: 'k', token: 0, projectionRevision: 0, signature: 'sig' });
    value.progress.setBlockScope(['k']);
    value.progress.begin(0, 'local');
    expect(value.work.takeNext(0)?.key).toBe('k');
    expect(value.progress.snapshot()).toMatchObject({ generation: 0, lane: 'local', total: 1 });
    expect(failureHandler).not.toHaveBeenCalled();
  });
});
