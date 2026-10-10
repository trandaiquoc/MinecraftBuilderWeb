import { describe, expect, it } from 'vitest';
import { surfaceFaceNormal, surfaceNeighbor } from './voxel-face-directions';

describe('voxel face directions', () => {
  it('maps each face to its neighboring voxel and outward normal', () => {
    const origin = { x: 4, y: 5, z: 6 };
    const expected = {
      north: [{ x: 4, y: 5, z: 5 }, [0, 0, -1]],
      east: [{ x: 5, y: 5, z: 6 }, [1, 0, 0]],
      south: [{ x: 4, y: 5, z: 7 }, [0, 0, 1]],
      west: [{ x: 3, y: 5, z: 6 }, [-1, 0, 0]],
      up: [{ x: 4, y: 6, z: 6 }, [0, 1, 0]],
      down: [{ x: 4, y: 4, z: 6 }, [0, -1, 0]],
    } as const;
    for (const [face, [neighbor, normal]] of Object.entries(expected) as [
      keyof typeof expected,
      (typeof expected)[keyof typeof expected],
    ][]) {
      expect(surfaceNeighbor(origin, face)).toEqual(neighbor);
      expect(surfaceFaceNormal(face).toArray()).toEqual(normal);
    }
  });
});
