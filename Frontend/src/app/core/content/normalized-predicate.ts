import type { BlockState } from '../domain/project.types';
import type { BlockStateDefinition } from '../blocks/catalog/block-definition.types';

export interface NormalizedPropertyPredicate { readonly property: string; readonly values: readonly string[]; readonly operator: 'equals-any'; }
export interface NormalizedPredicate { readonly kind: 'all' | 'any' | 'properties' | 'invalid'; readonly predicates?: readonly NormalizedPredicate[]; readonly properties?: readonly NormalizedPropertyPredicate[]; readonly reason?: string; }

/** Converts JSON blockstate scalar values to the editor's canonical string state. */
export function normalizeBlockStateScalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

export function normalizeScalarAlternatives(value: unknown): readonly string[] | undefined {
  const scalar = normalizeBlockStateScalar(value);
  if (scalar === undefined) return undefined;
  const values = typeof value === 'string' ? scalar.split('|') : [scalar];
  return values.every((item) => item.length > 0) ? values : undefined;
}

export function parseVariantKey(key: string): readonly NormalizedPropertyPredicate[] {
  return key ? key.split(',').flatMap((entry) => { const separator = entry.indexOf('='); if (separator < 1) return []; const property = entry.slice(0, separator).trim(); const expected = entry.slice(separator + 1); return property && expected ? [{ property, values: expected.split('|').sort(), operator: 'equals-any' as const }] : []; }) : [];
}
export function normalizePredicate(value: unknown): NormalizedPredicate {
  if (!isRecord(value)) return { kind: 'invalid', reason: 'Predicate must be an object.' };
  const hasAnd = Object.prototype.hasOwnProperty.call(value, 'AND');
  const hasOr = Object.prototype.hasOwnProperty.call(value, 'OR');
  if (hasAnd || hasOr) {
    if (hasAnd && hasOr || Object.keys(value).length !== 1) return { kind: 'invalid', reason: 'Logical predicates cannot contain additional fields.' };
    const key = hasAnd ? 'AND' : 'OR';
    const children = value[key];
    if (!Array.isArray(children)) return { kind: 'invalid', reason: `${key} must be an array.` };
    return hasAnd ? { kind: 'all', predicates: children.map(normalizePredicate) } : { kind: 'any', predicates: children.map(normalizePredicate) };
  }
  const properties: NormalizedPropertyPredicate[] = [];
  for (const [property, expected] of Object.entries(value)) {
    const values = normalizeScalarAlternatives(expected);
    if (!values || !property) return { kind: 'invalid', reason: `Unsupported predicate value for ${property || 'property'}.` };
    properties.push({ property, values: [...values].sort(), operator: 'equals-any' });
  }
  return { kind: 'properties', properties };
}
export function predicateMatches(predicate: NormalizedPredicate, state: BlockState): boolean {
  if (predicate.kind === 'invalid') return false;
  if (predicate.kind === 'all') return (predicate.predicates ?? []).every((child) => predicateMatches(child, state));
  if (predicate.kind === 'any') return (predicate.predicates ?? []).some((child) => predicateMatches(child, state));
  return (predicate.properties ?? []).every((property) => property.values.includes(state[property.property]));
}
export function variantKeyMatches(key: string, state: BlockState): boolean {
  return predicateMatches(normalizeVariantKey(key), state);
}

function normalizeVariantKey(key: string): NormalizedPredicate {
  if (!key.trim()) return { kind: 'properties', properties: [] };
  const entries = key.split(',');
  if (entries.some((entry) => {
    const separator = entry.indexOf('=');
    const property = separator >= 0 ? entry.slice(0, separator).trim() : '';
    const expected = separator >= 0 ? entry.slice(separator + 1) : '';
    return !property || !expected.trim() || expected.split('|').some((value) => !value.trim());
  })) return { kind: 'invalid', reason: 'Malformed variant key.' };
  return { kind: 'properties', properties: parseVariantKey(key) };
}

export function blockStatePredicates(document: unknown): readonly NormalizedPredicate[] {
  if (!isRecord(document)) return [];
  const result: NormalizedPredicate[] = [];
  if (isRecord(document['variants'])) for (const key of Object.keys(document['variants'])) result.push(normalizeVariantKey(key));
  if (Array.isArray(document['multipart'])) for (const part of document['multipart']) if (isRecord(part) && Object.prototype.hasOwnProperty.call(part, 'when')) result.push(normalizePredicate(part['when']));
  return result;
}

export function invalidPredicateReasons(predicates: readonly NormalizedPredicate[]): readonly string[] {
  const reasons: string[] = [];
  const visit = (predicate: NormalizedPredicate): void => {
    if (predicate.kind === 'invalid') { reasons.push(predicate.reason ?? 'Malformed predicate.'); return; }
    for (const child of predicate.predicates ?? []) visit(child);
  };
  predicates.forEach(visit);
  return reasons;
}

export function stateDefinitionsFromBlockstate(document: unknown): readonly BlockStateDefinition[] {
  const values = new Map<string, Set<string>>();
  const visit = (predicate: NormalizedPredicate): void => {
    if (predicate.kind === 'properties') for (const property of predicate.properties ?? []) values.set(property.property, new Set([...(values.get(property.property) ?? []), ...property.values]));
    else for (const child of predicate.predicates ?? []) visit(child);
  };
  blockStatePredicates(document).forEach(visit);
  return [...values].sort(([left], [right]) => left.localeCompare(right)).map(([name, options]) => ({ name, values: [...options].sort() }));
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
