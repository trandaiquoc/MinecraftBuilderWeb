import { describe, expect, it } from 'vitest';
import { dirtyTerrainChunkKeys } from './chunk-dirty-tracker';

describe('terrain chunk dirty tracker', () => {
  it('keeps an interior edit local', () => {
    expect([...dirtyTerrainChunkKeys([{ x: 5, y: 5, z: 5 }])]).toEqual(['0,0,0']);
  });

  it('marks only the direct shared-face neighbor at a boundary', () => {
    expect([...dirtyTerrainChunkKeys([{ x: 15, y: 15, z: 15 }])]).toEqual(expect.arrayContaining(['0,0,0', '1,0,0', '0,1,0', '0,0,1']));
    expect([...dirtyTerrainChunkKeys([{ x: 15, y: 15, z: 15 }])]).toHaveLength(4);
  });
});
