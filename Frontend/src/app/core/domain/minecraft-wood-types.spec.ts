import { describe, expect, it } from 'vitest';
import { MINECRAFT_WOOD_TYPES } from './minecraft-wood-types';

describe('Minecraft wood type contract', () => {
  it('contains the vanilla wood families used by signs and doors', () => {
    expect(MINECRAFT_WOOD_TYPES).toEqual([
      'oak',
      'spruce',
      'birch',
      'jungle',
      'acacia',
      'dark_oak',
      'mangrove',
      'cherry',
      'bamboo',
      'crimson',
      'warped',
    ]);
  });
});
