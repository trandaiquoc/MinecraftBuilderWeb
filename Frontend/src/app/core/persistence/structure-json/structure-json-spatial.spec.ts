import { describe, expect, it } from 'vitest';
import { buildDecorationSpatialIndex, buildStructureImportSpatialContext, queryDecorationSpatialIndex } from './structure-json-spatial';
import type { PlacedBlock } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';

function block(x: number, y = 0, z = 0): PlacedBlock {
  return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} };
}

function frame(instanceId: string, x: number, y = 0, z = 0): PlacedDecoration {
  return { instanceId, kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x, y, z }, facing: 'north', rotation: 0, invisible: false, fixed: false, itemDropChance: 1 };
}

describe('structure import spatial indexes', () => {
  it('indexes block occupancy and deduplicates decoration candidates', () => {
    const context = buildStructureImportSpatialContext([block(4)], [frame('frame-1', 4)]);
    expect(context.occupiedCoordinates.has('4,0,0')).toBe(true);
    const candidates = queryDecorationSpatialIndex(context.decorations, { min: { x: 3.9, y: 0, z: 0 }, max: { x: 5, y: 1, z: 1 } });
    expect(candidates.map((entry) => entry.decoration.instanceId)).toEqual(['frame-1']);
  });

  it.each([5_000, 10_000, 20_000])('scales indexed lookup for %s blocks without scanning all entries', (count) => {
    const blocks = Array.from({ length: count }, (_, index) => block(index % 200, Math.floor(index / 200), 0));
    const decorations = Array.from({ length: Math.floor(count / 4) }, (_, index) => frame(`frame-${index}`, index % 200, Math.floor(index / 200), 1));
    const context = buildStructureImportSpatialContext(blocks, decorations);
    const candidates = queryDecorationSpatialIndex(context.decorations, { min: { x: 20, y: 10, z: 0 }, max: { x: 21, y: 11, z: 1 } });
    expect(context.blockByCoordinate.size).toBe(count);
    expect(candidates.length).toBeLessThanOrEqual(1);
  });

  it.each([1_000, 5_000])('keeps decoration overlap candidates local for %s decorations', (count) => {
    const decorations = Array.from({ length: count }, (_, index) => frame(`decoration-${index}`, index % 200, Math.floor(index / 200), 1));
    const index = buildDecorationSpatialIndex(decorations);
    const candidates = queryDecorationSpatialIndex(index, { min: { x: 42, y: 3, z: 0 }, max: { x: 43, y: 4, z: 1 } });
    expect(candidates.length).toBeLessThanOrEqual(1);
    expect(index.byCell.size).toBeGreaterThan(0);
  });
});
