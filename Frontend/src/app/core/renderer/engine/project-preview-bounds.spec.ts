import { describe, expect, it } from 'vitest';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { projectPreviewBounds } from './project-preview-bounds';

function block(position: VoxelCoordinate): PlacedBlock {
  return {
    kind: 'resolved',
    id: 'example:block',
    namespace: 'example',
    position,
    state: {},
  };
}

function decoration(anchor: VoxelCoordinate): PlacedDecoration {
  return {
    instanceId: 'frame-1',
    kind: 'item-frame',
    entityTypeId: 'minecraft:item_frame',
    anchor,
    facing: 'north',
  };
}

describe('projectPreviewBounds', () => {
  it('returns no bounds for empty structures', () => {
    expect(projectPreviewBounds({ blocks: [], decorations: [] })).toBeUndefined();
  });

  it('uses complete voxel edges for blocks', () => {
    expect(projectPreviewBounds({ blocks: [block({ x: 2, y: 4, z: 6 })] })).toEqual({
      min: { x: 2, y: 4, z: 6 },
      max: { x: 3, y: 5, z: 7 },
    });
  });

  it('preserves the existing wider framing for decorations', () => {
    expect(
      projectPreviewBounds({ blocks: [], decorations: [decoration({ x: 2, y: 4, z: 6 })] }),
    ).toEqual({
      min: { x: 1, y: 3, z: 5 },
      max: { x: 4, y: 6, z: 8 },
    });
  });

  it('combines block and decoration extents', () => {
    expect(
      projectPreviewBounds({
        blocks: [block({ x: 8, y: 1, z: 3 })],
        decorations: [decoration({ x: -2, y: 4, z: 5 })],
      }),
    ).toEqual({
      min: { x: -3, y: 1, z: 3 },
      max: { x: 9, y: 6, z: 7 },
    });
  });
});
