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
});
