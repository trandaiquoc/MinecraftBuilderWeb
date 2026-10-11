export const ALL_CONTENT_SOURCE = '__minecraftbuilder_all__' as const;

export type ContentSourceSelection = typeof ALL_CONTENT_SOURCE | string;

export interface SourceTaggedContent {
  readonly sourceId?: string;
  readonly namespace?: string;
}

export function filterByContentSource<T extends SourceTaggedContent>(
  items: readonly T[],
  selected: ContentSourceSelection,
): readonly T[] {
  if (selected === ALL_CONTENT_SOURCE) return items;
  return items.filter((item) => (item.sourceId ?? item.namespace) === selected);
}
