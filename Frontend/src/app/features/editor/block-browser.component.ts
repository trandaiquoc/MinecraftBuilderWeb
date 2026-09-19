import { Component, effect, inject } from '@angular/core';
import { BehaviorSupportLevel, VisualSupportLevel } from '../../core/blocks/block-definition.types';
import { PlaceableItemDefinition } from '../../core/blocks/placeable-item';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { I18nService } from '../../core/ui/i18n.service';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { QuickBlockBarService } from '../../core/editor/quick-block-bar.service';
import { DecorationService } from '../../core/decorations/decoration.service';
import { DialogService } from '../../core/ui/dialog.service';
import { LucidePlus } from '@lucide/angular';
import { UiTooltipDirective } from '../../shared/ui-tooltip.directive';

@Component({ selector: 'app-block-browser', imports: [LucidePlus, UiTooltipDirective], templateUrl: './block-browser.component.html', styleUrl: './block-browser.component.scss' })
export class BlockBrowserComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly quick = inject(QuickBlockBarService);
  private readonly decorations = inject(DecorationService);
  private readonly dialogs = inject(DialogService);
  private readonly thumbnailSync = effect(() => { this.assets.visualProvider(); this.assets.prepareItemThumbnails(this.library.results()); });
  protected search(event: Event): void { this.library.setQuery((event.target as HTMLInputElement).value); }
  protected async importAssets(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.assets.importJar(file);
    if (this.assets.status() === 'import-required' || this.assets.status() === 'cache-error') await this.dialogs.error(this.i18n.t('assetImportErrorTitle'), this.i18n.t('assetImportErrorText'));
  }
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
