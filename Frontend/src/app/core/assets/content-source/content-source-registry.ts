import { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import type { PaintingVariant } from '../../decorations/decoration.types';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { ContentSourceDescriptor, ContentSourceProvider } from './content-source.types';
import { CompositeAssetResourceProvider } from './composite-asset-provider';
import { TagIndex } from '../../content/tag-index';

export interface SourceRegistrationDiagnostic { readonly sourceId: string; readonly message: string; }
export interface ContentContributionConflict { readonly kind: 'block-id' | 'item-id' | 'decoration-id'; readonly id: string; readonly sourceIds: readonly string[]; }
export interface ItemEvidenceSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly items: readonly CatalogItemEvidence[];
  readonly provider?: ContentSourceProvider;
}

/** Pure coordinator for source lifecycle, namespace ownership and catalog composition. */
export class ContentSourceRegistry {
  readonly resources = new CompositeAssetResourceProvider();
  private readonly contributions = new Map<string, BlockCatalogSource>();
  private readonly paintingContributions = new Map<string, readonly PaintingVariant[]>();
  private conflictsValue: SourceRegistrationDiagnostic[] = [];
  constructor(private activeVersion = '1.21.1') { this.resources.setActiveVersion(activeVersion); }

  setActiveVersion(version: string): void { this.activeVersion = version; this.resources.setActiveVersion(version); }
  activeMinecraftVersion(): string { return this.activeVersion; }
  clear(): void { for (const source of this.sources()) this.remove(source.id); }

  register(provider: ContentSourceProvider): void {
    assertCompatibleSource(provider.source, this.activeVersion);
    this.resources.register(provider);
    try {
      const catalog = provider.catalog?.();
      if (catalog) { this.contributions.set(provider.source.id, catalog); this.paintingContributions.set(provider.source.id, catalog.paintingVariants ?? []); }
    } catch (error) { this.resources.remove(provider.source.id); throw error; }
  }
  replace(provider: ContentSourceProvider): void {
    assertCompatibleSource(provider.source, this.activeVersion);
    const previous = this.resources.providerForSource(provider.source.id);
    this.resources.replace(provider);
    try {
      const catalog = provider.catalog?.();
      if (catalog) { this.contributions.set(provider.source.id, catalog); this.paintingContributions.set(provider.source.id, catalog.paintingVariants ?? []); } else { this.contributions.delete(provider.source.id); this.paintingContributions.delete(provider.source.id); }
      if (previous && previous !== provider) previous.dispose?.();
    } catch (error) {
      this.resources.remove(provider.source.id);
      if (previous) this.resources.register(previous);
      throw error;
    }
  }
  remove(sourceId: string): boolean {
    const provider = this.resources.providerForSource(sourceId);
    const removed = this.resources.remove(sourceId);
    if (removed) {
      this.contributions.delete(sourceId);
      this.paintingContributions.delete(sourceId);
      provider?.dispose?.();
    }
    return removed;
  }
  get generation(): number { return this.resources.revision; }
  sources(): readonly ContentSourceDescriptor[] { return this.resources.sources(); }
  providerForSource(sourceId: string): ContentSourceProvider | undefined { return this.resources.providerForSource(sourceId); }
  /** Normalized tag evidence across all active sources, without exposing source-specific JSON shape. */
  tagIndex(): TagIndex { return new TagIndex(this.sources().map((source) => this.providerForSource(source.id)).filter((provider): provider is ContentSourceProvider => !!provider)); }
  decorationSources(): readonly ContentSourceDescriptor[] {
    return this.sources().filter((source) => source.decorationSupport === true || (this.paintingContributions.get(source.id)?.length ?? 0) > 0);
  }
  paintingVariants(): readonly PaintingVariant[] { return [...this.paintingContributions.values()].flat(); }
  itemEvidenceSources(): readonly ItemEvidenceSource[] {
    return [...this.contributions.entries()].map(([sourceId, source]) => ({
      sourceId,
      sourceName: source.sourceName ?? sourceId,
      items: source.targetItems ?? [],
      provider: this.providerForSource(sourceId),
    }));
  }
  conflicts(): readonly SourceRegistrationDiagnostic[] { return [...this.conflictsValue]; }
  catalogConflicts(): readonly { readonly id: string; readonly sourceIds: readonly string[] }[] { return this.catalog().conflicts(); }
  inspectCatalogContribution(source: BlockCatalogSource): readonly ContentContributionConflict[] {
    const conflicts: ContentContributionConflict[] = [];
    const existingBlocks = new Map(this.catalog().all().map((entry) => [entry.id, entry.sourceId]));
    for (const block of source.blocks) { const owner = existingBlocks.get(block.id); if (owner && owner !== source.sourceId) conflicts.push({ kind: 'block-id', id: block.id, sourceIds: [owner, source.sourceId ?? 'unknown'].sort() }); }
    const existingItems = new Map(this.itemEvidenceSources().flatMap((entry) => entry.items.map((item) => [item.itemId, entry.sourceId] as const)));
    for (const item of source.targetItems ?? []) { const owner = existingItems.get(item.itemId); if (owner && owner !== source.sourceId) conflicts.push({ kind: 'item-id', id: item.itemId, sourceIds: [owner, source.sourceId ?? 'unknown'].sort() }); }
    const existingDecorations = new Map(this.paintingVariants().map((entry) => [entry.id, entry.sourceId ?? 'vanilla']));
    for (const entry of source.paintingVariants ?? []) { const owner = existingDecorations.get(entry.id); if (owner && owner !== source.sourceId) conflicts.push({ kind: 'decoration-id', id: entry.id, sourceIds: [owner, source.sourceId ?? 'unknown'].sort() }); }
    return conflicts;
  }

  catalog(): BlockCatalog {
    this.conflictsValue = [];
    const catalog = new BlockCatalog();
    for (const source of this.contributions.values()) {
      try { catalog.replaceSource(source); }
      catch (error) { this.conflictsValue.push({ sourceId: source.blocks[0]?.sourceId ?? 'unknown', message: error instanceof Error ? error.message : String(error) }); }
    }
    return catalog;
  }
}

export function assertCompatibleSource(source: Pick<ContentSourceDescriptor, 'minecraftVersion'>, activeVersion = '1.21.1'): void {
  if (source.minecraftVersion !== activeVersion) throw new Error(`Unsupported content source Minecraft version: ${source.minecraftVersion}. Expected ${activeVersion}.`);
}
