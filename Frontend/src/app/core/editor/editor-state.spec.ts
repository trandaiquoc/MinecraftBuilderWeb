import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../blocks/active-block.service';
import { ProjectDocument } from '../domain/project.types';
import { WorkspaceStateService } from '../ui/workspace-state.service';
import { EditorModeService } from './editor-mode.service';
import { SelectionService } from './selection.service';

describe('editor mode state', () => {
  it('does not replace project, Active Block, or selection when switching modes', () => {
    const mode = new EditorModeService();
    const workspace = new WorkspaceStateService();
    const active = new ActiveBlockService();
    const selection = new SelectionService();
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'project-1',
      metadata: { name: 'State test', minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      size: { x: 4, y: 4, z: 4 },
      structureMode: 'vanilla-structure-block',
      blocks: [],
      groups: [],
      editorSettings: { currentY: 2, layerVisibility: 'current-only', referenceLayerOpacity: .3 },
    };
    workspace.project.set(project);
    active.pick({ kind: 'missing', id: 'example:unknown', namespace: 'example', position: { x: 1, y: 2, z: 3 }, state: { facing: 'east' } });
    selection.select({ x: 1, y: 2, z: 3 });

    mode.mode.set('y-layer');
    mode.mode.set('3d');

    expect(workspace.project()).toBe(project);
    expect(active.active()).toEqual({ id: 'example:unknown', state: { facing: 'east' }, support: 'unknown' });
    expect(selection.single()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('keeps Active Block separate from structure selection', () => {
    const active = new ActiveBlockService();
    const selection = new SelectionService();
    selection.select({ x: 4, y: 5, z: 6 });
    active.pick({ kind: 'resolved', id: 'minecraft:oak_stairs', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } });

    expect(active.active()).toEqual({ id: 'minecraft:oak_stairs', state: { facing: 'north' }, support: 'fallback' });
    expect(selection.single()).toEqual({ x: 4, y: 5, z: 6 });

    selection.clearIf({ x: 4, y: 5, z: 6 });
    expect(selection.single()).toBeUndefined();
    expect(active.active()?.state).toEqual({ facing: 'north' });
  });
});
