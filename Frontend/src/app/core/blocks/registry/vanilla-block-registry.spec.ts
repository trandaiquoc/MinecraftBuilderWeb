import { describe, expect, it } from 'vitest';
import { parseVanillaBlockRegistry, VANILLA_BLOCK_REGISTRY_URL } from './vanilla-block-registry';
import registryDocument from '../../../../../public/assets/vanilla-block-registry-1.21.1.json';
import { VANILLA_ASSET_VERSION } from '../../assets/vanilla/vanilla-asset-version';

describe('authoritative vanilla block registry', () => {
  it('uses the packaged Vanilla asset version for its URL and parsed metadata', () => {
    expect(VANILLA_BLOCK_REGISTRY_URL).toBe(
      `assets/vanilla-block-registry-${VANILLA_ASSET_VERSION}.json`,
    );
    expect(parseVanillaBlockRegistry(registryDocument).document.minecraftVersion).toBe(
      VANILLA_ASSET_VERSION,
    );
  });

  it('contains every 1.21.1 block report entry with a complete default state', () => {
    const registry = parseVanillaBlockRegistry(registryDocument);
    expect(registry.all()).toHaveLength(1060);
    expect(
      registry
        .all()
        .every((entry) =>
          entry.properties.every((property) =>
            property.values.includes(entry.defaultState[property.name]),
          ),
        ),
    ).toBe(true);
  });

  it('preserves authoritative representative properties and defaults', () => {
    const registry = parseVanillaBlockRegistry(registryDocument);
    expect(registry.get('minecraft:stone')).toMatchObject({ defaultState: {}, properties: [] });
    expect(registry.get('minecraft:stone_slab')).toMatchObject({
      defaultState: { type: 'bottom', waterlogged: 'false' },
    });
    expect(
      registry
        .get('minecraft:andesite_slab')
        ?.properties.find((property) => property.name === 'type')?.values,
    ).toEqual(['top', 'bottom', 'double']);
    expect(registry.get('minecraft:oak_stairs')?.defaultState).toMatchObject({
      facing: 'north',
      half: 'bottom',
      shape: 'straight',
      waterlogged: 'false',
    });
    expect(registry.get('minecraft:oak_log')?.defaultState).toEqual({ axis: 'y' });
    expect(registry.get('minecraft:lantern')?.defaultState).toEqual({
      hanging: 'false',
      waterlogged: 'false',
    });
    expect(registry.get('minecraft:chain')?.defaultState).toEqual({
      axis: 'y',
      waterlogged: 'false',
    });
  });

  it('rejects missing or multiple authoritative defaults instead of guessing', () => {
    expect(() =>
      parseVanillaBlockRegistry({
        schemaVersion: 1,
        minecraftVersion: '1.21.1',
        source: 'test',
        blocks: [
          {
            id: 'minecraft:test',
            properties: [{ name: 'mode', values: ['a', 'b'] }],
            defaultState: {},
          },
        ],
      }),
    ).toThrow('Missing authoritative default');
  });
});
