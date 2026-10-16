/**
 * Creates a deterministic identity for project and render values.
 * Object key order is ignored; array order, holes, explicit undefined,
 * non-finite numbers, and negative zero remain significant. This supports
 * JSON-shaped data and those explicit cases, not arbitrary JavaScript objects.
 */
export function stableValueKey(value: unknown): string {
  return stableValuePart(value);
}

function stableValuePart(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    if (Object.is(value, -0)) return '-0';
  }
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
