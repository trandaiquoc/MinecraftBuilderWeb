import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import type { ItemCatalogEntry } from '../../../core/items/catalog/item-catalog';
import type { ItemStackData } from '../../../core/items/item-stack.types';
import { SearchableDropdownComponent, SearchableDropdownOption } from '../searchable-dropdown/searchable-dropdown.component';
import { ALL_CONTENT_SOURCE, sourceOptions } from '../content-source-selector/content-source-filter';
import { ContentSourceOption, ContentSourceSelectorComponent } from '../content-source-selector/content-source-selector.component';
import { ItemVisualService, stableVisualComponents } from '../../../core/items/catalog/item-visual.service';

@Component({ selector: 'app-item-stack-picker', imports: [SearchableDropdownComponent, ContentSourceSelectorComponent], templateUrl: './item-stack-picker.component.html', styleUrl: './item-stack-picker.component.scss' })
export class ItemStackPickerComponent implements OnChanges {
  private readonly visuals = inject(ItemVisualService);
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
  @Input() visualLoadingLabel = 'Loading visual';
  @Input() sourceId?: string;
  @Output() readonly stackChange = new EventEmitter<ItemStackData | undefined>();

  ngOnChanges(changes: SimpleChanges): void {
    const selectedRestored = changes['entries'] && this.selectedStack && this.entries.some((entry) => entry.id === this.selectedStack!.id);
    if ((changes['selectedStack'] || selectedRestored) && this.selectedStack) void this.visuals.request(this.selectedStack, 'high').catch(() => undefined);
  }

  protected readonly sourceFilter = signal<string>(ALL_CONTENT_SOURCE);
  private optionsEntries?: readonly ItemCatalogEntry[];
  private optionsSource?: string;
  private optionsSelectedId?: string;
  private optionsSelectedKey?: string;
  private optionsFilter?: string;
  private optionsLabelsKey?: string;
  private optionsVisualRevision?: number;
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
    const visualRevision = this.visuals.revision();
    const selectedId = this.selectedStack?.id; const selectedKey = selectedId ? `${selectedId}|${this.selectedStack?.components ? stableVisualComponents(this.selectedStack.components) : ''}` : undefined; const filter = this.sourceId ?? this.sourceFilter();
    const labelsKey = `${this.unavailableLabel}|${this.visualAvailableLabel}|${this.visualUnsupportedLabel}|${this.visualMissingLabel}|${this.visualLoadingLabel}`;
    if (this.optionsEntries === this.entries && this.optionsSource === this.sourceId && this.optionsSelectedId === selectedId && this.optionsSelectedKey === selectedKey && this.optionsFilter === filter && this.optionsLabelsKey === labelsKey && this.optionsVisualRevision === visualRevision) return this.optionsCache;
    this.optionsEntries = this.entries; this.optionsSource = this.sourceId; this.optionsSelectedId = selectedId; this.optionsSelectedKey = selectedKey; this.optionsFilter = filter; this.optionsLabelsKey = labelsKey; this.optionsVisualRevision = visualRevision;
    const options: SearchableDropdownOption[] = []; const availableIds = new Set<string>();
    for (const entry of this.entries) {
      if (filter !== ALL_CONTENT_SOURCE && entry.sourceId !== filter) continue;
      availableIds.add(entry.id);
      const state = this.selectedStack?.id === entry.id ? this.visuals.state(this.selectedStack) : this.visuals.state(entry);
      const visual = entry.visual ?? state.info;
      const status = entry.visual?.status === 'available' || state.status === 'available' ? this.visualAvailableLabel : entry.visual?.status === 'missing-resource' || state.status === 'missing-resource' ? this.visualMissingLabel : entry.visual?.status === 'unsupported' || state.status === 'unsupported' ? this.visualUnsupportedLabel : state.status === 'queued' || state.status === 'loading' ? this.visualLoadingLabel : undefined;
      options.push({ id: entry.id, label: entry.displayName, secondary: `${entry.sourceName} - ${entry.id}`, ...(status ? { status } : {}), thumbnail: { urls: visual?.previewUrls ?? [], alt: entry.displayName, fallback: !visual || !visual.previewUrls.length } });
    }
    const selected = this.selectedStack;
    if (selected && !availableIds.has(selected.id)) options.unshift({ id: selected.id, label: selected.id, secondary: this.unavailableLabel, status: this.visualUnsupportedLabel, thumbnail: { urls: [], alt: selected.id, fallback: true } });
    this.optionsCache = options; return this.optionsCache;
  }

  protected choose(id: string): void {
    const selected = this.selectedStack;
    if (!id) { this.stackChange.emit(undefined); return; }
    if (selected?.id === id) { this.stackChange.emit(selected); return; }
    const next = { id, count: 1 } satisfies ItemStackData;
    void this.visuals.request(next, 'high').catch(() => undefined);
    this.stackChange.emit(next);
  }
}
