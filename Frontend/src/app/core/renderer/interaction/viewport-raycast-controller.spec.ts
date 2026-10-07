import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ViewportRaycastController } from './viewport-raycast-controller';

describe('ViewportRaycastController', () => {
  it('records bounded DDA work and delegates translucent candidates to precise picking', () => {
    const precise = vi.fn(() => undefined);
    const record = vi.fn();
    const controller = new ViewportRaycastController({ classify: () => 'fallback', precise, record });
    const result = controller.pick(new THREE.Ray(new THREE.Vector3(.5, .5, -2), new THREE.Vector3(0, 0, 1)), { x: 4, y: 4, z: 4 });
    expect(result).toBeUndefined();
    expect(record).toHaveBeenCalledWith('ddaPickCount');
    expect(precise).toHaveBeenCalled();
  });
});
