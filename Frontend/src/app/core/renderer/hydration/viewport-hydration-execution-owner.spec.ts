import { describe, expect, it, vi } from 'vitest';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { ViewportHydrationExecutionOwner } from './viewport-hydration-execution-owner';

const job = (overrides: Record<string, unknown> = {}) => ({
  token: 4,
  projectionRevision: 2,
  key: '1,2,3',
  block: { kind: 'normal' },
  signature: 'stone|normal',
  role: 'normal',
  worldContext: { getBlock: () => undefined },
  options: {},
  allowInstancing: false,
  surfaceFastPathEligible: false,
  surfaceVisibleEntries: new Map(),
  ...overrides,
}) as never;

const ownerWith = (overrides: Record<string, unknown> = {}) => {
  const diagnostics = new RendererDiagnostics();
  const completeHydrationPart = vi.fn();
  const completeProviderJob = vi.fn();
  const recordDuration = vi.fn();
  const processDecorationBatch = vi.fn(() => 2);
  const provider = { completeJob: completeProviderJob };
  const projection = {
    visibleEntry: vi.fn(() => ({
      block: { kind: 'normal' },
      role: 'normal',
      signature: 'stone|normal',
      occlusionClass: 'transparent',
    })),
    revisionForKey: vi.fn(() => 2),
  };
  const owner = new ViewportHydrationExecutionOwner({
    hydrationPipeline: { workCounts: () => ({ regularQueued: 0, providerRefreshQueued: 0, regularRunning: 0, providerRefreshRunning: 0 }) },
    blockRepresentationHydration: { create: vi.fn(), refresh: vi.fn() },
    providerRefreshPipeline: provider,
    projection,
    decorations: { queuedCount: 2, processBatch: processDecorationBatch },
    diagnostics,
    runtimeTrace: () => ({ recordDuration } as never),
    isStopped: () => false,
    isInteractive: () => false,
    rollbackPartialInstanceVisual: vi.fn(),
    markHydrationFailure: vi.fn(),
    publishProviderRefreshProgress: vi.fn(),
    completeHydrationPart,
    ...overrides,
  } as never, {
    syncBudgetMs: 4,
    interactiveSyncBudgetMs: 1,
    maxJobsPerBatch: 8,
    interactiveMaxJobsPerBatch: 2,
  });
  return { owner, diagnostics, completeHydrationPart, completeProviderJob, projection, processDecorationBatch, recordDuration };
};

describe('ViewportHydrationExecutionOwner', () => {
  it('settles authoritative regular completion and ignores stale completion', () => {
    const value = ownerWith();
    value.owner.port.onJobComplete(job(), true);
    value.owner.port.onJobComplete(job({ signature: 'old' }), false);

    expect(value.completeHydrationPart).toHaveBeenCalledOnce();
    expect(value.completeHydrationPart).toHaveBeenCalledWith(4, '1,2,3');
    expect(value.diagnostics.snapshot().staleHydrationCompletionsIgnored).toBe(1);
  });

  it('settles provider refreshes through the provider pipeline without block progress', () => {
    const value = ownerWith();
    value.owner.port.onJobComplete(job({ providerRefresh: true, providerRefreshGeneration: 7 }), true);

    expect(value.completeProviderJob).toHaveBeenCalledOnce();
    expect(value.completeProviderJob).toHaveBeenCalledWith(7, expect.objectContaining({ onTrace: expect.any(Function), onStateChange: expect.any(Function) }));
    expect(value.completeHydrationPart).not.toHaveBeenCalled();
  });

  it('uses the existing interactive decoration budget and records the batch duration', () => {
    const value = ownerWith();
    value.owner.port.processAdditionalWork(4, 20);

    expect(value.processDecorationBatch).toHaveBeenCalledWith(4, 20, 8);
    value.owner.port.onBatchDuration?.(3);
    expect(value.recordDuration).toHaveBeenCalledWith('processHydrationBatch', 3);
  });
});
