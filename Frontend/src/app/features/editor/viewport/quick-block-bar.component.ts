import { Component, computed, effect, inject } from '@angular/core';
import { QuickBlockBarService } from '../../../core/editor/quick-block-bar.service';
import { I18nService } from '../../../core/ui/i18n.service';
import { BlockLibraryService } from '../../../core/blocks/block-library.service';
import { VanillaAssetsService } from '../../../core/assets/vanilla-assets.service';
import { LucideChevronDown, LucideChevronUp, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';

@Component({ selector: 'app-quick-block-bar', imports: [LucideChevronDown, LucideChevronUp, LucideX, UiTooltipDirective], templateUrl: './quick-block-bar.component.html', styleUrl: './quick-block-bar.component.scss' })
export class QuickBlockBarComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly quick = inject(QuickBlockBarService);
  private readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly thumbnailSync = effect(() => { this.assets.generation(); for (const entry of this.quick.entries()) { const item = this.library.getItem(entry.itemId); if (item) this.assets.prepareItemThumbnail({ ...item, defaultState: entry.state }); else this.assets.prepareThumbnail(entry.itemId, entry.state); } });
  protected readonly entries = computed(() => { const active = this.quick.active(); return this.quick.entries().map((entry) => { const state = stateKey(entry.state); return { ...entry, key: `${entry.itemId}|${state}`, thumbnail: this.assets.thumbnailUrl(entry.itemId, entry.state), active: active?.itemId === entry.itemId && state === stateKey(active.state) }; }); });
}

function stateKey(state: Readonly<Record<string, string>>): string { return Object.entries(state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(','); }
