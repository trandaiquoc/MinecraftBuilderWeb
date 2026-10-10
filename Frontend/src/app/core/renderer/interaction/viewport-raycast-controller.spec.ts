import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ViewportRaycastController } from './viewport-raycast-controller';

describe('ViewportRaycastController', () => {
  it('records bounded DDA work and delegates translucent candidates to precise picking', () => {
    const record = vi.fn();
    const controller = new ViewportRaycastController(new THREE.Raycaster(), {
      classify: () => 'fallback',
      objectsForVoxel: () => [],
      isPreciseHit: () => false,
      record,
    });
    const result = controller.pick(
      new THREE.Ray(new THREE.Vector3(0.5, 0.5, -2), new THREE.Vector3(0, 0, 1)),
      { x: 4, y: 4, z: 4 },
    );
    expect(result).toBeUndefined();
    expect(record).toHaveBeenCalledWith('ddaPickCount');
  });
});
