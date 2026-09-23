import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ItemCatalogEntry } from '../../../core/items/catalog/item-catalog';
import type { ItemStackData } from '../../../core/items/item-stack.types';
import { SearchableDropdownComponent, SearchableDropdownOption } from '../searchable-dropdown/searchable-dropdown.component';

@Component({
  selector: 'app-item-stack-picker',
  imports: [SearchableDropdownComponent],
  templateUrl: './item-stack-picker.component.html',
  styleUrl: './item-stack-picker.component.scss',
})
export class ItemStackPickerComponent {
  @Input() entries: readonly ItemCatalogEntry[] = [];
  @Input() selectedStack?: ItemStackData;
  @Input() placeholder = 'Search items';
  @Input() emptyLabel = 'Empty';
  @Input() ariaLabel = 'Item';
  @Input() closeLabel = 'Close';
  @Input() noResults = 'No matches';
  @Input() sourceId?: string;
  @Output() readonly stackChange = new EventEmitter<ItemStackData | undefined>();

  private optionsEntries?: readonly ItemCatalogEntry[];
  private optionsSource?: string;
  private optionsSelectedId?: string;
  private optionsCache: readonly SearchableDropdownOption[] = [];

  protected options(): readonly SearchableDropdownOption[] {
    const selectedId = this.selectedStack?.id;
    if (this.optionsEntries === this.entries && this.optionsSource === this.sourceId && this.optionsSelectedId === selectedId) return this.optionsCache;
    this.optionsEntries = this.entries; this.optionsSource = this.sourceId; this.optionsSelectedId = selectedId;
    const options: SearchableDropdownOption[] = [];
    const availableIds = new Set<string>();
    for (const entry of this.entries) {
      if (this.sourceId && entry.sourceId !== this.sourceId) continue;
      availableIds.add(entry.id);
      options.push({ id: entry.id, label: entry.displayName, secondary: `${entry.sourceName} · ${entry.id}` });
    }
    const selected = this.selectedStack;
    if (selected && !availableIds.has(selected.id)) options.unshift({ id: selected.id, label: selected.id, secondary: 'Unavailable' });
    this.optionsCache = options;
    return this.optionsCache;
  }

  protected choose(id: string): void {
    const selected = this.selectedStack;
    if (!id) { this.stackChange.emit(undefined); return; }
    if (selected?.id === id) { this.stackChange.emit(selected); return; }
    this.stackChange.emit({ id, count: 1 });
  }
}
