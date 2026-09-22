import { Injectable, inject } from '@angular/core';
import { ItemCatalogService } from '../../items/catalog/item-catalog.service';
import type { ItemCatalogEntry } from '../../items/catalog/item-catalog';

/** @deprecated Compatibility facade. New consumers should inject ItemCatalogService. */
@Injectable({ providedIn: 'root' })
export class DecorationItemCatalogService {
  private readonly items = inject(ItemCatalogService);
  readonly generation = this.items.generation;
  all(): readonly ItemCatalogEntry[] { return this.items.all(); }
  search(query: string): readonly ItemCatalogEntry[] { return this.items.search(query); }
}
