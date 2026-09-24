import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createDecorationVisual, DecorationTextureCache } from './decoration-visuals';

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

  it('resolves an item-frame item through the shared item model texture resolver', () => {
    const frameTexture = new THREE.Texture();
    const itemTexture = new THREE.Texture();
    const textures = new Map<string, THREE.Texture>([
      ['blob:minecraft:block/item_frame', frameTexture],
      ['blob:minecraft:item/diamond', itemTexture],
    ]);
    const loader = { load: vi.fn((url: string) => textures.get(url) ?? new THREE.Texture()) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    const visual = createDecorationVisual({
      instanceId: 'frame-1', kind: 'item-frame', entityTypeId: 'minecraft:item_frame',
      anchor: { x: 1, y: 1, z: 1 }, facing: 'north', rotation: 0, invisible: false, fixed: false, itemDropChance: 1,
      item: { id: 'minecraft:diamond', count: 1, components: { custom: true } },
    }, (resource) => `blob:${resource}`, cache, undefined, () => 'minecraft:item/diamond');
    const itemMesh = visual.children.find((child) => child.userData['decorationItem']) as THREE.Mesh | undefined;
    expect(itemMesh).toBeDefined();
    expect(itemMesh?.userData['decorationItem']).toEqual({ id: 'minecraft:diamond', count: 1, components: { custom: true } });
    expect((itemMesh?.material as THREE.MeshLambertMaterial).map).toBe(itemTexture);
    expect(itemMesh?.position.z).toBeGreaterThan(.9);
  });
});
