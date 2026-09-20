import { describe, expect, it } from 'vitest';
import { clampVoxelBox, normalizeVoxelBox, voxelBoxSize, voxelInBox } from './selection';

describe('voxel box selection', () => {
  it('normalizes inclusive integer corners and counts its size', () => {
    const box = normalizeVoxelBox({ x: 4.8, y: 3.2, z: 8.9 }, { x: 1.1, y: 5.7, z: 2.4 });
    expect(box).toEqual({ min: { x: 1, y: 3, z: 2 }, max: { x: 4, y: 5, z: 8 } });
    expect(voxelBoxSize(box)).toEqual({ x: 4, y: 3, z: 7 });
    expect(voxelInBox({ x: 4, y: 5, z: 8 }, box)).toBe(true);
  });

  it('clamps box bounds to project dimensions', () => {
    expect(clampVoxelBox(normalizeVoxelBox({ x: -3, y: 1, z: 2 }, { x: 8, y: 9, z: 20 }), { x: 4, y: 5, z: 6 })).toEqual({ min: { x: 0, y: 1, z: 2 }, max: { x: 3, y: 4, z: 5 } });
  });
});
