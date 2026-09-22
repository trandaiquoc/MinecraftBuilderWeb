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

  protected options(): readonly SearchableDropdownOption[] {
    const visible = this.sourceId ? this.entries.filter((entry) => entry.sourceId === this.sourceId) : this.entries;
    const options = visible.map((entry) => ({ id: entry.id, label: entry.displayName, secondary: `${entry.sourceName} · ${entry.id}` }));
    const selected = this.selectedStack;
    if (selected && !options.some((option) => option.id === selected.id)) options.unshift({ id: selected.id, label: selected.id, secondary: 'Unavailable' });
    return options;
  }

  protected choose(id: string): void {
    const selected = this.selectedStack;
    if (!id) { this.stackChange.emit(undefined); return; }
    if (selected?.id === id) { this.stackChange.emit(selected); return; }
    this.stackChange.emit({ id, count: 1 });
  }
}
