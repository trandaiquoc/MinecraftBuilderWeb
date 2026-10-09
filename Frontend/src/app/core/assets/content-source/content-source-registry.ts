import { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import type { PaintingVariant } from '../../decorations/decoration.types';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { ContentSourceDescriptor, ContentSourceProvider } from './content-source.types';
import { CompositeAssetResourceProvider } from './composite-asset-provider';
import { TagIndex } from '../../content/tag-index';
import { yieldToBrowser } from '../cooperative-yield';
import { throwIfAborted } from '../mod/mod-import-cancellation';

export interface SourceRegistrationDiagnostic { readonly sourceId: string; readonly message: string; }
export interface ContentContributionConflict { readonly kind: 'block-id' | 'item-id' | 'decoration-id'; readonly id: string; readonly sourceIds: readonly string[]; }
export interface ItemEvidenceSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly items: readonly CatalogItemEvidence[];
  readonly provider?: ContentSourceProvider;
}
export interface CatalogConflictProgress { readonly processed: number; readonly total: number; }
export interface PreparedContentSource {
  readonly provider: ContentSourceProvider;
  readonly catalog: BlockCatalogSource & { readonly paintingVariants?: readonly PaintingVariant[] };
  readonly replaceExisting?: boolean;
}

/** Pure coordinator for source lifecycle, namespace ownership and catalog composition. */
export class ContentSourceRegistry {
  readonly resources = new CompositeAssetResourceProvider();
  private readonly contributions = new Map<string, BlockCatalogSource>();
  private readonly paintingContributions = new Map<string, readonly PaintingVariant[]>();
  private conflictsValue: SourceRegistrationDiagnostic[] = [];
  constructor(activeVersion = '1.21.1') { this.resources.setActiveVersion(activeVersion); }

  setActiveVersion(version: string): void { this.resources.setActiveVersion(version); }
  activeMinecraftVersion(): string { return this.resources.activeMinecraftVersion; }
  clear(): void { for (const source of this.sources()) this.remove(source.id); }

  /**
   * Publishes a prepared set of sources as one content boundary. Catalogs are
   * supplied by the caller so a restore commit never rebuilds them on the
   * live path. Validation happens before the first provider is registered.
   */
  commitBatch(entries: readonly PreparedContentSource[]): void {
    if (!entries.length) return;
    const sourceIds = new Set<string>();
    for (const entry of entries) {
      assertCompatibleSource(entry.provider.source, this.activeMinecraftVersion());
      const id = entry.provider.source.id;
      if (sourceIds.has(id)) throw new Error(`Content source is duplicated in batch: ${id}`);
      sourceIds.add(id);
      const existing = this.providerForSource(id);
      if (existing && !entry.replaceExisting) throw new Error(`Content source is already registered: ${id}`);
      const resourceConflicts = this.resources.inspectProvider(entry.provider);
      if (resourceConflicts.length) throw new Error(formatContentConflict(resourceConflicts[0]));
    }

    const stagedPaths = new Map<string, ContentSourceProvider>();
    const liveCatalog = this.catalog();
    // Validate normalization before touching live resources. This keeps an
    // invalid prepared record from failing after the resource boundary.
    const normalizedStagedCatalog = new BlockCatalog();
    normalizedStagedCatalog.replaceSources(entries.map((entry) => entry.catalog));
    const liveBlocks = new Map(liveCatalog.all().filter((block) => !sourceIds.has(block.sourceId ?? '')).map((block) => [block.id, block.sourceId] as const));
    const liveItems = new Map(this.itemEvidenceSources().filter((source) => !sourceIds.has(source.sourceId)).flatMap((source) => source.items.map((item) => [item.itemId, source.sourceId] as const)));
    const livePaintings = new Map(this.paintingVariants().filter((painting) => !sourceIds.has(painting.sourceId ?? 'vanilla')).map((painting) => [painting.id, painting.sourceId ?? 'vanilla'] as const));
    for (const entry of entries) {
      const id = entry.provider.source.id;
      for (const path of entry.provider.paths?.() ?? []) {
        const previous = stagedPaths.get(path);
        if (previous && !isAdditiveTag(path, previous, entry.provider)) throw new Error(formatContentConflict({ path, sourceIds: [previous.source.id, id].sort(), kind: isTagPath(path) ? 'tag-replacement' : 'resource-collision' }));
        stagedPaths.set(path, entry.provider);
      }
      const catalog = entry.catalog;
      for (const block of catalog.blocks) {
        const owner = liveBlocks.get(block.id);
        if (owner && owner !== id) throw new Error(`Catalog block-id conflict for ${block.id} (${owner}, ${id})`);
        liveBlocks.set(block.id, id);
      }
      for (const item of catalog.targetItems ?? []) {
        const owner = liveItems.get(item.itemId);
        if (owner && owner !== id) throw new Error(`Catalog item-id conflict for ${item.itemId} (${owner}, ${id})`);
        liveItems.set(item.itemId, id);
      }
      for (const painting of catalog.paintingVariants ?? []) {
        const owner = livePaintings.get(painting.id);
        if (owner && owner !== id) throw new Error(`Catalog decoration-id conflict for ${painting.id} (${owner}, ${id})`);
        livePaintings.set(painting.id, id);
      }
    }

    for (const entry of entries) {
      const id = entry.provider.source.id;
      if (entry.replaceExisting && this.providerForSource(id)) this.resources.replace(entry.provider);
      else this.resources.register(entry.provider);
      this.contributions.set(id, entry.catalog);
      this.paintingContributions.set(id, entry.catalog.paintingVariants ?? []);
    }
  }

  register(provider: ContentSourceProvider): void {
    assertCompatibleSource(provider.source, this.activeMinecraftVersion());
    this.resources.register(provider);
    try {
      const catalog = provider.catalog?.();
      if (catalog) { this.contributions.set(provider.source.id, catalog); this.paintingContributions.set(provider.source.id, catalog.paintingVariants ?? []); }
    } catch (error) { this.resources.remove(provider.source.id); throw error; }
  }
  replace(provider: ContentSourceProvider): void {
    assertCompatibleSource(provider.source, this.activeMinecraftVersion());
    const catalog = provider.catalog?.();
    this.resources.replace(provider);
    if (catalog) { this.contributions.set(provider.source.id, catalog); this.paintingContributions.set(provider.source.id, catalog.paintingVariants ?? []); }
    else { this.contributions.delete(provider.source.id); this.paintingContributions.delete(provider.source.id); }
  }
  remove(sourceId: string): boolean {
    const removed = this.resources.remove(sourceId);
    if (removed) {
      this.contributions.delete(sourceId);
      this.paintingContributions.delete(sourceId);
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
  async inspectCatalogContributionAsync(source: BlockCatalogSource, onProgress?: (progress: CatalogConflictProgress) => void, signal?: AbortSignal): Promise<readonly ContentContributionConflict[]> {
    throwIfAborted(signal);
    const conflicts: ContentContributionConflict[] = [];
    const existingBlocks = new Map(this.catalog().all().map((entry) => [entry.id, entry.sourceId]));
    const existingItems = new Map(this.itemEvidenceSources().flatMap((entry) => entry.items.map((item) => [item.itemId, entry.sourceId] as const)));
    const existingDecorations = new Map(this.paintingVariants().map((entry) => [entry.id, entry.sourceId ?? 'vanilla']));
    const total = source.blocks.length + (source.targetItems?.length ?? 0) + (source.paintingVariants?.length ?? 0); let processed = 0;
    for (const block of source.blocks) { throwIfAborted(signal); const owner = existingBlocks.get(block.id); if (owner && owner !== source.sourceId) conflicts.push({ kind: 'block-id', id: block.id, sourceIds: [owner, source.sourceId ?? 'unknown'].sort() }); processed += 1; onProgress?.({ processed, total }); if (processed % 64 === 0) { await yieldToBrowser(signal); throwIfAborted(signal); } }
    for (const item of source.targetItems ?? []) { throwIfAborted(signal); const owner = existingItems.get(item.itemId); if (owner && owner !== source.sourceId) conflicts.push({ kind: 'item-id', id: item.itemId, sourceIds: [owner, source.sourceId ?? 'unknown'].sort() }); processed += 1; onProgress?.({ processed, total }); if (processed % 64 === 0) { await yieldToBrowser(signal); throwIfAborted(signal); } }
    for (const entry of source.paintingVariants ?? []) { throwIfAborted(signal); const owner = existingDecorations.get(entry.id); if (owner && owner !== source.sourceId) conflicts.push({ kind: 'decoration-id', id: entry.id, sourceIds: [owner, source.sourceId ?? 'unknown'].sort() }); processed += 1; onProgress?.({ processed, total }); if (processed % 64 === 0) { await yieldToBrowser(signal); throwIfAborted(signal); } }
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

function isAdditiveTag(path: string, left: ContentSourceProvider, right: ContentSourceProvider): boolean {
  return isTagPath(path) && !isReplaceTag(left.readJson(path)) && !isReplaceTag(right.readJson(path));
}
function isTagPath(path: string): boolean { return /^data\/[^/]+\/tags\/(?:block|item|painting_variant)\/.+\.json$/.test(path); }
function isReplaceTag(value: unknown): boolean { return !!value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>)['replace'] === true; }
function formatContentConflict(conflict: { readonly path: string; readonly sourceIds: readonly string[]; readonly kind: 'resource-collision' | 'tag-replacement' }): string {
  return `${conflict.kind === 'tag-replacement' ? 'Tag replacement' : 'Resource collision'} at ${conflict.path} (${conflict.sourceIds.join(', ')})`;
}

export function assertCompatibleSource(source: Pick<ContentSourceDescriptor, 'minecraftVersion'>, activeVersion = '1.21.1'): void {
  if (source.minecraftVersion !== activeVersion) throw new Error(`Unsupported content source Minecraft version: ${source.minecraftVersion}. Expected ${activeVersion}.`);
}
