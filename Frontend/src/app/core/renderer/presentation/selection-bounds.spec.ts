import { describe, expect, it } from 'vitest';
import { selectionBounds } from './selection-bounds';

describe('selection bounds', () => {
  it('returns the minimal inclusive voxel bounds', () => {
    expect(
      selectionBounds([
        { x: 4, y: 2, z: -1 },
        { x: -2, y: 8, z: 5 },
        { x: 1, y: 0, z: 3 },
      ]),
    ).toEqual({
      min: { x: -2, y: 0, z: -1 },
      max: { x: 4, y: 8, z: 5 },
    });
  });

  it('returns no bounds for an empty selection', () => {
    expect(selectionBounds([])).toBeUndefined();
  });
});
