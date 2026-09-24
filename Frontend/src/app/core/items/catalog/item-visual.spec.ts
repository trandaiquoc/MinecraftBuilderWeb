import { describe, expect, it } from 'vitest';
import { resolveCatalogItemVisual } from './item-visual';

function provider(json: Record<string, unknown>, binary: readonly string[] = []) {
  return {
    readJson: (path: string) => json[path],
    readBinary: (path: string) => binary.includes(path) ? new Uint8Array([1]) : undefined,
    textureUrl: (resource: string) => `blob:${resource}`,
  };
}

describe('item visual resolution', () => {
  it('reports generated layers and keeps their order for thumbnails', () => {
    const result = resolveCatalogItemVisual(provider({ 'assets/example/items/gem.json': { model: 'example:item/gem' }, 'assets/example/models/item/gem.json': { textures: { layer0: 'example:item/gem_base', layer1: 'example:item/gem_glow' } } }, ['assets/example/textures/item/gem_base.png', 'assets/example/textures/item/gem_glow.png']), 'example:gem');
    expect(result.status).toBe('available');
    expect(result.resourcePaths).toEqual(['example:item/gem_base', 'example:item/gem_glow']);
    expect(result.previewUrls).toEqual(['blob:example:item/gem_base', 'blob:example:item/gem_glow']);
  });

  it('distinguishes missing resources from unsupported runtime models', () => {
    expect(resolveCatalogItemVisual(provider({ 'assets/example/items/gem.json': { model: 'example:item/gem' }, 'assets/example/models/item/gem.json': { textures: { layer0: 'example:item/gem' } } }), 'example:gem').status).toBe('missing-resource');
    expect(resolveCatalogItemVisual(provider({ 'assets/example/items/gem.json': { model: { type: 'minecraft:select' } } }), 'example:gem').status).toBe('unsupported');
  });
});
