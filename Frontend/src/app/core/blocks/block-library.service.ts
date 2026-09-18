import { Injectable, computed, signal } from '@angular/core';
import { ActiveBlockService } from './active-block.service';
import { BlockCatalog } from './block-catalog';
import { BlockDefinition } from './block-definition.types';
import { representativeBlockFixture } from './block-catalog.fixture';

@Injectable({ providedIn: 'root' })
export class BlockLibraryService {
  private catalog = new BlockCatalog();
  private readonly revision = signal(0);
  readonly query = signal('');
  readonly results = computed<readonly BlockDefinition[]>(() => { this.revision(); return this.catalog.search(this.query()); });

  constructor(readonly activeBlock: ActiveBlockService) {
    this.catalog.load(representativeBlockFixture);
  }

  setQuery(query: string): void { this.query.set(query); }
  load(source: import('./block-catalog').BlockCatalogSource): void { const catalog = new BlockCatalog(); catalog.load(source); this.catalog = catalog; this.revision.update((value) => value + 1); }
  select(block: BlockDefinition): void { this.activeBlock.select(block); }
  get(id: string): BlockDefinition | undefined { return this.catalog.get(id); }
}
