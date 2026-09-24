import { describe, expect, it } from 'vitest';
import { itemEvidenceFromResources, itemIdentityEvidenceFromProvider } from './item-evidence';

describe('target item evidence', () => {
  it('records resource references without inventing a same-ID block placement target', () => {
    const evidence = itemEvidenceFromResources({
      'assets/minecraft/items/test_item.json': { model: { type: 'minecraft:model', model: 'minecraft:item/test_item' } },
    }, ['assets/minecraft/items/test_item.json']);
    expect(evidence[0]).toMatchObject({ itemId: 'minecraft:test_item', referencedModels: ['minecraft:item/test_item'] });
    expect(evidence[0]).not.toHaveProperty('placeableBlockCandidates');
    expect(evidence[0]).not.toHaveProperty('explicitBlockPlacement');
  });

  it('catalogues a proven item while retaining helper models as resource-only nodes', () => {
    const evidence = itemEvidenceFromResources({
      'assets/example/items/tools/hammer.json': { model: { type: 'minecraft:model', model: 'example:item/tools/hammer' } },
      'assets/example/models/item/tools/hammer_model.json': { parent: 'example:item/tool_model', textures: { layer0: 'example:item/tools/hammer' } },
    }, ['assets/example/items/tools/hammer.json', 'assets/example/models/item/tools/hammer_model.json']);
    expect(evidence.map((entry) => entry.itemId)).toEqual(['example:tools/hammer']);
  });

  it('uses static item evidence to admit a legacy model without promoting an unrelated helper', () => {
    const json = {
      'assets/example/blockstates/ancient_citrine_ball.json': { variants: {} },
      'assets/example/models/item/ancient_citrine_ball.json': { parent: 'minecraft:item/generated' },
      'assets/example/models/item/ancient_citrine_ball_model.json': { parent: 'example:item/ancient_poke_ball_model' },
    };
    expect(itemEvidenceFromResources(json, Object.keys(json), 'legacy-item-model').map((entry) => entry.itemId)).toEqual(['example:ancient_citrine_ball']);
  });

  it('invalidates cached identity evidence when a source revision removes and restores a resource', () => {
    let revision = 1;
    let json: Record<string, unknown> = { 'assets/example/models/item/gem.json': { parent: 'minecraft:item/generated' } };
    const provider = {
      get revision() { return revision; },
      paths: () => Object.keys(json),
      readJson: (path: string) => json[path],
    };
    expect(itemIdentityEvidenceFromProvider(provider, 'example:gem')).toEqual(['legacy-item-root-model']);
    json = {};
    revision += 1;
    expect(itemIdentityEvidenceFromProvider(provider, 'example:gem')).toEqual([]);
    json = { 'assets/example/models/item/gem.json': { parent: 'minecraft:item/generated' } };
    revision += 1;
    expect(itemIdentityEvidenceFromProvider(provider, 'example:gem')).toEqual(['legacy-item-root-model']);
  });

  it('accepts explicit data references without promoting unrelated model resources', () => {
    const json = {
      'data/example/loot_tables/gem.json': { pools: [{ entries: [{ type: 'minecraft:item', name: 'example:gem' }] }] },
      'assets/example/models/item/gem.json': { parent: 'example:item/custom_runtime_model' },
      'assets/example/models/item/gem_model.json': { parent: 'example:item/custom_runtime_model' },
    };
    expect(itemEvidenceFromResources(json, Object.keys(json), 'legacy-item-model').map((entry) => entry.itemId)).toEqual(['example:gem']);
  });
});
