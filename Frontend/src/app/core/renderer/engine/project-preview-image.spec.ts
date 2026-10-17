import { describe, expect, it } from 'vitest';
import { flipRenderTargetPixelsVertically } from './project-preview-image';

describe('flipRenderTargetPixelsVertically', () => {
  it('reverses RGBA rows without changing pixel order within a row', () => {
    const pixels = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    expect([...flipRenderTargetPixelsVertically(pixels, 2, 2)]).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});
