import { describe, expect, it } from 'vitest';
import { contentRestoreAfterMods, deriveAssetBootstrapStatus, shouldStartVersionLoad, thumbnailIdentityForItem, thumbnailKey } from './vanilla-assets.service';

describe('thumbnail cache key', () => {
  it('is stable for canonical state order and changes for provider generation', () => {
    const first = thumbnailKey(2, '1.21.1', 'minecraft:oak_stairs', { half: 'top', facing: 'north' });
    expect(first).toBe(thumbnailKey(2, '1.21.1', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
    expect(first).not.toBe(thumbnailKey(3, '1.21.1', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
    expect(first).not.toBe(thumbnailKey(2, '1.22', 'minecraft:oak_stairs', { facing: 'north', half: 'top' }));
  });
  it('uses the same preview identity for thumbnail preparation and lookup', () => {
    const item = { itemId: 'example:plant', previewRecipe: 'single' as const, concreteBlockIds: ['example:plant'] as const };
    const preview = thumbnailIdentityForItem(4, '1.21.1', item, { phase: '1' });
    expect(preview).toBe(thumbnailIdentityForItem(4, '1.21.1', item, { phase: '1' }));
    expect(preview).not.toBe(thumbnailIdentityForItem(4, '1.21.1', item, { phase: '0' }));
  });
});

describe('version load state', () => {
  it('keeps final content readiness partial when one cached mod fails', () => {
    expect(contentRestoreAfterMods(2, 1)).toEqual({ phase: 'partial', current: 2, total: 2, failed: 1 });
    expect(contentRestoreAfterMods(2, 0).phase).toBe('ready');
  });
  it('starts the first request even when the initial status is loading-cache', () => {
    expect(shouldStartVersionLoad(undefined, 'loading-cache', '1.21.1', undefined)).toBe(true);
  });
  it('deduplicates in-flight work while allowing ready providers and forced refreshes', () => {
    expect(shouldStartVersionLoad(undefined, 'downloading', '1.21.1', '1.21.1')).toBe(false);
    expect(shouldStartVersionLoad('1.21.1', 'ready', '1.21.1', undefined)).toBe(false);
    expect(shouldStartVersionLoad('1.21.1', 'ready', '1.21.1', undefined, true)).toBe(true);
  });
  it('derives distinct vanilla, mod restore, ready, partial, and unavailable states', () => {
    expect(deriveAssetBootstrapStatus('loading-cache', { phase: 'vanilla', current: 0, total: 0, failed: 0 }).kind).toBe('loading-cache');
    expect(deriveAssetBootstrapStatus('downloading', { phase: 'vanilla', current: 0, total: 0, failed: 0 }, { phase: 'download', loaded: 42, total: 100 }).percent).toBe(42);
    expect(deriveAssetBootstrapStatus('ready', { phase: 'restoring-mods', current: 1, total: 2, failed: 0, sourceName: 'Cobblemon' })).toMatchObject({ kind: 'restoring-mods', current: 1, total: 2, sourceName: 'Cobblemon' });
    expect(deriveAssetBootstrapStatus('ready', { phase: 'ready', current: 0, total: 0, failed: 0 }).kind).toBe('ready');
    expect(deriveAssetBootstrapStatus('ready', { phase: 'partial', current: 2, total: 2, failed: 1 })).toMatchObject({ kind: 'partial', warnings: 1 });
    expect(deriveAssetBootstrapStatus('offline', { phase: 'error', current: 0, total: 0, failed: 1 }).kind).toBe('unavailable');
  });
});
