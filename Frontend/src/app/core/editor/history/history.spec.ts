import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { HistoryService } from './history.service';

describe('history transactions', () => {
  it('stores a local block edit as a delta and applies exact undo/redo', () => {
    const project: ProjectDocument = { schemaVersion: 1, id: 'delta', metadata: { name: 'Delta', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {} }], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
    const workspace = new WorkspaceStateService(); const service = new HistoryService(workspace); workspace.project.set(project);
    const before = project.blocks[0]; const after = { ...before, state: { powered: 'true' } };
    expect(service.executeDelta('state', (_project, runtime) => ({ delta: { updated: [{ before, after }] } }))).toBe(true);
    expect(workspace.project()?.blocks[0].state).toEqual({ powered: 'true' });
    expect(service.undo()).toBe(true); expect(workspace.project()?.blocks[0].state).toEqual({});
    expect(service.redo()).toBe(true); expect(workspace.project()?.blocks[0].state).toEqual({ powered: 'true' });
  });

  it('rejects an out-of-bounds local delta without changing history or runtime', () => {
    const project: ProjectDocument = { schemaVersion: 1, id: 'delta-invalid', metadata: { name: 'Delta', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
    const workspace = new WorkspaceStateService(); const service = new HistoryService(workspace); workspace.project.set(project);
    expect(service.executeDelta('invalid', () => ({ delta: { added: [{ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: -1, y: 0, z: 0 }, state: {} }] } }))).toBe(false);
    expect(service.canUndo()).toBe(false); expect(workspace.runtime.snapshot()).toEqual([]);
  });

  it('keeps a 100k local delta out of the materialization path', () => {
    const blocks = Array.from({ length: 100_000 }, (_, index) => ({ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: index % 100, y: Math.floor(index / 100) % 100, z: Math.floor(index / 10_000) }, state: {} }));
    const project: ProjectDocument = { schemaVersion: 1, id: 'large-delta', metadata: { name: 'Large', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 100, y: 100, z: 100 }, structureMode: 'huge-structure-blocks', blocks, groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .28 } };
    const workspace = new WorkspaceStateService(); const service = new HistoryService(workspace); workspace.project.set(project);
    const target = blocks[77_777]; const updated = { ...target, state: { powered: 'true' } }; workspace.ensureRuntime(project).resetCounters();
    expect(service.executeDelta('large state', () => ({ delta: { updated: [{ before: target, after: updated }] } }))).toBe(true);
    expect(workspace.runtime.iterations).toBe(0); expect(workspace.runtime.get(target.position)?.state['powered']).toBe('true');
    workspace.publishRuntimeDelta({ editorSettings: { ...project.editorSettings, currentY: 4 } });
    expect(workspace.ensureRuntime(workspace.project()).get(target.position)?.state['powered']).toBe('true');
    expect(service.undo()).toBe(true); expect(workspace.runtime.iterations).toBe(0); expect(service.redo()).toBe(true); expect(workspace.runtime.iterations).toBe(0);
  });

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
