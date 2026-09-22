import { describe, expect, it } from 'vitest';
import { defaultItemContainerData, itemContainerData, setItemContainerSlot } from './item-container';

describe('item container block entity data', () => {
  it('creates deterministic empty slots and immutable updates', () => {
    const initial = defaultItemContainerData('item-storage-display', 3);
    const updated = setItemContainerSlot(initial, 'item-storage-display', 3, 1, { id: 'minecraft:apple', count: 1 });
    expect(initial.slots[1]?.stack).toBeUndefined();
    expect(updated.slots).toEqual([{ slot: 0 }, { slot: 1, stack: { id: 'minecraft:apple', count: 1 } }, { slot: 2 }]);
  });

  it('preserves unknown raw fields and custom components', () => {
    const data = itemContainerData({ kind: 'legacy-shelf', unknown: { keep: true }, slots: [{ slot: 0, stack: { id: 'example:gem', count: 2, components: { custom: 'value' } } }] }, 'item-storage-display', 3);
    expect(data.raw).toEqual({ kind: 'legacy-shelf', unknown: { keep: true }, slots: [{ slot: 0, stack: { id: 'example:gem', count: 2, components: { custom: 'value' } } }] });
    expect(data.slots[0]?.stack?.components).toEqual({ custom: 'value' });
  });

  it('normalizes invalid and out-of-range slots to empty deterministic slots', () => {
    const data = itemContainerData({ slots: [{ slot: 3, stack: { id: 'minecraft:stone', count: 1 } }, { slot: 0, stack: { id: '', count: 1 } }] }, 'item-display', 2);
    expect(data.slots).toEqual([{ slot: 0 }, { slot: 1 }]);
  });
});
