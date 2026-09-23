import { Injectable, computed, signal } from '@angular/core';
import { ActiveBlockService } from '../placement-palette/active-block.service';
import { BlockCatalog } from './block-catalog';
import type { BlockDefinition, NormalizedBlockDefinition } from './block-definition.types';
import { representativeBlockFixture } from './block-catalog.fixture';
import { buildPlaceableItems, PlaceableItemDefinition, placementItemSearch } from '../placement-palette/placeable-item';
import { ALL_CONTENT_SOURCE } from '../../../shared/ui/content-source-selector/content-source-filter';
import type { ContentSourceSelection } from '../../../shared/ui/content-source-selector/content-source-filter';
import { DecorationService } from '../../decorations/decoration.service';
import type { BlockCatalogSource } from './block-catalog';

@Injectable({ providedIn: 'root' })
export class BlockLibraryService {
  private catalog = new BlockCatalog();
  private items: readonly PlaceableItemDefinition[] = [];
  private readonly itemById = new Map<string, PlaceableItemDefinition>();
  private readonly itemByBlockId = new Map<string, PlaceableItemDefinition>();
  private readonly itemsBySource = new Map<string, readonly PlaceableItemDefinition[]>();
  private readonly revision = signal(0);
  readonly query = signal('');
  readonly results = computed<readonly PlaceableItemDefinition[]>(() => { this.revision(); return placementItemSearch(this.items, this.query()); });
  readonly allPlaceableItems = computed<readonly PlaceableItemDefinition[]>(() => { this.revision(); return this.items; });
  readonly rawResults = computed<readonly BlockDefinition[]>(() => { this.revision(); return this.catalog.search(this.query()); });

  constructor(readonly activeBlock: ActiveBlockService, private readonly decorations?: DecorationService) {
    this.catalog.load(representativeBlockFixture);
    this.replaceItems(buildPlaceableItems(this.catalog.all(), this.catalog.targetItems(), this.catalog.hasTargetItemEvidence()));
  }

  setQuery(query: string): void { this.query.set(query); }
  load(source: BlockCatalogSource): void { this.replaceSource(source); }
  replaceSource(source: BlockCatalogSource): void { const activeId = this.activeBlock.active()?.id; const activeSource = activeId ? this.catalog.get(activeId)?.sourceId : undefined; this.catalog.replaceSource(source); this.replaceItems(buildPlaceableItems(this.catalog.all(), this.catalog.targetItems(), this.catalog.hasTargetItemEvidence())); if (activeId && activeSource === (source.sourceId ?? source.blocks[0]?.sourceId ?? 'vanilla') && !this.catalog.get(activeId)) this.activeBlock.clear(); this.revision.update((value) => value + 1); }
  removeSource(sourceId: string): void { const activeId = this.activeBlock.active()?.id; const activeSource = activeId ? this.catalog.get(activeId)?.sourceId : undefined; this.catalog.removeSource(sourceId); this.replaceItems(buildPlaceableItems(this.catalog.all(), this.catalog.targetItems(), this.catalog.hasTargetItemEvidence())); if (activeSource === sourceId) this.activeBlock.clear(); this.revision.update((value) => value + 1); }
  sourceIds(): readonly string[] { return this.catalog.sources(); }
  catalogConflicts(): readonly { readonly id: string; readonly sourceIds: readonly string[] }[] { return this.catalog.conflicts(); }
  select(item: PlaceableItemDefinition): void { this.decorations?.clearActive(); this.activeBlock.select(item); }
  get(id: string): NormalizedBlockDefinition | undefined { return this.catalog.get(id); }
  getItem(itemId: string): PlaceableItemDefinition | undefined { return this.itemById.get(itemId) ?? this.itemByBlockId.get(itemId); }
  itemForBlock(blockId: string): PlaceableItemDefinition | undefined {
    return this.itemByBlockId.get(blockId) ?? this.itemById.get(blockId);
  }
  allItems(): readonly PlaceableItemDefinition[] { return this.items; }
  searchPlaceableItems(query: string, source: ContentSourceSelection = ALL_CONTENT_SOURCE): readonly PlaceableItemDefinition[] {
    return placementItemSearch(this.itemsBySource.get(source) ?? this.items, query);
  }
  placeableSourceSummaries(): readonly { readonly id: string; readonly label: string; readonly count: number }[] {
    return [...this.itemsBySource.entries()].map(([id, items]) => ({ id, label: items[0]?.sourceName || items[0]?.modName || id, count: items.length }));
  }

  private replaceItems(items: readonly PlaceableItemDefinition[]): void {
    this.items = items;
    this.itemById.clear(); this.itemByBlockId.clear(); this.itemsBySource.clear();
    const sourceBuckets = new Map<string, PlaceableItemDefinition[]>();
    for (const item of items) {
      this.itemById.set(item.itemId, item);
      for (const blockId of item.concreteBlockIds) this.itemByBlockId.set(blockId, item);
      const source = item.sourceId ?? item.namespace;
      const bucket = sourceBuckets.get(source) ?? [];
      bucket.push(item); sourceBuckets.set(source, bucket);
    }
    for (const [source, bucket] of sourceBuckets) this.itemsBySource.set(source, bucket);
    this.itemsBySource.set(ALL_CONTENT_SOURCE, items);
  }
}
