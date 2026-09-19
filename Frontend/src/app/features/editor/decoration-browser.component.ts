import { Component, inject, signal } from '@angular/core';
import { DecorationService } from '../../core/decorations/decoration.service';
import { PAINTING_VARIANTS } from '../../core/decorations/decoration.types';
import { I18nService } from '../../core/ui/i18n.service';

@Component({ selector: 'app-decoration-browser', templateUrl: './decoration-browser.component.html', styleUrl: './decoration-browser.component.scss' })
export class DecorationBrowserComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  protected readonly variants = PAINTING_VARIANTS.filter((entry) => entry.placeable !== false);
  protected readonly expanded = signal(false);
  protected readonly paintingSearch = signal('');
  protected search(event: Event): void { this.paintingSearch.set((event.target as HTMLInputElement).value); }
  protected toggleExpanded(): void { this.expanded.update((value) => !value); }
  protected filteredVariants(): typeof this.variants { const query = this.paintingSearch().trim().toLowerCase(); return query ? this.variants.filter((entry) => entry.id.includes(query)) : this.variants; }
}
