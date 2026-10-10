export type SearchFieldResolver<T> = (item: T) => readonly string[];

/** Ranks all matches before applying an optional result limit. */
export function rankSearchResults<T>(
  items: readonly T[],
  query: string,
  fields: SearchFieldResolver<T>,
  limit?: number,
): readonly T[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return limit === undefined ? items : items.slice(0, limit);
  const ranked: Array<{ readonly item: T; readonly rank: number; readonly index: number }> = [];
  items.forEach((item, index) => {
    const values = fields(item).map(normalizeSearchText).filter(Boolean);
    const rank = matchRank(values, normalized);
    if (rank !== undefined) ranked.push({ item, rank, index });
  });
  ranked.sort((left, right) => left.rank - right.rank || left.index - right.index);
  const result = ranked.map((entry) => entry.item);
  return limit === undefined ? result : result.slice(0, limit);
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

function matchRank(values: readonly string[], query: string): number | undefined {
  if (values.some((value) => value === query)) return 0;
  if (values.some((value) => value.startsWith(query))) return 1;
  if (values.some((value) => value.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))))
    return 2;
  if (values.some((value) => value.includes(query))) return 3;
  return undefined;
}
