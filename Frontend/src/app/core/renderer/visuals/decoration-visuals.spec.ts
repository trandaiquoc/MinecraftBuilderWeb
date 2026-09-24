import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyDecorationItemPreview, createDecorationVisual, DecorationTextureCache } from './decoration-visuals';
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
      const sprite = visual.children.find((child) => child.userData['decorationItem'])!;
      const itemMeshes = sprite.children as THREE.Mesh[];
      expect(itemMeshes).toHaveLength(2);
      const frameCenter = visual.children.find((child) => child.userData['decoration'] && !child.userData['decorationItem'])!.position;
      const direction = directionVector(facing);
      for (const itemMesh of itemMeshes) {
        const vector = sprite.position.clone().sub(frameCenter);
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
    expect(visual.children.some((child) => child.userData['decorationItem'] && child.children.length > 0)).toBe(true);
  });

  it('uses the same flat sprite presentation for normal and glow frames', () => {
    const itemTexture = new THREE.Texture();
    const loader = { load: vi.fn(() => itemTexture) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    const make = (kind: 'item-frame' | 'glow-item-frame') => createDecorationVisual({ instanceId: kind, kind, entityTypeId: kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow_item_frame', anchor: { x: 0, y: 0, z: 0 }, facing: 'south', rotation: 0, invisible: false, fixed: false, itemDropChance: 1, item: { id: 'example:gem', count: 1 } }, (resource) => `blob:${resource}`, cache, undefined, () => ['example:item/gem']);
    const normal = make('item-frame').children.find((child) => child.userData['decorationItem']) as THREE.Group;
    const glow = make('glow-item-frame').children.find((child) => child.userData['decorationItem']) as THREE.Group;
    const normalMesh = normal.children[0] as THREE.Mesh;
    const glowMesh = glow.children[0] as THREE.Mesh;
    expect(normalMesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(glowMesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect((normalMesh.geometry as THREE.PlaneGeometry).parameters).toEqual((glowMesh.geometry as THREE.PlaneGeometry).parameters);
    expect(normalMesh.material).toMatchObject({ map: itemTexture });
    expect(glowMesh.material).toMatchObject({ map: itemTexture });
  });

  it('reuses one normalized 2D preview for a frame after its temporary layers resolve', () => {
    const layerTexture = new THREE.Texture(); const previewTexture = new THREE.Texture();
    const loader = { load: vi.fn((url: string) => url === 'blob:preview' ? previewTexture : layerTexture) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    const visual = createDecorationVisual({ instanceId: 'preview', kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 0, y: 0, z: 0 }, facing: 'south', rotation: 0, invisible: false, fixed: false, itemDropChance: 1, item: { id: 'example:gem', count: 1 } }, (resource) => `blob:${resource}`, cache, undefined, () => ['example:item/gem', 'example:item/gem_glow']);
    const sprite = visual.children.find((child) => child.userData['decorationItem'])!;
    expect(sprite.children).toHaveLength(2);
    expect(applyDecorationItemPreview(sprite, 'blob:preview', cache)).toBe(true);
    expect(sprite.children).toHaveLength(1);
    expect((sprite.children[0] as THREE.Mesh).geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(((sprite.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).map).toBe(previewTexture);
  });

  it('presents static block-model items as centered flat sprites instead of 3D geometry', () => {
    const frameTexture = new THREE.Texture();
    const loader = { load: vi.fn(() => frameTexture) } as unknown as THREE.TextureLoader;
    const cache = new DecorationTextureCache((resource) => `blob:${resource}`, loader);
    const visual = createDecorationVisual({
      instanceId: 'static-model', kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 1, y: 1, z: 1 }, facing: 'south', rotation: 0, invisible: false, fixed: false, itemDropChance: 1,
      item: { id: 'minecraft:stone', count: 1 },
    }, (resource) => `blob:${resource}`, cache, undefined, undefined, () => ({ kind: 'block-model', layers: [], model: 'minecraft:block/stone', elements: [{ from: [0, 0, 0], to: [16, 16, 16] }], diagnostics: [] }));
    const sprite = visual.children.find((child) => child.userData['decorationItem']) as THREE.Group;
    expect(sprite).toBeDefined();
    expect(sprite.children).toHaveLength(1);
    expect(sprite.children[0]).toBeInstanceOf(THREE.Mesh);
    expect((sprite.children[0] as THREE.Mesh).geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(sprite.children[0].userData['decorationItemLayer']).toBe(0);
  });

  it('keeps item sprites centered while applying frame-facing and eight-step rotation', () => {
    const cache = new DecorationTextureCache(() => undefined, { load: vi.fn(() => new THREE.Texture()) } as unknown as THREE.TextureLoader);
    for (const facing of ['north', 'south', 'east', 'west', 'up', 'down'] as const) {
      const visual = createDecorationVisual({ instanceId: `rotation-${facing}`, kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 0, y: 0, z: 0 }, facing, rotation: 7, invisible: false, fixed: false, itemDropChance: 1, item: { id: 'minecraft:stone', count: 1 } }, undefined, cache, undefined, undefined, () => ({ kind: 'generated-layers', layers: ['minecraft:item/stone'], diagnostics: [] }));
      const sprite = visual.children.find((child) => child.userData['decorationItem'])!;
      const baseVisual = createDecorationVisual({ instanceId: `base-${facing}`, kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 0, y: 0, z: 0 }, facing, rotation: 0, invisible: false, fixed: false, itemDropChance: 1, item: { id: 'minecraft:stone', count: 1 } }, undefined, cache, undefined, undefined, () => ({ kind: 'generated-layers', layers: ['minecraft:item/stone'], diagnostics: [] }));
      const baseSprite = baseVisual.children.find((child) => child.userData['decorationItem'])!;
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(sprite.quaternion);
      const direction = directionVector(facing);
      expect(normal.dot(new THREE.Vector3(direction.x, direction.y, direction.z))).toBeGreaterThan(.99);
      expect(Math.abs(sprite.quaternion.dot(baseSprite.quaternion))).toBeLessThan(.99);
      expect(sprite.position.x).toBeGreaterThanOrEqual(-0.51);
      expect(sprite.position.x).toBeLessThanOrEqual(1.51);
      expect(sprite.position.y).toBeGreaterThanOrEqual(-0.51);
      expect(sprite.position.y).toBeLessThanOrEqual(1.51);
      expect(sprite.position.z).toBeGreaterThanOrEqual(-0.51);
      expect(sprite.position.z).toBeLessThanOrEqual(1.51);
    }
  });
});
