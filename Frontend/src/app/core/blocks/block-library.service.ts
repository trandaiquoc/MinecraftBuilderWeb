import { Injectable, computed, signal } from '@angular/core';
import { ActiveBlockService } from './active-block.service';
import { BlockCatalog } from './block-catalog';
import { BlockDefinition } from './block-definition.types';
import { representativeBlockFixture } from './block-catalog.fixture';
import { buildPlaceableItems, canonicalPlaceableItemId, PlaceableItemDefinition, placementItemSearch } from './placeable-item';

@Injectable({ providedIn: 'root' })
export class BlockLibraryService {
  private catalog = new BlockCatalog();
  private items: readonly PlaceableItemDefinition[] = [];
  private readonly revision = signal(0);
  readonly query = signal('');
  readonly results = computed<readonly PlaceableItemDefinition[]>(() => { this.revision(); return placementItemSearch(this.items, this.query()); });
  readonly rawResults = computed<readonly BlockDefinition[]>(() => { this.revision(); return this.catalog.search(this.query()); });

  constructor(readonly activeBlock: ActiveBlockService) {
    this.catalog.load(representativeBlockFixture);
    this.items = buildPlaceableItems(this.catalog.all());
  }

  setQuery(query: string): void { this.query.set(query); }
  load(source: import('./block-catalog').BlockCatalogSource): void { const catalog = new BlockCatalog(); catalog.load(source); this.catalog = catalog; this.items = buildPlaceableItems(catalog.all()); this.revision.update((value) => value + 1); }
  select(item: PlaceableItemDefinition): void { this.activeBlock.select(item); }
  get(id: string): BlockDefinition | undefined { return this.catalog.get(id); }
  getItem(itemId: string): PlaceableItemDefinition | undefined { return this.items.find((item) => item.itemId === itemId); }
  itemForBlock(blockId: string): PlaceableItemDefinition | undefined { const itemId = canonicalPlaceableItemId(blockId); return this.getItem(itemId); }
  allItems(): readonly PlaceableItemDefinition[] { return this.items; }
}
