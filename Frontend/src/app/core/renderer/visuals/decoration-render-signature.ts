import type { PlacedDecoration } from '../../decorations/decoration.types';

export function decorationRenderSignature(decoration: PlacedDecoration | undefined): string {
  return decoration === undefined ? '' : stableValue(decoration);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}
