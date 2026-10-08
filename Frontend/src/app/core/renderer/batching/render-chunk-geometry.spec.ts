import { describe, expect, it } from 'vitest';
import { renderChunkBounds, renderChunkKey, unitVoxelEnvelope } from './render-chunk-geometry';

describe('render chunk geometry', () => {
  it('uses floor-based chunks for negative coordinates', () => {
    expect(renderChunkKey({ x: -1, y: 16, z: 31 })).toBe('-1,1,1');
  });

  it('keeps the voxel envelope and translates stable chunk bounds', () => {
    const envelope = unitVoxelEnvelope();
    expect(envelope.min.toArray()).toEqual([0, 0, 0]);
    expect(envelope.max.toArray()).toEqual([1, 1, 1]);
    const bounds = renderChunkBounds('1,2,3', envelope);
    expect(bounds.min.toArray()).toEqual([16, 32, 48]);
    expect(bounds.max.toArray()).toEqual([32, 48, 64]);
  });
});
