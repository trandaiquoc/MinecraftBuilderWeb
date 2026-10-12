export function sanitizeTraceScenario(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || 'trace';
}

export function viewportTraceFilename(scenario: string, date = new Date()): string {
  const iso = date.toISOString().replace(/[:.]/g, '-');
  return `minecraftbuilder-viewport-trace-${sanitizeTraceScenario(scenario)}-${iso}.json`;
}

export function stableTraceJson(value: unknown): string {
  return JSON.stringify(sortTraceValue(value), undefined, 2);
}

export function downloadViewportTrace<
  T extends { readonly scenario: string; readonly startedAt: string },
>(trace: T): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined')
    return;
  const blob = new Blob([stableTraceJson(trace)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = viewportTraceFilename(trace.scenario, new Date(trace.startedAt));
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sortTraceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortTraceValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortTraceValue(entry)]),
  );
}
