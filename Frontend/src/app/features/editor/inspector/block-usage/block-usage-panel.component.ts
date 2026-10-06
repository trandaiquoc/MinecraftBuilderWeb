import { Component, computed, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { ProjectBlockRuntimeIndex, ProjectBlockUsageEntry } from '../../../../core/editor/runtime/project-block-runtime-index';
import { BlockUsageHighlightService } from '../../../../core/editor/state/block-usage-highlight.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ThumbnailVisibilityDirective } from '../../../../shared/ui/thumbnail-visibility/thumbnail-visibility.directive';
import type { PlaceableItemDefinition } from '../../../../core/blocks/placement-palette/placeable-item';
import type { ThumbnailTaskPriority } from '../../../../core/assets/vanilla/thumbnail-task-queue';

type UsageSort = 'count-desc' | 'count-asc' | 'name-asc' | 'name-desc';

interface UsageRow {
  readonly entry: ProjectBlockUsageEntry;
  readonly displayName: string;
  readonly source: string;
  readonly item?: PlaceableItemDefinition;
}

@Component({
  selector: 'app-block-usage-panel',
  imports: [ScrollingModule, ThumbnailVisibilityDirective],
  templateUrl: './block-usage-panel.component.html',
  styleUrl: './block-usage-panel.component.scss',
})
export class BlockUsagePanelComponent {
  protected readonly i18n = inject(I18nService);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly runtimeIndex = inject(ProjectBlockRuntimeIndex);
  private readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  protected readonly highlight = inject(BlockUsageHighlightService);
  protected readonly query = signal('');
  protected readonly sort = signal<UsageSort>('count-desc');

  constructor() {
    const project = this.workspace.project();
    if (project) this.runtimeIndex.ensure(project);
  }

  protected readonly totalBlocks = computed(() => this.workspace.project()?.blocks.length ?? 0);
  protected readonly usageRows = computed<readonly UsageRow[]>(() => {
    this.runtimeIndex.usageRevision();
    const catalogRevision = this.library.catalogRevision();
    void catalogRevision;
    const query = this.query().trim().toLocaleLowerCase();
    const rows = this.runtimeIndex.usageEntries().map((entry) => {
      const item = this.library.itemForBlock(entry.id);
      const definition = this.library.get(entry.id);
      return {
        entry,
        displayName: item?.displayName ?? definition?.displayName ?? entry.id,
        source: item?.modName ?? item?.sourceName ?? definition?.sourceName ?? entry.namespace,
        item,
      };
    }).filter((row) => !query || `${row.displayName} ${row.entry.id} ${row.entry.namespace} ${row.source}`.toLocaleLowerCase().includes(query));
    const direction = this.sort();
    return rows.sort((left, right) => {
      if (direction === 'count-desc' || direction === 'count-asc') {
        const countDelta = right.entry.count - left.entry.count;
        if (countDelta) return direction === 'count-desc' ? countDelta : -countDelta;
      } else {
        const nameDelta = left.displayName.localeCompare(right.displayName);
        if (nameDelta) return direction === 'name-asc' ? nameDelta : -nameDelta;
      }
      return left.entry.id.localeCompare(right.entry.id);
    });
  });

  protected readonly uniqueTypes = computed(() => { this.runtimeIndex.usageRevision(); return this.runtimeIndex.uniqueBlockIdCount(); });
  protected readonly missingBlocks = computed(() => { this.runtimeIndex.usageRevision(); return this.runtimeIndex.usageEntries().reduce((sum, entry) => sum + entry.missingCount, 0); });

  protected search(event: Event): void { this.query.set((event.target as HTMLInputElement).value); }
  protected setSort(event: Event): void { this.sort.set((event.target as HTMLSelectElement).value as UsageSort); }
  protected percentage(count: number): string {
    const total = this.totalBlocks();
    if (!total) return '0%';
    const value = count / total * 100;
    return value > 0 && value < 0.1 ? '<0.1%' : `${value.toFixed(value >= 10 ? 1 : 1)}%`;
  }
  protected formatCount(value: number): string { return new Intl.NumberFormat(this.i18n.locale()).format(value); }
  protected isHighlighted(id: string): boolean { return this.highlight.highlightedBlockId() === id; }
  protected toggleHighlight(id: string): void { this.highlight.toggle(id); }
  protected clearHighlight(): void { this.highlight.clear(); }
  protected requestThumbnail(row: UsageRow, event: { readonly priority: ThumbnailTaskPriority }): void {
    if (row.item) this.assets.requestItemThumbnail(row.item, event.priority);
  }
  protected trackRow(_: number, row: UsageRow): string { return row.entry.id; }
}
