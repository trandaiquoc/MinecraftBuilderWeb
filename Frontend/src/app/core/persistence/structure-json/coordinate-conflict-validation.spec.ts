import { describe, expect, it } from 'vitest';
import {
  collectDuplicateCoordinates,
  createCoordinateConflictAccumulator,
  finalizeCoordinateConflicts,
  recordCoordinate,
} from './coordinate-conflict-validation';

describe('Structure JSON coordinate conflict owner', () => {
  it('preserves source order within conflicts and first-seen coordinate ordering', () => {
    const blocks = [
      { id: 'example:first', x: 1, y: 0, z: 0 },
      { id: 'example:other', x: 2, y: 0, z: 0 },
      { id: 'example:second', x: 1, y: 0, z: 0 },
      { id: 'example:third', x: 1, y: 0, z: 0 },
    ];
    const result = collectDuplicateCoordinates(blocks);
    expect([...result.duplicateIndexes]).toEqual([0, 2, 3]);
    expect(result.conflicts).toEqual([
      {
        category: 'duplicate',
        coordinate: { x: 1, y: 0, z: 0 },
        blockIndexes: [0, 2, 3],
        blockIds: ['example:first', 'example:second', 'example:third'],
      },
    ]);
  });

  it('supports cooperative accumulation and finalization with identical semantics', () => {
    const blocks = [
      { id: 'example:a', x: 0, y: 0, z: 0 },
      { id: 'example:b', x: 0, y: 0, z: 0 },
    ];
    const accumulator = createCoordinateConflictAccumulator();
    blocks.forEach((block, index) => recordCoordinate(accumulator, block, index));
    expect(finalizeCoordinateConflicts(accumulator)).toEqual(collectDuplicateCoordinates(blocks));
  });
});
