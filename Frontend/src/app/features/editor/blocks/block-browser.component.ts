import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { PlaceableItemDefinition } from '../../../core/blocks/placement-palette/placeable-item.types';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ContentAssetRuntimeService } from '../../../core/assets/content-asset-runtime.service';
import { QuickBlockBarService } from '../../../core/editor/quick-bar/quick-block-bar.service';
import { DecorationService } from '../../../core/decorations/decoration.service';
import { ALL_CONTENT_SOURCE } from '../../../core/content/source-selection/content-source-selection';
import { LucideCheck, LucidePlus } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import {
  ContentSourceOption,
  ContentSourceSelectorComponent,
} from '../../../shared/ui/content-source-selector/content-source-selector.component';
import { sourceOptions } from '../../../shared/ui/content-source-selector/content-source-filter';
import { ThumbnailVisibilityDirective } from '../../../shared/ui/thumbnail-visibility/thumbnail-visibility.directive';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import type { ThumbnailTaskPriority } from '../../../core/assets/vanilla/thumbnails/thumbnail-task-queue';

const COMPACT_BLOCK_GRID_WIDTH = 240;
export const BLOCK_CATALOG_ROW_HEIGHT = 80;

@Component({
  selector: 'app-block-browser',
  imports: [
    LucideCheck,
    LucidePlus,
    UiTooltipDirective,
    ContentSourceSelectorComponent,
    ThumbnailVisibilityDirective,
    ScrollingModule,
  ],
  templateUrl: './block-browser.component.html',
  styleUrl: './block-browser.component.scss',
})
export class BlockBrowserComponent {
  readonly assetManagerRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(ContentAssetRuntimeService);
  private readonly quick = inject(QuickBlockBarService);
  private readonly decorations = inject(DecorationService);
  protected readonly selectedSource = signal<string>(ALL_CONTENT_SOURCE);
  protected readonly sources = computed<readonly ContentSourceOption[]>(() => {
    const options = this.library.placeableSourceSummaries().map((source) => ({
      id: source.id,
      label: source.id === 'vanilla' ? this.i18n.t('vanillaSource') : source.label,
      count: source.count,
      tooltip: `${source.label} (${source.count})`,
    }));
    const count = this.library.allPlaceableItems().length;
    return sourceOptions(
      options,
      count,
      this.i18n.t('allSources'),
      `${this.i18n.t('allSources')} (${count})`,
    );
  });
  protected readonly activeSource = computed(() =>
    this.sources().some((source) => source.id === this.selectedSource())
      ? this.selectedSource()
      : ALL_CONTENT_SOURCE,
  );
  protected readonly results = computed(() =>
    this.library.searchPlaceableItems(this.library.query(), this.activeSource()),
  );
  protected readonly panelWidth = signal(0);
  protected readonly isCompact = computed(() => this.panelWidth() < COMPACT_BLOCK_GRID_WIDTH);
  protected readonly rowHeight = BLOCK_CATALOG_ROW_HEIGHT;
  private readonly catalogGridHost = viewChild<ElementRef<HTMLElement>>('catalogGridHost');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly catalogViewport = viewChild<CdkVirtualScrollViewport>('catalogViewport');
  private readonly viewportSizing = effect((onCleanup) => {
    const host = this.catalogGridHost()?.nativeElement;
    if (!host) return;
    const update = (): void => {
      const nextWidth = host.clientWidth;
      if (nextWidth === this.panelWidth()) return;
      this.panelWidth.set(nextWidth);
      queueMicrotask(() => this.catalogViewport()?.checkViewportSize());
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  protected search(event: Event): void {
    this.library.setQuery((event.target as HTMLInputElement).value);
  }
  protected clearSearch(): void {
    this.library.setQuery('');
    this.searchInput()?.nativeElement.focus();
  }
  protected openAssetManager(): void {
    this.assetManagerRequested.emit();
  }
  protected retryAssets(): void {
    void this.assets.redownload();
  }
  protected assetsUnavailable(): boolean {
    return !['loading-cache', 'downloading', 'importing', 'ready'].includes(this.assets.status());
  }
  protected requestThumbnail(
    block: PlaceableItemDefinition,
    event: { readonly priority: ThumbnailTaskPriority },
  ): void {
    this.assets.requestItemThumbnail(block, event.priority);
  }
  protected selectSource(id: string): void {
    this.selectedSource.set(id);
  }
  protected select(block: PlaceableItemDefinition): void {
    this.decorations.clearActive();
    this.library.select(block);
    this.assets.requestItemThumbnail(block, 'selected');
  }
  protected isActive(block: PlaceableItemDefinition): boolean {
    const active = this.library.activeBlock.active();
    return (
      !!active &&
      (active.itemId === block.itemId ||
        active.id === block.itemId ||
        active.id === block.displayBlockId)
    );
  }
  protected addToQuickBar(event: Event, block: PlaceableItemDefinition): void {
    event.stopPropagation();
    if (!this.canAddToQuickBar(block)) return;
    this.quick.add({
      id: block.displayBlockId,
      itemId: block.itemId,
      placementKind: block.placementKind,
      state: { ...block.defaultState },
      support: block.support,
      displayName: block.displayName,
    });
  }
  protected canAddToQuickBar(block: PlaceableItemDefinition): boolean {
    const entry = { id: block.displayBlockId, itemId: block.itemId, state: block.defaultState };
    return !this.quick.has(entry) && this.quick.canAdd(entry);
  }
  protected quickAddLabel(block: PlaceableItemDefinition): string {
    const entry = { id: block.displayBlockId, itemId: block.itemId, state: block.defaultState };
    return this.quick.has(entry)
      ? this.i18n.t('alreadyInQuickBar')
      : this.quick.isFull()
        ? this.i18n.t('quickBarFull')
        : this.i18n.t('addToQuickBar');
  }
  protected trackBlock(_index: number, block: PlaceableItemDefinition): string {
    return block.itemId;
  }
}
