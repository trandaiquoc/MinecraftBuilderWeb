import type { BlockState } from '../domain/project.types';

export interface NormalizedPropertyPredicate { readonly property: string; readonly values: readonly string[]; readonly operator: 'equals-any'; }
export interface NormalizedPredicate { readonly kind: 'all' | 'any' | 'properties'; readonly predicates?: readonly NormalizedPredicate[]; readonly properties?: readonly NormalizedPropertyPredicate[]; }

export function parseVariantKey(key: string): readonly NormalizedPropertyPredicate[] {
  return key ? key.split(',').flatMap((entry) => { const separator = entry.indexOf('='); if (separator < 1) return []; return [{ property: entry.slice(0, separator), values: entry.slice(separator + 1).split('|').sort(), operator: 'equals-any' as const }]; }) : [];
}
export function normalizePredicate(value: unknown): NormalizedPredicate {
  if (!isRecord(value)) return { kind: 'properties', properties: [] };
  if (Array.isArray(value['AND'])) return { kind: 'all', predicates: value['AND'].map(normalizePredicate) };
  if (Array.isArray(value['OR'])) return { kind: 'any', predicates: value['OR'].map(normalizePredicate) };
  return { kind: 'properties', properties: Object.entries(value).flatMap(([property, expected]) => typeof expected === 'string' ? [{ property, values: expected.split('|').sort(), operator: 'equals-any' as const }] : []) };
}
export function predicateMatches(predicate: NormalizedPredicate, state: BlockState): boolean {
  if (predicate.kind === 'all') return (predicate.predicates ?? []).every((child) => predicateMatches(child, state));
  if (predicate.kind === 'any') return (predicate.predicates ?? []).some((child) => predicateMatches(child, state));
  return (predicate.properties ?? []).every((property) => property.values.includes(state[property.property]));
}
export function variantKeyMatches(key: string, state: BlockState): boolean { return predicateMatches({ kind: 'properties', properties: parseVariantKey(key) }, state); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
