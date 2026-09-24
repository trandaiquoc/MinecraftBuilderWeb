import { Injectable, effect, inject, signal } from '@angular/core';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';
import type { ContentSourceProvider } from '../../assets/content-source/content-source.types';
import { ItemCatalog, ItemCatalogEntry, humanizeItemId, itemNamespace } from './item-catalog';
import type { CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import { resolveCatalogItemVisual } from './item-visual';
import type { RenderableAssetResourceProvider } from '../../assets/content-source/content-source.types';

@Injectable({ providedIn: 'root' })
export class ItemCatalogService {
  private readonly assets = inject(VanillaAssetsService);
  private readonly catalog = new ItemCatalog();
  readonly generation = signal(0);

  constructor() {
    effect(() => {
      this.assets.generation();
      this.rebuildFromActiveSources();
    });
  }

  all(): readonly ItemCatalogEntry[] { this.generation(); return this.catalog.all(); }
  search(query: string): readonly ItemCatalogEntry[] { this.generation(); return this.catalog.search(query); }
  get(id: string): ItemCatalogEntry | undefined { this.generation(); return this.catalog.get(id); }

  /** Useful for pure tests and future content-source adapters. */
  replaceSource(sourceId: string, entries: readonly ItemCatalogEntry[]): void {
    this.catalog.replaceSource(sourceId, entries);
    this.generation.update((value) => value + 1);
  }

  removeSource(sourceId: string): void {
    this.catalog.removeSource(sourceId);
    this.generation.update((value) => value + 1);
  }

  private rebuildFromActiveSources(): void {
    this.catalog.clear();
    for (const source of this.assets.sources.itemEvidenceSources()) {
      this.catalog.replaceSource(source.sourceId, source.items.map((item) => toCatalogEntry(item, source.sourceId, source.sourceName, source.provider, this.assets.sources.resources)));
    }
    this.generation.update((value) => value + 1);
  }
}

function toCatalogEntry(item: CatalogItemEvidence, sourceId: string, sourceName: string, provider: ContentSourceProvider | undefined, resources: RenderableAssetResourceProvider): ItemCatalogEntry {
  const namespace = itemNamespace(item.itemId);
  const path = item.itemId.slice(namespace ? namespace.length + 1 : 0);
  const language = provider ? readLanguage(provider, namespace) : {};
  const key = `item.${namespace}.${path.replaceAll('/', '.')}`;
  const blockKey = `block.${namespace}.${path.replaceAll('/', '.')}`;
  const translated = language[key] ?? language[blockKey];
  return {
    id: item.itemId,
    displayName: typeof translated === 'string' ? translated : humanizeItemId(item.itemId),
    namespace,
    sourceId: item.sourceId ?? sourceId,
    sourceName: item.sourceName ?? sourceName,
    sourceFormat: item.sourceFormat,
    referencedModels: item.referencedModels,
    referencedResources: item.referencedResources,
    visual: resolveCatalogItemVisual(resources, item.itemId),
    ...(item.explicitBlockPlacement ? { explicitBlockPlacement: item.explicitBlockPlacement } : {}),
  };
}

function readLanguage(provider: ContentSourceProvider, namespace: string): Readonly<Record<string, unknown>> {
  const value = provider.readJson(`assets/${namespace}/lang/en_us.json`);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}
