import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecorationService } from '../../core/decorations/decoration.service';
import { PAINTING_VARIANTS } from '../../core/decorations/decoration.types';
import { I18nService } from '../../core/ui/i18n.service';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { ItemCatalog } from '../../core/decorations/item-catalog';

@Component({ selector: 'app-decoration-browser', templateUrl: './decoration-browser.component.html', styleUrl: './decoration-browser.component.scss' })
export class DecorationBrowserComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  protected readonly variants = PAINTING_VARIANTS.filter((entry) => entry.placeable !== false);
  protected readonly paintingSearch = signal('');
  protected readonly itemSearch = signal('');
  private readonly assets = inject(VanillaAssetsService);
  private readonly itemCatalog = new ItemCatalog();
  protected readonly items = computed(() => this.itemCatalog.search(this.itemSearch()));
  constructor() { effect(() => { const provider = this.assets.provider(); if (provider) this.itemCatalog.load(provider); }); }
  protected search(event: Event): void { this.paintingSearch.set((event.target as HTMLInputElement).value); }
  protected searchItems(event: Event): void { this.itemSearch.set((event.target as HTMLInputElement).value); }
  protected selectItem(id: string): void { this.decorations.selectItem({ id, count: 1 }); }
  protected filteredVariants(): typeof this.variants { const query = this.paintingSearch().trim().toLowerCase(); return query ? this.variants.filter((entry) => entry.id.includes(query)) : this.variants; }
}
