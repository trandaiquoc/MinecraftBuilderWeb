import { describe, expect, it } from 'vitest';
import { AssetBlockRecord } from '../blocks/block-definition.types';
import { VanillaBehaviorRegistry } from './vanilla-behavior-registry';

const baseRecord = (id: string): AssetBlockRecord => ({ id, displayName: id, defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'fallback', visualSupport: 'fallback', behaviorSupport: 'unknown', defaultStateSource: 'unknown' });

describe('VanillaBehaviorRegistry', () => {
  it('resolves nested authoritative block tags without registry-name heuristics', () => {
    const resources = new Map<string, unknown>([
      ['data/minecraft/tags/block/fences.json', { values: ['#minecraft:wooden_fences', 'minecraft:nether_brick_fence'] }],
      ['data/minecraft/tags/block/wooden_fences.json', { values: ['minecraft:oak_fence', 'minecraft:spruce_fence'] }],
      ['data/minecraft/tags/block/stairs.json', { values: ['minecraft:oak_stairs'] }],
    ]);
    const registry = new VanillaBehaviorRegistry({ readJson: (path) => resources.get(path) });
    expect(registry.enrich(baseRecord('minecraft:spruce_fence'))).toMatchObject({ behaviorSupport: 'full', behavior: { family: 'fence', connectionGroup: 'wood-fence' }, defaultState: { north: 'false' } });
    expect(registry.enrich(baseRecord('minecraft:nether_brick_fence'))).toMatchObject({ behavior: { family: 'fence', connectionGroup: 'nether-fence' } });
    expect(registry.enrich(baseRecord('minecraft:oak_stairs'))).toMatchObject({ behaviorSupport: 'full', behavior: { kind: 'stairs' }, defaultState: { shape: 'straight' } });
    expect(registry.enrich(baseRecord('example:oak_fence'))).toEqual(baseRecord('example:oak_fence'));
  });

  it('uses verified representative metadata when a legacy normalized cache has no block tags', () => {
    const registry = new VanillaBehaviorRegistry();
    expect(registry.enrich(baseRecord('minecraft:oak_fence'))).toMatchObject({ behaviorSupport: 'full', behavior: { kind: 'horizontal-connect', family: 'fence' } });
    expect(registry.enrich(baseRecord('minecraft:oak_door'))).toMatchObject({ behaviorSupport: 'partial', behavior: { kind: 'double-height' }, defaultState: { half: 'lower' } });
    expect(registry.enrich(baseRecord('minecraft:dandelion'))).toMatchObject({ behaviorSupport: 'partial', behavior: { kind: 'floor-supported' } });
  });

  it('adds generic candle stacking metadata to every vanilla candle variant', () => {
    const registry = new VanillaBehaviorRegistry();
    for (const id of ['minecraft:white_candle', 'minecraft:red_candle', 'minecraft:blue_candle']) {
      expect(registry.enrich(baseRecord(id))).toMatchObject({
        behavior: { kind: 'candle', candlesProperty: 'candles', maxCandles: 4 },
        defaultState: { candles: '1', lit: 'false', waterlogged: 'false' },
        stateDefinitions: expect.arrayContaining([{ name: 'candles', values: ['1', '2', '3', '4'] }]),
      });
    }
    expect(registry.enrich(baseRecord('example:red_candle'))).toEqual(baseRecord('example:red_candle'));
  });
});
