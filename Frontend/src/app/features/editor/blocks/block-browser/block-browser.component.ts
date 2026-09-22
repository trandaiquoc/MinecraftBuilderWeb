import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { BehaviorSupportLevel, VisualSupportLevel } from '../../../../core/blocks/catalog/block-definition.types';
import { PlaceableItemDefinition, placementItemSearch } from '../../../../core/blocks/placement-palette/placeable-item';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { QuickBlockBarService } from '../../../../core/editor/quick-bar/quick-block-bar.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { LucidePlus } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../../../../shared/ui/content-source-selector/content-source-selector.component';
import { ALL_CONTENT_SOURCE, filterByContentSource, sourceOptions } from '../../../../shared/ui/content-source-selector/content-source-filter';

@Component({ selector: 'app-block-browser', imports: [LucidePlus, UiTooltipDirective, ContentSourceSelectorComponent], templateUrl: './block-browser.component.html', styleUrl: './block-browser.component.scss' })
export class BlockBrowserComponent {
  readonly assetManagerRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly quick = inject(QuickBlockBarService);
  private readonly decorations = inject(DecorationService);
  protected readonly selectedSource = signal<string>(ALL_CONTENT_SOURCE);
  protected readonly sources = computed<readonly ContentSourceOption[]>(() => {
    const grouped = new Map<string, { readonly label: string; count: number }>();
    for (const item of this.library.allPlaceableItems()) {
      const id = item.sourceId ?? item.namespace;
      const current = grouped.get(id);
      grouped.set(id, { label: id === 'vanilla' ? this.i18n.t('vanillaSource') : item.sourceName || item.modName || id, count: (current?.count ?? 0) + 1 });
    }
    const options = [...grouped.entries()].map(([id, value]) => ({ id, label: value.label, count: value.count, tooltip: `${value.label} (${value.count})` }));
    const count = new Set(this.library.allPlaceableItems().map((item) => item.itemId)).size;
    return sourceOptions(options, count, this.i18n.t('allSources'), `${this.i18n.t('allSources')} (${count})`);
  });
  protected readonly activeSource = computed(() => this.sources().some((source) => source.id === this.selectedSource()) ? this.selectedSource() : ALL_CONTENT_SOURCE);
  protected readonly results = computed(() => placementItemSearch(filterByContentSource(this.library.allPlaceableItems(), this.activeSource()), this.library.query()));
  private readonly thumbnailSync = effect(() => { this.assets.visualProvider(); this.assets.prepareItemThumbnails(this.results()); });
  protected search(event: Event): void { this.library.setQuery((event.target as HTMLInputElement).value); }
  protected openAssetManager(): void { this.assetManagerRequested.emit(); }
  protected retryAssets(): void { void this.assets.redownload(); }
  protected assetLoading(): boolean { return ['loading-cache', 'downloading', 'importing'].includes(this.assets.status()) || this.assets.contentRestore().phase === 'restoring-mods'; }
  protected assetStatusText(): string {
    const status = this.assets.status();
    if (status === 'loading-cache') return this.i18n.t('checkingAssetCache');
    if (status === 'downloading') return this.i18n.t('downloadingAsset');
    if (status === 'importing') return this.i18n.t('preparingAssets');
    if (this.assets.contentRestore().phase === 'restoring-mods') { const progress = this.assets.contentRestore(); const label = this.i18n.t('restoringModsProgress').replace('{current}', String(progress.current)).replace('{total}', String(progress.total)); return progress.sourceName ? `${label} · ${progress.sourceName}` : label; }
    if (this.assets.contentRestore().phase === 'partial') return this.i18n.t('assetsReadyWithWarnings');
    return this.i18n.t('assetsReady');
  }
  protected progressPercent(): number | undefined {
    const progress = this.assets.downloadProgress();
    return progress?.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : undefined;
  }
  protected formatBytes(value: number): string {
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
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
  protected behaviorLabel(support: BehaviorSupportLevel): string { return this.i18n.behaviorSupport(support); }
  protected visualLabel(support: VisualSupportLevel): string { return this.i18n.visualSupport(support); }
}
