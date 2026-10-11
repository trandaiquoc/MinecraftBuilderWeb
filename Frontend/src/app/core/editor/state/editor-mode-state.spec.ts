import { describe, expect, it } from 'vitest';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { EditorModeService } from './editor-mode.service';
import { SelectionService } from '../selection/selection.service';
import { UiPreferencesService } from '../../ui/preferences/ui-preferences.service';

describe('editor mode state', () => {
  it('does not replace project, Active Block, or selection when switching modes', () => {
    const mode = new EditorModeService();
    const workspace = new WorkspaceStateService();
    const active = new ActiveBlockService();
    const selection = new SelectionService();
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'project-1',
      metadata: {
        name: 'State test',
        minecraftVersion: '1.21.1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      size: { x: 4, y: 4, z: 4 },
      structureMode: 'vanilla-structure-block',
      blocks: [],
      groups: [],
      editorSettings: { currentY: 2, layerVisibility: 'current-only', referenceLayerOpacity: 0.3 },
    };
    workspace.project.set(project);
    active.pick({
      kind: 'missing',
      id: 'example:unknown',
      namespace: 'example',
      position: { x: 1, y: 2, z: 3 },
      state: { facing: 'east' },
    });
    selection.select({ x: 1, y: 2, z: 3 });

    mode.mode.set('y-layer');
    mode.mode.set('3d');

    expect(workspace.project()).toBe(project);
    expect(active.active()).toEqual({
      id: 'example:unknown',
      state: { facing: 'east' },
      support: 'unknown',
    });
    expect(selection.single()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('preserves resolved box selection membership and presentation across 3D/Y-layer switching', () => {
    const mode = new EditorModeService();
    const selection = new SelectionService();
    const block = {
      kind: 'resolved' as const,
      id: 'minecraft:stone',
      namespace: 'minecraft',
      state: {},
    };
    const project: ProjectDocument = {
      schemaVersion: 1,
      id: 'box-selection-mode',
      metadata: {
        name: 'Selection mode test',
        minecraftVersion: '1.21.1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      size: { x: 4, y: 4, z: 4 },
      structureMode: 'vanilla-structure-block',
      blocks: [
        { ...block, position: { x: 1, y: 1, z: 1 } },
        { ...block, position: { x: 2, y: 1, z: 1 } },
      ],
      groups: [],
      editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: 0.3 },
    };
    const box = { min: { x: 1, y: 1, z: 1 }, max: { x: 2, y: 1, z: 1 } };
    selection.selectBoxLogical(box, project, () => undefined);

    mode.mode.set('y-layer');
    expect(selection.count(project)).toBe(2);
    expect(selection.renderState(project).count).toBe(2);
    expect(selection.box()).toEqual(box);
    mode.mode.set('3d');

    expect(selection.selectedBlocks(project).map((entry) => entry.position)).toEqual([
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 1, z: 1 },
    ]);
    expect(selection.renderState(project)).toMatchObject({
      kind: 'box',
      count: 2,
      bounds: { min: { x: 1, y: 1, z: 1 }, max: { x: 2, y: 1, z: 1 } },
    });
  });

  it('keeps Active Block separate from structure selection', () => {
    const active = new ActiveBlockService();
    const selection = new SelectionService();
    selection.select({ x: 4, y: 5, z: 6 });
    active.pick({
      kind: 'resolved',
      id: 'minecraft:oak_stairs',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: { facing: 'north' },
    });

    expect(active.active()).toEqual({
      id: 'minecraft:oak_stairs',
      state: { facing: 'north' },
      support: 'fallback',
    });
    expect(selection.single()).toEqual({ x: 4, y: 5, z: 6 });

    selection.clearIf({ x: 4, y: 5, z: 6 });
    expect(selection.single()).toBeUndefined();
    expect(active.active()?.state).toEqual({ facing: 'north' });
  });

  it('persists the last editor mode through UI preferences', () => {
    localStorage.removeItem('minecraft-builder.ui-preferences');
    const preferences = new UiPreferencesService();
    const mode = new EditorModeService(preferences);
    mode.setMode('y-layer');
    expect(new UiPreferencesService().preferences().editorMode).toBe('y-layer');
    localStorage.removeItem('minecraft-builder.ui-preferences');
  });
});
