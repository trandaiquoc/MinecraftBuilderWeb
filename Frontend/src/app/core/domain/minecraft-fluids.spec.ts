import { describe, expect, it } from 'vitest';
import {
  isMinecraftFluidBlockId,
  MINECRAFT_FLUID_BLOCK_IDS,
  minecraftFluidKindForBlockId,
} from './minecraft-fluids';

describe('Minecraft fluid block identities', () => {
  it('maps only Vanilla water and lava blocks to their fluid kinds', () => {
    expect(MINECRAFT_FLUID_BLOCK_IDS).toEqual({
      water: 'minecraft:water',
      lava: 'minecraft:lava',
    });
    expect(minecraftFluidKindForBlockId('minecraft:water')).toBe('water');
    expect(minecraftFluidKindForBlockId('minecraft:lava')).toBe('lava');
    expect(minecraftFluidKindForBlockId('example:water')).toBeUndefined();
    expect(isMinecraftFluidBlockId('minecraft:water')).toBe(true);
    expect(isMinecraftFluidBlockId('minecraft:glass')).toBe(false);
  });
});
