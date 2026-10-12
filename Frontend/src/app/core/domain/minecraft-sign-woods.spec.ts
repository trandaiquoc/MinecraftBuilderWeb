import { describe, expect, it } from 'vitest';
import { MINECRAFT_SIGN_WOODS } from './minecraft-sign-woods';

describe('Minecraft sign wood contract', () => {
  it('keeps the vanilla sign families represented by behavior and placement catalogs', () => {
    expect(MINECRAFT_SIGN_WOODS).toEqual([
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
