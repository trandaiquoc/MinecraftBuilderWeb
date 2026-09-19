import { Component, effect, inject, output, signal } from '@angular/core';
import { BehaviorSupportLevel, VisualSupportLevel } from '../../core/blocks/block-definition.types';
import { PlaceableItemDefinition } from '../../core/blocks/placeable-item';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { I18nService } from '../../core/ui/i18n.service';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { QuickBlockBarService } from '../../core/editor/quick-block-bar.service';
import { DecorationService } from '../../core/decorations/decoration.service';

@Component({ selector: 'app-block-browser', templateUrl: './block-browser.component.html', styleUrl: './block-browser.component.scss' })
export class BlockBrowserComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly quick = inject(QuickBlockBarService);
  private readonly decorations = inject(DecorationService);
  private readonly thumbnailSync = effect(() => { this.assets.visualProvider(); this.assets.prepareItemThumbnails(this.library.results()); });
  protected readonly expanded = signal(false);
  readonly expandedChange = output<boolean>();
  protected search(event: Event): void { this.library.setQuery((event.target as HTMLInputElement).value); }
  protected importAssets(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) void this.assets.importJar(file); }
  protected select(block: PlaceableItemDefinition): void { this.decorations.clearActive(); this.library.select(block); }
  protected pinActive(): void { const active = this.library.activeBlock.active(); const definition = active && this.library.getItem(active.itemId ?? active.id); if (active && definition) this.quick.add({ ...active, itemId: definition.itemId, id: definition.displayBlockId, displayName: definition.displayName }); }
  protected toggleExpanded(): void { this.expanded.update((value) => !value); this.expandedChange.emit(this.expanded()); }
  protected behaviorLabel(support: BehaviorSupportLevel): string { return this.i18n.behaviorSupport(support); }
  protected visualLabel(support: VisualSupportLevel): string { return this.i18n.visualSupport(support); }
}
