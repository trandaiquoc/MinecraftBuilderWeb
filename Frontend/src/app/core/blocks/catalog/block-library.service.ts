import { Injectable, computed, signal } from '@angular/core';
import { ActiveBlockService } from '../placement-palette/active-block.service';
import { BlockCatalog } from './block-catalog';
import type { BlockDefinition, NormalizedBlockDefinition } from './block-definition.types';
import { representativeBlockFixture } from './block-catalog.fixture';
import { buildPlaceableItems, canonicalPlaceableItemId, PlaceableItemDefinition, placementItemSearch } from '../placement-palette/placeable-item';
import { DecorationService } from '../../decorations/decoration.service';
import type { BlockCatalogSource } from './block-catalog';

@Injectable({ providedIn: 'root' })
export class BlockLibraryService {
  private catalog = new BlockCatalog();
  private items: readonly PlaceableItemDefinition[] = [];
  private readonly revision = signal(0);
  readonly query = signal('');
  readonly results = computed<readonly PlaceableItemDefinition[]>(() => { this.revision(); return placementItemSearch(this.items, this.query()); });
  readonly allPlaceableItems = computed<readonly PlaceableItemDefinition[]>(() => { this.revision(); return this.items; });
  readonly rawResults = computed<readonly BlockDefinition[]>(() => { this.revision(); return this.catalog.search(this.query()); });

  constructor(readonly activeBlock: ActiveBlockService, private readonly decorations?: DecorationService) {
    this.catalog.load(representativeBlockFixture);
    this.items = buildPlaceableItems(this.catalog.all(), this.catalog.targetItems(), this.catalog.hasTargetItemEvidence());
  }

  setQuery(query: string): void { this.query.set(query); }
  load(source: BlockCatalogSource): void { this.replaceSource(source); }
  replaceSource(source: BlockCatalogSource): void { const activeId = this.activeBlock.active()?.id; const activeSource = activeId ? this.catalog.get(activeId)?.sourceId : undefined; this.catalog.replaceSource(source); this.items = buildPlaceableItems(this.catalog.all(), this.catalog.targetItems(), this.catalog.hasTargetItemEvidence()); if (activeId && activeSource === (source.sourceId ?? source.blocks[0]?.sourceId ?? 'vanilla') && !this.catalog.get(activeId)) this.activeBlock.clear(); this.revision.update((value) => value + 1); }
  removeSource(sourceId: string): void { const activeId = this.activeBlock.active()?.id; const activeSource = activeId ? this.catalog.get(activeId)?.sourceId : undefined; this.catalog.removeSource(sourceId); this.items = buildPlaceableItems(this.catalog.all(), this.catalog.targetItems(), this.catalog.hasTargetItemEvidence()); if (activeSource === sourceId) this.activeBlock.clear(); this.revision.update((value) => value + 1); }
  sourceIds(): readonly string[] { return this.catalog.sources(); }
  catalogConflicts(): readonly { readonly id: string; readonly sourceIds: readonly string[] }[] { return this.catalog.conflicts(); }
  select(item: PlaceableItemDefinition): void { this.decorations?.clearActive(); this.activeBlock.select(item); }
  get(id: string): NormalizedBlockDefinition | undefined { return this.catalog.get(id); }
  getItem(itemId: string): PlaceableItemDefinition | undefined { return this.items.find((item) => item.itemId === itemId || item.concreteBlockIds.includes(itemId)); }
  itemForBlock(blockId: string): PlaceableItemDefinition | undefined {
    return this.items.find((item) => item.concreteBlockIds.includes(blockId)) ?? this.getItem(canonicalPlaceableItemId(blockId, this.items));
  }
  allItems(): readonly PlaceableItemDefinition[] { return this.items; }
}
