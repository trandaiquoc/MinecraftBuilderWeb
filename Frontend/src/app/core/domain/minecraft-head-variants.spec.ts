import { describe, expect, it } from 'vitest';
import { MINECRAFT_HEAD_VARIANTS } from './minecraft-head-variants';

describe('Minecraft head block variants', () => {
  it('keeps standing and wall heads paired for the vanilla placement catalog', () => {
    expect(MINECRAFT_HEAD_VARIANTS).toEqual([
      ['skeleton_skull', 'skeleton_wall_skull'],
      ['wither_skeleton_skull', 'wither_skeleton_wall_skull'],
      ['zombie_head', 'zombie_wall_head'],
      ['creeper_head', 'creeper_wall_head'],
      ['piglin_head', 'piglin_wall_head'],
      ['player_head', 'player_wall_head'],
      ['dragon_head', 'dragon_wall_head'],
    ]);
  });
});
