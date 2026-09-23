import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { BehaviorSupportLevel, VisualSupportLevel } from '../../../../core/blocks/catalog/block-definition.types';
import { PlaceableItemDefinition } from '../../../../core/blocks/placement-palette/placeable-item';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { QuickBlockBarService } from '../../../../core/editor/quick-bar/quick-block-bar.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { LucidePlus } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../../../../shared/ui/content-source-selector/content-source-selector.component';
import { ALL_CONTENT_SOURCE, sourceOptions } from '../../../../shared/ui/content-source-selector/content-source-filter';
import { ThumbnailVisibilityDirective } from '../../../../shared/ui/thumbnail-visibility/thumbnail-visibility.directive';
import { ScrollingModule } from '@angular/cdk/scrolling';

@Component({ selector: 'app-block-browser', imports: [LucidePlus, UiTooltipDirective, ContentSourceSelectorComponent, ThumbnailVisibilityDirective, ScrollingModule], templateUrl: './block-browser.component.html', styleUrl: './block-browser.component.scss' })
export class BlockBrowserComponent {
  readonly assetManagerRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly quick = inject(QuickBlockBarService);
  private readonly decorations = inject(DecorationService);
  protected readonly selectedSource = signal<string>(ALL_CONTENT_SOURCE);
  protected readonly sources = computed<readonly ContentSourceOption[]>(() => {
    const options = this.library.placeableSourceSummaries().map((source) => ({ id: source.id, label: source.id === 'vanilla' ? this.i18n.t('vanillaSource') : source.label, count: source.count, tooltip: `${source.label} (${source.count})` }));
    const count = this.library.allPlaceableItems().length;
    return sourceOptions(options, count, this.i18n.t('allSources'), `${this.i18n.t('allSources')} (${count})`);
  });
  protected readonly activeSource = computed(() => this.sources().some((source) => source.id === this.selectedSource()) ? this.selectedSource() : ALL_CONTENT_SOURCE);
  protected readonly results = computed(() => this.library.searchPlaceableItems(this.library.query(), this.activeSource()));
  private readonly thumbnailScope = effect(() => { this.assets.visualProvider(); this.results(); this.assets.invalidateQueuedThumbnails(); });
  protected search(event: Event): void { this.library.setQuery((event.target as HTMLInputElement).value); }
  protected openAssetManager(): void { this.assetManagerRequested.emit(); }
  protected retryAssets(): void { void this.assets.redownload(); }
  protected assetsUnavailable(): boolean { return !['loading-cache', 'downloading', 'importing', 'ready'].includes(this.assets.status()); }
  protected requestThumbnail(block: PlaceableItemDefinition, event: { readonly priority: 'visible' | 'prefetch' }): void { this.assets.requestItemThumbnail(block, event.priority); }
  protected selectSource(id: string): void { this.selectedSource.set(id); }
  protected select(block: PlaceableItemDefinition): void { this.decorations.clearActive(); this.library.select(block); }
  protected addToQuickBar(event: Event, block: PlaceableItemDefinition): void {
    event.stopPropagation();
    if (!this.canAddToQuickBar(block)) return;
    this.quick.add({ id: block.displayBlockId, itemId: block.itemId, placementKind: block.placementKind, state: { ...block.defaultState }, support: block.support, displayName: block.displayName });
  }
  protected canAddToQuickBar(block: PlaceableItemDefinition): boolean { const entry = { id: block.displayBlockId, itemId: block.itemId, state: block.defaultState }; return !this.quick.has(entry) && this.quick.canAdd(entry); }
  protected quickAddLabel(block: PlaceableItemDefinition): string {
    const entry = { id: block.displayBlockId, itemId: block.itemId, state: block.defaultState };
    return this.quick.has(entry) ? this.i18n.t('alreadyInQuickBar') : this.quick.isFull() ? this.i18n.t('quickBarFull') : this.i18n.t('addToQuickBar');
  }
  protected trackBlock(_index: number, block: PlaceableItemDefinition): string { return block.itemId; }
  protected behaviorLabel(support: BehaviorSupportLevel): string { return this.i18n.behaviorSupport(support); }
  protected visualLabel(support: VisualSupportLevel): string { return this.i18n.visualSupport(support); }
}
