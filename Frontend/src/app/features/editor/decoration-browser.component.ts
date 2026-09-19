import { Component, inject, signal } from '@angular/core';
import { DecorationService } from '../../core/decorations/decoration.service';
import { PAINTING_VARIANTS } from '../../core/decorations/decoration.types';
import { I18nService } from '../../core/ui/i18n.service';
import { SearchableDropdownComponent } from './searchable-dropdown.component';

@Component({ selector: 'app-decoration-browser', imports: [SearchableDropdownComponent], templateUrl: './decoration-browser.component.html', styleUrl: './decoration-browser.component.scss' })
export class DecorationBrowserComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly decorations = inject(DecorationService);
  protected readonly variantOptions = PAINTING_VARIANTS.filter((entry) => entry.placeable !== false).map((entry) => ({ id: entry.id, label: humanize(entry.id), secondary: `${entry.width} × ${entry.height}` }));
  protected readonly expanded = signal(false);
  protected toggleExpanded(): void { this.expanded.update((value) => !value); }
}

function humanize(id: string): string { return id.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
