import { describe, expect, it } from 'vitest';
import blockRegistryDocument from '../../../../../public/assets/vanilla-block-registry-1.21.1.json';
import itemRegistryDocument from '../../../../../public/assets/vanilla-item-registry-1.21.1.json';
import { parseVanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import { parseVanillaItemRegistry } from '../../items/registry/vanilla-item-registry';
import { deriveVanillaInternalBlockIds } from './vanilla-internal-content';

describe('authoritative vanilla internal content producer', () => {
  it('derives internal membership from the checked-in 1.21.1 block/item reports', () => {
    const ids = deriveVanillaInternalBlockIds(
      parseVanillaBlockRegistry(blockRegistryDocument),
      parseVanillaItemRegistry(itemRegistryDocument),
    );
    expect(ids.has('minecraft:potted_torchflower')).toBe(true);
    expect(ids.has('minecraft:torchflower_crop')).toBe(true);
    expect(ids.has('minecraft:oak_wall_sign')).toBe(true);
    expect(ids.has('minecraft:wall_torch')).toBe(true);
    expect(ids.has('minecraft:red_wall_banner')).toBe(true);
    expect(ids.has('minecraft:tube_coral_wall_fan')).toBe(true);
    expect(ids.has('minecraft:water')).toBe(false);
    expect(ids.has('minecraft:piston_head')).toBe(false);
  });

  it('keeps fluid and technical identity outside internal content', () => {
    const blocks = parseVanillaBlockRegistry({
      schemaVersion: 1,
      minecraftVersion: '1.21.1',
      source: 'test',
      blocks: [
        { id: 'minecraft:potted_torchflower', properties: [], defaultState: {} },
        {
          id: 'minecraft:water',
          properties: [{ name: 'level', values: ['0'] }],
          defaultState: { level: '0' },
        },
        { id: 'minecraft:piston_head', properties: [], defaultState: {} },
      ],
    });
    const items = parseVanillaItemRegistry({
      schemaVersion: 1,
      minecraftVersion: '1.21.1',
      source: 'test',
      items: [],
    });
    const ids = deriveVanillaInternalBlockIds(blocks, items);
    expect(ids).toEqual(new Set(['minecraft:potted_torchflower']));
  });
});
