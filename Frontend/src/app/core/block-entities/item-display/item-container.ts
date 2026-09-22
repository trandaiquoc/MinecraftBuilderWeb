import { normalizeItemStack } from '../../items/item-stack.types';
import type { ItemStackData } from '../../items/item-stack.types';

export type ItemHostKind = 'item-display' | 'item-storage-display';

export interface ItemSlotData {
  readonly slot: number;
  readonly stack?: ItemStackData;
}

export interface ItemContainerBlockEntityData {
  readonly kind: 'item-container';
  readonly hostKind: ItemHostKind;
  readonly slots: readonly ItemSlotData[];
  /** Unknown imported fields survive known slot edits. */
  readonly raw?: Readonly<Record<string, unknown>>;
}

export function defaultItemContainerData(hostKind: ItemHostKind, slotCount: number): ItemContainerBlockEntityData {
  return { kind: 'item-container', hostKind, slots: emptySlots(slotCount) };
}

export function itemContainerData(value: unknown, hostKind: ItemHostKind, slotCount: number): ItemContainerBlockEntityData {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
  const current = Array.isArray(source?.['slots']) ? source['slots'] : [];
  const bySlot = new Map<number, ItemStackData | undefined>();
  for (const entry of current) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Readonly<Record<string, unknown>>;
    const slot = typeof record['slot'] === 'number' ? record['slot'] : Number(record['slot']);
    if (Number.isInteger(slot) && slot >= 0 && slot < slotCount) bySlot.set(slot, normalizeItemStack(record['stack']));
  }
  const slots = Array.from({ length: slotCount }, (_, slot) => ({ slot, ...(bySlot.get(slot) ? { stack: bySlot.get(slot) } : {}) }));
  const nestedRaw = source?.['raw'];
  const raw = nestedRaw && typeof nestedRaw === 'object' && !Array.isArray(nestedRaw) ? nestedRaw : source;
  return {
    kind: 'item-container',
    hostKind,
    slots,
    ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? { raw: raw as Readonly<Record<string, unknown>> } : {}),
  };
}

export function setItemContainerSlot(value: unknown, hostKind: ItemHostKind, slotCount: number, slot: number, stack: ItemStackData | undefined): ItemContainerBlockEntityData {
  const current = itemContainerData(value, hostKind, slotCount);
  return { ...current, slots: current.slots.map((entry) => entry.slot === slot ? { slot, ...(stack ? { stack } : {}) } : entry) };
}

function emptySlots(slotCount: number): readonly ItemSlotData[] { return Array.from({ length: slotCount }, (_, slot) => ({ slot })); }
