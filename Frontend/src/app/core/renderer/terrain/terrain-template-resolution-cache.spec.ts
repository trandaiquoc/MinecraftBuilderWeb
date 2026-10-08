import { describe, expect, it, vi } from 'vitest';
import { TerrainTemplateResolutionCache } from './terrain-template-resolution-cache';

describe('TerrainTemplateResolutionCache', () => {
  it('coalesces same-key in-flight extraction and clears settled ownership', async () => {
    const cache = new TerrainTemplateResolutionCache<object>();
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
    const cache = new TerrainTemplateResolutionCache<object>();
    const failure = new Error('template failed');
    await expect(cache.resolve('bad', async () => { throw failure; })).rejects.toBe(failure);
    expect(cache.pendingCount).toBe(0);
  });
});
