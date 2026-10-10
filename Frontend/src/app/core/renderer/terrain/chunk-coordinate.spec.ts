import { describe, expect, it } from 'vitest';
import {
  relevantTerrainChunks,
  terrainChunkBounds,
  terrainChunkKey,
  worldToTerrainChunk,
  worldToTerrainLocal,
} from './chunk-coordinate';

describe('terrain chunk coordinates', () => {
  it('maps positive and negative world voxels to stable chunks and locals', () => {
    expect(worldToTerrainChunk({ x: 15, y: 16, z: -1 })).toEqual({ x: 0, y: 1, z: -1 });
    expect(worldToTerrainLocal({ x: 15, y: 16, z: -1 })).toEqual({ x: 15, y: 0, z: 15 });
    expect(terrainChunkKey({ x: -1, y: 0, z: 2 })).toBe('-1,0,2');
    expect(terrainChunkBounds({ x: 2, y: -1, z: 0 })).toEqual({
      min: { x: 32, y: -16, z: 0 },
      max: { x: 48, y: 0, z: 16 },
    });
  });

  it('enumerates only directly touched neighbor chunks at boundaries', () => {
    expect(new Set(relevantTerrainChunks({ x: 15, y: 0, z: 15 }).map(terrainChunkKey))).toEqual(
      new Set(['0,0,0', '1,0,0', '0,-1,0', '0,0,1']),
    );
  });
});
