import { Component, computed, inject, signal } from '@angular/core';
import { DecorationItemCatalogService } from '../../core/decorations/decoration-item-catalog.service';
import { DecorationService } from '../../core/decorations/decoration.service';
import { I18nService } from '../../core/ui/i18n.service';
import { PAINTING_VARIANTS } from '../../core/decorations/decoration.types';

@Component({ selector: 'app-decoration-inspector', templateUrl: './decoration-inspector.component.html', styleUrl: './decoration-inspector.component.scss' })
export class DecorationInspectorComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  private readonly catalog = inject(DecorationItemCatalogService);
  protected readonly itemQuery = signal('');
  protected readonly variantQuery = signal('');
  protected readonly items = computed(() => this.catalog.search(this.itemQuery()));
  protected readonly variants = computed(() => { const query = this.variantQuery().trim().toLowerCase(); return PAINTING_VARIANTS.filter((entry) => entry.placeable !== false && (!query || entry.id.includes(query))); });
  protected searchItems(event: Event): void { this.itemQuery.set((event.target as HTMLInputElement).value); }
  protected selectItem(id: string): void { const selected = this.decorations.selected(); if (selected) this.decorations.setFrameItem(selected.instanceId, id ? { id, count: 1 } : undefined); }
  protected searchVariants(event: Event): void { this.variantQuery.set((event.target as HTMLInputElement).value); }
  protected selectVariant(id: string): void { const selected = this.decorations.selected(); if (selected) this.decorations.setPaintingVariant(selected.instanceId, id); }
  protected rotate(delta: number): void { const selected = this.decorations.selected(); if (!selected) return; this.decorations.setFrameRotation(selected.instanceId, (selected.rotation ?? 0) + delta); }
  protected toggle(field: 'invisible' | 'fixed', event: Event): void { const selected = this.decorations.selected(); if (!selected) return; const value = (event.target as HTMLInputElement).checked; if (field === 'invisible') this.decorations.setFrameInvisible(selected.instanceId, value); else this.decorations.setFrameFixed(selected.instanceId, value); }
  protected setDropChance(event: Event): void { const selected = this.decorations.selected(); if (selected) this.decorations.setFrameItemDropChance(selected.instanceId, Number((event.target as HTMLInputElement).value)); }
  protected delete(): void { const selected = this.decorations.selected(); if (selected) this.decorations.delete(selected.instanceId); }
}
