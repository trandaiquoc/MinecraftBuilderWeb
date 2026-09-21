import { describe, expect, it } from 'vitest';
import { shouldStartVersionLoad, thumbnailKey } from './vanilla-assets.service';

describe('thumbnail cache key', () => {
  it('is stable for canonical state order and changes for provider generation', () => {
    const first = thumbnailKey(2, '1.21.1', 'minecraft:oak_stairs', { half: 'top', facing: 'north' });
    expect(first).toBe(thumbnailKey(2, '1.21.1', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
    expect(first).not.toBe(thumbnailKey(3, '1.21.1', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
    expect(first).not.toBe(thumbnailKey(2, '1.22', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
  });
});

describe('version load state', () => {
  it('starts the first request even when the initial status is loading-cache', () => {
    expect(shouldStartVersionLoad(undefined, 'loading-cache', '1.21.1', undefined)).toBe(true);
  });
  it('deduplicates in-flight work while allowing ready providers and forced refreshes', () => {
    expect(shouldStartVersionLoad(undefined, 'downloading', '1.21.1', '1.21.1')).toBe(false);
    expect(shouldStartVersionLoad('1.21.1', 'ready', '1.21.1', undefined)).toBe(false);
    expect(shouldStartVersionLoad('1.21.1', 'ready', '1.21.1', undefined, true)).toBe(true);
  });
});
