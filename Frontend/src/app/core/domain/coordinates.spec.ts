import { describe, expect, it } from 'vitest';
import { coordinateKey, isWithinBounds } from './coordinates';

describe('voxel coordinates', () => {
  it('accepts integer coordinates inside exclusive upper bounds', () => {
    expect(isWithinBounds({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 4 })).toBe(true);
    expect(isWithinBounds({ x: 2, y: 0, z: 0 }, { x: 2, y: 3, z: 4 })).toBe(false);
  });

  it('creates stable coordinate keys', () => {
    expect(coordinateKey({ x: 1, y: 2, z: 3 })).toBe('1,2,3');
  });
});
