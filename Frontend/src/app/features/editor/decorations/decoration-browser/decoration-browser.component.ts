import { Component, computed, inject, output, signal } from '@angular/core';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { DECORATION_BROWSER_SOURCES } from '../../../../core/decorations/decoration.types';
import { PaintingPickerComponent } from '../painting-picker/painting-picker.component';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../../../../shared/ui/content-source-selector/content-source-selector.component';
import { ALL_CONTENT_SOURCE, sourceOptions } from '../../../../shared/ui/content-source-selector/content-source-filter';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import { ItemStackPickerComponent } from '../../../../shared/ui/item-stack-picker/item-stack-picker.component';

@Component({ selector: 'app-decoration-browser', imports: [PaintingPickerComponent, ContentSourceSelectorComponent, ItemStackPickerComponent], templateUrl: './decoration-browser.component.html', styleUrl: './decoration-browser.component.scss' })
export class DecorationBrowserComponent {
  readonly assetManagerRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly itemCatalog = inject(ItemCatalogService);
  protected readonly itemEntries = computed(() => { this.itemCatalog.generation(); return this.itemCatalog.all(); });
  protected readonly selectedSource = signal<string>(ALL_CONTENT_SOURCE);
  protected readonly sources = computed<readonly ContentSourceOption[]>(() => {
    this.assets.generation();
    const active = this.assets.sources.decorationSources();
    const sourceIds = active.length ? active.map((source) => ({ id: source.id, label: source.id === 'vanilla' ? this.i18n.t('vanillaSource') : source.displayName })) : DECORATION_BROWSER_SOURCES.map((source) => ({ id: source.id, label: source.id === 'vanilla' ? this.i18n.t('vanillaSource') : source.id }));
    const counts = new Map<string, number>();
    for (const variant of this.paintingCatalog.placeable()) counts.set(variant.sourceId ?? 'vanilla', (counts.get(variant.sourceId ?? 'vanilla') ?? 0) + 1);
    const hasVanilla = sourceIds.some((source) => source.id === 'vanilla');
    const options = sourceIds.map((source) => ({ ...source, count: (counts.get(source.id) ?? 0) + (source.id === 'vanilla' && hasVanilla ? 2 : 0) }));
    const allCount = this.paintingCatalog.placeable().length + (hasVanilla ? 2 : 0);
    return sourceOptions(options, allCount, this.i18n.t('allSources'), `${this.i18n.t('allSources')} (${allCount})`);
  });
  protected readonly activeSource = computed(() => {
    const current = this.selectedSource();
    const available = this.sources();
    return available.some((source) => source.id === current) ? current : ALL_CONTENT_SOURCE;
  });
  protected readonly visiblePaintingVariants = computed(() => this.paintingCatalog.placeable(this.activeSource()));
  protected readonly showFrames = computed(() => (this.activeSource() === ALL_CONTENT_SOURCE && this.sources().some((source) => source.id === 'vanilla')) || this.activeSource() === 'vanilla');
  protected paintingTexture(): string | undefined { this.assets.generation(); const active = this.decorations.active(); const id = active?.kind === 'painting' ? active.variantId : this.visiblePaintingVariants()[0]?.id; const variant = this.paintingCatalog.get(id); return variant ? this.assets.sources.resources.textureUrl(variant.assetPath) : undefined; }
  protected paintingCaption(): string { const active = this.decorations.active(); const requested = active?.kind === 'painting' ? this.paintingCatalog.get(active.variantId) : undefined; const variant = requested && (this.activeSource() === ALL_CONTENT_SOURCE || (requested.sourceId ?? 'vanilla') === this.activeSource()) ? requested : this.visiblePaintingVariants()[0]; return variant ? `${humanize(variant.id)} · ${variant.width} × ${variant.height}` : ''; }
  protected frameTexture(glow: boolean): string | undefined { this.assets.generation(); return this.assets.provider()?.textureUrl(glow ? 'minecraft:block/glow_item_frame' : 'minecraft:block/item_frame'); }
  protected selectSource(id: string): void { this.selectedSource.set(id === 'minecraft' ? 'vanilla' : id); }
  protected selectPaintingForSource(): void { const first = this.visiblePaintingVariants()[0]; if (first) this.decorations.selectPainting(first.id); }
  protected openAssetManager(): void { this.assetManagerRequested.emit(); }
}

function humanize(id: string): string { return id.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
