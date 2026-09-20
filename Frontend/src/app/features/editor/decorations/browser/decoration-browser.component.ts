import { Component, computed, inject, output, signal } from '@angular/core';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { I18nService } from '../../../../core/ui/i18n.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla-assets.service';
import { DECORATION_BROWSER_SOURCES, PAINTING_VARIANTS } from '../../../../core/decorations/decoration.types';
import { PaintingPickerComponent } from '../painting-picker/painting-picker.component';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../../../../shared/ui/content-source-selector/content-source-selector.component';

@Component({ selector: 'app-decoration-browser', imports: [PaintingPickerComponent, ContentSourceSelectorComponent], templateUrl: './decoration-browser.component.html', styleUrl: './decoration-browser.component.scss' })
export class DecorationBrowserComponent {
  readonly assetManagerRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  private readonly assets = inject(VanillaAssetsService);
  protected readonly selectedSource = signal('minecraft');
  protected readonly sources = computed<readonly ContentSourceOption[]>(() => DECORATION_BROWSER_SOURCES.map((source) => ({ id: source.id, label: source.id === 'minecraft' ? this.i18n.t('vanillaSource') : source.id })));
  protected paintingTexture(): string | undefined { this.assets.generation(); const active = this.decorations.active(); const variant = active?.kind === 'painting' ? active.variantId : 'kebab'; return variant ? this.assets.provider()?.textureUrl(`minecraft:painting/${variant}`) : undefined; }
  protected paintingCaption(): string { const active = this.decorations.active(); const id = active?.kind === 'painting' ? active.variantId : 'kebab'; const variant = PAINTING_VARIANTS.find((entry) => entry.id === id); return variant ? `${humanize(id ?? '')} · ${variant.width} × ${variant.height}` : ''; }
  protected frameTexture(glow: boolean): string | undefined { this.assets.generation(); return this.assets.provider()?.textureUrl(glow ? 'minecraft:block/glow_item_frame' : 'minecraft:block/item_frame'); }
  protected selectSource(id: string): void { this.selectedSource.set(id); }
  protected openAssetManager(): void { this.assetManagerRequested.emit(); }
}

function humanize(id: string): string { return id.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
