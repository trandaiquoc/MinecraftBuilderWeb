import { describe, expect, it } from 'vitest';
import { B5JsonObject, B5RuntimeDiagnosticsService } from './b5-runtime-diagnostics.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { HistoryService } from '../history/history.service';

describe('B5 runtime diagnostics', () => {
  it('keeps bounded keyboard/lifecycle/frame evidence and JSON-safe values', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    const circular: Record<string, unknown> = {}; circular['self'] = circular;
    diagnostics.setContext({ shellActions: ['move-forward'], circular });
    diagnostics.recordKeyboard({ type: 'keydown', repeat: true, before: { shellActions: ['move-forward'], engineActions: [] }, after: { shellActions: [], engineActions: ['move-forward'] }, circular });
    diagnostics.recordLifecycle({ type: 'window.blur' });
    diagnostics.recordMovementFrame({ timestamp: 1, selectedBlock: { key: '1,2,3' } });
    const snapshot = diagnostics.snapshot();
    expect(snapshot.keyboard[0]['circular']).toBeTypeOf('object');
    expect(JSON.stringify(snapshot)).toContain('[Circular]');
    expect(snapshot.lifecycle).toHaveLength(1);
    expect(snapshot.movementFrames).toHaveLength(1);
    expect(snapshot.selectedTrace).toHaveLength(1);
    expect(snapshot.divergences).toHaveLength(1);
  });

  it('reset clears only diagnostic buffers and captures the current baseline', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    diagnostics.setContext({ camera: { x: 1 }, selection: { single: { x: 2, y: 0, z: 3 } } });
    diagnostics.recordKeyboard({ type: 'keyup' });
    const reset = diagnostics.reset();
    expect(reset.keyboard).toHaveLength(0);
    expect(reset.lifecycle).toHaveLength(0);
    expect(reset.movementFrames).toHaveLength(0);
    expect(reset.baseline).toEqual({ camera: { x: 1 }, selection: { single: { x: 2, y: 0, z: 3 } } });
    expect(reset.sequence).toBe(1);
  });

  it('records bounded block-key mutation provenance without dumping project arrays', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    const before = { blocks: [{ position: { x: 1, y: 0, z: 2 } }, { position: { x: 3, y: 0, z: 4 } }] };
    const after = { blocks: [{ position: { x: 1, y: 0, z: 2 } }] };
    diagnostics.recordMutation('history.execute', 'Delete', before, after);
    const mutation = diagnostics.snapshot().mutations[0];
    expect(mutation['beforeBlockCount']).toBe(2);
    expect(mutation['afterBlockCount']).toBe(1);
    expect(mutation['removedCoordinates']).toEqual(['3,0,4']);
    expect(mutation['blocks']).toBeUndefined();
  });

  it('captures the first removal incident once and resets the one-shot checkpoint', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    const before = { id: 'project-1', blocks: [{ id: 'minecraft:stone', kind: 'resolved', position: { x: 1, y: 0, z: 2 }, state: { axis: 'y' } }] };
    const after = { id: 'project-1', blocks: [] };
    diagnostics.observeProject(before);
    diagnostics.reset();
    diagnostics.recordMutation('history.execute', 'Delete', before, after, { operation: 'execute' });
    diagnostics.recordMutation('history.execute', 'Delete again', before, after, { operation: 'execute' });
    const first = diagnostics.snapshot().firstBlockRemovalIncident;
    expect(first).not.toBeNull();
    expect((first?.['mutation'] as B5JsonObject)['historyLabel']).toBe('Delete');
    expect((first?.['mutation'] as B5JsonObject)['stack']).toBeTypeOf('string');
    expect(diagnostics.snapshot().mutations).toHaveLength(2);
    diagnostics.reset();
    expect(diagnostics.snapshot().firstBlockRemovalIncident).toBeNull();
  });

  it('keeps command, pointer and selection-clear evidence bounded and inspectable', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    diagnostics.recordCommand({ type: 'history-command', label: 'Delete' });
    diagnostics.recordPointerLifecycle({ phase: 'pointerup', pointerId: 7, hit: { block: { x: 1, y: 2, z: 3 } } });
    diagnostics.recordSelectionClear('SelectionService.clear', { kind: 'single' }, { kind: 'none' });
    const snapshot = diagnostics.snapshot();
    expect(snapshot.commandExecutions[0]['label']).toBe('Delete');
    expect(snapshot.pointerLifecycle[0]['pointerId']).toBe(7);
    expect(snapshot.firstSelectionClearAfterReset?.['source']).toBe('SelectionService.clear');
    expect(snapshot.firstSelectionClearAfterReset?.['stack']).toBeTypeOf('string');
  });

  it('attributes history execute, undo and redo with their operation sources', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    const workspace = new WorkspaceStateService();
    const history = new HistoryService(workspace);
    const project = { id: 'history-forensics', blocks: [{ id: 'minecraft:stone', kind: 'resolved', position: { x: 0, y: 0, z: 0 }, state: {} }] };
    workspace.project.set(project as never);
    diagnostics.reset();
    expect(history.execute('Delete', (current) => ({ ...current, blocks: [] }))).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(diagnostics.snapshot().mutations.map((entry) => [entry['source'], entry['operation'], entry['historyLabel']])).toEqual([
      ['history.execute', 'execute', 'Delete'], ['history.undo', 'undo', 'Delete'], ['history.redo', 'redo', 'Delete'],
    ]);
  });

  it('flags a block-count decrease that has no tagged writer', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    const before = { id: 'unattributed', blocks: [{ position: { x: 1, y: 0, z: 1 } }, { position: { x: 2, y: 0, z: 1 } }] };
    const after = { id: 'unattributed', blocks: [{ position: { x: 1, y: 0, z: 1 } }] };
    diagnostics.observeProject(before);
    diagnostics.reset();
    diagnostics.observeProject(after, 'workspace.project.signal');
    expect(diagnostics.snapshot().unattributedProjectMutations).toHaveLength(1);
    expect(diagnostics.snapshot().firstBlockRemovalIncident?.['mutation']).toBeTruthy();
  });
});
