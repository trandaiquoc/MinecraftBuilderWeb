import { Component, inject, signal } from '@angular/core';
import { DecorationService } from '../../core/decorations/decoration.service';
import { I18nService } from '../../core/ui/i18n.service';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { PAINTING_VARIANTS } from '../../core/decorations/decoration.types';
import { PaintingPickerComponent } from './painting-picker.component';

@Component({ selector: 'app-decoration-browser', imports: [PaintingPickerComponent], templateUrl: './decoration-browser.component.html', styleUrl: './decoration-browser.component.scss' })
export class DecorationBrowserComponent {
  protected readonly expanded = signal(false);
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  private readonly assets = inject(VanillaAssetsService);
  protected paintingTexture(): string | undefined { this.assets.generation(); const active = this.decorations.active(); const variant = active?.kind === 'painting' ? active.variantId : 'kebab'; return variant ? this.assets.provider()?.textureUrl(`minecraft:painting/${variant}`) : undefined; }
  protected paintingCaption(): string { const active = this.decorations.active(); const id = active?.kind === 'painting' ? active.variantId : 'kebab'; const variant = PAINTING_VARIANTS.find((entry) => entry.id === id); return variant ? `${humanize(id ?? '')} · ${variant.width} × ${variant.height}` : ''; }
  protected frameTexture(glow: boolean): string | undefined { this.assets.generation(); return this.assets.provider()?.textureUrl(glow ? 'minecraft:block/glow_item_frame' : 'minecraft:block/item_frame'); }
  protected toggleExpanded(): void { this.expanded.update((value) => !value); }
}

function humanize(id: string): string { return id.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
