import { Component, inject } from '@angular/core';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import { humanizeItemId } from '../../../../core/items/catalog/item-catalog';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import { ItemStackPickerComponent } from '../../../../shared/ui/item-stack-picker/item-stack-picker.component';
import { PaintingPickerComponent } from '../../decorations/painting-picker/painting-picker.component';

@Component({ selector: 'app-decoration-inspector', imports: [ItemStackPickerComponent, PaintingPickerComponent], templateUrl: './decoration-inspector.component.html', styleUrl: './decoration-inspector.component.scss' })
export class DecorationInspectorComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  protected readonly catalog = inject(ItemCatalogService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  protected paintingTexture(id: string | undefined): string | undefined { this.assets.generation(); const variant = this.paintingCatalog.get(id); return variant ? this.assets.sources.resources.textureUrl(variant.assetPath) : undefined; }
  protected paintingLabel(id: string | undefined): string { return id ? humanizeItemId(id) : ''; }
  protected facingLabel(value: string): string { return this.i18n.stateValue(value); }
  protected paintingSize(id: string | undefined): string { const variant = this.paintingCatalog.get(id); return variant ? `${variant.width} x ${variant.height}` : ''; }
  protected selectItem(stack: ItemStackData | undefined): void { const selected = this.decorations.selected(); if (selected) this.decorations.setFrameItem(selected.instanceId, stack); }
  protected selectVariant(id: string): void { const selected = this.decorations.selected(); if (selected) this.decorations.setPaintingVariant(selected.instanceId, id); }
  protected rotate(delta: number): void { const selected = this.decorations.selected(); if (!selected) return; this.decorations.setFrameRotation(selected.instanceId, (selected.rotation ?? 0) + delta); }
  protected toggle(field: 'invisible' | 'fixed', event: Event): void { const selected = this.decorations.selected(); if (!selected) return; const value = (event.target as HTMLInputElement).checked; if (field === 'invisible') this.decorations.setFrameInvisible(selected.instanceId, value); else this.decorations.setFrameFixed(selected.instanceId, value); }
  protected setDropChance(event: Event): void { const selected = this.decorations.selected(); if (selected) this.decorations.setFrameItemDropChance(selected.instanceId, Number((event.target as HTMLInputElement).value) / 100); }
  protected delete(): void { const selected = this.decorations.selected(); if (selected) this.decorations.delete(selected.instanceId); }
}
