import { describe, expect, it } from 'vitest';
import { itemEvidenceFromResources } from './item-evidence';

describe('target item evidence', () => {
  it('records resource references without inventing a same-ID block placement target', () => {
    const evidence = itemEvidenceFromResources({
      'assets/minecraft/items/test_item.json': { model: { type: 'minecraft:model', model: 'minecraft:item/test_item' } },
    }, ['assets/minecraft/items/test_item.json']);
    expect(evidence[0]).toMatchObject({ itemId: 'minecraft:test_item', referencedModels: ['minecraft:item/test_item'] });
    expect(evidence[0]).not.toHaveProperty('placeableBlockCandidates');
    expect(evidence[0]).not.toHaveProperty('explicitBlockPlacement');
  });

  it('normalizes nested item and legacy model resource IDs', () => {
    const evidence = itemEvidenceFromResources({
      'assets/example/items/tools/hammer.json': { model: { type: 'minecraft:model', model: 'example:item/tools/hammer' } },
      'assets/example/models/item/tools/hammer.json': { parent: 'item/generated', textures: { layer0: 'example:item/tools/hammer' } },
    }, ['assets/example/items/tools/hammer.json', 'assets/example/models/item/tools/hammer.json']);
    expect(evidence.map((entry) => entry.itemId)).toEqual(['example:tools/hammer', 'example:tools/hammer']);
  });
});
