import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShellComponent } from './editor-shell.component';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { StructureEditorService } from '../../../core/editor/structure/structure-editor.service';
import { HistoryService } from '../../../core/editor/history/history.service';
import { ProjectDocument } from '../../../core/domain/project.types';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'keyboard-shell',
  metadata: { name: 'Keyboard shell', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [
    { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 1, y: 1, z: 1 }, state: {} },
    { kind: 'resolved', id: 'minecraft:dirt', namespace: 'minecraft', position: { x: 2, y: 1, z: 1 }, state: {} },
  ],
  groups: [],
  editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
};

describe('editor shell movement/delete routing', () => {
  beforeEach(async () => {
    installIndexedDbStub();
    await TestBed.configureTestingModule({ imports: [EditorShellComponent] }).compileComponents();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('suppresses delete while movement owns the keyboard, then allows delete after release', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const shell = fixture.componentInstance as unknown as {
      handleEditorShortcut: (event: KeyboardEvent) => void;
      handleEditorKeyup: (event: KeyboardEvent) => void;
    };
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    const editor = TestBed.inject(StructureEditorService);
    const history = TestBed.inject(HistoryService);
    workspace.activate(project, undefined);
    selection.select({ x: 1, y: 1, z: 1 });
    const deleteSelection = vi.spyOn(editor, 'deleteSelection');

    const movementDown = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', cancelable: true });
    shell.handleEditorShortcut(movementDown);
    expect(movementDown.defaultPrevented).toBe(true);
    shell.handleEditorShortcut(new KeyboardEvent('keydown', { key: String.fromCharCode(0x00b7), code: '', cancelable: true }));
    const movementRepeat = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', repeat: true, cancelable: true });
    shell.handleEditorShortcut(movementRepeat);
    expect(movementRepeat.defaultPrevented).toBe(true);
    const deleteDuringMovement = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', cancelable: true });
    shell.handleEditorShortcut(deleteDuringMovement);
    expect(deleteDuringMovement.defaultPrevented).toBe(true);
    expect(deleteSelection).not.toHaveBeenCalled();
    expect(workspace.project()?.blocks).toHaveLength(2);

    shell.handleEditorKeyup(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', cancelable: true }));
    const deleteAfterRelease = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', cancelable: true });
    shell.handleEditorShortcut(deleteAfterRelease);
    expect(deleteAfterRelease.defaultPrevented).toBe(true);
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    expect(workspace.project()?.blocks).toHaveLength(1);
    expect(history.lastLabel()).toBe('Delete selection');

    fixture.destroy();
  });
});

function installIndexedDbStub(): void {
  const database = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction: { objectStore: () => Record<string, () => IDBRequest>; oncomplete: (() => void) | null } = {
        objectStore: () => ({
          getAll: () => request([]), get: () => request(undefined), getKey: () => request(undefined),
          put: () => request(undefined), add: () => request(undefined), delete: () => request(undefined),
        }),
        oncomplete: null,
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', { open: () => request(database) });
}

function request<T>(result: T): IDBRequest<T> {
  const pending = { result, onsuccess: null as ((event: Event) => void) | null, onerror: null as (() => void) | null } as unknown as IDBRequest<T>;
  queueMicrotask(() => pending.onsuccess?.(new Event('success')));
  return pending;
}
