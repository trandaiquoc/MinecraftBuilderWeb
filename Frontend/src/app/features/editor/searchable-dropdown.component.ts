import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal, viewChild } from '@angular/core';

export interface SearchableDropdownOption {
  readonly id: string;
  readonly label: string;
  readonly secondary?: string;
}

let nextDropdownId = 0;

@Component({
  selector: 'app-searchable-dropdown',
  templateUrl: './searchable-dropdown.component.html',
  styleUrl: './searchable-dropdown.component.scss',
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
  private readonly host = inject(ElementRef<HTMLElement>);

  protected get selected(): SearchableDropdownOption | undefined { return this.options.find((option) => option.id === this.selectedId); }
  protected filteredOptions(): readonly SearchableDropdownOption[] {
    const query = normalize(this.query());
    return query ? this.options.filter((option) => normalize(`${option.label} ${option.secondary ?? ''} ${option.id}`).includes(query)).slice(0, 100) : this.options.slice(0, 100);
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

  @HostListener('document:pointerdown', ['$event'])
  protected outsidePointer(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown', ['$event'])
  protected documentKeydown(event: KeyboardEvent): void {
    if (this.open() && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
  }
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
