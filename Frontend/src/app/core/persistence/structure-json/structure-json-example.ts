/** Canonical copy-ready Structure JSON example. */

import { STRUCTURE_JSON_FORMAT } from './structure-json-contracts';
import type { StructureJson } from './structure-json-contracts';

export function createStructureJsonExample(): StructureJson {
  return {
    format: STRUCTURE_JSON_FORMAT,
    minecraftVersion: '1.21.1',
    name: 'Example Structure',
    blocks: [
      { id: 'minecraft:stone_bricks', x: 0, y: 0, z: 0 },
      {
        id: 'minecraft:oak_stairs',
        x: 1,
        y: 0,
        z: 0,
        state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' },
      },
      {
        id: 'minecraft:chest',
        x: 0,
        y: 0,
        z: 1,
        blockEntity: { kind: 'container', items: [{ slot: 0, item: { id: 'minecraft:diamond' } }] },
      },
    ],
    decorations: [
      {
        kind: 'painting',
        anchor: { x: 0, y: 1, z: 1 },
        facing: 'north',
        variantId: 'minecraft:kebab',
      },
      {
        kind: 'item-frame',
        anchor: { x: 1, y: 1, z: 1 },
        facing: 'south',
        item: { id: 'minecraft:diamond' },
        rotation: 0,
        invisible: false,
        fixed: false,
        itemDropChance: 1,
      },
    ],
  };
}
