import type { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import type { VanillaItemRegistry } from '../../items/registry/vanilla-item-registry';
import { ItemCatalog, ItemCatalogEntry, humanizeItemId, itemNamespace } from '../../items/catalog/item-catalog';

/** @deprecated Compatibility adapter. ItemCatalog is the single source of truth. */
export type DecorationItemDefinition = ItemCatalogEntry;

/** @deprecated Use ItemCatalog directly. */
export class DecorationItemCatalog extends ItemCatalog {
  load(provider: AssetResourceProvider, registry?: VanillaItemRegistry): void {
    const ids = registry?.all().map((entry) => entry.id) ?? itemModelIds(provider);
    const entries = ids.filter((id) => id !== 'minecraft:air').map((id) => ({
      id,
      displayName: translatedName(provider, id),
      namespace: itemNamespace(id),
      sourceId: 'vanilla',
      sourceName: 'Vanilla',
      sourceFormat: 'unknown' as const,
      referencedModels: [],
      referencedResources: [],
    }));
    this.replaceSource('vanilla', entries);
  }
}

function itemModelIds(provider: AssetResourceProvider): readonly string[] {
  const paths = typeof (provider as { paths?: () => readonly string[] }).paths === 'function' ? (provider as { paths: () => readonly string[] }).paths() : [];
  return paths.flatMap((path) => {
    const match = /^assets\/([^/]+)\/(?:models\/item|items)\/(.+)\.json$/.exec(path);
    return match ? [`${match[1]}:${match[2]}`] : [];
  });
}

function translatedName(provider: AssetResourceProvider, id: string): string {
  const namespace = itemNamespace(id); const path = id.slice(namespace.length + 1);
  const language = provider.readJson(`assets/${namespace}/lang/en_us.json`);
  const values = language && typeof language === 'object' && !Array.isArray(language) ? language as Record<string, unknown> : {};
  const translated = values[`item.${namespace}.${path.replaceAll('/', '.')}`] ?? values[`block.${namespace}.${path.replaceAll('/', '.')}`];
  return typeof translated === 'string' ? translated : humanizeItemId(id);
}
