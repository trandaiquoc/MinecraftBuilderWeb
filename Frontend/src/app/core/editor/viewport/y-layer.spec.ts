import { describe, expect, it } from 'vitest';
import { blocksForLayers, clampLayer, adjacentOccupiedLayer, jumpOccupiedLayer, occupiedLayers, planYLayerProjectionDelta, visibleLayerSet } from './y-layer';
import { PlacedBlock } from '../../domain/project.types';

const blocks: PlacedBlock[] = [
  { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 1, z: 0 }, state: {} },
  { kind: 'missing', id: 'example:block', namespace: 'example', position: { x: 1, y: 3, z: 1 }, state: { mode: 'x' } },
];

describe('Y-layer projection', () => {
  it('navigates occupied layers and clamps current Y', () => {
    expect(occupiedLayers(blocks)).toEqual([1, 3]);
    expect(adjacentOccupiedLayer(2, blocks, -1)).toBe(1);
    expect(adjacentOccupiedLayer(2, blocks, 1)).toBe(3);
    expect(jumpOccupiedLayer(blocks, 2, 'first')).toBe(1);
    expect(jumpOccupiedLayer(blocks, 2, 'last')).toBe(3);
    expect(clampLayer(9, { x: 2, y: 4, z: 2 })).toBe(3);
  });

  it('filters blocks according to visibility mode', () => {
    expect([...visibleLayerSet(2, blocks, 'previous-current-next')]).toEqual([1, 2, 3]);
    expect(blocksForLayers(blocks, 1, 'current-only')).toHaveLength(1);
    expect(blocksForLayers(blocks, 2, 'all-below')).toHaveLength(1);
  });

  it('uses an indexed layer projection without scanning unrelated layers', () => {
    const index = {
      blocksAtY: (y: number) => blocks.filter((block) => block.position.y === y),
      occupiedLayers: () => [1, 3],
      allBlocks: () => blocks,
    };
    expect(occupiedLayers(blocks, index)).toEqual([1, 3]);
    expect(blocksForLayers(blocks, 1, 'all-below', index)).toHaveLength(1);
  });

  it('plans every occupied layer crossed by a non-adjacent all-below jump', () => {
    const index = { blocksAtY: (y: number) => blocks.filter((block) => block.position.y === y), occupiedLayers: () => [1, 3, 5, 10, 20, 40, 79], allBlocks: () => blocks };
    expect(planYLayerProjectionDelta(79, 'all-below', 20, 'all-below', index)).toEqual({ changed: true, changedLayers: [20, 40, 79] });
    expect(planYLayerProjectionDelta(20, 'all-below', 79, 'all-below', index)).toEqual({ changed: true, changedLayers: [20, 40, 79] });
  });

  it('keeps whole-structure role changes bounded to the old and new current layers', () => {
    expect(planYLayerProjectionDelta(20, 'whole-structure', 79, 'whole-structure')).toEqual({ changed: true, changedLayers: [20, 79] });
    expect(planYLayerProjectionDelta(20, 'current-only', 21, 'current-only')).toEqual({ changed: true, changedLayers: [20, 21] });
    expect(planYLayerProjectionDelta(20, 'previous-current-next', 21, 'previous-current-next').changedLayers).toEqual([19, 20, 21, 22]);
  });
});
