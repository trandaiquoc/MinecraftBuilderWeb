import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item-resolution';

export type ExternalAiContentCategory = 'blocks' | 'items' | 'decorations';

export interface ExternalAiContentLimits {
  readonly blocks: readonly string[];
  readonly items: readonly string[];
  readonly decorations: readonly string[];
}

export const DEFAULT_EXTERNAL_AI_CONTENT_LIMITS: ExternalAiContentLimits = Object.freeze({
  blocks: Object.freeze([
    'minecraft:ancient_debris',
    'minecraft:dragon_egg',
    'minecraft:dragon_head',
    'minecraft:netherite_block',
  ]),
  items: Object.freeze([]),
  decorations: Object.freeze([]),
});

const IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/** Normalizes the current ID-list shape and migrates the previous max-count array shape. */
export function normalizeExternalAiContentLimits(value: unknown, items?: readonly PlaceableItemDefinition[]): ExternalAiContentLimits {
  if (Array.isArray(value)) return normalizeLegacyRules(value, items);
  if (!value || typeof value !== 'object') return emptyContentLimits();
  const source = value as Record<string, unknown>;
  return {
    blocks: normalizeIds(source['blocks'], 'blocks', items),
    items: normalizeIds(source['items'], 'items'),
    decorations: normalizeIds(source['decorations'], 'decorations'),
  };
}

export function serializeExternalAiContentLimits(limits: ExternalAiContentLimits): string {
  return JSON.stringify(normalizeExternalAiContentLimits(limits), null, 2);
}

export function isExternalAiContentLimitAvailable(id: string, availableNamespaces: ReadonlySet<string>): boolean {
  const namespace = id.slice(0, id.indexOf(':'));
  return namespace === 'minecraft' || availableNamespaces.has(namespace);
}

function normalizeLegacyRules(value: readonly unknown[], items?: readonly PlaceableItemDefinition[]): ExternalAiContentLimits {
  const grouped: Record<ExternalAiContentCategory, string[]> = { blocks: [], items: [], decorations: [] };
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const entry = candidate as Record<string, unknown>;
    if (typeof entry['targetId'] !== 'string') continue;
    const category = entry['category'] === 'items' || entry['category'] === 'decorations' ? entry['category'] : 'blocks';
    grouped[category].push(entry['targetId']);
  }
  return {
    blocks: normalizeIds(grouped.blocks, 'blocks', items),
    items: normalizeIds(grouped.items, 'items'),
    decorations: normalizeIds(grouped.decorations, 'decorations'),
  };
}

function normalizeIds(value: unknown, category: ExternalAiContentCategory, items?: readonly PlaceableItemDefinition[]): readonly string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((candidate) => {
    if (typeof candidate !== 'string' || !IDENTIFIER.test(candidate)) return [];
    return [category === 'blocks' ? canonicalPlaceableItemId(candidate, items) : candidate];
  });
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function emptyContentLimits(): ExternalAiContentLimits { return { blocks: [], items: [], decorations: [] }; }
