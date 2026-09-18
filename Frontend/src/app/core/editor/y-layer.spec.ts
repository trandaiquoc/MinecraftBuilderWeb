import { describe, expect, it } from 'vitest';
import { blocksForLayers, clampLayer, adjacentOccupiedLayer, jumpOccupiedLayer, occupiedLayers, visibleLayerSet } from './y-layer';
import { PlacedBlock } from '../domain/project.types';

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
});
