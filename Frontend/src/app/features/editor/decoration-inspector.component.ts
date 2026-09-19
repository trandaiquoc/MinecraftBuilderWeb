import { Component, computed, inject } from '@angular/core';
import { DecorationItemCatalogService } from '../../core/decorations/decoration-item-catalog.service';
import { DecorationService } from '../../core/decorations/decoration.service';
import { I18nService } from '../../core/ui/i18n.service';
import { PAINTING_VARIANTS } from '../../core/decorations/decoration.types';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { SearchableDropdownComponent, SearchableDropdownOption } from './searchable-dropdown.component';
import { PaintingPickerComponent } from './painting-picker.component';

@Component({ selector: 'app-decoration-inspector', imports: [SearchableDropdownComponent, PaintingPickerComponent], templateUrl: './decoration-inspector.component.html', styleUrl: './decoration-inspector.component.scss' })
export class DecorationInspectorComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  private readonly catalog = inject(DecorationItemCatalogService);
  private readonly assets = inject(VanillaAssetsService);
  protected readonly itemOptions = computed<readonly SearchableDropdownOption[]>(() => {
    const options = this.catalog.all().map((entry) => ({ id: entry.id, label: entry.displayName, secondary: entry.id }));
    const selected = this.decorations.selected()?.item;
    if (selected && !options.some((entry) => entry.id === selected.id)) options.unshift({ id: selected.id, label: humanize(selected.id), secondary: selected.id });
    return options;
  });
  protected paintingTexture(id: string | undefined): string | undefined { this.assets.generation(); return id ? this.assets.provider()?.textureUrl(`minecraft:painting/${id}`) : undefined; }
  protected paintingLabel(id: string | undefined): string { return id ? humanize(id) : ''; }
  protected paintingSize(id: string | undefined): string { const variant = PAINTING_VARIANTS.find((entry) => entry.id === id); return variant ? `${variant.width} × ${variant.height}` : ''; }
  protected selectItem(id: string): void { const selected = this.decorations.selected(); if (selected) this.decorations.setFrameItem(selected.instanceId, id ? { id, count: 1 } : undefined); }
  protected selectVariant(id: string): void { const selected = this.decorations.selected(); if (selected) this.decorations.setPaintingVariant(selected.instanceId, id); }
  protected rotate(delta: number): void { const selected = this.decorations.selected(); if (!selected) return; this.decorations.setFrameRotation(selected.instanceId, (selected.rotation ?? 0) + delta); }
  protected toggle(field: 'invisible' | 'fixed', event: Event): void { const selected = this.decorations.selected(); if (!selected) return; const value = (event.target as HTMLInputElement).checked; if (field === 'invisible') this.decorations.setFrameInvisible(selected.instanceId, value); else this.decorations.setFrameFixed(selected.instanceId, value); }
  protected setDropChance(event: Event): void { const selected = this.decorations.selected(); if (selected) this.decorations.setFrameItemDropChance(selected.instanceId, Number((event.target as HTMLInputElement).value) / 100); }
  protected delete(): void { const selected = this.decorations.selected(); if (selected) this.decorations.delete(selected.instanceId); }
}

function humanize(id: string): string { return id.split(':').at(-1)!.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
