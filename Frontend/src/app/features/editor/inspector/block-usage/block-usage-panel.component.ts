import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { LucideSearch } from '@lucide/angular';
import { filter, take } from 'rxjs';
import type { Subscription } from 'rxjs';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import {
  ProjectBlockRuntimeIndex,
  ProjectBlockUsageEntry,
} from '../../../../core/editor/runtime/project-block-runtime-index';
import { BlockUsageHighlightService } from '../../../../core/editor/state/block-usage-highlight.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ThumbnailVisibilityDirective } from '../../../../shared/ui/thumbnail-visibility/thumbnail-visibility.directive';
import type { PlaceableItemDefinition } from '../../../../core/blocks/placement-palette/placeable-item.types';
import type { ThumbnailTaskPriority } from '../../../../core/assets/vanilla/thumbnails/thumbnail-task-queue';

type UsageSort = 'count-desc' | 'count-asc' | 'name-asc' | 'name-desc';

interface UsageRow {
  readonly entry: ProjectBlockUsageEntry;
  readonly displayName: string;
  readonly source: string;
  readonly item?: PlaceableItemDefinition;
}

@Component({
  selector: 'app-block-usage-panel',
  imports: [LucideSearch, ScrollingModule, ThumbnailVisibilityDirective],
  templateUrl: './block-usage-panel.component.html',
  styleUrl: './block-usage-panel.component.scss',
})
export class BlockUsagePanelComponent {
  protected readonly i18n = inject(I18nService);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly runtimeIndex = inject(ProjectBlockRuntimeIndex);
  private readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(ContentAssetRuntimeService);
  protected readonly highlight = inject(BlockUsageHighlightService);
  protected readonly query = signal('');
  protected readonly sort = signal<UsageSort>('count-desc');
  protected readonly activeUsageIndex = signal(0);
  private readonly pendingUsageIndex = signal<number | undefined>(undefined);
  private pendingRangeSubscription: Subscription | undefined;
  private readonly usageViewport = viewChild(CdkVirtualScrollViewport);
  private readonly viewportSizing = effect((onCleanup) => {
    const viewport = this.usageViewport();
    const element = viewport?.elementRef.nativeElement;
    if (!viewport || !element) return;

    if (typeof ResizeObserver === 'undefined') {
      viewport.checkViewportSize();
      return;
    }

    const observer = new ResizeObserver(() => viewport.checkViewportSize());
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

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
    const rows = this.runtimeIndex
      .usageEntries()
      .map((entry) => {
        const item = this.library.itemForBlock(entry.id);
        const definition = this.library.get(entry.id);
        return {
          entry,
          displayName: item?.displayName ?? definition?.displayName ?? entry.id,
          source: item?.modName ?? item?.sourceName ?? definition?.sourceName ?? entry.namespace,
          item,
        };
      })
      .filter(
        (row) =>
          !query ||
          `${row.displayName} ${row.entry.id} ${row.entry.namespace} ${row.source}`
            .toLocaleLowerCase()
            .includes(query),
      );
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

  protected readonly uniqueTypes = computed(() => {
    this.runtimeIndex.usageRevision();
    return this.runtimeIndex.uniqueBlockIdCount();
  });
  protected readonly missingBlocks = computed(() => {
    this.runtimeIndex.usageRevision();
    return this.runtimeIndex.usageEntries().reduce((sum, entry) => sum + entry.missingCount, 0);
  });

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.resetUsageNavigation();
  }
  protected setSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as UsageSort);
    this.resetUsageNavigation();
  }
  protected readonly activeUsageOptionId = computed(() => {
    const rows = this.usageRows();
    if (!rows.length) return null;
    return this.usageOptionId(Math.min(this.activeUsageIndex(), rows.length - 1));
  });
  protected usageOptionId(index: number): string {
    return `block-usage-option-${index}`;
  }
  protected usageOptionLabel(row: UsageRow): string {
    const parts = [
      this.i18n.t('highlightBlockUsage'),
      row.displayName,
      row.entry.id,
      this.formatCount(row.entry.count),
      this.percentage(row.entry.count),
    ];
    if (row.entry.missingCount) {
      parts.push(`${this.formatCount(row.entry.missingCount)} ${this.i18n.t('missingShort')}`);
    }
    return parts.join(', ');
  }
  protected activateUsageRow(index: number): void {
    const row = this.usageRows()[index];
    if (!row) return;

    this.cancelPendingNavigation();
    this.pendingUsageIndex.set(undefined);
    this.activeUsageIndex.set(index);
    this.usageViewport()?.elementRef.nativeElement.focus({ preventScroll: true });
    this.toggleHighlight(row.entry.id);
  }
  protected handleUsageListKeydown(event: KeyboardEvent): void {
    const rows = this.usageRows();
    if (!rows.length) return;

    const currentIndex = Math.min(
      this.pendingUsageIndex() ?? this.activeUsageIndex(),
      rows.length - 1,
    );
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleHighlight(rows[currentIndex].entry.id);
      return;
    }

    let nextIndex: number;
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 1, rows.length - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = rows.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.moveActiveUsageIndex(nextIndex);
  }
  protected percentage(count: number): string {
    const total = this.totalBlocks();
    if (!total) return '0%';
    const value = (count / total) * 100;
    return value > 0 && value < 0.1 ? '<0.1%' : `${value.toFixed(value >= 10 ? 1 : 1)}%`;
  }
  protected usageShare(count: number): number {
    const total = this.totalBlocks();
    return total > 0 ? Math.min(100, Math.max(0, (count / total) * 100)) : 0;
  }
  protected formatCount(value: number): string {
    return new Intl.NumberFormat(this.i18n.locale()).format(value);
  }
  protected isHighlighted(id: string): boolean {
    return this.highlight.highlightedBlockId() === id;
  }
  protected toggleHighlight(id: string): void {
    this.highlight.toggle(id);
  }
  protected clearHighlight(): void {
    this.highlight.clear();
  }
  protected requestThumbnail(
    row: UsageRow,
    event: { readonly priority: ThumbnailTaskPriority },
  ): void {
    if (row.item) this.assets.requestItemThumbnail(row.item, event.priority);
  }
  protected trackRow(_: number, row: UsageRow): string {
    return row.entry.id;
  }

  private resetUsageNavigation(): void {
    this.cancelPendingNavigation();
    this.pendingUsageIndex.set(undefined);
    this.activeUsageIndex.set(0);
    this.usageViewport()?.scrollToIndex(0);
  }

  private moveActiveUsageIndex(index: number): void {
    const viewport = this.usageViewport();
    if (!viewport) {
      this.activeUsageIndex.set(index);
      return;
    }

    this.cancelPendingNavigation();
    const range = viewport.getRenderedRange();
    if (index >= range.start && index < range.end) {
      this.pendingUsageIndex.set(undefined);
      this.activeUsageIndex.set(index);
      return;
    }

    this.pendingUsageIndex.set(index);
    this.pendingRangeSubscription = viewport.renderedRangeStream
      .pipe(
        filter((renderedRange) => index >= renderedRange.start && index < renderedRange.end),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.pendingRangeSubscription = undefined;
        if (this.pendingUsageIndex() !== index) return;
        this.pendingUsageIndex.set(undefined);
        this.activeUsageIndex.set(index);
      });
    viewport.scrollToIndex(index);
  }

  private cancelPendingNavigation(): void {
    this.pendingRangeSubscription?.unsubscribe();
    this.pendingRangeSubscription = undefined;
    this.pendingUsageIndex.set(undefined);
  }
}
