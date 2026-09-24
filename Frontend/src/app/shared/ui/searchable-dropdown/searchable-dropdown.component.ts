import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Component, ElementRef, EventEmitter, Input, Output, signal, viewChild } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';

export interface SearchableDropdownOption {
  readonly id: string;
  readonly label: string;
  readonly secondary?: string;
  readonly thumbnail?: { readonly urls: readonly string[]; readonly alt: string; readonly fallback?: boolean };
  readonly status?: string;
}

let nextDropdownId = 0;

@Component({
  selector: 'app-searchable-dropdown',
  imports: [LucideChevronDown, CdkConnectedOverlay, CdkOverlayOrigin],
  templateUrl: './searchable-dropdown.component.html',
  styleUrl: './searchable-dropdown.component.scss',
  host: { '(keydown)': 'onHostKeydown($event)' },
})
export class SearchableDropdownComponent {
  @Input() options: readonly SearchableDropdownOption[] = [];
  @Input() selectedId = '';
  @Input() placeholder = '';
  @Input() emptyLabel = '';
  @Input() ariaLabel = '';
  @Input() closeLabel = '';
  @Input() noResults = 'No matches';
  @Output() readonly selectionChange = new EventEmitter<string>();
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal<number | null>(null);
  protected readonly listId = `searchable-dropdown-${nextDropdownId++}`;
  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private indexedOptions?: readonly SearchableDropdownOption[];
  private readonly optionSearchIndex = new Map<string, string>();
  private readonly optionById = new Map<string, SearchableDropdownOption>();

  protected get selected(): SearchableDropdownOption | undefined {
    this.ensureOptionIndex();
    return this.optionById.get(this.selectedId);
  }
  protected filteredOptions(): readonly SearchableDropdownOption[] {
    const query = normalize(this.query());
    this.ensureOptionIndex();
    if (!query) return this.options.slice(0, 100);
    const matches: SearchableDropdownOption[] = [];
    for (const option of this.options) {
      if (this.optionSearchIndex.get(option.id)?.includes(query)) matches.push(option);
      if (matches.length === 100) break;
    }
    return matches;
  }
  protected toggle(): void {
    if (this.open()) this.close();
    else {
      this.open.set(true);
      this.activeIndex.set(null);
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
    }
  }
  protected setQuery(event: Event): void { this.query.set((event.target as HTMLInputElement).value); this.activeIndex.set(null); }
  protected select(id: string): void { this.selectionChange.emit(id); this.close(); }
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const options = this.filteredOptions();
      if (!options.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update((index) => {
        if (index === null) return delta > 0 ? 0 : options.length - 1;
        return (index + delta + options.length) % options.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      const index = this.activeIndex();
      const option = index === null ? undefined : this.filteredOptions()[index];
      if (option) { event.preventDefault(); this.select(option.id); }
    }
  }
  protected close(): void { this.open.set(false); this.query.set(''); this.activeIndex.set(null); }
  protected onHostKeydown(event: KeyboardEvent): void { if (this.open() && event.key === 'Escape') { event.preventDefault(); this.close(); } }

  private ensureOptionIndex(): void {
    if (this.indexedOptions === this.options) return;
    this.indexedOptions = this.options;
    this.optionSearchIndex.clear(); this.optionById.clear();
    for (const option of this.options) {
      this.optionById.set(option.id, option);
      this.optionSearchIndex.set(option.id, normalize(`${option.label} ${option.secondary ?? ''} ${option.status ?? ''} ${option.id}`));
    }
  }
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
