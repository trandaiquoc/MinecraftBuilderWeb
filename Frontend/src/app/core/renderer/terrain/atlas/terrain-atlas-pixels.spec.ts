import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { copyTerrainPixelsWithGutter, normalizeTerrainPixels, readTerrainTexturePixels } from './terrain-atlas-pixels';

function pixel(data: Uint8Array, width: number, x: number, y: number): number[] { const index = (y * width + x) * 4; return [...data.slice(index, index + 4)]; }

describe('terrain atlas pixels', () => {
  it('preserves asymmetric semantic corners for runtime flipY=true', () => {
    const source = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const texture = new THREE.DataTexture(source, 2, 2, THREE.RGBAFormat);
    texture.flipY = true;
    const read = readTerrainTexturePixels(texture)!;
    expect(pixel(read.data, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(normalizeTerrainPixels(read, true).data, 2, 1, 1)).toEqual([255, 255, 0, 255]);
    texture.dispose();
  });

  it('normalizes flipY=false without mutating source bytes and extrudes all edges', () => {
    const source = { width: 2, height: 2, data: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]) };
    const normalized = normalizeTerrainPixels(source, false);
    expect(pixel(normalized.data, 2, 0, 0)).toEqual([7, 8, 9, 255]);
    expect(pixel(source.data, 2, 0, 0)).toEqual([1, 2, 3, 255]);
    const target = new Uint8Array(6 * 6 * 4);
    copyTerrainPixelsWithGutter(target, 6, { page: 0, x: 2, y: 2, width: 2, height: 2, gutter: 1 }, normalized);
    expect(pixel(target, 6, 1, 1)).toEqual([7, 8, 9, 255]);
    expect(pixel(target, 6, 3, 1)).toEqual([10, 11, 12, 255]);
    expect(pixel(target, 6, 3, 3)).toEqual([4, 5, 6, 255]);
  });
});
