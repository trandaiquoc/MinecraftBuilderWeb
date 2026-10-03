import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { HistoryService } from './history.service';

describe('history transactions', () => {
  it('undoes/redoes one logical operation and clears the redo branch', () => {
    const project: ProjectDocument = { schemaVersion: 1, id: 'history', metadata: { name: 'History', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
    const workspace = new WorkspaceStateService(); const service = new HistoryService(workspace);
    workspace.project.set(project);
    expect(service.canUndo()).toBe(false); expect(service.canRedo()).toBe(false);
    expect(service.execute('test', (current) => ({ ...current, editorSettings: { ...current.editorSettings, currentY: 1 } }))).toBe(true);
    expect(service.canUndo()).toBe(true); expect(service.canRedo()).toBe(false);
    expect(workspace.project()?.editorSettings.currentY).toBe(1);
    expect(service.undo()).toBe(true); expect(workspace.project()?.editorSettings.currentY).toBe(0); expect(service.canRedo()).toBe(true);
    expect(service.redo()).toBe(true); expect(workspace.project()?.editorSettings.currentY).toBe(1);
    expect(service.undo()).toBe(true);
    expect(service.execute('branch', (current) => ({ ...current, editorSettings: { ...current.editorSettings, currentY: 2 } }))).toBe(true);
    expect(service.canRedo()).toBe(false);
  });

  it('rejects a mutation that would commit a negative block or decoration coordinate', () => {
    const project: ProjectDocument = { schemaVersion: 1, id: 'invariant', metadata: { name: 'Invariant', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], decorations: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
    const workspace = new WorkspaceStateService(); const service = new HistoryService(workspace); workspace.project.set(project);
    expect(service.execute('negative block', (current) => ({ ...current, blocks: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: -1, y: 0, z: 0 }, state: {} }] }))).toBe(false);
    expect(service.execute('negative decoration', (current) => ({ ...current, decorations: [{ instanceId: 'frame', kind: 'item-frame', entityTypeId: 'minecraft:item_frame', anchor: { x: 0, y: -1, z: 0 }, facing: 'north', fixed: false }] }))).toBe(false);
    expect(workspace.project()).toBe(project); expect(service.canUndo()).toBe(false);
  });
});
