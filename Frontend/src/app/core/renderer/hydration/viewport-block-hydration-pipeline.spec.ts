import { describe, expect, it, vi } from 'vitest';
import type { HydrationWorkOwnerToken } from '../scheduling/hydration-work-coordinator';
import {
  ViewportBlockHydrationPipeline,
  type HydrationExecutionPort,
} from './viewport-block-hydration-pipeline';

interface Job {
  readonly key: string;
  readonly token: number;
  readonly projectionRevision: number;
  readonly signature: string;
  readonly providerRefresh?: boolean;
  readonly ownerToken?: HydrationWorkOwnerToken;
}

const pipeline = () =>
  new ViewportBlockHydrationPipeline<Job>({
    concurrency: 6,
    regularReservedCapacity: 4,
    providerRefreshCapacity: 2,
  });

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

  it('returns a detached running-generation snapshot', () => {
    const value = pipeline();
    value.startWork(4);
    const snapshot = value.runningGenerationSnapshot() as Map<number, number>;
    snapshot.set(9, 99);
    expect(value.runningGenerationCount(4)).toBe(1);
    expect(value.runningGenerationCount(9)).toBe(0);
  });

  it('cancels pending generation work and clears pending/running accounting atomically', () => {
    const value = pipeline();
    value.setPendingSignature('a', 'stone');
    value.enqueueRegular({ key: 'a', token: 0, projectionRevision: 0, signature: 'stone' });
    value.startJob('running', 0, 1, 'dirt');
    const oldGeneration = value.generation;
    value.advanceGeneration();
    value.clearPendingWork();
    value.clearPendingSignatures();
    value.clearRunningOwnership();
    value.clearBatchBudget();
    expect(oldGeneration).toBe(0);
    expect(value.generation).toBe(1);
    expect(value.pendingCount).toBe(0);
    expect(value.runningTotal).toBe(0);
    expect(value.queuedWork()).toBe(0);
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
    value.enqueueRegular({ key: 'k', token: 0, projectionRevision: 0, signature: 'sig' });
    value.setBlockScope(['k']);
    value.beginProgress(0, 'local');
    expect(value.takeNextJob(0)?.key).toBe('k');
    expect(value.progressSnapshot()).toMatchObject({ generation: 0, lane: 'local', total: 1 });
    expect(failureHandler).not.toHaveBeenCalled();
  });

  it('clears a pending signature only when the dequeued job still owns it', () => {
    const value = pipeline();
    const staleOwner = { owner: 'y-layer-prewarm', attempt: 1, generation: 0 } as const;
    const currentOwner = { owner: 'editor-hydration', attempt: 8, generation: 0 } as const;
    value.setPendingSignature('same-key', 'current-signature', currentOwner);
    value.enqueueRegular({
      key: 'same-key',
      token: 0,
      projectionRevision: 0,
      signature: 'stale-signature',
      ownerToken: staleOwner,
    });
    const port: HydrationExecutionPort<Job> = {
      isStopped: () => false,
      isInteractive: () => false,
      now: () => 1,
      budgetMs: () => 10,
      interactiveJobLimit: () => 8,
      jobLimit: () => 8,
      ownership: (job) => ({ revision: job.projectionRevision, signature: job.signature }),
      execute: (_job, finish) => finish(),
      onBatchStart: vi.fn(),
      onJobStarted: vi.fn(),
      onExecutionFailure: vi.fn(),
      onJobComplete: vi.fn(),
      processAdditionalWork: vi.fn(),
      hasAdditionalWork: () => false,
    };

    value.process(port);

    expect(value.pendingSignature('same-key')).toBe('current-signature');
  });

  it('owns execution, synchronous failure completion, and rescheduling', () => {
    const value = pipeline();
    const executed: string[] = [];
    const failed = vi.fn();
    const completed = vi.fn();
    const jobs: Job[] = [
      { key: 'ok', token: 0, projectionRevision: 0, signature: 'a' },
      { key: 'bad', token: 0, projectionRevision: 0, signature: 'b' },
    ];
    value.enqueueRegular(jobs[0]);
    value.enqueueRegular(jobs[1]);
    const port: HydrationExecutionPort<Job> = {
      isStopped: () => false,
      isInteractive: () => false,
      now: () => 1,
      budgetMs: () => 10,
      interactiveJobLimit: () => 8,
      jobLimit: () => 8,
      ownership: (job) => ({ revision: job.projectionRevision, signature: job.signature }),
      execute: (job, finish) => {
        executed.push(job.key);
        if (job.key === 'bad') throw new Error('expected');
        finish();
      },
      onBatchStart: vi.fn(),
      onJobStarted: vi.fn(),
      onExecutionFailure: failed,
      onJobComplete: completed,
      processAdditionalWork: vi.fn(),
      hasAdditionalWork: () => false,
    };
    value.process(port);
    expect(executed).toEqual(['ok', 'bad']);
    expect(failed).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledTimes(2);
    expect(value.runningTotal).toBe(0);
  });

  it('finishes running ownership even when a completion observer throws', () => {
    const value = pipeline();
    value.enqueueRegular({
      key: 'throwing-completion',
      token: 0,
      projectionRevision: 0,
      signature: 'a',
    });
    const port: HydrationExecutionPort<Job> = {
      isStopped: () => false,
      isInteractive: () => false,
      now: () => 1,
      budgetMs: () => 10,
      interactiveJobLimit: () => 8,
      jobLimit: () => 8,
      ownership: (job) => ({ revision: job.projectionRevision, signature: job.signature }),
      execute: (_job, finish) => finish(),
      onBatchStart: vi.fn(),
      onJobStarted: vi.fn(),
      onExecutionFailure: vi.fn(),
      onJobComplete: () => {
        throw new Error('observer failure');
      },
      processAdditionalWork: vi.fn(),
      hasAdditionalWork: () => false,
    };

    expect(() => value.process(port)).not.toThrow();
    expect(value.runningTotal).toBe(0);
  });

  it('releases running accounting before publishing terminal job completion', () => {
    const value = pipeline();
    value.enqueueRegular({
      key: 'final-block',
      token: 0,
      projectionRevision: 0,
      signature: 'stone',
    });
    let runningAtCompletion = -1;
    const port: HydrationExecutionPort<Job> = {
      isStopped: () => false,
      isInteractive: () => false,
      now: () => 1,
      budgetMs: () => 10,
      interactiveJobLimit: () => 8,
      jobLimit: () => 8,
      ownership: (job) => ({ revision: job.projectionRevision, signature: job.signature }),
      execute: (_job, finish) => finish(),
      onBatchStart: vi.fn(),
      onJobStarted: vi.fn(),
      onExecutionFailure: vi.fn(),
      onJobComplete: () => {
        runningAtCompletion = value.runningGenerationCount(0);
      },
      processAdditionalWork: vi.fn(),
      hasAdditionalWork: () => false,
    };

    value.process(port);

    expect(runningAtCompletion).toBe(0);
    expect(value.runningGenerationCount(0)).toBe(0);
  });
});
