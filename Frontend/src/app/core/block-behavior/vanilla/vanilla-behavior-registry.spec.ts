import { describe, expect, it } from 'vitest';
import { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';
import { VANILLA_BEHAVIOR_COMPATIBILITY, isVanillaCandleId, VanillaBehaviorRegistry } from './vanilla-behavior-registry';

const baseRecord = (id: string): AssetBlockRecord => ({ id, displayName: id, defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'fallback', visualSupport: 'fallback', behaviorSupport: 'unknown', defaultStateSource: 'unknown' });

describe('VanillaBehaviorRegistry', () => {
  it('has an explicit compatibility strategy for every BlockBehavior kind', () => {
    const expected = ['solid', 'horizontal-connect', 'stairs', 'wall-mounted', 'wall-sign', 'standing-sign', 'hanging-sign', 'wall-hanging-sign', 'floor-supported', 'vertical-chain', 'lantern-placement', 'torch-placement', 'double-height', 'paired-horizontal', 'candle', 'six-face-placement', 'decorated-pot-placement', 'conduit-placement', 'fluid', 'button', 'head-placement'];
    expect(Object.keys(VANILLA_BEHAVIOR_COMPATIBILITY).sort()).toEqual([...expected].sort());
    expect(Object.values(VANILLA_BEHAVIOR_COMPATIBILITY).every((entry) => entry.evidence.length > 0)).toBe(true);
  });
  it('resolves nested authoritative block tags without registry-name heuristics', () => {
    const resources = new Map<string, unknown>([
      ['data/minecraft/tags/block/fences.json', { values: ['#minecraft:wooden_fences', 'minecraft:nether_brick_fence'] }],
      ['data/minecraft/tags/block/wooden_fences.json', { values: ['minecraft:oak_fence', 'minecraft:spruce_fence'] }],
      ['data/minecraft/tags/block/stairs.json', { values: ['minecraft:oak_stairs'] }],
    ]);
    const registry = new VanillaBehaviorRegistry({ readJson: (path) => resources.get(path) });
    expect(registry.enrich(baseRecord('minecraft:spruce_fence'))).toMatchObject({ behaviorSupport: 'partial', behavior: { family: 'fence', connectionGroup: 'wood-fence' }, defaultState: { north: 'false' } });
    expect(registry.enrich(baseRecord('minecraft:nether_brick_fence'))).toMatchObject({ behavior: { family: 'fence', connectionGroup: 'nether-fence' } });
    expect(registry.enrich(baseRecord('minecraft:oak_stairs'))).toMatchObject({ behaviorSupport: 'full', behavior: { kind: 'stairs' }, defaultState: { shape: 'straight' } });
    expect(registry.enrich(baseRecord('example:oak_fence'))).toEqual(baseRecord('example:oak_fence'));
  });

  it('uses verified representative metadata when a legacy normalized cache has no block tags', () => {
    const registry = new VanillaBehaviorRegistry();
    expect(registry.enrich(baseRecord('minecraft:oak_fence'))).toMatchObject({ behaviorSupport: 'partial', behavior: { kind: 'horizontal-connect', family: 'fence' } });
    expect(registry.enrich(baseRecord('minecraft:oak_door'))).toMatchObject({ behaviorSupport: 'partial', behavior: { kind: 'double-height' }, defaultState: { half: 'lower' } });
    expect(registry.enrich(baseRecord('minecraft:dandelion'))).toMatchObject({ behaviorSupport: 'partial', behavior: { kind: 'floor-supported' } });
  });

  it('adds generic candle stacking metadata to every vanilla candle variant', () => {
    const registry = new VanillaBehaviorRegistry();
    for (const id of ['minecraft:candle', 'minecraft:white_candle', 'minecraft:red_candle', 'minecraft:orange_candle', 'minecraft:magenta_candle', 'minecraft:light_blue_candle', 'minecraft:yellow_candle', 'minecraft:lime_candle', 'minecraft:pink_candle', 'minecraft:gray_candle', 'minecraft:light_gray_candle', 'minecraft:cyan_candle', 'minecraft:purple_candle', 'minecraft:blue_candle', 'minecraft:brown_candle', 'minecraft:green_candle', 'minecraft:red_candle', 'minecraft:black_candle']) {
      expect(registry.enrich(baseRecord(id))).toMatchObject({
        behavior: { kind: 'candle', candlesProperty: 'candles', maxCandles: 4 },
        defaultState: { candles: '1', lit: 'false', waterlogged: 'false' },
        stateDefinitions: expect.arrayContaining([{ name: 'candles', values: ['1', '2', '3', '4'] }]),
      });
    }
    expect(isVanillaCandleId('minecraft:candle')).toBe(true);
    expect(isVanillaCandleId('minecraft:white_candle_cake')).toBe(false);
    expect(registry.enrich(baseRecord('minecraft:white_candle_cake'))).toEqual(baseRecord('minecraft:white_candle_cake'));
    expect(registry.enrich(baseRecord('example:red_candle'))).toEqual(baseRecord('example:red_candle'));
  });

  it('uses exact head/skull IDs and excludes piston_head', () => {
    const registry = new VanillaBehaviorRegistry();
    expect(registry.enrich(baseRecord('minecraft:skeleton_skull')).behavior).toMatchObject({ kind: 'head-placement', wall: false });
    expect(registry.enrich(baseRecord('minecraft:skeleton_wall_skull')).behavior).toMatchObject({ kind: 'head-placement', wall: true });
    expect(registry.enrich(baseRecord('minecraft:piston_head'))).toEqual(baseRecord('minecraft:piston_head'));
  });
  it('keeps contextual wall torch and wall banner metadata exact to vanilla IDs', () => {
    const registry = new VanillaBehaviorRegistry();
    for (const id of ['minecraft:torch', 'minecraft:soul_torch', 'minecraft:redstone_torch']) {
      expect(registry.enrich(baseRecord(id)).behavior).toMatchObject({ kind: 'torch-placement' });
    }
    for (const id of ['minecraft:wall_torch', 'minecraft:soul_wall_torch', 'minecraft:redstone_wall_torch']) {
      expect(registry.enrich(baseRecord(id))).toMatchObject({ behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, defaultState: { facing: 'north' } });
    }
    expect(registry.enrich(baseRecord('minecraft:red_wall_banner'))).toMatchObject({ behavior: { kind: 'wall-mounted', facingProperty: 'facing' } });
    expect(registry.enrich(baseRecord('example:red_wall_banner'))).toEqual(baseRecord('example:red_wall_banner'));
  });
  it('adds six-face placement metadata only to the 17 vanilla Shulker Box IDs', () => {
    const registry = new VanillaBehaviorRegistry();
    const ids = ['shulker_box', 'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box', 'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box', 'gray_shulker_box', 'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box', 'brown_shulker_box', 'green_shulker_box', 'red_shulker_box', 'black_shulker_box'];
    for (const id of ids) {
      expect(registry.enrich(baseRecord(`minecraft:${id}`))).toMatchObject({ behavior: { kind: 'six-face-placement', facingProperty: 'facing' }, defaultState: { facing: 'up' }, stateDefinitions: expect.arrayContaining([{ name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] }]) });
    }
    expect(registry.enrich(baseRecord('mod:red_shulker_box'))).toEqual(baseRecord('mod:red_shulker_box'));
  });
  it('adds exact Decorated Pot placement metadata and defaults', () => {
    const result = new VanillaBehaviorRegistry().enrich(baseRecord('minecraft:decorated_pot'));
    expect(result).toMatchObject({ behavior: { kind: 'decorated-pot-placement', facingProperty: 'facing' }, defaultState: { facing: 'north', waterlogged: 'false', cracked: 'false' }, stateDefinitions: expect.arrayContaining([{ name: 'cracked', values: ['true', 'false'] }]) });
  });
  it('keeps Conduit catalog default true while exposing only waterlogged state', () => {
    const result = new VanillaBehaviorRegistry().enrich(baseRecord('minecraft:conduit'));
    expect(result).toMatchObject({ behavior: { kind: 'conduit-placement', waterloggedProperty: 'waterlogged' }, defaultState: { waterlogged: 'true' }, stateDefinitions: [{ name: 'waterlogged', values: ['true', 'false'] }] });
  });
  it('discovers new vanilla standing/wall pairs from the selected resource catalog', () => {
    const states = new Map<string, unknown>([
      ['assets/minecraft/blockstates/cherry_sign.json', {}],
      ['assets/minecraft/blockstates/cherry_wall_sign.json', {}],
      ['assets/minecraft/blockstates/cherry_head.json', {}],
      ['assets/minecraft/blockstates/cherry_wall_head.json', {}],
    ]);
    const registry = new VanillaBehaviorRegistry({ readJson: (path) => states.get(path) });
    expect(registry.enrich({ ...baseRecord('minecraft:cherry_sign'), stateDefinitions: [
      { name: 'rotation', values: Array.from({ length: 16 }, (_, value) => String(value)) },
      { name: 'waterlogged', values: ['true', 'false'] },
    ], resources: { blockstate: 'assets/minecraft/blockstates/cherry_sign.json', textures: [] } })).toMatchObject({ behavior: { kind: 'standing-sign', wallBlockId: 'minecraft:cherry_wall_sign' } });
    expect(registry.enrich({ ...baseRecord('minecraft:cherry_wall_head'), stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }], resources: { blockstate: 'assets/minecraft/blockstates/cherry_wall_head.json', textures: [] } })).toMatchObject({ behavior: { kind: 'head-placement', wall: true } });
  });
  it('keeps raw water and lava as level-only fluid blocks', () => {
    const registry = new VanillaBehaviorRegistry();
    for (const [id, fluid] of [['minecraft:water', 'water'], ['minecraft:lava', 'lava']] as const) {
      expect(registry.enrich(baseRecord(id))).toMatchObject({ behavior: { kind: 'fluid', fluid }, defaultState: { level: '0' }, stateDefinitions: [{ name: 'level', values: Array.from({ length: 16 }, (_, value) => String(value)) }] });
    }
  });
});
