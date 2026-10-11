import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { ContentAssetRuntimeService } from '../../assets/content-asset-runtime.service';
import { ItemCatalogService } from './item-catalog.service';

describe('ItemCatalogService', () => {
  it('indexes active item evidence and localized names without inferring unrelated IDs', () => {
    const language = {
      'item.minecraft.diamond': 'Diamond',
      'block.minecraft.oak_log': 'Oak Log',
    };
    const source = {
      sourceId: 'vanilla',
      sourceName: 'Vanilla',
      provider: {
        source: {
          id: 'vanilla',
          kind: 'vanilla',
          displayName: 'Vanilla',
          minecraftVersion: '1.21.1',
          namespaces: ['minecraft'],
        },
        readJson: (path: string) =>
          path === 'assets/minecraft/lang/en_us.json' ? language : undefined,
      },
      items: [
        'minecraft:diamond',
        'minecraft:oak_log',
        'minecraft:water_bucket',
        'minecraft:zombie_spawn_egg',
      ].map((itemId) => ({
        itemId,
        sourceFormat: 'authoritative-registry' as const,
        referencedModels: [],
        referencedResources: [],
      })),
    };
    const assets = {
      generation: signal(1),
      sources: { itemEvidenceSources: () => [source] },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ContentAssetRuntimeService, useValue: assets }, ItemCatalogService],
    });

    const catalog = TestBed.inject(ItemCatalogService);
    TestBed.flushEffects();

    expect(catalog.search('diamond').map((entry) => entry.id)).toContain('minecraft:diamond');
    expect(catalog.search('oak log').map((entry) => entry.id)).toContain('minecraft:oak_log');
    expect(catalog.search('spawn egg').map((entry) => entry.id)).toContain(
      'minecraft:zombie_spawn_egg',
    );
    expect(catalog.get('minecraft:diamond')?.displayName).toBe('Diamond');
    expect(catalog.all().map((entry) => entry.id)).not.toContain('minecraft:zombie');
    expect(catalog.all().map((entry) => entry.id)).not.toContain('minecraft:air');
  });
});
