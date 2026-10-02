import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item';

/** A restriction for one logical placeable material. Zero means forbidden. */
export interface ExternalAiMaterialRule {
  readonly targetId: string;
  readonly maxCount: number;
}

/** The resolved IDs are the only IDs counted by the external prompt. */
export interface ExternalAiMaterialPolicyEntry extends ExternalAiMaterialRule {
  readonly blockIds: readonly string[];
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
  const strictest = new Map<string, number>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const rawId = (candidate as { readonly targetId?: unknown }).targetId;
    const rawCount = (candidate as { readonly maxCount?: unknown }).maxCount;
    if (typeof rawId !== 'string' || !IDENTIFIER.test(rawId)) continue;
    if (typeof rawCount !== 'number' || !Number.isSafeInteger(rawCount) || rawCount < 0) continue;
    const targetId = canonicalPlaceableItemId(rawId, items);
    const previous = strictest.get(targetId);
    strictest.set(targetId, previous === undefined ? rawCount : Math.min(previous, rawCount));
  }
  return [...strictest.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([targetId, maxCount]) => ({ targetId, maxCount }));
}

export function materialRuleMode(rule: ExternalAiMaterialRule | undefined): 'unlimited' | 'forbidden' | 'maximum' {
  if (!rule) return 'unlimited';
  return rule.maxCount === 0 ? 'forbidden' : 'maximum';
}

export function resolveExternalAiMaterialPolicy(
  rules: readonly ExternalAiMaterialRule[],
  items: readonly PlaceableItemDefinition[],
): readonly ExternalAiMaterialPolicyEntry[] {
  const normalized = normalizeExternalAiMaterialRules(rules, items);
  return normalized.map((rule) => {
    const item = items.find((candidate) => candidate.itemId === rule.targetId || candidate.concreteBlockIds.includes(rule.targetId));
    if (!item) {
      return { ...rule, blockIds: [rule.targetId], sourceId: rule.targetId.split(':')[0], available: false };
    }
    return {
      ...rule,
      targetId: item.itemId,
      blockIds: [...new Set(item.concreteBlockIds)].sort(),
      sourceId: item.sourceId ?? item.namespace,
      displayName: item.displayName,
      available: true,
    };
  });
}

export function isMaterialRuleForAvailableContent(entry: ExternalAiMaterialPolicyEntry, availableSourceIds: ReadonlySet<string>): boolean {
  if (!entry.available) return entry.targetId.startsWith('minecraft:');
  if (entry.targetId.startsWith('minecraft:')) return true;
  return !!entry.sourceId && availableSourceIds.has(entry.sourceId);
}
