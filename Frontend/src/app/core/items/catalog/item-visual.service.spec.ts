import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
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
    const assets = { generation: signal(1), sources: { resources, itemEvidenceSources: () => [{ sourceId: 'example', sourceName: 'Example', provider: { readJson: () => ({}) }, items: [{ itemId: 'example:gem', sourceFormat: 'legacy-item-model', referencedModels: [], referencedResources: [] }] }] } };
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
});
