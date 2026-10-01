import { describe, expect, it } from 'vitest';
import registryDocument from '../../../../../public/assets/vanilla-item-registry-1.21.1.json';
import { parseVanillaItemRegistry } from './vanilla-item-registry';

const document = { schemaVersion: 1, minecraftVersion: '1.21.1', source: 'test', items: [
  { id: 'minecraft:diamond' }, { id: 'minecraft:oak_log' },
  { id: 'minecraft:lava_bucket' }, { id: 'minecraft:zombie_spawn_egg' }, { id: 'minecraft:armor_stand' },
  { id: 'minecraft:water_bucket', defaultComponents: { 'minecraft:max_stack_size': 1 } }, { id: 'minecraft:oak_sign', defaultComponents: { 'minecraft:max_stack_size': 16 } }, { id: 'minecraft:air', defaultComponents: { 'minecraft:max_stack_size': 64 } },
] } as const;

describe('VanillaItemRegistry', () => {
  it('parses authoritative item IDs without inventing entity IDs', () => {
    const registry = parseVanillaItemRegistry(document);
    expect(registry.get('minecraft:diamond')).toBeDefined();
    expect(registry.get('minecraft:zombie')).toBeUndefined();
    expect(registry.get('minecraft:water')).toBeUndefined();
    expect(registry.get('minecraft:water_bucket')).toBeDefined();
    expect(registry.get('minecraft:air')).toBeDefined();
    expect(registry.get('minecraft:water_bucket')?.maxStackSize).toBe(1);
    expect(registry.get('minecraft:oak_sign')?.maxStackSize).toBe(16);
    expect(registry.get('minecraft:air')?.maxStackSize).toBe(64);
  });

  it('matches the checked-in 1.21.1 registry evidence for max stack categories', () => {
    const registry = parseVanillaItemRegistry(registryDocument);
    expect(registry.get('minecraft:water_bucket')?.maxStackSize).toBe(1);
    expect(registry.get('minecraft:oak_sign')?.maxStackSize).toBe(16);
    expect(registry.get('minecraft:diamond')?.maxStackSize).toBe(64);
  });
});
