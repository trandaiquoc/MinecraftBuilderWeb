import { describe, expect, it, vi } from 'vitest';
import { ViewportTerrainTemplatePipeline } from './viewport-terrain-template-pipeline';

describe('ViewportTerrainTemplatePipeline', () => {
  it('coalesces same-key in-flight extraction and clears settled ownership', async () => {
    const cache = new ViewportTerrainTemplatePipeline<object>();
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
    const cache = new ViewportTerrainTemplatePipeline<object>();
    const failure = new Error('template failed');
    await expect(cache.resolve('bad', async () => { throw failure; })).rejects.toBe(failure);
    expect(cache.pendingCount).toBe(0);
  });

  it('owns grouped terrain hydration accounting and safely resets stale work', () => {
    const pipeline = new ViewportTerrainTemplatePipeline<object>();
    pipeline.beginGroups(3);
    pipeline.finishGroups(1);
    expect(pipeline.pendingGroupCount).toBe(2);
    pipeline.resetGroups();
    pipeline.finishGroups(1);
    expect(pipeline.pendingGroupCount).toBe(0);
  });
});
