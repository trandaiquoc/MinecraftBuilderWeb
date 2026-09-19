import { Injectable, effect, inject, signal } from '@angular/core';
import { VanillaAssetsService } from '../assets/vanilla-assets.service';
import { ItemCatalog, DecorationItemDefinition } from './item-catalog';

@Injectable({ providedIn: 'root' })
export class DecorationItemCatalogService {
  private readonly assets = inject(VanillaAssetsService);
  private readonly catalog = new ItemCatalog();
  readonly generation = signal(0);
  constructor() { effect(() => { const provider = this.assets.provider(); if (!provider) return; this.catalog.load(provider); this.generation.update((value) => value + 1); }); }
  search(query: string): readonly DecorationItemDefinition[] { this.generation(); return this.catalog.search(query); }
}
