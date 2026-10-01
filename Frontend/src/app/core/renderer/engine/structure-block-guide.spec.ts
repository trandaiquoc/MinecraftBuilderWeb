import { describe, expect, it } from 'vitest';
import { structureBlockGuideCenter, structureBlockGuidePosition } from './structure-block-guide';

describe('Structure Block guide position', () => {
  it('places the guide one voxel outside the minimum X/Z corner', () => {
    expect(structureBlockGuidePosition({ x: 0, y: 0, z: 0 })).toEqual({ x: -1, y: 0, z: -1 });
    expect(structureBlockGuidePosition({ x: 4, y: 2, z: 7 })).toEqual({ x: 3, y: 2, z: 6 });
  });

  it('keeps the guide center stable in voxel coordinates', () => {
    const position = structureBlockGuidePosition({ x: 0, y: 0, z: 0 });
    expect(position).toEqual({ x: -1, y: 0, z: -1 });
    expect(structureBlockGuideCenter(position)).toEqual({ x: -.5, y: .5, z: -.5 });
  });
});
