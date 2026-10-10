import { describe, expect, it, vi } from 'vitest';
import { ViewportTerrainRepresentationPipeline } from './viewport-terrain-representation-pipeline';

describe('ViewportTerrainRepresentationPipeline', () => {
  it('coalesces same-key in-flight extraction and clears settled ownership', async () => {
    const cache = new ViewportTerrainRepresentationPipeline<object>();
    const template = {};
    const create = vi.fn(async () => template);
    const first = cache.resolve('model|state', create);
    const second = cache.resolve('model|state', create);
    expect(first).toBe(second);
    expect(cache.pendingCount).toBe(1);
    await expect(first).resolves.toBe(template);
    expect(cache.pendingCount).toBe(0);
    expect(create).toHaveBeenCalledOnce();
  });

  it('drops rejected promises from its pending ownership', async () => {
    const cache = new ViewportTerrainRepresentationPipeline<object>();
    const failure = new Error('template failed');
    await expect(
      cache.resolve('bad', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(cache.pendingCount).toBe(0);
  });

  it('owns grouped terrain hydration accounting and safely resets stale work', () => {
    const pipeline = new ViewportTerrainRepresentationPipeline<object>();
    pipeline.beginGroups(3);
    pipeline.finishGroups(1);
    expect(pipeline.pendingGroupCount).toBe(2);
    pipeline.resetGroups();
    pipeline.finishGroups(1);
    expect(pipeline.pendingGroupCount).toBe(0);
  });

  it('owns grouped apply/commit and hands failed candidates back once', async () => {
    const pipeline = new ViewportTerrainRepresentationPipeline<object>();
    const template = {};
    const candidate = { key: '0,0,0', reusableKey: 'stone', signature: 'stone|normal' };
    const apply = vi.fn(() => ({
      representedKeys: [candidate.key],
      failedKeys: [],
      pending: false,
    }));
    const commit = vi.fn();
    const failed = vi.fn();
    pipeline.scheduleBatch(
      [candidate],
      {
        affectedPositions: [],
        initial: true,
        local: false,
        lane: 'structural',
        generation: 0,
        providerGeneration: 0,
        currentGeneration: () => 0,
        currentProviderGeneration: () => 0,
        isDisposed: () => false,
        projectionRevision: 1,
        candidateProjectionRevisions: new Map([[candidate.key, 1]]),
        projectionRevisionFor: () => 1,
      },
      {
        cachedTemplates: () => undefined,
        cacheTemplates: vi.fn(),
        resolveTemplates: async () => template,
        disposeTemplates: vi.fn(),
      },
      {
        currentSignature: () => candidate.signature,
        candidateSignature: (item) => item.signature,
        toRecord: (item, value) => ({ key: item.key, value }),
        apply,
      },
      { onCommit: commit, onStale: vi.fn(), onFailed: failed },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apply).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    expect(pipeline.pendingGroupCount).toBe(0);
  });

  it('reports obsolete generation work as stale without routing it through failure recovery', async () => {
    const pipeline = new ViewportTerrainRepresentationPipeline<object>();
    const stale = vi.fn();
    const failed = vi.fn();
    const candidate = { key: '0,0,0', reusableKey: 'stone', signature: 'stone|normal' };
    pipeline.scheduleBatch(
      [candidate],
      {
        affectedPositions: [],
        initial: true,
        local: false,
        lane: 'structural',
        generation: 1,
        providerGeneration: 0,
        currentGeneration: () => 2,
        currentProviderGeneration: () => 0,
        isDisposed: () => false,
        projectionRevision: 1,
        candidateProjectionRevisions: new Map([[candidate.key, 1]]),
        projectionRevisionFor: () => 1,
      },
      {
        cachedTemplates: () => undefined,
        cacheTemplates: vi.fn(),
        resolveTemplates: async () => ({}),
        disposeTemplates: vi.fn(),
      },
      {
        currentSignature: () => candidate.signature,
        candidateSignature: (item) => item.signature,
        toRecord: (item, value) => ({ key: item.key, value }),
        apply: vi.fn(() => ({ representedKeys: [candidate.key], failedKeys: [], pending: false })),
      },
      { onCommit: vi.fn(), onStale: stale, onFailed: failed },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stale).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    expect(pipeline.pendingGroupCount).toBe(0);
  });
});
