import { describe, expect, it, vi } from 'vitest';
import { VanillaAssetLifecycle } from './vanilla-asset-lifecycle';
import { VanillaAssetProvider } from './vanilla-asset-provider';

describe('VanillaAssetLifecycle', () => {
  it('validates and caches downloaded vanilla providers before returning them', async () => {
    const provider = { assertUsable: vi.fn(), serialize: vi.fn(() => ({ payload: 'normalized' })) } as unknown as VanillaAssetProvider;
    const source = { load: vi.fn(async () => provider) };
    const cache = { save: vi.fn(async () => undefined) };
    const lifecycle = new VanillaAssetLifecycle(cache as never, source as never);
    const progress = vi.fn();

    await expect(lifecycle.downloadAndCache('1.21.1', progress)).resolves.toBe(provider);
    expect(source.load).toHaveBeenCalledWith('1.21.1', progress, undefined);
    expect(provider.assertUsable).toHaveBeenCalledOnce();
    expect(cache.save).toHaveBeenCalledWith({ payload: 'normalized' }, undefined);
  });

  it('delegates vanilla cache removal and listing to the lifecycle cache', async () => {
    const cache = {
      deleteVanilla: vi.fn(async () => undefined),
      listVanillaVersions: vi.fn(async () => ['1.21.1']),
    };
    const lifecycle = new VanillaAssetLifecycle(cache as never, { load: vi.fn() } as never);
    await lifecycle.removeCachedVersion('1.21.1');
    await expect(lifecycle.cachedVersions()).resolves.toEqual(['1.21.1']);
    expect(cache.deleteVanilla).toHaveBeenCalledWith('1.21.1', undefined);
  });

  it('restores a cached vanilla bundle without calling the official source', async () => {
    const cached = new VanillaAssetProvider('cached.jar', {
      'assets/minecraft/lang/en_us.json': {},
      'assets/minecraft/blockstates/stone.json': { variants: { '': { model: 'minecraft:block/stone' } } },
      'assets/minecraft/models/block/stone.json': { elements: [] },
    }, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1])]])).serialize();
    const cache = { load: vi.fn(async () => cached) };
    const official = { load: vi.fn() };
    const lifecycle = new VanillaAssetLifecycle(cache as never, official as never);

    const restored = await lifecycle.loadCached('1.21.1');
    expect(restored?.minecraftVersion).toBe('1.21.1');
    expect(official.load).not.toHaveBeenCalled();
  });
});
