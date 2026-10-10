import { describe, expect, it } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import { validateGroupMove } from './group-move-planner';

const project: ProjectDocument = {
  schemaVersion: 2,
  id: 'move-test',
  metadata: { name: 'Move test', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  groups: [{ id: 'g', name: 'Group', visible: true, locked: false }],
  blocks: [
    {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 1, y: 1, z: 1 },
      state: {},
      groupIds: ['g'],
    },
    {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 2, y: 1, z: 1 },
      state: {},
    },
  ],
  decorations: [],
  editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: 0.28 },
};

describe('group move planner', () => {
  it('plans valid translation and rejects collision and bounds before transaction execution', () => {
    expect(validateGroupMove(project, 'g', { x: 0, y: 1, z: 0 })).toMatchObject({
      valid: true,
      positions: [{ x: 1, y: 1, z: 1 }],
    });
    expect(validateGroupMove(project, 'g', { x: 1, y: 0, z: 0 }).reason).toBe('collision');
    expect(validateGroupMove(project, 'g', { x: -2, y: 0, z: 0 }).reason).toBe('bounds');
  });
});
