import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import type { ItemCatalogEntry } from '../../../core/items/catalog/item-catalog';
import type { ItemStackData } from '../../../core/items/item-stack.types';
import { SearchableDropdownComponent, SearchableDropdownOption } from '../searchable-dropdown/searchable-dropdown.component';
import { ALL_CONTENT_SOURCE, sourceOptions } from '../content-source-selector/content-source-filter';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../content-source-selector/content-source-selector.component';

@Component({ selector: 'app-item-stack-picker', imports: [SearchableDropdownComponent, ContentSourceSelectorComponent], templateUrl: './item-stack-picker.component.html', styleUrl: './item-stack-picker.component.scss' })
export class ItemStackPickerComponent {
  @Input() entries: readonly ItemCatalogEntry[] = [];
  @Input() selectedStack?: ItemStackData;
  @Input() placeholder = 'Search items';
  @Input() emptyLabel = 'Empty';
  @Input() ariaLabel = 'Item';
  @Input() closeLabel = 'Close';
  @Input() noResults = 'No matches';
  @Input() sourceLabel = 'Source';
  @Input() allSourcesLabel = 'All sources';
  @Input() unavailableLabel = 'Unavailable';
  @Input() visualAvailableLabel = 'Renderable';
  @Input() visualUnsupportedLabel = 'Visual unavailable';
  @Input() visualMissingLabel = 'Missing visual resource';
  @Input() sourceId?: string;
  @Output() readonly stackChange = new EventEmitter<ItemStackData | undefined>();

  protected readonly sourceFilter = signal<string>(ALL_CONTENT_SOURCE);
  private optionsEntries?: readonly ItemCatalogEntry[];
  private optionsSource?: string;
  private optionsSelectedId?: string;
  private optionsFilter?: string;
  private optionsLabelsKey?: string;
  private optionsCache: readonly SearchableDropdownOption[] = [];
  private sourceOptionsEntries?: readonly ItemCatalogEntry[];
  private sourceOptionsLabel?: string;
  private sourceOptionsCache: readonly ContentSourceOption[] = [];

  protected sourceOptions(): readonly ContentSourceOption[] {
    if (this.sourceId) return [];
    if (this.sourceOptionsEntries === this.entries && this.sourceOptionsLabel === this.allSourcesLabel) return this.sourceOptionsCache;
    this.sourceOptionsEntries = this.entries; this.sourceOptionsLabel = this.allSourcesLabel;
    const counts = new Map<string, number>(); const labels = new Map<string, string>();
    for (const entry of this.entries) { counts.set(entry.sourceId, (counts.get(entry.sourceId) ?? 0) + 1); labels.set(entry.sourceId, entry.sourceName); }
    this.sourceOptionsCache = counts.size > 1 ? sourceOptions([...counts].map(([id, count]) => ({ id, count, label: labels.get(id) ?? id })), this.entries.length, this.allSourcesLabel) : [];
    return this.sourceOptionsCache;
  }

  protected selectSource(id: string): void { this.sourceFilter.set(id); this.optionsEntries = undefined; }

  protected options(): readonly SearchableDropdownOption[] {
    const selectedId = this.selectedStack?.id; const filter = this.sourceId ?? this.sourceFilter();
    const labelsKey = `${this.unavailableLabel}|${this.visualAvailableLabel}|${this.visualUnsupportedLabel}|${this.visualMissingLabel}`;
    if (this.optionsEntries === this.entries && this.optionsSource === this.sourceId && this.optionsSelectedId === selectedId && this.optionsFilter === filter && this.optionsLabelsKey === labelsKey) return this.optionsCache;
    this.optionsEntries = this.entries; this.optionsSource = this.sourceId; this.optionsSelectedId = selectedId; this.optionsFilter = filter; this.optionsLabelsKey = labelsKey;
    const options: SearchableDropdownOption[] = []; const availableIds = new Set<string>();
    for (const entry of this.entries) {
      if (filter !== ALL_CONTENT_SOURCE && entry.sourceId !== filter) continue;
      availableIds.add(entry.id);
      const visual = entry.visual;
      const status = visual?.status === 'available' ? this.visualAvailableLabel : visual?.status === 'missing-resource' ? this.visualMissingLabel : visual?.status === 'unsupported' ? this.visualUnsupportedLabel : undefined;
      options.push({ id: entry.id, label: entry.displayName, secondary: `${entry.sourceName} - ${entry.id}`, ...(status ? { status } : {}), thumbnail: { urls: visual?.previewUrls ?? [], alt: entry.displayName, fallback: !visual || visual.status !== 'available' || !visual.previewUrls.length } });
    }
    const selected = this.selectedStack;
    if (selected && !availableIds.has(selected.id)) options.unshift({ id: selected.id, label: selected.id, secondary: this.unavailableLabel, status: this.visualUnsupportedLabel, thumbnail: { urls: [], alt: selected.id, fallback: true } });
    this.optionsCache = options; return this.optionsCache;
  }

  protected choose(id: string): void {
    const selected = this.selectedStack;
    if (!id) { this.stackChange.emit(undefined); return; }
    if (selected?.id === id) { this.stackChange.emit(selected); return; }
    this.stackChange.emit({ id, count: 1 });
  }
}
