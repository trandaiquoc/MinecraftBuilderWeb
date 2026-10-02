import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item';

export type ExternalAiPolicyCategory = 'blocks' | 'items' | 'decorations';

/** A restriction for one logical placeable material. Zero means forbidden. */
export interface ExternalAiMaterialRule {
  /** Omitted on legacy rules; omitted means blocks. */
  readonly category?: ExternalAiPolicyCategory;
  readonly targetId: string;
  readonly maxCount: number;
}

export interface ExternalAiPolicyCatalogEntry {
  readonly category: ExternalAiPolicyCategory;
  readonly id: string;
  readonly displayName?: string;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly blockIds?: readonly string[];
  readonly available?: boolean;
}

/** The resolved IDs are the only IDs counted by the external prompt. */
export interface ExternalAiMaterialPolicyEntry extends ExternalAiMaterialRule {
  readonly category: ExternalAiPolicyCategory;
  readonly blockIds?: readonly string[];
  readonly sourceId?: string;
  readonly displayName?: string;
  readonly available?: boolean;
}

export const DEFAULT_EXTERNAL_AI_MATERIAL_RULES: readonly ExternalAiMaterialRule[] = Object.freeze([
  Object.freeze({ targetId: 'minecraft:dragon_egg', maxCount: 1 }),
  Object.freeze({ targetId: 'minecraft:dragon_head', maxCount: 1 }),
  Object.freeze({ targetId: 'minecraft:netherite_block', maxCount: 4 }),
  Object.freeze({ targetId: 'minecraft:ancient_debris', maxCount: 8 }),
]);

const IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

export function normalizeExternalAiMaterialRules(value: unknown, items?: readonly PlaceableItemDefinition[]): readonly ExternalAiMaterialRule[] {
  if (!Array.isArray(value)) return [];
  const strictest = new Map<string, { readonly category: ExternalAiPolicyCategory; readonly targetId: string; readonly maxCount: number }>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const rawId = (candidate as { readonly targetId?: unknown }).targetId;
    const rawCount = (candidate as { readonly maxCount?: unknown }).maxCount;
    const rawCategory = (candidate as { readonly category?: unknown }).category;
    const category: ExternalAiPolicyCategory = rawCategory === 'items' || rawCategory === 'decorations' ? rawCategory : 'blocks';
    if (typeof rawId !== 'string' || !IDENTIFIER.test(rawId)) continue;
    if (typeof rawCount !== 'number' || !Number.isSafeInteger(rawCount) || rawCount < 0) continue;
    const targetId = category === 'blocks' ? canonicalPlaceableItemId(rawId, items) : rawId;
    const key = `${category}:${targetId}`;
    const previous = strictest.get(key);
    strictest.set(key, previous === undefined ? { category, targetId, maxCount: rawCount } : { ...previous, maxCount: Math.min(previous.maxCount, rawCount) });
  }
  return [...strictest.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rule]) => rule.category === 'blocks' ? { targetId: rule.targetId, maxCount: rule.maxCount } : rule);
}

export function materialRuleMode(rule: ExternalAiMaterialRule | undefined): 'unlimited' | 'forbidden' | 'maximum' {
  if (!rule) return 'unlimited';
  return rule.maxCount === 0 ? 'forbidden' : 'maximum';
}

export function resolveExternalAiMaterialPolicy(
  rules: readonly ExternalAiMaterialRule[],
  items: readonly PlaceableItemDefinition[],
  catalog: readonly ExternalAiPolicyCatalogEntry[] = [],
): readonly ExternalAiMaterialPolicyEntry[] {
  const normalized = normalizeExternalAiMaterialRules(rules, items);
  return normalized.map((rule) => {
    const category = rule.category ?? 'blocks';
    if (category !== 'blocks') {
      const entry = catalog.find((candidate) => candidate.category === category && candidate.id === rule.targetId);
      return {
        ...rule,
        category,
        ...(entry?.blockIds ? { blockIds: [...new Set(entry.blockIds)].sort() } : {}),
        ...(entry?.sourceId ? { sourceId: entry.sourceId } : { sourceId: rule.targetId.split(':')[0] }),
        ...(entry?.displayName ? { displayName: entry.displayName } : {}),
        ...(entry?.available !== undefined ? { available: entry.available } : { available: false }),
      };
    }
    const item = items.find((candidate) => candidate.itemId === rule.targetId || candidate.concreteBlockIds.includes(rule.targetId));
    if (!item) {
      return { ...rule, category, blockIds: [rule.targetId], sourceId: rule.targetId.split(':')[0], available: false };
    }
    return {
      ...rule,
      category,
      targetId: item.itemId,
      blockIds: [...new Set(item.concreteBlockIds)].sort(),
      sourceId: item.sourceId ?? item.namespace,
      displayName: item.displayName,
      available: true,
    };
  });
}

export function serializeExternalAiMaterialPolicy(entries: readonly ExternalAiMaterialPolicyEntry[]): string {
  const policy: Record<ExternalAiPolicyCategory, readonly Record<string, unknown>[]> = { blocks: [], items: [], decorations: [] };
  for (const entry of entries) {
    const value: Record<string, unknown> = { targetId: entry.targetId, maxCount: entry.maxCount };
    if (entry.category === 'blocks') value['blockIds'] = uniqueSorted(entry['blockIds'] ?? [entry.targetId]);
    policy[entry.category] = [...policy[entry.category], value];
  }
  for (const category of Object.keys(policy) as ExternalAiPolicyCategory[]) policy[category] = [...policy[category]].sort((left, right) => String(left['targetId']).localeCompare(String(right['targetId'])));
  return JSON.stringify(policy, null, 2);
}

export function isMaterialRuleForAvailableContent(entry: ExternalAiMaterialPolicyEntry, availableSourceIds: ReadonlySet<string>): boolean {
  if (!entry.available) return entry.targetId.startsWith('minecraft:');
  if (entry.targetId.startsWith('minecraft:')) return true;
  return !!entry.sourceId && availableSourceIds.has(entry.sourceId);
}

function uniqueSorted(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
