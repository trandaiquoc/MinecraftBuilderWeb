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

// Verified vanilla pillar families. Placement consumes this contract instead
// of branching on individual registry IDs in the rule engine.
const VERIFIED_PILLAR_IDS = new Set([
  'minecraft:oak_log', 'minecraft:spruce_log', 'minecraft:birch_log', 'minecraft:jungle_log',
  'minecraft:acacia_log', 'minecraft:dark_oak_log', 'minecraft:mangrove_log', 'minecraft:cherry_log',
  'minecraft:crimson_stem', 'minecraft:warped_stem', 'minecraft:bamboo_block',
  'minecraft:oak_wood', 'minecraft:spruce_wood', 'minecraft:birch_wood', 'minecraft:jungle_wood',
  'minecraft:acacia_wood', 'minecraft:dark_oak_wood', 'minecraft:mangrove_wood', 'minecraft:cherry_wood',
  'minecraft:crimson_hyphae', 'minecraft:warped_hyphae',
  'minecraft:stripped_oak_log', 'minecraft:stripped_spruce_log', 'minecraft:stripped_birch_log', 'minecraft:stripped_jungle_log',
  'minecraft:stripped_acacia_log', 'minecraft:stripped_dark_oak_log', 'minecraft:stripped_mangrove_log', 'minecraft:stripped_cherry_log',
  'minecraft:stripped_crimson_stem', 'minecraft:stripped_warped_stem', 'minecraft:stripped_oak_wood', 'minecraft:stripped_spruce_wood',
  'minecraft:stripped_birch_wood', 'minecraft:stripped_jungle_wood', 'minecraft:stripped_acacia_wood', 'minecraft:stripped_dark_oak_wood',
  'minecraft:stripped_mangrove_wood', 'minecraft:stripped_cherry_wood', 'minecraft:stripped_crimson_hyphae', 'minecraft:stripped_warped_hyphae',
]);

export function verifiedVanillaCapabilityProfile(id: string): readonly BlockCapability[] {
  if (VERIFIED_SHELF_IDS.has(id)) return [{ kind: 'item-storage-display', slotCount: 3, evidence: 'verified' }];
  if (VERIFIED_STORAGE_ONLY_IDS.has(id)) return [{ kind: 'inventory-storage', evidence: 'verified' }];
  if (VERIFIED_PILLAR_IDS.has(id)) return [
    { kind: 'direct-placement', evidence: 'verified' },
    { kind: 'axis-oriented', axisProperty: 'axis', evidence: 'verified' },
  ];
  return [];
}

export function isVerifiedVanillaShelf(id: string): boolean { return VERIFIED_SHELF_IDS.has(id); }
