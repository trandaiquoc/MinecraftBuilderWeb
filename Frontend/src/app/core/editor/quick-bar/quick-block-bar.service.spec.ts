import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { quickEntryMatchesActive } from './quick-block-bar.service';

describe('quick block active state contract', () => {
  it('preserves a pinned BlockState when it becomes active again', () => {
    const active = new ActiveBlockService();
    active.set({ id: 'minecraft:oak_stairs', state: { facing: 'north', half: 'top' }, support: 'full' });
    expect(active.active()).toEqual({ id: 'minecraft:oak_stairs', state: { facing: 'north', half: 'top' }, support: 'full' });
  });

  it('matches a direct block even when ActiveBlock omits redundant itemId', () => {
    expect(quickEntryMatchesActive({ id: 'minecraft:stone', itemId: 'minecraft:stone', state: {} }, { id: 'minecraft:stone', state: {} })).toBe(true);
  });

  it('matches item identity and pinned state deterministically', () => {
    const entry = { id: 'minecraft:oak_stairs', itemId: 'minecraft:oak_stairs', state: { half: 'top', facing: 'north' } };
    expect(quickEntryMatchesActive(entry, { id: 'minecraft:oak_stairs', state: { facing: 'north', half: 'top' } })).toBe(true);
    expect(quickEntryMatchesActive(entry, { id: 'minecraft:oak_stairs', state: { facing: 'south', half: 'top' } })).toBe(false);
    expect(quickEntryMatchesActive({ ...entry, itemId: 'minecraft:stone', id: 'minecraft:stone' }, { id: 'minecraft:oak_stairs', state: entry.state })).toBe(false);
  });

  it('does not mark an unavailable source entry active', () => {
    expect(quickEntryMatchesActive({ id: 'example:stone', itemId: 'example:stone', state: {} }, { id: 'example:stone', state: {} }, false)).toBe(false);
    expect(quickEntryMatchesActive({ id: 'example:stone', itemId: 'example:stone', state: {} }, { id: 'example:stone', state: {} }, true)).toBe(true);
  });
});
