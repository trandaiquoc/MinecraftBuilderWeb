import { describe, expect, it } from 'vitest';
import { VIEWPORT_BOOTSTRAP_SIZE, viewportRenderSize } from './three-viewport-engine';

describe('viewport bootstrap sizing', () => {
  it('keeps a renderable backing buffer while layout is initially zero-sized', () => {
    expect(viewportRenderSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it('adopts the real observed layout size without requiring a window resize', () => {
    expect(viewportRenderSize(1280.4, 719.6)).toEqual({ width: 1280, height: 720 });
  });

  it('provides an asset-independent initial grid frame', () => {
    expect(VIEWPORT_BOOTSTRAP_SIZE).toEqual({ x: 16, y: 16, z: 16 });
  });
});
