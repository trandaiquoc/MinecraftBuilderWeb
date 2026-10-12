import { describe, expect, it } from 'vitest';
import { isMinecraftDyeColor, MINECRAFT_DYE_COLORS } from './minecraft-dye-colors';

describe('Minecraft dye color contract', () => {
  it('contains the canonical sixteen colors in registry-family order', () => {
    expect(MINECRAFT_DYE_COLORS).toEqual([
      'white',
      'orange',
      'magenta',
      'light_blue',
      'yellow',
      'lime',
      'pink',
      'gray',
      'light_gray',
      'cyan',
      'purple',
      'blue',
      'brown',
      'green',
      'red',
      'black',
    ]);
    expect(isMinecraftDyeColor('red')).toBe(true);
    expect(isMinecraftDyeColor('straw')).toBe(false);
  });
});
