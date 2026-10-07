import type { VanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import { isDecorationEntityId, isTechnicalBlockId } from '../../content/content-classifier';
import type { VanillaItemRegistry } from '../../items/registry/vanilla-item-registry';

/**
 * Vanilla 1.21.1 content-domain evidence at the asset boundary.
 *
 * The authoritative block report contains world blocks while the authoritative
 * item report contains independently obtainable item identities. A Minecraft
 * block with no same-ID item is therefore a concrete/internal world variant,
 * except for fluids whose bucket identity intentionally differs from their
 * world block identity and for the separate technical/decorative domains.
 *
 * This membership is derived once while loading vanilla data. It is not a
 * registry-name heuristic and is never applied to external content.
 */
export function deriveVanillaInternalBlockIds(
  blocks: VanillaBlockRegistry,
  items: VanillaItemRegistry,
): ReadonlySet<string> {
  const itemIds = new Set(items.all().map((entry) => entry.id));
  const internal = new Set<string>();
  for (const block of blocks.all()) {
    if (!block.id.startsWith('minecraft:') || itemIds.has(block.id)) continue;
    if (VANILLA_NON_INTERNAL_WORLD_IDS.has(block.id) || isTechnicalBlockId(block.id) || isDecorationEntityId(block.id)) continue;
    internal.add(block.id);
  }
  return internal;
}

/** Fluid blocks are world identities represented by bucket items, not internal variants. */
const VANILLA_NON_INTERNAL_WORLD_IDS = new Set(['minecraft:water', 'minecraft:lava']);
