import { Component, computed, inject, input, Output, EventEmitter, signal } from '@angular/core';
import { PaintingVariant } from '../../../../core/decorations/decoration.types';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';

@Component({
  selector: 'app-painting-picker',
  templateUrl: './painting-picker.component.html',
  styleUrl: './painting-picker.component.scss',
})
export class PaintingPickerComponent {
  readonly selectedId = input('');
  readonly compact = input(false);
  readonly sourceId = input('__minecraftbuilder_all__');
  @Output() readonly selectionChange = new EventEmitter<string>();
  protected readonly i18n = inject(I18nService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly catalog = inject(PaintingVariantCatalogService);
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected variants(): readonly PaintingVariant[] { return this.catalog.placeable(this.sourceId()); }
  protected readonly filteredVariants = computed(() => {
    const query = normalize(this.query());
    const variants = this.variants();
    return query ? variants.filter((entry) => normalize(`${humanize(entry.id)} ${entry.id} ${entry.sourceName ?? entry.sourceId ?? ''} ${entry.width}x${entry.height}`).includes(query)) : variants;
  });
  protected selectedVariant(): PaintingVariant | undefined {
    const selected = this.catalog.get(this.selectedId());
    return selected && (this.sourceId() === '__minecraftbuilder_all__' || (selected.sourceId ?? 'vanilla') === this.sourceId()) ? selected : undefined;
  }
  protected imageSize(variant: PaintingVariant, stage: 'card' | 'selected'): { readonly width: number; readonly height: number } {
    const sourceWidth = variant.width * 16;
    const sourceHeight = variant.height * 16;
    const [stageWidth, stageHeight, maxScale] = stage === 'selected' ? [160, 160, 8] : [112, 72, 4];
    const scale = Math.max(1, Math.min(maxScale, Math.floor(Math.min(stageWidth / sourceWidth, stageHeight / sourceHeight))));
    return { width: sourceWidth * scale, height: sourceHeight * scale };
  }
  protected label(id: string): string { return humanize(id); }
  protected imageUrl(variant: PaintingVariant): string | undefined { this.assets.generation(); return this.assets.sources.resources.textureUrl(variant.assetPath); }
  protected choose(id: string): void { this.selectionChange.emit(id); if (this.compact()) this.open.set(false); }
  protected toggle(): void { this.open.update((value) => !value); }
  protected updateQuery(event: Event): void { this.query.set((event.target as HTMLInputElement).value); }
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
function humanize(value: string): string { return value.split(':').at(-1)!.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
