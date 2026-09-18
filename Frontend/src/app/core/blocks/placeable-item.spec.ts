import { describe, expect, it } from 'vitest';
import { BlockCatalog } from './block-catalog';
import { representativeBlockFixture } from './block-catalog.fixture';
import { buildPlaceableItems, canonicalPlaceableItemId, isNormalBuildingExportEligible, isNormalBuildingPaletteEligible, resolveConcreteBlockId } from './placeable-item';

function catalogWith(...ids: string[]): BlockCatalog {
  const source = [...representativeBlockFixture.blocks];
  for (const id of ids) if (!source.some((entry) => entry.id === id)) source.push({ id, displayName: id.split(':')[1] ?? id, defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full' });
  const catalog = new BlockCatalog(); catalog.load({ minecraftVersion: '1.21.1', blocks: source }); return catalog;
}

describe('vanilla placeable item layer', () => {
  it('canonicalizes standing and wall variants to one logical item', () => {
    const catalog = catalogWith('minecraft:oak_sign', 'minecraft:oak_wall_sign', 'minecraft:torch', 'minecraft:wall_torch', 'minecraft:skeleton_skull', 'minecraft:skeleton_wall_skull', 'minecraft:red_banner', 'minecraft:red_wall_banner');
    const items = buildPlaceableItems(catalog.all());
    expect(items.some((item) => item.itemId === 'minecraft:oak_sign')).toBe(true);
    expect(items.some((item) => item.itemId === 'minecraft:oak_wall_sign')).toBe(false);
    expect(items.some((item) => item.itemId === 'minecraft:torch')).toBe(true);
    expect(items.some((item) => item.itemId === 'minecraft:wall_torch')).toBe(false);
    expect(canonicalPlaceableItemId('minecraft:skeleton_wall_skull')).toBe('minecraft:skeleton_skull');
  });

  it('keeps raw technical IDs resolvable while excluding them from normal palette/export', () => {
    const catalog = catalogWith('minecraft:air', 'minecraft:light', 'minecraft:structure_void', 'minecraft:bedrock');
    expect(catalog.get('minecraft:light')).toBeDefined();
    expect(isNormalBuildingPaletteEligible(catalog.get('minecraft:light')!)).toBe(false);
    expect(isNormalBuildingPaletteEligible(catalog.get('minecraft:bedrock')!)).toBe(true);
    expect(isNormalBuildingExportEligible('minecraft:structure_void')).toBe(false);
  });

  it('builds complete logical previews for multi-block families', () => {
    const catalog = catalogWith('minecraft:red_bed', 'minecraft:oak_door', 'minecraft:sunflower');
    const items = buildPlaceableItems(catalog.all());
    expect(items.find((item) => item.itemId === 'minecraft:red_bed')?.previewBlocks).toHaveLength(2);
    expect(items.find((item) => item.itemId === 'minecraft:oak_door')?.previewBlocks.map((block) => block.position.y)).toEqual([0, 1]);
    expect(items.find((item) => item.itemId === 'minecraft:sunflower')?.previewBlocks).toHaveLength(2);
  });

  it('resolves contextual wall variants without suffix inference', () => {
    const catalog = catalogWith('minecraft:oak_sign', 'minecraft:oak_wall_sign', 'minecraft:torch', 'minecraft:wall_torch', 'minecraft:soul_torch', 'minecraft:soul_wall_torch', 'minecraft:redstone_torch', 'minecraft:redstone_wall_torch', 'minecraft:skeleton_skull', 'minecraft:skeleton_wall_skull', 'minecraft:red_banner', 'minecraft:red_wall_banner', 'minecraft:tube_coral_fan', 'minecraft:tube_coral_wall_fan', 'minecraft:oak_hanging_sign', 'minecraft:oak_wall_hanging_sign');
    const items = buildPlaceableItems(catalog.all());
    const sign = items.find((item) => item.itemId === 'minecraft:oak_sign')!;
    const torch = items.find((item) => item.itemId === 'minecraft:torch')!;
    expect(resolveConcreteBlockId(sign, { faceNormal: { x: 0, y: 1, z: 0 } })).toBe('minecraft:oak_sign');
    expect(resolveConcreteBlockId(sign, { faceNormal: { x: 1, y: 0, z: 0 } })).toBe('minecraft:oak_wall_sign');
    expect(resolveConcreteBlockId(torch, { faceNormal: { x: 0, y: 1, z: 0 } })).toBe('minecraft:torch');
    expect(resolveConcreteBlockId(torch, { faceNormal: { x: 0, y: 0, z: -1 } })).toBe('minecraft:wall_torch');
    for (const itemId of ['minecraft:soul_torch', 'minecraft:redstone_torch', 'minecraft:skeleton_skull', 'minecraft:red_banner', 'minecraft:tube_coral_fan', 'minecraft:oak_hanging_sign']) {
      const item = items.find((entry) => entry.itemId === itemId)!;
      expect(resolveConcreteBlockId(item, { faceNormal: { x: 0, y: 0, z: 1 } })).not.toBe(itemId);
    }
  });
});
