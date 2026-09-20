import { describe, expect, it } from 'vitest';
import { parseVanillaItemRegistry } from './vanilla-item-registry';

const document = { schemaVersion: 1, minecraftVersion: '1.21.1', source: 'test', items: [
  { id: 'minecraft:diamond' }, { id: 'minecraft:oak_log' }, { id: 'minecraft:water_bucket' },
  { id: 'minecraft:lava_bucket' }, { id: 'minecraft:zombie_spawn_egg' }, { id: 'minecraft:armor_stand' },
  { id: 'minecraft:filled_map' }, { id: 'minecraft:air' },
] } as const;

describe('VanillaItemRegistry', () => {
  it('parses authoritative item IDs without inventing entity IDs', () => {
    const registry = parseVanillaItemRegistry(document);
    expect(registry.get('minecraft:diamond')).toBeDefined();
    expect(registry.get('minecraft:zombie')).toBeUndefined();
    expect(registry.get('minecraft:water')).toBeUndefined();
    expect(registry.get('minecraft:water_bucket')).toBeDefined();
    expect(registry.get('minecraft:air')).toBeDefined();
  });
});
