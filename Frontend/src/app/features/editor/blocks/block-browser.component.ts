import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { BehaviorSupportLevel, VisualSupportLevel } from '../../../core/blocks/block-definition.types';
import { PlaceableItemDefinition, placementItemSearch } from '../../../core/blocks/placeable-item';
import { BlockLibraryService } from '../../../core/blocks/block-library.service';
import { I18nService } from '../../../core/ui/i18n.service';
import { VanillaAssetsService } from '../../../core/assets/vanilla-assets.service';
import { QuickBlockBarService } from '../../../core/editor/quick-block-bar.service';
import { DecorationService } from '../../../core/decorations/decoration.service';
import { LucidePlus } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../../../shared/ui/content-source-selector/content-source-selector.component';

@Component({ selector: 'app-block-browser', imports: [LucidePlus, UiTooltipDirective, ContentSourceSelectorComponent], templateUrl: './block-browser.component.html', styleUrl: './block-browser.component.scss' })
export class BlockBrowserComponent {
  readonly assetManagerRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly quick = inject(QuickBlockBarService);
  private readonly decorations = inject(DecorationService);
  protected readonly selectedSource = signal('minecraft');
  protected readonly sources = computed<readonly ContentSourceOption[]>(() => {
    const grouped = new Map<string, { readonly label: string; count: number }>();
    for (const item of this.library.allPlaceableItems()) {
      const id = item.namespace;
      const current = grouped.get(id);
      grouped.set(id, { label: id === 'minecraft' ? this.i18n.t('vanillaSource') : item.modName || id, count: (current?.count ?? 0) + 1 });
    }
    return [...grouped.entries()].sort(([left], [right]) => left === 'minecraft' ? -1 : right === 'minecraft' ? 1 : left.localeCompare(right)).map(([id, value]) => ({ id, label: value.label, count: value.count, tooltip: `${value.label} (${value.count})` }));
  });
  protected readonly activeSource = computed(() => this.sources().some((source) => source.id === this.selectedSource()) ? this.selectedSource() : this.sources()[0]?.id);
  protected readonly results = computed(() => placementItemSearch(this.library.allPlaceableItems().filter((item) => item.namespace === this.activeSource()), this.library.query()));
  private readonly thumbnailSync = effect(() => { this.assets.visualProvider(); this.assets.prepareItemThumbnails(this.library.results()); });
  protected search(event: Event): void { this.library.setQuery((event.target as HTMLInputElement).value); }
  protected openAssetManager(): void { this.assetManagerRequested.emit(); }
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
