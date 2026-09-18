import { describe, expect, it } from 'vitest';
import { cameraBoundsCenter, cameraDistanceForBounds, projectCameraBounds, selectedVoxelCenter, structureCameraBounds } from './camera';

describe('camera framing', () => {
  it('uses project bounds when there are no placed blocks', () => {
    const bounds = projectCameraBounds({ x: 20, y: 10, z: 30 });
    expect(cameraBoundsCenter(bounds)).toEqual({ x: 10, y: 5, z: 15 });
    expect(cameraDistanceForBounds(bounds, 45, 1.6)).toBeGreaterThan(0);
  });

  it('calculates placed-block bounds and selected voxel center', () => {
    const bounds = structureCameraBounds([
      { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 2, y: 3, z: 4 }, state: {} },
      { kind: 'missing', id: 'example:block', namespace: 'example', position: { x: 6, y: 1, z: 8 }, state: {} },
    ]);
    expect(bounds).toEqual({ min: { x: 2, y: 1, z: 4 }, max: { x: 7, y: 4, z: 9 } });
    expect(selectedVoxelCenter({ x: 6, y: 1, z: 8 })).toEqual({ x: 6.5, y: 1.5, z: 8.5 });
  });
});
