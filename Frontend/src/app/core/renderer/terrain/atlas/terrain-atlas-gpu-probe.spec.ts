import { describe, expect, it } from 'vitest';
import { summarizeTerrainFramebuffer } from './terrain-atlas-gpu-probe';

describe('terrain atlas GPU probe evidence', () => {
  it('summarizes alpha visibility and framebuffer bounds numerically', () => {
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 255, 0, 128,
    ]);
    const result = summarizeTerrainFramebuffer(pixels, 2, 2);
    expect(result.nonTransparentPixels).toBe(2);
    expect(result.alphaMin).toBe(128);
    expect(result.alphaMax).toBe(255);
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(result.checksum).not.toBe(0);
  });

  it('reports an all-transparent framebuffer as invisible', () => {
    const result = summarizeTerrainFramebuffer(new Uint8Array(4 * 4 * 4), 4, 4);
    expect(result.nonTransparentPixels).toBe(0);
    expect(result.alphaMin).toBe(0);
    expect(result.alphaMax).toBe(0);
    expect(result.bounds).toBeUndefined();
  });
});
