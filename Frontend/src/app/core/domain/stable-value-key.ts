export function stableValueKey(value: unknown): string {
  return stableValuePart(value);
}

function stableValuePart(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value))
    return `[${Array.from({ length: value.length }, (_, index) =>
      index in value ? stableValuePart(value[index]) : '<hole>',
    ).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableValuePart((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}
