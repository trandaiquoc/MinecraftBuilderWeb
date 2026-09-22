import type { BlockCapability } from './block-capability.types';

/**
 * Verified target contract for the 26.3 Vanilla Shelf family. The exact IDs
 * come from the downloaded official resource set; this is deliberately an
 * allow-list, not a suffix/name heuristic for modded blocks.
 */
const VERIFIED_SHELF_IDS = new Set([
  'minecraft:acacia_shelf', 'minecraft:bamboo_shelf', 'minecraft:birch_shelf',
  'minecraft:cherry_shelf', 'minecraft:crimson_shelf', 'minecraft:dark_oak_shelf',
  'minecraft:jungle_shelf', 'minecraft:mangrove_shelf', 'minecraft:oak_shelf',
  'minecraft:pale_oak_shelf', 'minecraft:poplar_shelf', 'minecraft:spruce_shelf',
  'minecraft:warped_shelf',
]);

const VERIFIED_STORAGE_ONLY_IDS = new Set([
  'minecraft:chest', 'minecraft:barrel', 'minecraft:hopper', 'minecraft:furnace',
]);

export function verifiedVanillaCapabilityProfile(id: string): readonly BlockCapability[] {
  if (VERIFIED_SHELF_IDS.has(id)) return [{ kind: 'item-storage-display', slotCount: 3, evidence: 'verified' }];
  if (VERIFIED_STORAGE_ONLY_IDS.has(id)) return [{ kind: 'inventory-storage', evidence: 'verified' }];
  return [];
}

export function isVerifiedVanillaShelf(id: string): boolean { return VERIFIED_SHELF_IDS.has(id); }
