import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ItemCatalogService } from './item-catalog.service';
import { ItemVisualService } from './item-visual.service';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';

describe('ItemVisualService', () => {
  function setup() {
    let textureCalls = 0;
    const json: Record<string, unknown> = { 'assets/example/models/item/gem.json': { parent: 'minecraft:item/generated', textures: { layer0: 'example:item/gem' } } };
    const resources = {
      readJson: (path: string) => json[path],
      readBinary: (_path: string) => new Uint8Array([1]),
      textureUrl: (_resource: string) => { textureCalls += 1; return 'blob:gem'; },
      gameVersion: '1.21.1',
    };
    const assets = { generation: signal(1), visualProvider: () => undefined, sources: { resources, itemEvidenceSources: () => [{ sourceId: 'example', sourceName: 'Example', provider: { readJson: () => ({}) }, items: [{ itemId: 'example:gem', sourceFormat: 'legacy-item-model', referencedModels: [], referencedResources: [] }] }] } };
    TestBed.configureTestingModule({ providers: [{ provide: VanillaAssetsService, useValue: assets }, ItemCatalogService, ItemVisualService] });
    return { assets, resources, get textureCalls() { return textureCalls; } };
  }

  it('keeps catalog indexing metadata-only and resolves one visual on demand', async () => {
    const fixture = setup();
    const catalog = TestBed.inject(ItemCatalogService);
    (catalog as unknown as { rebuildFromActiveSources(): void }).rebuildFromActiveSources();
    expect(catalog.all()).toHaveLength(1);
    expect(fixture.textureCalls).toBe(0);
    const visuals = TestBed.inject(ItemVisualService);
    const first = visuals.request('example:gem');
    const second = visuals.request('example:gem');
    expect(await first).toMatchObject({ status: 'available', previewUrls: ['blob:gem'] });
    expect(await second).toEqual(await first);
    expect(fixture.textureCalls).toBe(1);
  });

  it('uses the shared perspective rasterizer for static block-model items', async () => {
    const json: Record<string, unknown> = {
      'assets/example/models/item/stone.json': { parent: 'minecraft:block/cube_all' },
      'assets/minecraft/models/block/cube_all.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16] }] },
    };
    const rasterize = vi.fn(async () => ({ url: 'blob:stone-preview', quality: 'enhanced' as const }));
    const resources = { readJson: (path: string) => json[path], readBinary: () => new Uint8Array([1]), textureUrl: () => undefined, gameVersion: '1.21.1' };
    const assets = { generation: signal(1), visualProvider: () => ({ perspectiveItemVisualThumbnail: rasterize }), sources: { resources, itemEvidenceSources: () => [] } };
    TestBed.configureTestingModule({ providers: [{ provide: VanillaAssetsService, useValue: assets }, ItemVisualService] });
    const info = await TestBed.inject(ItemVisualService).request('example:stone', 'high');
    expect(info).toMatchObject({ kind: 'block-model', status: 'available', previewUrls: ['blob:stone-preview'] });
    expect(rasterize).toHaveBeenCalledWith('example:stone');
  });

  it('keeps visual cache identity component-sensitive and does not resolve catalog rows implicitly', async () => {
    const rasterize = vi.fn(async () => ({ url: 'blob:stack-preview', quality: 'enhanced' as const }));
    const assets = {
      generation: signal(1),
      visualProvider: () => ({ perspectiveItemVisualThumbnail: rasterize }),
      sources: { resources: { readJson: () => ({ textures: { layer0: 'example:item/gem' } }), readBinary: () => new Uint8Array([1]), textureUrl: () => 'blob:layer' }, itemEvidenceSources: () => [] },
    };
    TestBed.configureTestingModule({ providers: [{ provide: VanillaAssetsService, useValue: assets }, ItemVisualService] });
    const visuals = TestBed.inject(ItemVisualService);
    const first = { id: 'example:gem', count: 1, components: { 'minecraft:profile': { name: 'A' } } };
    const second = { id: 'example:gem', count: 1, components: { 'minecraft:profile': { name: 'B' } } };
    await visuals.request(first, 'high');
    await visuals.request(second, 'high');
    expect(rasterize).toHaveBeenCalledTimes(2);
  });
});
