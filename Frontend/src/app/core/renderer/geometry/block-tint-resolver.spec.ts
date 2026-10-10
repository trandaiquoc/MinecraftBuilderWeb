import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  grassColormapSampleCoordinate,
  isGrassTintBlock,
  sampleGrassColormap,
  tintColorForFace,
} from './block-tint-resolver';

describe('block tint resolver', () => {
  it('applies grass tint only to tintindexed vanilla grass faces', () => {
    const grass = 0x79c05a;
    expect(tintColorForFace('minecraft:grass_block', 0, grass)).toBe(grass);
    expect(tintColorForFace('minecraft:short_grass', 0, grass)).toBe(grass);
    expect(tintColorForFace('minecraft:tall_grass', 0, grass)).toBe(grass);
    expect(tintColorForFace('minecraft:grass_block', undefined, grass)).toBeUndefined();
    expect(tintColorForFace('minecraft:stone', 0, grass)).toBeUndefined();
    expect(isGrassTintBlock('minecraft:tall_grass')).toBe(true);
    expect(grassColormapSampleCoordinate(256, 256)).toEqual([127, 127]);
  });

  it('samples the vanilla default grass pixel from the colormap image data', () => {
    const data = new Uint8Array(256 * 256 * 4);
    data.set([0x72, 0xb8, 0x55, 0xff], (127 * 256 + 127) * 4);
    expect(sampleGrassColormap(new THREE.Texture({ width: 256, height: 256, data }))).toBe(
      0x72b855,
    );
  });
});
