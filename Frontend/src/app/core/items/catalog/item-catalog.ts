import type { CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';

export interface ItemCatalogEntry {
  readonly id: string;
  readonly displayName: string;
  readonly namespace: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceFormat: CatalogItemEvidence['sourceFormat'];
  readonly referencedModels: readonly string[];
  readonly referencedResources: readonly string[];
  readonly explicitBlockPlacement?: { readonly blockId: string };
}

/** Source-independent index for ItemStack-capable content. It never becomes the Block catalog. */
export class ItemCatalog {
  private readonly contributions = new Map<string, readonly ItemCatalogEntry[]>();
  private readonly entries = new Map<string, ItemCatalogEntry>();
  private readonly searchIndex = new Map<string, string>();

  replaceSource(sourceId: string, entries: readonly ItemCatalogEntry[]): void {
    this.contributions.set(sourceId, entries.map((entry) => ({ ...entry, referencedModels: [...entry.referencedModels], referencedResources: [...entry.referencedResources] })));
    this.rebuild();
  }

  removeSource(sourceId: string): void { this.contributions.delete(sourceId); this.rebuild(); }
  clear(): void { this.contributions.clear(); this.rebuild(); }
  sourceIds(): readonly string[] { return [...this.contributions.keys()]; }
  get(id: string): ItemCatalogEntry | undefined { return this.entries.get(id); }
  all(): readonly ItemCatalogEntry[] { return [...this.entries.values()]; }

  search(query: string): readonly ItemCatalogEntry[] {
    const normalized = normalizeItemSearch(query);
    if (!normalized) return this.all();
    return this.all().filter((entry) => this.searchIndex.get(entry.id)?.includes(normalized) ?? false);
  }

  private rebuild(): void {
    this.entries.clear();
    this.searchIndex.clear();
    for (const sourceEntries of this.contributions.values()) for (const entry of sourceEntries) {
      // A canonical registry ID identifies an Item. A later source cannot silently
      // replace an existing source's metadata in the active catalog.
      if (this.entries.has(entry.id)) continue;
      this.entries.set(entry.id, entry);
      this.searchIndex.set(entry.id, normalizeItemSearch(`${entry.displayName} ${entry.id} ${entry.namespace} ${entry.sourceName}`));
    }
  }
}

export function normalizeItemSearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

export function itemNamespace(id: string): string {
  const separator = id.indexOf(':');
  return separator > 0 ? id.slice(0, separator) : '';
}

export function humanizeItemId(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return path.split('/').at(-1)!.split('_').filter(Boolean).map((part) => part[0]!.toUpperCase() + part.slice(1)).join(' ');
}
