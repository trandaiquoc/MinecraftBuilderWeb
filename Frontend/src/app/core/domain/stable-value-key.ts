export function stableValueKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValueKey((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) as string;
}
