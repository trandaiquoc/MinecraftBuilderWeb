import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../blocks/active-block.service';

describe('quick block active state contract', () => {
  it('preserves a pinned BlockState when it becomes active again', () => {
    const active = new ActiveBlockService();
    active.set({ id: 'minecraft:oak_stairs', state: { facing: 'north', half: 'top' }, support: 'full' });
    expect(active.active()).toEqual({ id: 'minecraft:oak_stairs', state: { facing: 'north', half: 'top' }, support: 'full' });
  });
});
