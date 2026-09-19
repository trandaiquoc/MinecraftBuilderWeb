import { describe, expect, it } from 'vitest';
import { decoratedPotData, decoratedPotSherdIds, toMinecraftDecoratedPotBlockEntityNbt } from './decorated-pot';

describe('decorated pot block entity', () => {
  it('omits default sherds and preserves canonical order', () => {
    expect(toMinecraftDecoratedPotBlockEntityNbt(decoratedPotData(undefined))).toEqual({ id: 'minecraft:decorated_pot' });
    expect(toMinecraftDecoratedPotBlockEntityNbt({ decorations: { back: 'minecraft:angler_pottery_sherd', left: 'minecraft:brick', right: 'minecraft:skull_pottery_sherd', front: 'minecraft:heart_pottery_sherd' } })).toEqual({ id: 'minecraft:decorated_pot', sherds: ['minecraft:angler_pottery_sherd', 'minecraft:brick', 'minecraft:skull_pottery_sherd', 'minecraft:heart_pottery_sherd'] });
  });
  it('accepts all vanilla sherd ids and falls back unknown values', () => {
    expect(decoratedPotSherdIds).toHaveLength(23);
    expect(decoratedPotData({ decorations: { front: 'minecraft:not_a_sherd' } }).decorations.front).toBe('minecraft:brick');
  });
  it('preserves imported unrelated raw fields', () => {
    expect(decoratedPotData({ item: { id: 'minecraft:diamond' }, sherds: ['minecraft:brick'] }).raw).toMatchObject({ item: { id: 'minecraft:diamond' } });
    expect(decoratedPotData({ sherds: ['minecraft:angler_pottery_sherd', 'minecraft:brick', 'minecraft:skull_pottery_sherd', 'minecraft:heart_pottery_sherd'] }).decorations).toEqual({ back: 'minecraft:angler_pottery_sherd', left: 'minecraft:brick', right: 'minecraft:skull_pottery_sherd', front: 'minecraft:heart_pottery_sherd' });
  });
});
