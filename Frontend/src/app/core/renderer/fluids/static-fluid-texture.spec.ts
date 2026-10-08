import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { staticFluidTextureView } from './static-fluid-texture';

describe('static fluid texture view', () => {
  it('uses one nearest-filtered frame from an animated fluid strip without mutating the cache texture', () => {
    const source = new THREE.Texture(); source.image = { width: 16, height: 64 } as never;
    const view = staticFluidTextureView(source, { animation: { frames: [{ index: 1 }], height: 16 } });
    expect(view).not.toBe(source); expect(view.repeat.y).toBeCloseTo(.25); expect(view.offset.y).toBeCloseTo(.5);
    expect(view.magFilter).toBe(THREE.NearestFilter); expect(view.minFilter).toBe(THREE.NearestFilter); expect(source.repeat.y).toBe(1);
  });
});
