/** A canonical inventory/display stack. Components are preserved verbatim. */
export interface ItemStackData {
  readonly id: string;
  readonly count: number;
  readonly components?: Readonly<Record<string, unknown>>;
}

export function normalizeItemStack(value: unknown): ItemStackData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record['id'] !== 'string' || !record['id'].trim()) return undefined;
  const count = typeof record['count'] === 'number' ? record['count'] : Number(record['count']);
  if (!Number.isInteger(count) || count < 1) return undefined;
  const components = record['components'];
  return {
    id: record['id'],
    count,
    ...(components && typeof components === 'object' && !Array.isArray(components) ? { components: components as Readonly<Record<string, unknown>> } : {}),
  };
}
