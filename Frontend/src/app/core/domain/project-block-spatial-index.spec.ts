import { describe, expect, it } from 'vitest';
import { ProjectBlockSpatialIndex } from './project-block-spatial-index';
import type { PlacedBlock } from './project.types';

const block = (x: number, y = 0, z = 0): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });

describe('ProjectBlockSpatialIndex', () => {
  it('looks up blocks without changing the source snapshot', () => {
    const blocks = [block(2, 1, 3)];
    const index = new ProjectBlockSpatialIndex(blocks);
    expect(index.get({ x: 2, y: 1, z: 3 })).toBe(blocks[0]);
    expect(index.get({ x: 0, y: 0, z: 0 })).toBeUndefined();
    expect(blocks).toHaveLength(1);
  });
});
