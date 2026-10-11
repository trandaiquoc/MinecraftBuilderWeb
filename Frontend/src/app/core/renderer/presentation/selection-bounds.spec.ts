import { describe, expect, it } from 'vitest';
import { selectionBounds, selectionBoxWorldBounds, selectionFocusBounds } from './selection-bounds';

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

  it('converts inclusive voxel bounds to camera-framing world bounds', () => {
    expect(
      selectionBoxWorldBounds({
        min: { x: 1, y: 2, z: 3 },
        max: { x: 4, y: 5, z: 6 },
      }),
    ).toEqual({ min: { x: 1, y: 2, z: 3 }, max: { x: 5, y: 6, z: 7 } });
  });

  it('focuses actual selected bounds before the broader gesture box', () => {
    expect(
      selectionFocusBounds(
        { min: { x: 4, y: 5, z: 6 }, max: { x: 4, y: 5, z: 6 } },
        { min: { x: 0, y: 0, z: 0 }, max: { x: 9, y: 9, z: 9 } },
      ),
    ).toEqual({ min: { x: 4, y: 5, z: 6 }, max: { x: 5, y: 6, z: 7 } });
  });

  it('keeps an empty gesture box available as a camera focus target', () => {
    expect(
      selectionFocusBounds(undefined, {
        min: { x: 0, y: 1, z: 2 },
        max: { x: 3, y: 4, z: 5 },
      }),
    ).toEqual({ min: { x: 0, y: 1, z: 2 }, max: { x: 4, y: 5, z: 6 } });
  });
});
