import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShellComponent, hasEditorSelectionState } from './editor-shell.component';
import { EditorStatusBarComponent } from './editor-status-bar/editor-status-bar.component';
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
import { EditorLayoutPreferencesService } from '../../../core/ui/preferences/editor-layout-preferences.service';
import { IndexedDbProjectStore } from '../../../core/persistence/project-store/indexeddb-project-store';
import { PROJECT_STORE } from '../../../core/persistence/project-store/project-store.token';
import { ProjectAutosaveService } from '../../../core/persistence/autosave/project-autosave.service';
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
  captureProjectPreview: (project: ProjectDocument) => Promise<Blob | undefined> = async () =>
    undefined;
  clearCameraInput(): void {}
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

  it('returns focus to the Settings menu trigger after closing the dialog', async () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    await workspace.restore(TestBed.inject(PROJECT_STORE), undefined);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const settingsTrigger = root.querySelector<HTMLButtonElement>(
      '.settings-entry > .app-menu-trigger',
    );
    settingsTrigger?.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.settings-popover [role="menuitem"]')?.click();
    fixture.detectChanges();

    expect(root.querySelector('app-settings-dialog')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.settings-dialog-footer button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('app-settings-dialog')).toBeNull();
    expect(document.activeElement).toBe(settingsTrigger);

    fixture.destroy();
    mount.mockRestore();
  });

  it('opens Mod JAR Import on Mods and Asset Manager on Minecraft Versions', async () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    await workspace.restore(TestBed.inject(PROJECT_STORE), undefined);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const i18n = TestBed.inject(I18nService);
    const toolsTrigger = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.app-menu-trigger'),
    ).find((button) => button.textContent?.trim() === i18n.t('toolsMenu'))!;
    const openAssetManager = (label: 'modJarImport' | 'assetManager') => {
      toolsTrigger.click();
      fixture.detectChanges();
      const action = Array.from(
        root.querySelectorAll<HTMLButtonElement>('.menu-popover [role="menuitem"]'),
      ).find((button) => button.textContent?.includes(i18n.t(label)))!;
      action.click();
      fixture.detectChanges();
    };
    const activeTab = () => {
      const instance = fixture.debugElement.query(By.css('app-asset-manager-dialog'))
        .componentInstance as unknown as {
        initialTab: () => string;
        tab: () => string;
      };
      return { initial: instance.initialTab(), selected: instance.tab() };
    };

    openAssetManager('modJarImport');
    expect(activeTab()).toEqual({ initial: 'mods', selected: 'mods' });
    root.querySelector<HTMLButtonElement>('.tool-dialog .ui-close-button')?.click();
    fixture.detectChanges();

    openAssetManager('assetManager');
    expect(activeTab()).toEqual({ initial: 'vanilla', selected: 'vanilla' });

    fixture.destroy();
    mount.mockRestore();
  });

  it('opens Asset Manager on Mods when requested from missing-assets details', async () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    await workspace.restore(TestBed.inject(PROJECT_STORE), undefined);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const statusBar = fixture.debugElement.query(By.directive(EditorStatusBarComponent))
      .componentInstance as EditorStatusBarComponent;
    statusBar.assetManagerRequested.emit();
    fixture.detectChanges();

    const assetManager = fixture.debugElement.query(By.css('app-asset-manager-dialog'))
      .componentInstance as unknown as { initialTab: () => string; tab: () => string };
    expect(assetManager.initialTab()).toBe('mods');
    expect(assetManager.tab()).toBe('mods');

    fixture.destroy();
    mount.mockRestore();
  });

  it('dismisses editor menus with Escape and outside clicks', async () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    await workspace.restore(TestBed.inject(PROJECT_STORE), undefined);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.app-menu-trigger',
    );
    try {
      trigger?.focus();
      trigger?.click();
      fixture.detectChanges();
      expect(trigger?.getAttribute('aria-expanded')).toBe('true');

      const firstItem = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.menu-popover button',
      );
      firstItem?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.menu-popover')).toBeNull();
      expect(document.activeElement).toBe(trigger);

      trigger?.click();
      fixture.detectChanges();
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect((fixture.nativeElement as HTMLElement).querySelector('.menu-popover')).toBeNull();
    } finally {
      fixture.destroy();
      mount.mockRestore();
    }
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
    const modeSwitch = root.querySelector<HTMLElement>('.mode-switch');
    const toolSwitch = root.querySelector<HTMLElement>('.tool-switch');
    expect(modeSwitch?.getAttribute('role')).toBe('radiogroup');
    expect(toolSwitch?.getAttribute('role')).toBe('radiogroup');
    expect(modeSwitch?.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(toolSwitch?.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(modeSwitch?.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
    expect(toolSwitch?.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
    expect(modeSwitch?.classList.contains('segment-selected-right')).toBe(false);
    expect(toolSwitch?.classList.contains('segment-selected-right')).toBe(false);
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
    fixture.detectChanges();
    expect(modeSwitch?.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(modeSwitch?.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      TestBed.inject(I18nService).t('modeYLayer'),
    );
    expect(toolSwitch?.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(toolSwitch?.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      TestBed.inject(I18nService).t('toolSelect'),
    );
    expect(modeSwitch?.classList.contains('segment-selected-right')).toBe(true);
    expect(toolSwitch?.classList.contains('segment-selected-right')).toBe(true);
    expect(modeSwitch?.querySelector('.segment-check')).toBeNull();
    expect(toolSwitch?.querySelector('.segment-check')).toBeNull();

    const modeBounds = {
      left: 0,
      right: 100,
      top: 0,
      bottom: 40,
      width: 100,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(modeSwitch!, 'getBoundingClientRect').mockReturnValue(modeBounds);
    const pointerEvent = (type: string, clientX: number): Event => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        button: { value: 0 },
        clientX: { value: clientX },
        isPrimary: { value: true },
        pointerId: { value: 1 },
      });
      return event;
    };
    modeSwitch?.dispatchEvent(pointerEvent('pointerdown', 20));
    fixture.detectChanges();
    expect(modeSwitch?.classList.contains('dragging')).toBe(true);
    expect(mode.mode()).toBe('3d');
    modeSwitch?.dispatchEvent(pointerEvent('pointermove', 80));
    expect(mode.mode()).toBe('y-layer');
    fixture.detectChanges();
    expect(modeSwitch?.classList.contains('segment-selected-right')).toBe(true);
    modeSwitch?.dispatchEvent(pointerEvent('pointerup', 80));
    fixture.detectChanges();
    expect(mode.mode()).toBe('y-layer');
    expect(modeSwitch?.classList.contains('dragging')).toBe(false);

    const selectedMode = modeSwitch?.querySelector<HTMLButtonElement>(
      '[role="radio"][aria-checked="true"]',
    );
    selectedMode?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(mode.mode()).toBe('3d');
    expect(modeSwitch?.classList.contains('segment-selected-right')).toBe(false);
    expect(document.activeElement).toBe(
      modeSwitch?.querySelector('[role="radio"][aria-checked="true"]'),
    );
    modeSwitch?.dispatchEvent(pointerEvent('pointerdown', 80));
    fixture.detectChanges();
    modeSwitch?.dispatchEvent(pointerEvent('pointercancel', 80));
    fixture.detectChanges();
    expect(modeSwitch?.classList.contains('dragging')).toBe(false);
    fixture.destroy();
    mount.mockRestore();
  });

  it('exposes keyboard sidebar resizers with localized names and current ranges', () => {
    vi.stubGlobal('innerWidth', 1600);
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    const layout = TestBed.inject(EditorLayoutPreferencesService);
    const i18n = TestBed.inject(I18nService);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const left = root.querySelector<HTMLElement>('.left-resize-handle');
    const right = root.querySelector<HTMLElement>('.right-resize-handle');
    const leftWidth = layout.preferences().leftSidebarWidth;
    const rightWidth = layout.preferences().rightSidebarWidth;

    expect(left?.getAttribute('role')).toBe('separator');
    expect(left?.getAttribute('aria-orientation')).toBe('vertical');
    expect(left?.getAttribute('aria-label')).toBe(i18n.t('leftSidebar'));
    expect(left?.getAttribute('aria-valuemin')).toBe('180');
    expect(left?.getAttribute('aria-valuenow')).toBe(String(leftWidth));
    expect(left?.getAttribute('aria-valuemax')).toBeTruthy();
    expect(right?.getAttribute('aria-label')).toBe(i18n.t('rightSidebar'));
    expect(right?.getAttribute('aria-valuemin')).toBe('200');
    expect(right?.getAttribute('aria-valuenow')).toBe(String(rightWidth));
    expect(right?.getAttribute('aria-valuemax')).toBeTruthy();

    left?.focus();
    left?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(left?.getAttribute('aria-valuenow')).toBe(String(leftWidth + 16));
    expect(document.activeElement).toBe(left);

    layout.setSidebarWidth('left', leftWidth);
    layout.setSidebarWidth('right', rightWidth);
    fixture.destroy();
    mount.mockRestore();
  });

  it('moves focus to the matching drawer opener when a resize handle becomes hidden', async () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    await workspace.restore(TestBed.inject(PROJECT_STORE), undefined);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const left = root.querySelector<HTMLElement>('.left-resize-handle');
    const leftLabel = TestBed.inject(I18nService).t('openLeftSidebar');
    const opener = [
      ...root.querySelectorAll<HTMLButtonElement>('.responsive-drawer-actions button'),
    ].find((button) => button.getAttribute('aria-label') === leftLabel);
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const shell = fixture.componentInstance as unknown as { handleViewportResize: () => void };

    try {
      left?.focus();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 780 });
      if (left) left.style.display = 'none';
      shell.handleViewportResize();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      expect(document.activeElement).toBe(opener);
    } finally {
      if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor);
      fixture.destroy();
      mount.mockRestore();
    }
  });

  it('keeps Inspector tabs keyboard-operable with the selected tab in sync', () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    TestBed.inject(WorkspaceStateService).activate(project, undefined);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const selectionTab = root.querySelector<HTMLButtonElement>(
      '.right-sidebar-tabs button[aria-selected="true"]',
    );
    const usageTarget = root.querySelector<HTMLButtonElement>('#right-sidebar-tab-usage');
    if (!usageTarget) throw new Error('Inspector Usage tab is missing');
    const focusUsage = vi.spyOn(usageTarget, 'focus');
    selectionTab?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    const usageTab = root.querySelector<HTMLButtonElement>(
      '.right-sidebar-tabs button[aria-selected="true"]',
    );
    expect(usageTab?.id).toBe('right-sidebar-tab-usage');
    expect(focusUsage).toHaveBeenCalledOnce();

    fixture.destroy();
    fixture.nativeElement.remove();
    mount.mockRestore();
  });

  it('keeps workspace tabs labeled and uses one keyboard tab stop per tablist', () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    TestBed.inject(WorkspaceStateService).activate(project, undefined);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const leftTabs = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.left-panel > .sidebar-tabs [role="tab"]'),
    );
    expect(
      leftTabs.map((tab) => tab.querySelector('.sidebar-tab-label')?.textContent?.trim()),
    ).toEqual([
      TestBed.inject(I18nService).t('blocksPanel'),
      TestBed.inject(I18nService).t('decorationsPanel'),
      TestBed.inject(I18nService).t('groupsPanel'),
    ]);
    expect(leftTabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    const decorationsTab = root.querySelector<HTMLButtonElement>('#sidebar-tab-decorations');
    if (!decorationsTab) throw new Error('Decorations tab is missing');
    decorationsTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('sidebar-tab-groups');
    expect(leftTabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);

    const rightTabs = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.right-sidebar-tabs [role="tab"]'),
    );
    expect(rightTabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
    rightTabs[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(rightTabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);

    fixture.destroy();
    fixture.nativeElement.remove();
    mount.mockRestore();
  });

  it('routes inspector quick actions through the existing selection commands', () => {
    const mount = vi.spyOn(ThreeViewportEngine.prototype, 'mount').mockImplementation(() => {});
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    const selection = TestBed.inject(SelectionService);
    workspace.activate(project, undefined);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-action="select-all"]')?.click();
    expect(selection.count(project)).toBe(project.blocks.length);

    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-action="clear-selection"]')?.click();
    expect(selection.kind()).toBe('none');
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

  it('skips preview capture when the Y-Layer viewport is active', async () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    TestBed.inject(WorkspaceStateService).activate(project, undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const capture = vi.fn(async () => undefined);
    const viewport = fixture.debugElement.query(By.css('test-viewport'))
      .componentInstance as TestViewportStub;
    viewport.captureProjectPreview = capture;
    TestBed.inject(EditorModeService).setMode('y-layer');
    const shell = fixture.componentInstance as unknown as {
      captureProjectPreviewBeforeLeaving: () => void;
    };

    shell.captureProjectPreviewBeforeLeaving();

    expect(capture).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('does not save a preview if the workspace project changes during image encoding', async () => {
    const fixture = TestBed.createComponent(EditorShellComponent);
    const workspace = TestBed.inject(WorkspaceStateService);
    workspace.activate(project, undefined);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    let finishCapture!: (preview: Blob) => void;
    const capture = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          finishCapture = resolve;
        }),
    );
    const viewport = fixture.debugElement.query(By.css('test-viewport'))
      .componentInstance as TestViewportStub;
    viewport.captureProjectPreview = capture;
    const shell = fixture.componentInstance as unknown as {
      captureProjectPreviewBeforeLeaving: () => void;
      threeDViewport: () => TestViewportStub;
    };
    shell.threeDViewport = () => viewport;
    TestBed.inject(EditorModeService).setMode('3d');
    const autosave = TestBed.inject(ProjectAutosaveService);
    vi.spyOn(autosave, 'isUnsafeDirty', 'get').mockReturnValue(false);
    const savePreview = vi.spyOn(TestBed.inject(PROJECT_STORE), 'savePreview');

    shell.captureProjectPreviewBeforeLeaving();
    expect(capture).toHaveBeenCalledWith(project);

    workspace.publishProject({
      ...project,
      metadata: { ...project.metadata, updatedAt: '2026-10-18T00:00:00.001Z' },
    });
    fixture.detectChanges();
    finishCapture(new Blob(['stale capture'], { type: 'image/webp' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(savePreview).not.toHaveBeenCalled();
    fixture.destroy();
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
