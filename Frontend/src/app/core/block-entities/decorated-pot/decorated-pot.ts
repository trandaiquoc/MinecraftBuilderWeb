import { DecoratedPotBlockEntityData } from '../../domain/project.types';
import { normalizeItemStack, type ItemStackData } from '../../items/item-stack.types';

export const DECORATED_POT_DEFAULT_SHERD = 'minecraft:brick';
export const decoratedPotSherdIds = [
  'minecraft:angler_pottery_sherd', 'minecraft:archer_pottery_sherd', 'minecraft:arms_up_pottery_sherd', 'minecraft:blade_pottery_sherd',
  'minecraft:brewer_pottery_sherd', 'minecraft:burn_pottery_sherd', 'minecraft:danger_pottery_sherd', 'minecraft:explorer_pottery_sherd',
  'minecraft:flow_pottery_sherd', 'minecraft:friend_pottery_sherd', 'minecraft:guster_pottery_sherd', 'minecraft:heart_pottery_sherd',
  'minecraft:heartbreak_pottery_sherd', 'minecraft:howl_pottery_sherd', 'minecraft:miner_pottery_sherd', 'minecraft:mourner_pottery_sherd',
  'minecraft:plenty_pottery_sherd', 'minecraft:prize_pottery_sherd', 'minecraft:scrape_pottery_sherd', 'minecraft:sheaf_pottery_sherd',
  'minecraft:shelter_pottery_sherd', 'minecraft:skull_pottery_sherd', 'minecraft:snort_pottery_sherd',
] as const;
const allowed = new Set<string>([DECORATED_POT_DEFAULT_SHERD, ...decoratedPotSherdIds]);
export function isDecoratedPotSherd(value: unknown): value is string { return typeof value === 'string' && allowed.has(value); }
export function normalizeDecoratedPotSherd(value: unknown): string { return typeof value === 'string' && allowed.has(value) ? value : DECORATED_POT_DEFAULT_SHERD; }
export function defaultDecoratedPotData(): DecoratedPotBlockEntityData {
  const side = DECORATED_POT_DEFAULT_SHERD;
  return { kind: 'decorated-pot', decorations: { back: side, left: side, right: side, front: side } };
}
export function decoratedPotData(value: unknown): DecoratedPotBlockEntityData {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
  const sherds = Array.isArray(raw?.['sherds']) ? raw['sherds'] : [];
  const decorations = raw?.['decorations'] && typeof raw['decorations'] === 'object' ? raw['decorations'] as Readonly<Record<string, unknown>> : sherds.length ? {
    back: sherds[0], left: sherds[1], right: sherds[2], front: sherds[3],
  } : raw;
  const item = normalizeItemStack(raw?.['item']);
  const invalidItem = raw?.['item'] !== undefined && !item;
  const nestedRaw = raw?.['kind'] === 'decorated-pot' && raw['raw'] && typeof raw['raw'] === 'object' ? raw['raw'] as Readonly<Record<string, unknown>> : undefined;
  const preservedRaw = raw?.['kind'] === 'decorated-pot' ? (nestedRaw ?? (invalidItem ? { item: raw['item'] } : undefined)) : raw;
  const result: DecoratedPotBlockEntityData = {
    kind: 'decorated-pot',
    decorations: {
      back: normalizeDecoratedPotSherd(decorations?.['back']), left: normalizeDecoratedPotSherd(decorations?.['left']),
      right: normalizeDecoratedPotSherd(decorations?.['right']), front: normalizeDecoratedPotSherd(decorations?.['front']),
    },
    ...(preservedRaw ? { raw: preservedRaw } : {}),
    ...(item ? { item: item as ItemStackData } : {}),
  };
  return result;
}

export interface MinecraftDecoratedPotBlockEntityNbt { readonly id: 'minecraft:decorated_pot'; readonly sherds?: readonly string[]; readonly item?: ItemStackData; }
export function toMinecraftDecoratedPotBlockEntityNbt(data: DecoratedPotBlockEntityData | unknown): MinecraftDecoratedPotBlockEntityNbt {
  const normalized = decoratedPotData(data);
  const decorations = normalized.decorations;
  const values = [decorations.back, decorations.left, decorations.right, decorations.front].map(normalizeDecoratedPotSherd);
  const item = normalized.item;
  return { id: 'minecraft:decorated_pot', ...(values.every((value) => value === DECORATED_POT_DEFAULT_SHERD) ? {} : { sherds: values }), ...(item ? { item } : {}) };
}
