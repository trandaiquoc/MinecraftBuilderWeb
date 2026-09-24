import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createDecorationVisual, DecorationTextureCache } from './decoration-visuals';
import { directionVector } from '../../decorations/placement/decoration-placement';

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

  it('notifies the viewport when an asynchronously loaded texture becomes ready', () => {
    const texture = new THREE.Texture();
    const onReady = vi.fn();
    const loader = { load: vi.fn((_url: string, onLoad?: (value: THREE.Texture) => void) => { onLoad?.(texture); return texture; }) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader, onReady);
    cache.get('minecraft:item/emerald');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('resolves generated item layers and places them on the front side for every facing', () => {
    const frameTexture = new THREE.Texture();
    const itemTexture = new THREE.Texture();
    const textures = new Map<string, THREE.Texture>([
      ['blob:minecraft:block/item_frame', frameTexture],
      ['blob:minecraft:item/emerald', itemTexture],
      ['blob:minecraft:item/emerald_glint', itemTexture],
    ]);
    const loader = { load: vi.fn((url: string) => textures.get(url) ?? new THREE.Texture()) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    for (const facing of ['north', 'south', 'east', 'west', 'up', 'down'] as const) {
      const visual = createDecorationVisual({
        instanceId: `frame-${facing}`, kind: facing === 'up' ? 'glow-item-frame' : 'item-frame', entityTypeId: facing === 'up' ? 'minecraft:glow_item_frame' : 'minecraft:item_frame',
        anchor: { x: 1, y: 1, z: 1 }, facing, rotation: 3, invisible: false, fixed: false, itemDropChance: 1,
        item: { id: 'minecraft:emerald', count: 1, components: { custom: true } },
      }, (resource) => `blob:${resource}`, cache, undefined, () => ['minecraft:item/emerald', 'minecraft:item/emerald_glint']);
      const itemMeshes = visual.children.filter((child) => child.userData['decorationItem']) as THREE.Mesh[];
      expect(itemMeshes).toHaveLength(2);
      const frameCenter = visual.children.find((child) => !child.userData['decorationItem'])!.position;
      const direction = directionVector(facing);
      for (const itemMesh of itemMeshes) {
        const vector = itemMesh.position.clone().sub(frameCenter);
        expect(vector.dot(new THREE.Vector3(direction.x, direction.y, direction.z))).toBeGreaterThan(0);
        expect(vector.length()).toBeLessThan(.08);
        expect((itemMesh.material as THREE.MeshLambertMaterial).map).toBe(itemTexture);
      }
    }
  });

  it('keeps displayed items when the frame itself is invisible', () => {
    const texture = new THREE.Texture();
    const loader = { load: vi.fn(() => texture) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    const visual = createDecorationVisual({ instanceId: 'invisible', kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 1, y: 1, z: 1 }, facing: 'north', rotation: 0, invisible: true, fixed: false, itemDropChance: 1, item: { id: 'minecraft:diamond', count: 1 } }, (resource) => `blob:${resource}`, cache, undefined, () => ['minecraft:item/diamond']);
    expect(visual.children.some((child) => child.userData['decorationItem'])).toBe(true);
  });
});
