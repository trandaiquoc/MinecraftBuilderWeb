import { describe, expect, it } from 'vitest';
import { ProjectDocument, PlacedBlock } from '../../domain/project.types';
import { visibleBlockEntries, visibleBlockKeys } from './visible-blocks';

function project(blocks: readonly PlacedBlock[], groups: ProjectDocument['groups'] = []): ProjectDocument {
  return {
    schemaVersion: 3, id: 'visible-fixture', metadata: { name: 'Visible', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
    size: { x: 32, y: 32, z: 32 }, structureMode: 'vanilla-structure-block', blocks, groups,
    editorSettings: { currentY: 2, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 },
  };
}

const block = (x: number, y: number, z: number, groupIds?: readonly string[]): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {}, groupIds });

describe('authoritative visible block query', () => {
  const blocks = [block(0, 1, 0), block(1, 2, 0, ['hidden']), block(2, 3, 0, ['kept']), { ...block(3, 2, 0), kind: 'missing' as const, id: 'example:unknown', namespace: 'example' }];
  const groups = [
    { id: 'hidden', name: 'Hidden', visible: false, locked: false },
    { id: 'kept', name: 'Kept', visible: true, locked: false },
  ];

  it('uses exact coordinate keys for 3D and whole-structure Y-layer projections', () => {
    const current = project(blocks, groups);
    const threeD = visibleBlockKeys(current);
    const whole = visibleBlockKeys(current, { layerY: 2, visibility: 'whole-structure' });
    expect(whole).toEqual(threeD);
    expect([...threeD].sort()).toEqual(['0,1,0', '2,3,0', '3,2,0']);
  });

  it('applies exact layer subsets after group visibility', () => {
    const current = project(blocks, groups);
    expect([...visibleBlockKeys(current, { layerY: 2, visibility: 'current-only' })]).toEqual(['3,2,0']);
    expect([...visibleBlockKeys(current, { layerY: 2, visibility: 'previous-current-next' })].sort()).toEqual(['0,1,0', '2,3,0', '3,2,0']);
    expect([...visibleBlockKeys(current, { layerY: 2, visibility: 'all-below' })].sort()).toEqual(['0,1,0', '3,2,0']);
  });

  it('applies isolation without changing membership data', () => {
    const current = project(blocks, groups);
    expect(visibleBlockEntries(current, { isolatedGroupId: 'kept', isolatedGroupPositions: [{ x: 2, y: 3, z: 0 }] }).map((entry) => entry.id)).toEqual(['minecraft:stone']);
    expect(current.blocks).toHaveLength(4);
  });

  it('scales to a 20k coordinate set without changing key semantics', () => {
    const many = Array.from({ length: 20_000 }, (_, index) => block(index % 100, Math.floor(index / 100), 0));
    const current = project(many);
    const keys = visibleBlockKeys(current, { layerY: 20, visibility: 'whole-structure' });
    expect(keys.size).toBe(20_000);
  });
});
