import { describe, expect, it } from 'vitest';
import { BlockCatalog } from '../catalog/block-catalog';
import { representativeBlockFixture } from '../catalog/block-catalog.fixture';
import { buildPlaceableItems, canonicalPlaceableItemId, isNormalBuildingExportEligible, isNormalBuildingPaletteEligible, placementItemSearch, previewBlocksForItem, resolveConcreteBlockId, resolveItemBlock } from './placeable-item';
import type { AssetBlockRecord } from '../catalog/block-definition.types';
import { blockCapability } from '../capabilities/block-capability-resolver';

function catalogWith(...ids: string[]): BlockCatalog {
  const source = [...representativeBlockFixture.blocks];
  for (const id of ids) if (!source.some((entry) => entry.id === id)) source.push({ id, displayName: id.split(':')[1] ?? id, defaultState: id === 'minecraft:water' || id === 'minecraft:lava' ? { level: '0' } : {}, stateDefinitions: id === 'minecraft:water' || id === 'minecraft:lava' ? [{ name: 'level', values: Array.from({ length: 16 }, (_, value) => String(value)) }] : [], resources: { textures: [] }, support: 'full' });
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

  it('discovers compatible standing/wall pairs from the active catalog', () => {
    const catalog = catalogWith('minecraft:azure_sign', 'minecraft:azure_wall_sign', 'minecraft:amethyst_head', 'minecraft:amethyst_wall_head');
    const items = buildPlaceableItems(catalog.all());
    expect(items.find((item) => item.itemId === 'minecraft:azure_sign')?.concreteBlockIds).toEqual(['minecraft:azure_sign', 'minecraft:azure_wall_sign']);
    expect(items.find((item) => item.itemId === 'minecraft:amethyst_head')?.concreteBlockIds).toEqual(['minecraft:amethyst_head', 'minecraft:amethyst_wall_head']);
  });

  it('does not advertise a wall variant when the counterpart is absent', () => {
    const catalog = catalogWith('minecraft:azure_sign');
    const item = buildPlaceableItems(catalog.all()).find((entry) => entry.itemId === 'minecraft:azure_sign');
    expect(item?.concreteBlockIds).toEqual(['minecraft:azure_sign']);
  });

  it('keeps raw technical IDs resolvable while excluding them from normal palette/export', () => {
    const catalog = catalogWith('minecraft:air', 'minecraft:light', 'minecraft:structure_void', 'minecraft:bedrock');
    expect(catalog.get('minecraft:light')).toBeDefined();
    expect(isNormalBuildingPaletteEligible(catalog.get('minecraft:light')!)).toBe(false);
    expect(isNormalBuildingPaletteEligible(catalog.get('minecraft:bedrock')!)).toBe(true);
    expect(isNormalBuildingExportEligible('minecraft:structure_void')).toBe(false);
  });
  it('does not claim verified runtime item evidence for external resource candidates', () => {
    const catalog = new BlockCatalog();
    catalog.load({ minecraftVersion: '1.21.1', sourceId: 'mod:example', sourceName: 'Example Mod', blocks: [{ id: 'example:widget', displayName: 'Widget', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'partial', sourceId: 'mod:example', sourceName: 'Example Mod' }] });
    const item = buildPlaceableItems(catalog.all()).find((entry) => entry.itemId === 'example:widget')!;
    expect(blockCapability(item.capabilities, 'item-backed')?.evidence).toBe('inferred');
  });
  it('represents fluids as Water/Lava Bucket logical items', () => {
    const catalog = catalogWith('minecraft:water', 'minecraft:lava');
    const items = buildPlaceableItems(catalog.all());
    expect(items.filter((item) => item.placementKind === 'fluid-bucket').map((item) => item.itemId)).toEqual(['minecraft:lava_bucket', 'minecraft:water_bucket']);
    expect(items.some((item) => item.itemId === 'minecraft:water')).toBe(false);
    expect(items.some((item) => item.itemId === 'minecraft:lava')).toBe(false);
    expect(items.find((item) => item.itemId === 'minecraft:water_bucket')).toMatchObject({ displayName: 'Water Bucket', displayBlockId: 'minecraft:water', defaultState: { level: '0' }, concreteBlockIds: ['minecraft:water'] });
    expect(canonicalPlaceableItemId('minecraft:water')).toBe('minecraft:water_bucket');
    expect(canonicalPlaceableItemId('minecraft:lava')).toBe('minecraft:lava_bucket');
    expect(placementItemSearch(items, 'water bucket').map((item) => item.itemId)).toContain('minecraft:water_bucket');
    expect(placementItemSearch(items, 'lava bucket').map((item) => item.itemId)).toContain('minecraft:lava_bucket');
    expect(items.find((item) => item.itemId === 'minecraft:water_bucket')?.previewBlocks[0]).toMatchObject({ id: 'minecraft:water', state: { level: '0' } });
    const water = items.find((item) => item.itemId === 'minecraft:water_bucket')!;
    expect(resolveItemBlock(water, water.defaultState, { x: 1, y: 2, z: 3 }, undefined, (id) => catalog.get(id))).toMatchObject({ id: 'minecraft:water', state: { level: '0' }, blockEntityData: undefined });
  });

  it('builds complete logical previews for multi-block families', () => {
    const catalog = catalogWith('minecraft:red_bed', 'minecraft:oak_door', 'minecraft:sunflower');
    const items = buildPlaceableItems(catalog.all());
    expect(items.find((item) => item.itemId === 'minecraft:red_bed')?.previewBlocks).toHaveLength(2);
    expect(items.find((item) => item.itemId === 'minecraft:oak_door')?.previewBlocks.map((block) => block.position.y)).toEqual([0, 1]);
    expect(items.find((item) => item.itemId === 'minecraft:sunflower')?.previewBlocks).toHaveLength(2);
    const bed = items.find((item) => item.itemId === 'minecraft:red_bed')!;
    for (const [facing, head] of [['south', { x: 0, y: 0, z: 1 }], ['north', { x: 0, y: 0, z: -1 }], ['east', { x: 1, y: 0, z: 0 }], ['west', { x: -1, y: 0, z: 0 }]] as const) {
      const preview = previewBlocksForItem(bed, { ...bed.defaultState, facing });
      expect(preview[0]?.state['facing']).toBe(facing); expect(preview[1]?.state['facing']).toBe(facing); expect(preview[1]?.position).toEqual(head);
    }
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

  it('rebuilds contextual state from the concrete variant definition', () => {
    const source: AssetBlockRecord[] = [
      { id: 'minecraft:oak_sign', displayName: 'Oak Sign', defaultState: { rotation: '0', waterlogged: 'false' }, stateDefinitions: [{ name: 'rotation', values: ['0'] }, { name: 'waterlogged', values: ['false', 'true'] }], resources: { textures: [] }, support: 'full' as const },
      { id: 'minecraft:oak_wall_sign', displayName: 'Oak Wall Sign', defaultState: { facing: 'north', waterlogged: 'false' }, stateDefinitions: [{ name: 'facing', values: ['north', 'south', 'east', 'west'] }, { name: 'waterlogged', values: ['false', 'true'] }], resources: { textures: [] }, support: 'full' as const },
    ];
    const catalog = new BlockCatalog(); catalog.load({ minecraftVersion: '1.21.1', blocks: source });
    const item = buildPlaceableItems(catalog.all()).find((entry) => entry.itemId === 'minecraft:oak_sign')!;
    const wall = resolveItemBlock(item, { rotation: '0', waterlogged: 'false' }, { x: 0, y: 0, z: 0 }, { faceNormal: { x: 1, y: 0, z: 0 }, stateOverride: { rotation: '0', facing: 'east' } }, (id) => catalog.get(id));
    expect(wall.id).toBe('minecraft:oak_wall_sign');
    expect(wall.state).toEqual({ facing: 'east', waterlogged: 'false' });
  });
});
