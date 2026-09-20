import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DecorationTextureCache } from './decoration-visuals';

describe('decoration texture cache lifecycle', () => {
  it('shares a provider-generation texture and disposes it once with the cache', () => {
    const texture = new THREE.Texture(); const dispose = vi.spyOn(texture, 'dispose');
    const loader = { load: vi.fn(() => texture) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    expect(cache.get('minecraft:block/item_frame')).toBe(texture);
    expect(cache.get('minecraft:block/item_frame')).toBe(texture);
    expect(loader.load).toHaveBeenCalledTimes(1);
    cache.dispose(); cache.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
