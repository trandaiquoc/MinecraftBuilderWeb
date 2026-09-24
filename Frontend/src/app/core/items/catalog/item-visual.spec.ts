import { describe, expect, it } from 'vitest';
import { resolveCatalogItemVisual } from './item-visual';

function provider(json: Record<string, unknown>, binary: readonly string[] = []) {
  return {
    readJson: (path: string) => json[path],
    paths: () => Object.keys(json),
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
    expect(result.trace?.identityEvidence).toContain('modern-item-definition');
  });

  it('distinguishes missing resources from unsupported runtime models', () => {
    expect(resolveCatalogItemVisual(provider({ 'assets/example/items/gem.json': { model: 'example:item/gem' }, 'assets/example/models/item/gem.json': { textures: { layer0: 'example:item/gem' } } }), 'example:gem').status).toBe('missing-resource');
    expect(resolveCatalogItemVisual(provider({ 'assets/example/items/gem.json': { model: { type: 'minecraft:select' } } }), 'example:gem').status).toBe('unsupported');
  });

  it('follows the selected Item model chain instead of an adjacent helper model', () => {
    const resources = {
      'assets/cobblemon/models/item/ancient_citrine_ball.json': { parent: 'minecraft:item/generated', textures: { layer0: 'cobblemon:item/poke_balls/ancient_citrine_ball' } },
      'assets/cobblemon/models/item/ancient_citrine_ball_model.json': { parent: 'cobblemon:item/ancient_poke_ball_model', textures: { layer0: 'cobblemon:item/poke_balls/models/ancient_citrine_ball' } },
      'assets/cobblemon/models/item/ancient_poke_ball_model.json': { parent: 'minecraft:item/generated', textures: { layer0: 'cobblemon:item/poke_balls/models/ancient_citrine_ball' } },
    };
    const result = resolveCatalogItemVisual(provider(resources, ['assets/cobblemon/textures/item/poke_balls/ancient_citrine_ball.png', 'assets/cobblemon/textures/item/poke_balls/models/ancient_citrine_ball.png']), 'cobblemon:ancient_citrine_ball');
    expect(result.kind).toBe('generated-layers');
    expect(result.resourcePaths).toEqual(['cobblemon:item/poke_balls/ancient_citrine_ball']);
    expect(result.resourcePaths).not.toContain('cobblemon:item/poke_balls/models/ancient_citrine_ball');
  });

  it('keeps a helper model resolvable when addressed explicitly', () => {
    const result = resolveCatalogItemVisual(provider({
      'assets/example/models/item/ancient_citrine_ball_model.json': { parent: 'example:item/ancient_poke_ball_model' },
      'assets/example/models/item/ancient_poke_ball_model.json': { parent: 'minecraft:item/generated', textures: { layer0: 'example:item/poke_balls/models/ancient_citrine_ball' } },
    }, ['assets/example/textures/item/poke_balls/models/ancient_citrine_ball.png']), 'example:ancient_citrine_ball_model');
    expect(result.status).toBe('available');
    expect(result.resourcePaths).toEqual(['example:item/poke_balls/models/ancient_citrine_ball']);
  });
});
