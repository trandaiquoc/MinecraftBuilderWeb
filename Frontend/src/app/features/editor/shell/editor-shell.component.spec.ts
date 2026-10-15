import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShellComponent, hasEditorSelectionState } from './editor-shell.component';
import { AMBIGUOUS_RELEASE_GRACE_MS } from '../../../core/editor/input/editor-movement-input-session';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { StructureEditorService } from '../../../core/editor/structure/structure-editor.service';
import { HistoryService } from '../../../core/editor/history/history.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { EditorModeService } from '../../../core/editor/state/editor-mode.service';
import { EditorToolService } from '../../../core/editor/state/tool.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import { IndexedDbProjectStore } from '../../../core/persistence/project-store/indexeddb-project-store';
import { PROJECT_STORE } from '../../../core/persistence/project-store/project-store.token';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { ProjectDeletionService } from '../../../core/persistence/project-deletion.service';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ThreeViewportEngine } from '../../../core/renderer/engine/three-viewport-engine';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'keyboard-shell',
  metadata: { name: 'Keyboard shell', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [
    {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 1, y: 1, z: 1 },
      state: {},
    },
    {
      kind: 'resolved',
      id: 'minecraft:dirt',
      namespace: 'minecraft',
      position: { x: 2, y: 1, z: 1 },
      state: {},
    },
  ],
  groups: [],
  editorSettings: { currentY: 1, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
};

@Component({ selector: 'test-viewport', template: '' })
class TestViewportStub {
  static created = 0;
  static destroyed = 0;
  readonly viewportActive = input(true);
  constructor() {
    TestViewportStub.created += 1;
  }
  ngOnDestroy(): void {
    TestViewportStub.destroyed += 1;
  }
  static reset(): void {
    TestViewportStub.created = 0;
    TestViewportStub.destroyed = 0;
  }
}

@Component({ selector: 'test-y-layer', template: '' })
class TestYLayerStub {
  static created = 0;
  static destroyed = 0;
  readonly viewportActive = input(true);
  constructor() {
    TestYLayerStub.created += 1;
  }
  ngOnDestroy(): void {
    TestYLayerStub.destroyed += 1;
  }
  static reset(): void {
    TestYLayerStub.created = 0;
    TestYLayerStub.destroyed = 0;
  }
}

describe('editor shell movement/delete routing', () => {
  beforeEach(async () => {
    installIndexedDbStub();
    await TestBed.configureTestingModule({
      imports: [EditorShellComponent],
      providers: [
        { provide: ActivatedRoute, useValue: {} },
        { provide: PROJECT_STORE, useFactory: () => new IndexedDbProjectStore() },
      ],
    }).compileComponents();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the shared brand logo as the accessible link back to Projects', () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    TestBed.inject(WorkspaceStateService).activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const brand = root.querySelector<HTMLAnchorElement>('.shell-header .brand');
    const logo = brand?.querySelector<HTMLImageElement>('img');

    expect(brand?.getAttribute('href')).toBe('/');
    expect(logo?.getAttribute('src')).toBe('assets/brand/the-block-laundromat-logo.svg');
    expect(logo?.getAttribute('alt')).toBe('The Block Laundromat');
    fixture.destroy();
    mount.mockRestore();
  });

  it('opens and closes the Structure NBT export dialog from the File action', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const shell = fixture.componentInstance as unknown as {
      openStructureNbtExport: () => void;
      closeStructureNbtExport: () => void;
      structureNbtExportOpen: () => boolean;
    };
    shell.openStructureNbtExport();
    expect(shell.structureNbtExportOpen()).toBe(true);
    shell.closeStructureNbtExport();
    expect(shell.structureNbtExportOpen()).toBe(false);
    fixture.destroy();
  });

  it('routes chrome menu and toolbar interactions through the existing editor services', () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    const mode = TestBed.inject(EditorModeService);
    const tool = TestBed.inject(EditorToolService);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const fileMenu = root.querySelector<HTMLButtonElement>('.app-menu-trigger');
    fileMenu?.click();
    fixture.detectChanges();
    const importAction = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.menu-popover [role="menuitem"]'),
    ).find((button) =>
      button.textContent?.includes(TestBed.inject(I18nService).t('importStructureJson')),
    );
    importAction?.click();
    fixture.detectChanges();
    expect(root.querySelector('app-structure-json-import-dialog')).not.toBeNull();

    root
      .querySelector<HTMLButtonElement>('.toolbar-group.mode-switch button:nth-child(2)')
      ?.click();
    root.querySelector<HTMLButtonElement>('.tool-switch button:nth-child(2)')?.click();
    expect(mode.mode()).toBe('y-layer');
    expect(tool.active()).toBe('select');
    fixture.destroy();
    mount.mockRestore();
  });

  it('does not delete on cancellation and reports navigation failure after successful deletion', async () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const shell = fixture.componentInstance as unknown as { deleteProject: () => Promise<void> };
    const workspace = TestBed.inject(WorkspaceStateService);
    const dialogs = TestBed.inject(DialogService);
    const router = TestBed.inject(Router);
    const deletion = TestBed.inject(ProjectDeletionService);
    const i18n = TestBed.inject(I18nService);
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const deleteProject = vi.spyOn(deletion, 'deleteProject').mockResolvedValue(undefined);

    workspace.activate(project, undefined);
    await shell.deleteProject();

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteProject).not.toHaveBeenCalled();

    confirm.mockResolvedValue(true);
    vi.spyOn(dialogs, 'success').mockResolvedValue(false);
    const warning = vi.spyOn(dialogs, 'warning').mockResolvedValue(false);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(false);
    await shell.deleteProject();

    expect(deleteProject).toHaveBeenCalledWith(project.id);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0][1]).toBe(i18n.t('deleteProjectNavigationError'));
    fixture.destroy();
  });

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
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', {
        key: String.fromCharCode(0x00b7),
        code: '',
        cancelable: true,
      }),
    );
    const movementRepeat = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      repeat: true,
      cancelable: true,
    });
    shell.handleEditorShortcut(movementRepeat);
    expect(movementRepeat.defaultPrevented).toBe(true);
    const deleteDuringMovement = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      cancelable: true,
    });
    shell.handleEditorShortcut(deleteDuringMovement);
    expect(deleteDuringMovement.defaultPrevented).toBe(true);
    expect(deleteSelection).not.toHaveBeenCalled();
    expect(workspace.project()?.blocks).toHaveLength(2);

    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', cancelable: true }),
    );
    const deleteAfterRelease = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      cancelable: true,
    });
    shell.handleEditorShortcut(deleteAfterRelease);
    expect(deleteAfterRelease.defaultPrevented).toBe(true);
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    expect(workspace.project()?.blocks).toHaveLength(1);
    expect(history.lastLabel()).toBe('Delete selection');

    fixture.destroy();
  });

  it('toggles Place and Select once per Backquote press in either editor mode', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const shell = fixture.componentInstance as unknown as {
      handleEditorShortcut: (event: KeyboardEvent) => void;
      settingsDialogOpen: { set: (value: boolean) => void };
    };
    const tool = TestBed.inject(EditorToolService);
    const mode = TestBed.inject(EditorModeService);
    expect(tool.active()).toBe('place');

    const press = (options: KeyboardEventInit = {}) =>
      shell.handleEditorShortcut(
        new KeyboardEvent('keydown', {
          key: '`',
          code: 'Backquote',
          cancelable: true,
          ...options,
        }),
      );
    const firstPress = new KeyboardEvent('keydown', {
      key: '`',
      code: 'Backquote',
      cancelable: true,
    });
    shell.handleEditorShortcut(firstPress);
    expect(firstPress.defaultPrevented).toBe(true);
    expect(tool.active()).toBe('select');

    const repeatedPress = new KeyboardEvent('keydown', {
      key: '`',
      code: 'Backquote',
      repeat: true,
      cancelable: true,
    });
    shell.handleEditorShortcut(repeatedPress);
    expect(repeatedPress.defaultPrevented).toBe(false);
    expect(tool.active()).toBe('select');

    press();
    expect(tool.active()).toBe('place');
    mode.setMode('y-layer');
    press();
    expect(tool.active()).toBe('select');

    shell.settingsDialogOpen.set(true);
    const modalPress = new KeyboardEvent('keydown', {
      key: '`',
      code: 'Backquote',
      cancelable: true,
    });
    shell.handleEditorShortcut(modalPress);
    expect(modalPress.defaultPrevented).toBe(false);
    expect(tool.active()).toBe('select');
    mode.setMode('3d');
    fixture.destroy();
  });

  it('releases every fast multi-key movement owner in any order', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    const press = (key: string, code: string, options: KeyboardEventInit = {}) =>
      shell.handleEditorShortcut(
        new KeyboardEvent('keydown', { key, code, cancelable: true, ...options }),
      );
    const release = (key: string, code: string, options: KeyboardEventInit = {}) =>
      shell.handleEditorKeyup(
        new KeyboardEvent('keyup', { key, code, cancelable: true, ...options }),
      );

    press('w', 'KeyW');
    press('a', 'KeyA');
    press('d', 'KeyD');
    release('d', 'KeyD');
    release('w', 'KeyW');
    release('a', 'KeyA');
    press('w', 'KeyW');
    press('a', 'KeyA');
    release('a', 'KeyA');
    release('w', 'KeyW');
    press('a', 'KeyA');
    release('a', 'KeyA');
    press('a', 'KeyA');
    release('a', 'KeyA');

    expect(calls.down.mock.calls.map(([action]) => action)).toEqual([
      'move-forward',
      'move-left',
      'move-right',
      'move-forward',
      'move-left',
      'move-left',
      'move-left',
    ]);
    expect(calls.up.mock.calls.map(([action]) => action)).toEqual([
      'move-right',
      'move-forward',
      'move-left',
      'move-left',
      'move-forward',
      'move-left',
      'move-left',
    ]);
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(0);
    fixture.destroy();
  });

  it('keeps ownership stable across modifier changes and coded/missing-code releases', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', cancelable: true }),
    );
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', {
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: true,
        cancelable: true,
      }),
    );
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'a', code: '', shiftKey: true, cancelable: true }),
    );
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftRight', cancelable: true }),
    );
    expect(calls.down.mock.calls.map(([action]) => action)).toEqual(['move-left', 'move-down']);
    expect(calls.up.mock.calls.map(([action]) => action)).toEqual(['move-left', 'move-down']);

    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', {
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: true,
        cancelable: true,
      }),
    );
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', shiftKey: true, cancelable: true }),
    );
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', cancelable: true }),
    );
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', cancelable: true }),
    );
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(0);

    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: '', cancelable: true }),
    );
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', cancelable: true }),
    );
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(0);
    fixture.destroy();
  });

  it('clears all movement owners on lifecycle boundaries', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', cancelable: true }),
    );
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', cancelable: true }),
    );
    shell.handleWindowBlur();
    expect(calls.clear).toHaveBeenCalledTimes(1);
    expect(calls.up).not.toHaveBeenCalled();
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(0);
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', cancelable: true }),
    );
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', cancelable: true }),
    );
    shell.handleVisibilityChange();
    expect(calls.clear).toHaveBeenCalledTimes(2);
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(0);
    fixture.destroy();
  });

  it('debounces an unidentifiable release while preserving known movement ownership', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: '', cancelable: true }),
    );
    for (let index = 0; index < 8; index += 1)
      shell.handleEditorKeyup(
        new KeyboardEvent('keyup', { key: 'Unidentified', code: '', cancelable: true }),
      );
    expect(calls.down.mock.calls.map(([action]) => action)).toEqual(['move-left']);
    expect(calls.clear).not.toHaveBeenCalled();
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(1);
    vi.advanceTimersByTime(AMBIGUOUS_RELEASE_GRACE_MS - 1);
    expect(calls.clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(calls.clear).toHaveBeenCalledTimes(1);
    expect(
      (
        fixture.componentInstance as unknown as { movementInput: { ownerCount: () => number } }
      ).movementInput.ownerCount(),
    ).toBe(0);
    fixture.destroy();
  });

  it('cancels ambiguous-release reconciliation when the identified key continues', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', cancelable: true }),
    );
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'Unidentified', code: '', cancelable: true }),
    );
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', repeat: true, cancelable: true }),
    );
    vi.advanceTimersByTime(AMBIGUOUS_RELEASE_GRACE_MS);
    expect(calls.clear).not.toHaveBeenCalled();
    expect(calls.down.mock.calls.map(([action]) => action)).toEqual(['move-right']);
    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'd', code: 'KeyD', cancelable: true }),
    );
    expect(calls.up.mock.calls.map(([action]) => action)).toEqual(['move-right']);
    fixture.destroy();
  });

  it('suppresses the IME destructive sequence before and after a new movement session', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    const editor = TestBed.inject(StructureEditorService);
    workspace.activate(project, undefined);
    selection.select({ x: 1, y: 1, z: 1 });
    const deleteSelection = vi.spyOn(editor, 'deleteSelection');

    shell.handleEditorKeyup(
      new KeyboardEvent('keyup', { key: 'Unidentified', code: '', cancelable: true }),
    );
    const before = JSON.stringify(workspace.project());
    const firstDelete = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      cancelable: true,
    });
    shell.handleEditorShortcut(firstDelete);
    expect(firstDelete.defaultPrevented).toBe(true);
    expect(deleteSelection).not.toHaveBeenCalled();
    expect(JSON.stringify(workspace.project())).toBe(before);

    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: '', cancelable: true }),
    );
    const secondUnknownRelease = new KeyboardEvent('keyup', {
      key: 'Unidentified',
      code: '',
      cancelable: true,
    });
    shell.handleEditorKeyup(secondUnknownRelease);
    const secondDelete = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      cancelable: true,
    });
    shell.handleEditorShortcut(secondDelete);
    expect(secondDelete.defaultPrevented).toBe(true);
    expect(deleteSelection).not.toHaveBeenCalled();
    expect(calls.clear).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('keeps normal identifiable release synchronized so Backspace still deletes', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    const editor = TestBed.inject(StructureEditorService);
    workspace.activate(project, undefined);
    selection.select({ x: 1, y: 1, z: 1 });
    const deleteSelection = vi.spyOn(editor, 'deleteSelection');
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', cancelable: true }),
    );
    shell.handleEditorKeyup(new KeyboardEvent('keyup', { key: 'a', code: '', cancelable: true }));
    const deletion = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      cancelable: true,
    });
    shell.handleEditorShortcut(deletion);
    expect(deletion.defaultPrevented).toBe(true);
    expect(deleteSelection).toHaveBeenCalledTimes(1);
    expect(calls.clear).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('clears the old viewport before a mode transition', () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const calls = { down: vi.fn(), up: vi.fn(), clear: vi.fn() };
    const shell = withFakeViewport(fixture.componentInstance, calls);
    const mode = TestBed.inject(EditorModeService);
    shell.handleEditorShortcut(
      new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', cancelable: true }),
    );
    shell.setEditorMode('y-layer');
    expect(calls.clear).toHaveBeenCalledTimes(1);
    expect(mode.mode()).toBe('y-layer');
    fixture.destroy();
  });
});

describe('editor shell retained viewport lifecycle', () => {
  beforeEach(async () => {
    installIndexedDbStub();
    TestViewportStub.reset();
    TestYLayerStub.reset();
    await TestBed.configureTestingModule({
      imports: [EditorShellComponent],
      providers: [
        { provide: ActivatedRoute, useValue: {} },
        { provide: PROJECT_STORE, useFactory: () => new IndexedDbProjectStore() },
      ],
    })
      .overrideComponent(EditorShellComponent, {
        set: {
          imports: [TestViewportStub, TestYLayerStub],
          template: `
            @if (visitedModes().has('3d')) { <test-viewport [viewportActive]="mode.mode() === '3d'"></test-viewport> }
            @if (visitedModes().has('y-layer')) { <test-y-layer [viewportActive]="mode.mode() === 'y-layer'"></test-y-layer> }
          `,
        },
      })
      .compileComponents();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with the persisted Y-layer viewport active', async () => {
    TestBed.inject(UiPreferencesService).update({ editorMode: 'y-layer' });
    const fixture = TestBed.createComponent(EditorShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const mode = TestBed.inject(EditorModeService);
    const three = fixture.debugElement.query(By.css('test-viewport'))
      .componentInstance as TestViewportStub;
    const yLayer = fixture.debugElement.query(By.css('test-y-layer'))
      .componentInstance as TestYLayerStub;
    expect(mode.mode()).toBe('y-layer');
    expect(three.viewportActive()).toBe(false);
    expect(yLayer.viewportActive()).toBe(true);
    fixture.destroy();
  });

  it('retains both viewport sessions across twenty mode switches and tears them down once', async () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const mode = TestBed.inject(EditorModeService);
    mode.setMode('3d');
    fixture.detectChanges();
    const three = fixture.debugElement.query(By.css('test-viewport'));
    expect(three).toBeDefined();
    const yLayerInitially = fixture.debugElement.query(By.css('test-y-layer'));
    expect(yLayerInitially).toBeDefined();

    mode.setMode('y-layer');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const yLayer = fixture.debugElement.query(By.css('test-y-layer'));
    expect(yLayer).toBeDefined();
    expect(yLayer).toBe(yLayerInitially);
    const threeInstance = three.componentInstance as TestViewportStub;
    const yLayerInstance = yLayer.componentInstance as TestYLayerStub;

    for (let index = 0; index < 20; index += 1) {
      const next = index % 2 === 0 ? '3d' : 'y-layer';
      mode.setMode(next);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('test-viewport'))).toBe(three);
      expect(fixture.debugElement.query(By.css('test-y-layer'))).toBe(yLayer);
      expect(threeInstance.viewportActive()).toBe(next === '3d');
      expect(yLayerInstance.viewportActive()).toBe(next === 'y-layer');
    }

    fixture.destroy();
    expect(TestViewportStub.created).toBe(1);
    expect(TestYLayerStub.created).toBe(1);
    expect(TestViewportStub.destroyed).toBe(1);
    expect(TestYLayerStub.destroyed).toBe(1);
  });
});

function withFakeViewport(
  component: EditorShellComponent,
  calls: {
    readonly down: ReturnType<typeof vi.fn>;
    readonly up: ReturnType<typeof vi.fn>;
    readonly clear: ReturnType<typeof vi.fn>;
  },
): {
  handleEditorShortcut: (event: KeyboardEvent) => void;
  handleEditorKeyup: (event: KeyboardEvent) => void;
  handleWindowBlur: () => void;
  handleVisibilityChange: () => void;
  setEditorMode: (mode: '3d' | 'y-layer') => void;
} {
  const instance = component as unknown as {
    currentViewport: () => unknown;
    handleEditorShortcut: (event: KeyboardEvent) => void;
    handleEditorKeyup: (event: KeyboardEvent) => void;
    handleWindowBlur: () => void;
    handleVisibilityChange: () => void;
    setEditorMode: (mode: '3d' | 'y-layer') => void;
  };
  instance.currentViewport = () => ({
    cameraKeyDown: calls.down,
    cameraKeyUp: calls.up,
    clearCameraInput: calls.clear,
  });
  return instance;
}

function installIndexedDbStub(): void {
  const database = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction: {
        objectStore: () => Record<string, () => IDBRequest>;
        oncomplete: (() => void) | null;
      } = {
        objectStore: () => ({
          getAll: () => request([]),
          get: () => request(undefined),
          getKey: () => request(undefined),
          put: () => request(undefined),
          add: () => request(undefined),
          delete: () => request(undefined),
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
  const pending = {
    result,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as (() => void) | null,
  } as unknown as IDBRequest<T>;
  queueMicrotask(() => pending.onsuccess?.(new Event('success')));
  return pending;
}

describe('editor selection action state', () => {
  it('treats decorations, voxel selections and box selections as editor selections', () => {
    expect(hasEditorSelectionState(true, 0, false)).toBe(true);
    expect(hasEditorSelectionState(false, 1, false)).toBe(true);
    expect(hasEditorSelectionState(false, 0, true)).toBe(true);
    expect(hasEditorSelectionState(false, 0, false)).toBe(false);
  });
});
