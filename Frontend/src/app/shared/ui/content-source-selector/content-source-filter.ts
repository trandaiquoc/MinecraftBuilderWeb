export const ALL_CONTENT_SOURCE = '__minecraftbuilder_all__' as const;

export type ContentSourceSelection = typeof ALL_CONTENT_SOURCE | string;

export interface SourceTaggedContent {
  readonly sourceId?: string;
  readonly namespace?: string;
}

export function filterByContentSource<T extends SourceTaggedContent>(items: readonly T[], selected: ContentSourceSelection): readonly T[] {
  if (selected === ALL_CONTENT_SOURCE) return items;
  return items.filter((item) => (item.sourceId ?? item.namespace) === selected);
}

export function sourceOptions(options: readonly ContentSourceOption[], allCount: number, allLabel: string, allTooltip?: string): readonly ContentSourceOption[] {
  const all: ContentSourceOption = { id: ALL_CONTENT_SOURCE, label: allLabel, count: allCount, ...(allTooltip ? { tooltip: allTooltip } : {}) };
  return [all, ...options.slice().sort((left, right) => left.id === 'vanilla' ? -1 : right.id === 'vanilla' ? 1 : left.label.localeCompare(right.label))];
}
import type { ContentSourceOption } from './content-source-selector.component';
