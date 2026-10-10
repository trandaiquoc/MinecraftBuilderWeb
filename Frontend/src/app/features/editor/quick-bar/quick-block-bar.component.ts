import { Component, computed, effect, inject } from '@angular/core';
import {
  QuickBlockBarService,
  quickEntryMatchesActive,
  quickStateKey,
} from '../../../core/editor/quick-bar/quick-block-bar.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { ContentAssetRuntimeService } from '../../../core/assets/content-asset-runtime.service';
import { LucideChevronDown, LucideChevronUp, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';

@Component({
  selector: 'app-quick-block-bar',
  imports: [LucideChevronDown, LucideChevronUp, LucideX, UiTooltipDirective],
  templateUrl: './quick-block-bar.component.html',
  styleUrl: './quick-block-bar.component.scss',
})
export class QuickBlockBarComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly quick = inject(QuickBlockBarService);
  private readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(ContentAssetRuntimeService);
  private readonly thumbnailSync = effect(() => {
    this.assets.generation();
    for (const entry of this.quick.entries()) {
      const item = this.library.getItem(entry.itemId) ?? this.library.itemForBlock(entry.id);
      if (item)
        this.assets.prepareItemThumbnail({
          ...item,
          defaultState: entry.state,
          previewState: entry.state,
        });
      else this.assets.prepareThumbnail(entry.itemId, entry.state);
    }
  });
  protected readonly entries = computed(() => {
    const active = this.quick.active();
    const items = this.library.allItems();
    return this.quick.entries().map((entry) => {
      const state = quickStateKey(entry.state);
      return {
        ...entry,
        key: `${entry.itemId}|${state}`,
        thumbnail: this.assets.thumbnailUrl(entry.itemId, entry.state),
        active: quickEntryMatchesActive(entry, active, !!this.library.getItem(entry.itemId), items),
      };
    });
  });
}
