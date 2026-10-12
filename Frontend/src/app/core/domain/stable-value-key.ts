export function stableValueKey(value: unknown): string {
  return stableValuePart(value) ?? 'undefined';
}

function stableValuePart(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map(stableValuePart).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableValuePart((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
