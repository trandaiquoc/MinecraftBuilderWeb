import { describe, expect, it } from 'vitest';
import { structureBlockGuideCenter, structureBlockGuidePosition } from './structure-block-guide';

describe('Structure Block guide position', () => {
  it('places the guide one voxel below the structure origin using Relative Position 0 1 0', () => {
    expect(structureBlockGuidePosition({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: -1, z: 0 });
    expect(structureBlockGuidePosition({ x: 4, y: 2, z: 7 })).toEqual({ x: 4, y: 1, z: 7 });
  });

  it('keeps the guide center stable in voxel coordinates', () => {
    const position = structureBlockGuidePosition({ x: 0, y: 0, z: 0 });
    expect(position).toEqual({ x: 0, y: -1, z: 0 });
    expect(structureBlockGuideCenter(position)).toEqual({ x: .5, y: -.5, z: .5 });
  });
});
