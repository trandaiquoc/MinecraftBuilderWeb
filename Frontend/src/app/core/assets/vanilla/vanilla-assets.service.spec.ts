import { describe, expect, it } from 'vitest';
import { thumbnailKey } from './vanilla-assets.service';

describe('thumbnail cache key', () => {
  it('is stable for canonical state order and changes for provider generation', () => {
    const first = thumbnailKey(2, '1.21.1', 'minecraft:oak_stairs', { half: 'top', facing: 'north' });
    expect(first).toBe(thumbnailKey(2, '1.21.1', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
    expect(first).not.toBe(thumbnailKey(3, '1.21.1', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
    expect(first).not.toBe(thumbnailKey(2, '1.22', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
  });
});
