import { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { ContentSourceDescriptor, ContentSourceProvider } from './content-source.types';
import { CompositeAssetResourceProvider } from './composite-asset-provider';

export interface SourceRegistrationDiagnostic { readonly sourceId: string; readonly message: string; }

/** Pure coordinator for source lifecycle, namespace ownership and catalog composition. */
export class ContentSourceRegistry {
  readonly resources = new CompositeAssetResourceProvider();
  private readonly contributions = new Map<string, BlockCatalogSource>();
  private readonly conflictsValue: SourceRegistrationDiagnostic[] = [];

  register(provider: ContentSourceProvider): void {
    this.resources.register(provider);
    const catalog = provider.catalog?.();
    if (catalog) this.contributions.set(provider.source.id, catalog);
  }
  replace(provider: ContentSourceProvider): void {
    this.resources.replace(provider);
    const catalog = provider.catalog?.();
    if (catalog) this.contributions.set(provider.source.id, catalog); else this.contributions.delete(provider.source.id);
  }
  remove(sourceId: string): boolean { const removed = this.resources.remove(sourceId); if (removed) this.contributions.delete(sourceId); return removed; }
  get generation(): number { return this.resources.revision; }
  sources(): readonly ContentSourceDescriptor[] { return this.resources.sources(); }
  providerForSource(sourceId: string): ContentSourceProvider | undefined { return this.resources.providerForSource(sourceId); }
  decorationSources(): readonly ContentSourceDescriptor[] { return this.sources().filter((source) => source.decorationSupport === true); }
  conflicts(): readonly SourceRegistrationDiagnostic[] { return [...this.conflictsValue]; }
  catalogConflicts(): readonly { readonly id: string; readonly sourceIds: readonly string[] }[] { return this.catalog().conflicts(); }

  catalog(): BlockCatalog {
    const catalog = new BlockCatalog();
    for (const source of this.contributions.values()) {
      try { catalog.replaceSource(source); }
      catch (error) { this.conflictsValue.push({ sourceId: source.blocks[0]?.sourceId ?? 'unknown', message: error instanceof Error ? error.message : String(error) }); }
    }
    return catalog;
  }
}
