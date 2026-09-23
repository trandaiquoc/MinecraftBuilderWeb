import { Component, computed, effect, ElementRef, inject, output, signal, viewChild } from '@angular/core';
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
import type { ThumbnailTaskPriority } from '../../../../core/assets/vanilla/thumbnail-task-queue';

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
  protected readonly columnCount = signal(1);
  protected readonly rows = computed<readonly (readonly PlaceableItemDefinition[])[]>(() => {
    const columns = this.columnCount();
    const items = this.results();
    const grouped: PlaceableItemDefinition[][] = [];
    for (let index = 0; index < items.length; index += columns) grouped.push(items.slice(index, index + columns) as PlaceableItemDefinition[]);
    return grouped;
  });
  protected readonly activePreviewItem = computed(() => {
    const active = this.library.activeBlock.active();
    const item = active ? this.library.getItem(active.itemId || active.id) : undefined;
    return active && item ? { ...item, defaultState: { ...active.state }, previewState: { ...active.state } } : undefined;
  });
  private readonly catalogViewport = viewChild<ElementRef<HTMLElement>>('catalogViewport');
  private readonly thumbnailScope = effect(() => { this.assets.visualProvider(); this.results(); this.assets.invalidateQueuedThumbnails(); });
  private readonly viewportSizing = effect((onCleanup) => {
    const viewport = this.catalogViewport()?.nativeElement;
    if (!viewport) return;
    const update = (): void => {
      const width = viewport.clientWidth;
      const next = Math.max(1, Math.floor((width + 7) / 120));
      if (next !== this.columnCount()) this.columnCount.set(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    onCleanup(() => observer.disconnect());
  });
  private readonly activePreviewScope = effect(() => {
    const active = this.activePreviewItem();
    if (active) this.assets.requestItemThumbnail(active, 'selected');
  });
  protected search(event: Event): void { this.library.setQuery((event.target as HTMLInputElement).value); }
  protected openAssetManager(): void { this.assetManagerRequested.emit(); }
  protected retryAssets(): void { void this.assets.redownload(); }
  protected assetsUnavailable(): boolean { return !['loading-cache', 'downloading', 'importing', 'ready'].includes(this.assets.status()); }
  protected requestThumbnail(block: PlaceableItemDefinition, event: { readonly priority: ThumbnailTaskPriority }): void { this.assets.requestItemThumbnail(block, event.priority); }
  protected selectSource(id: string): void { this.selectedSource.set(id); }
  protected select(block: PlaceableItemDefinition): void { this.decorations.clearActive(); this.library.select(block); this.assets.requestItemThumbnail(block, 'selected'); }
  protected isActive(block: PlaceableItemDefinition): boolean {
    const active = this.library.activeBlock.active();
    return !!active && (active.itemId === block.itemId || active.id === block.itemId || active.id === block.displayBlockId);
  }
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
  protected trackRow(index: number, row: readonly PlaceableItemDefinition[]): string { return row[0]?.itemId ?? `row-${index}`; }
  protected behaviorLabel(support: BehaviorSupportLevel): string { return this.i18n.behaviorSupport(support); }
  protected visualLabel(support: VisualSupportLevel): string { return this.i18n.visualSupport(support); }
}
