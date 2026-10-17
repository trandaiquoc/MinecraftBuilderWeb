import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ThemeService } from '../../../core/ui/theme/theme.service';
import { EditorBackgroundMode } from '../../../core/editor/appearance/editor-background-contract';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { BlockBrowserComponent } from '../blocks/block-browser.component';
import { DecorationBrowserComponent } from '../decorations/decoration-browser.component';
import { QuickBlockBarComponent } from '../quick-bar/quick-block-bar.component';
import { ViewportComponent } from '../viewport/three-d-viewport/viewport.component';
import { YLayerComponent } from '../viewport/y-layer-viewport/y-layer.component';
import { EditorModeService } from '../../../core/editor/state/editor-mode.service';
import { EditorToolService } from '../../../core/editor/state/tool.service';
import { CameraPreset } from '../../../core/editor/camera/camera';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { GroupService } from '../../../core/editor/groups/group.service';
import { StructureEditorService } from '../../../core/editor/structure/structure-editor.service';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { HistoryService } from '../../../core/editor/history/history.service';
import {
  isEditableKeyboardTarget,
  isMovementAction,
  KeyboardAction,
  movementPhysicalKey,
} from '../../../core/editor/input/keyboard-bindings';
import { EditorMovementInputSession } from '../../../core/editor/input/editor-movement-input-session';
import { KeyboardBindingService } from '../../../core/editor/input/keyboard-binding.service';
import { QuickBlockBarService } from '../../../core/editor/quick-bar/quick-block-bar.service';
import { PROJECT_STORE } from '../../../core/persistence/project-store/project-store.token';
import { ProjectAutosaveService } from '../../../core/persistence/autosave/project-autosave.service';
import { ProjectDeletionService } from '../../../core/persistence/project-deletion.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { EditorLayoutPreferencesService } from '../../../core/ui/preferences/editor-layout-preferences.service';
import { EditorSidebarResizeSession } from './editor-sidebar-resize-session';
import { DecorationService } from '../../../core/decorations/decoration.service';
import { SettingsDialogComponent } from '../settings/settings-dialog/settings-dialog.component';
import { LucideCuboid, LucideGroup, LucideImage, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { GroupsPanelComponent } from '../groups/groups-panel.component';
import { SelectionInspectorComponent } from '../inspector/selection-inspector/selection-inspector.component';
import { BlockUsagePanelComponent } from '../inspector/block-usage/block-usage-panel.component';
import { EditorStatusBarComponent } from './editor-status-bar/editor-status-bar.component';
import { ShortcutsHelpDialogComponent } from '../settings/shortcuts-help/shortcuts-help-dialog.component';
import { AssetManagerDialogComponent } from '../tools/asset-manager/asset-manager-dialog.component';
import { ProjectDiagnosticsDialogComponent } from '../tools/diagnostics/project-diagnostics-dialog.component';
import { StructureJsonExportDialogComponent } from '../structure-json/export/structure-json-export-dialog.component';
import { StructureJsonImportDialogComponent } from '../structure-json/import/structure-json-import-dialog.component';
import { StructureNbtExportDialogComponent } from '../minecraft-structure-export/structure-nbt-export-dialog.component';
import type { ViewportPerformanceEvidence } from '../../../core/renderer/engine/three-viewport-engine';
import { EditorChromeComponent } from './editor-chrome.component';
import type { EditorChromeAction, EditorChromeState } from './editor-chrome.contracts';
import { GroupMovePanelComponent } from './group-move/group-move-panel.component';

export function hasEditorSelectionState(
  decorationSelected: boolean,
  logicalCount: number,
  boxSelected: boolean,
): boolean {
  return decorationSelected || logicalCount > 0 || boxSelected;
}

type AssetManagerInitialTab = 'vanilla' | 'mods';

@Component({
  selector: 'app-editor-shell',
  imports: [
    EditorChromeComponent,
    GroupMovePanelComponent,
    BlockBrowserComponent,
    DecorationBrowserComponent,
    GroupsPanelComponent,
    SelectionInspectorComponent,
    BlockUsagePanelComponent,
    EditorStatusBarComponent,
    QuickBlockBarComponent,
    ViewportComponent,
    YLayerComponent,
    SettingsDialogComponent,
    ShortcutsHelpDialogComponent,
    AssetManagerDialogComponent,
    ProjectDiagnosticsDialogComponent,
    StructureJsonExportDialogComponent,
    StructureJsonImportDialogComponent,
    StructureNbtExportDialogComponent,
    LucideX,
    LucideCuboid,
    LucideGroup,
    LucideImage,
    UiTooltipDirective,
  ],
  templateUrl: './editor-shell.component.html',
  styleUrl: './editor-shell.component.scss',
  host: {
    '(document:keydown)': 'handleEditorShortcut($event)',
    '(document:keyup)': 'handleEditorKeyup($event)',
    '(document:focusin)': 'handleFocusIn($event)',
    '(document:visibilitychange)': 'handleVisibilityChange($event)',
    '(document:pointermove)': 'sidebarResize.move($event)',
    '(document:pointerup)': 'sidebarResize.end($event)',
    '(document:pointercancel)': 'sidebarResize.end($event)',
    '(window:blur)': 'handleWindowBlur($event)',
    '(window:resize)': 'handleViewportResize()',
  },
})
export class EditorShellComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly mode = inject(EditorModeService);
  protected readonly visitedModes = signal<ReadonlySet<'3d' | 'y-layer'>>(
    new Set(['3d', 'y-layer']),
  );
  protected readonly tool = inject(EditorToolService);
  protected readonly selection = inject(SelectionService);
  protected readonly groups = inject(GroupService);
  protected readonly decorations = inject(DecorationService);
  protected readonly history = inject(HistoryService);
  private readonly keyboard = inject(KeyboardBindingService);
  private readonly quickBar = inject(QuickBlockBarService);
  protected readonly autosave = inject(ProjectAutosaveService);
  private readonly projectStore = inject(PROJECT_STORE);
  protected readonly layout = inject(EditorLayoutPreferencesService);
  private readonly dialogs = inject(DialogService);
  private readonly editor = inject(StructureEditorService);
  private readonly router = inject(Router);
  private readonly library = inject(BlockLibraryService);
  private readonly projectDeletion = inject(ProjectDeletionService);
  private readonly threeDViewport = viewChild(ViewportComponent);
  private readonly yLayerViewport = viewChild(YLayerComponent);
  protected readonly selectedDecoration = this.decorations.selected;
  protected readonly logicalSelectionCount = computed(() =>
    this.selection.count(this.workspace.project()),
  );
  protected readonly hasEditorSelection = computed(() =>
    hasEditorSelectionState(
      !!this.selectedDecoration(),
      this.logicalSelectionCount(),
      !!this.selection.box() || this.selection.kind() === 'all',
    ),
  );
  protected readonly focusSelectionAvailable = computed(
    () => !!this.selectedDecoration() || this.selection.hasAny(this.workspace.project()),
  );
  protected readonly chromeState = computed<EditorChromeState>(() => ({
    theme: this.theme.theme(),
    locale: this.i18n.locale(),
    background: this.theme.editorBackground(),
    layout: this.layout.preferences(),
    mode: this.mode.mode(),
    tool: this.tool.active(),
    canUndo: this.history.canUndo(),
    canRedo: this.history.canRedo(),
    hasSelection: this.hasEditorSelection(),
    canFocusSelection: this.focusSelectionAvailable(),
    deletingProject: this.deletingProject(),
    projectName: this.workspace.project()?.metadata.name ?? '',
    minecraftVersion: this.workspace.project()?.metadata.minecraftVersion ?? '',
    saveStatusLabel: this.saveStatusLabel(),
  }));
  protected readonly leftSidebarTab = signal<'blocks' | 'decorations' | 'groups'>('blocks');
  protected readonly deletingProject = signal(false);
  protected readonly settingsDialogOpen = signal(false);
  protected readonly controlsHelpOpen = signal(false);
  protected readonly assetManagerOpen = signal(false);
  protected readonly assetManagerInitialTab = signal<AssetManagerInitialTab>('vanilla');
  protected readonly diagnosticsOpen = signal(false);
  protected readonly structureJsonExportOpen = signal(false);
  protected readonly structureJsonImportOpen = signal(false);
  protected readonly structureNbtExportOpen = signal(false);
  protected readonly leftDrawerOpen = signal(false);
  protected readonly rightDrawerOpen = signal(false);
  protected readonly rightSidebarTab = signal<'selection' | 'block-usage'>('selection');
  private drawerOpener?: HTMLElement;
  private focusedResizeSide?: 'left' | 'right';
  private readonly document = inject(DOCUMENT);
  private readonly editorBody = viewChild<ElementRef<HTMLElement>>('editorBody');
  protected readonly sidebarResize = new EditorSidebarResizeSession(
    this.layout,
    () => this.editorBody()?.nativeElement.clientWidth ?? 0,
  );
  protected readonly movePanelVisible = signal(false);
  private previousActiveGroupId: string | undefined;
  private readonly movementInput = new EditorMovementInputSession({
    movementDown: (action) => this.currentViewport()?.cameraKeyDown(action),
    movementUp: (action) => this.currentViewport()?.cameraKeyUp(action),
    clearMovement: () => this.currentViewport()?.clearCameraInput(),
  });

  constructor() {
    void this.workspace.restore(this.projectStore);
    effect(() => {
      const activeGroupId = this.groups.activeGroupId();
      if (activeGroupId === this.previousActiveGroupId) return;
      this.previousActiveGroupId = activeGroupId;
      this.groups.resetMove();
      if (!activeGroupId) this.movePanelVisible.set(false);
    });
  }
  ngOnDestroy(): void {
    this.sidebarResize.end();
    this.clearPressedMovementActions();
    void this.autosave.flush().catch(() => undefined);
  }

  protected saveStatusLabel(): string {
    return this.i18n.t(
      this.autosave.status() === 'pending' || this.autosave.status() === 'saving'
        ? 'savingProject'
        : this.autosave.status() === 'error'
          ? 'saveProjectError'
          : 'projectSaved',
    );
  }

  protected handleChromeAction(action: EditorChromeAction): void {
    switch (action.type) {
      case 'navigate-projects':
        void this.navigateToProjects();
        break;
      case 'save-project':
        void this.saveProject();
        break;
      case 'delete-project':
        void this.deleteProject();
        break;
      case 'import-structure-json':
        this.openStructureJsonImport();
        break;
      case 'export-structure-json':
        this.openStructureJsonExport();
        break;
      case 'export-structure-nbt':
        this.openStructureNbtExport();
        break;
      case 'undo':
        this.undoEdit();
        break;
      case 'redo':
        this.redoEdit();
        break;
      case 'select-all':
        this.selectAll();
        break;
      case 'clear-selection':
        this.clearSelection();
        break;
      case 'delete-selection':
        this.deleteSelection();
        break;
      case 'set-mode':
        this.setEditorMode(action.mode);
        break;
      case 'toggle-layout':
        this.toggleLayout(action.key);
        break;
      case 'reset-layout':
        this.resetLayout();
        break;
      case 'fit-structure':
        this.fitStructure();
        break;
      case 'focus-selection':
        this.focusSelection();
        break;
      case 'open-asset-manager':
        this.openAssetManager();
        break;
      case 'open-mod-jar-import':
        this.openAssetManager('mods');
        break;
      case 'open-diagnostics':
        this.openProjectDiagnostics();
        break;
      case 'open-settings':
        this.openSettingsDialog();
        break;
      case 'set-locale':
        this.chooseLanguage(action.locale);
        break;
      case 'set-theme':
        this.chooseTheme(action.theme);
        break;
      case 'set-background':
        this.chooseEditorBackground(action.background);
        break;
      case 'open-controls-help':
        this.showControlsHelp();
        break;
      case 'open-about':
        this.showAbout();
        break;
      case 'unavailable-feature':
        this.showUnavailableFeature();
        break;
      case 'set-tool':
        this.tool.select(action.tool);
        break;
      case 'camera-preset':
        this.setCameraPreset(action.preset);
        break;
      case 'reset-camera':
        this.resetCamera();
        break;
    }
  }

  protected fitStructure(): void {
    this.currentViewport()?.fitStructure();
  }
  protected focusSelection(): void {
    this.currentViewport()?.focusSelection();
  }
  protected resetCamera(): void {
    this.currentViewport()?.resetCamera();
  }
  protected setCameraPreset(preset: CameraPreset): void {
    this.currentViewport()?.setCameraPreset(preset);
  }
  protected currentViewportPerformanceEvidence(): ViewportPerformanceEvidence | undefined {
    return this.currentViewport()?.performanceEvidence();
  }
  protected handleSidebarTabKeydown(event: KeyboardEvent, index: number): void {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    const tabs = ['blocks', 'decorations', 'groups'] as const;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    this.leftSidebarTab.set(tabs[next]);
    document.getElementById(`sidebar-tab-${tabs[next]}`)?.focus();
  }
  protected handleRightSidebarTabKeydown(event: KeyboardEvent, index: number): void {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    const tabs = ['selection', 'block-usage'] as const;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    this.rightSidebarTab.set(tabs[next]);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(next)
      ?.focus();
  }
  protected openSettingsDialog(): void {
    this.settingsDialogOpen.set(true);
  }
  protected openAssetManager(initialTab: AssetManagerInitialTab = 'vanilla'): void {
    this.assetManagerInitialTab.set(initialTab);
    this.assetManagerOpen.set(true);
  }
  protected openProjectDiagnostics(): void {
    this.diagnosticsOpen.set(true);
  }
  protected closeSettingsDialog(): void {
    this.settingsDialogOpen.set(false);
  }
  protected toggleLayout(
    key:
      | 'editorToolbarVisible'
      | 'leftSidebarVisible'
      | 'rightSidebarVisible'
      | 'quickBarVisible'
      | 'statusBarVisible',
  ): void {
    this.layout.set(key, !this.layout.preferences()[key]);
  }
  protected resetLayout(): void {
    this.sidebarResize.reset();
    this.layout.reset();
  }
  protected chooseLanguage(locale: 'en' | 'vi'): void {
    this.i18n.setLocale(locale);
  }
  protected chooseTheme(theme: 'light' | 'dark' | 'craft' | 'raccoon'): void {
    this.theme.setPreset(theme);
  }
  protected chooseEditorBackground(background: EditorBackgroundMode): void {
    this.theme.setEditorBackground(background);
  }
  protected setEditorMode(mode: '3d' | 'y-layer'): void {
    this.changeEditorMode(mode);
  }
  protected retryRestore(): void {
    void this.workspace.restore(this.projectStore);
  }
  protected restoreRecovery(): void {
    void this.workspace.restoreRecovery();
  }
  protected discardRecovery(): void {
    void this.workspace.discardRecovery();
  }
  protected continueWithMain(): void {
    this.workspace.continueWithMain();
  }
  protected async backToProjects(): Promise<void> {
    await this.router.navigateByUrl('/');
  }
  protected openDrawer(side: 'left' | 'right', event: Event): void {
    this.drawerOpener = event.currentTarget as HTMLElement;
    if (side === 'left') {
      this.leftDrawerOpen.set(true);
      this.rightDrawerOpen.set(false);
    } else {
      this.rightDrawerOpen.set(true);
      this.leftDrawerOpen.set(false);
    }
  }
  protected closeDrawers(returnFocus = true): void {
    this.leftDrawerOpen.set(false);
    this.rightDrawerOpen.set(false);
    if (returnFocus) {
      const opener = this.drawerOpener;
      this.drawerOpener = undefined;
      opener?.focus();
    }
  }
  protected async navigateToProjects(): Promise<void> {
    await this.router.navigateByUrl('/');
  }
  protected async saveProject(): Promise<void> {
    try {
      await this.autosave.flush();
      await this.dialogs.success(this.i18n.t('saveProjectSuccess'));
    } catch {
      await this.dialogs.error(this.i18n.t('saveProjectError'), this.i18n.t('saveProjectError'));
    }
  }
  protected async deleteProject(): Promise<void> {
    const project = this.workspace.project();
    if (!project || this.deletingProject()) return;
    const name = project.metadata.name;
    this.deletingProject.set(true);
    try {
      try {
        const confirmed = await this.dialogs.confirm({
          title: this.i18n.t('deleteProjectTitle'),
          text: this.i18n.t('deleteProjectText').replace('{name}', name),
          confirmButtonText: this.i18n.t('deleteProjectConfirm'),
          cancelButtonText: this.i18n.t('cancel'),
          icon: 'warning',
          destructive: true,
        });
        if (!confirmed) return;
        await this.projectDeletion.deleteProject(project.id);
      } catch {
        await this.dialogs.error(
          this.i18n.t('deleteProjectError'),
          this.i18n.t('deleteProjectError'),
        );
        return;
      }

      try {
        await this.dialogs.success(this.i18n.t('deleteProjectSuccess'));
      } catch {
        // A notice failure must not prevent leaving an already-deleted project.
      }
      try {
        if (await this.router.navigateByUrl('/')) return;
        await this.dialogs.warning(
          this.i18n.t('deleteProjectSuccess'),
          this.i18n.t('deleteProjectNavigationError'),
        );
      } catch {
        await this.dialogs.warning(
          this.i18n.t('deleteProjectSuccess'),
          this.i18n.t('deleteProjectNavigationError'),
        );
      }
    } finally {
      this.deletingProject.set(false);
    }
  }
  protected openStructureJsonImport(): void {
    this.structureJsonImportOpen.set(true);
  }
  protected closeStructureJsonImport(): void {
    this.structureJsonImportOpen.set(false);
  }
  protected showUnavailableFeature(): void {
    void this.dialogs.info(this.i18n.t('featureUnavailable'), this.i18n.t('featureUnavailable'));
  }
  protected openStructureNbtExport(): void {
    this.structureNbtExportOpen.set(true);
  }
  protected closeStructureNbtExport(): void {
    this.structureNbtExportOpen.set(false);
  }
  protected openStructureJsonExport(): void {
    this.structureJsonExportOpen.set(true);
  }
  protected closeStructureJsonExport(): void {
    this.structureJsonExportOpen.set(false);
  }
  protected showControlsHelp(): void {
    this.controlsHelpOpen.set(true);
  }
  protected showAbout(): void {
    void this.dialogs.info(this.i18n.t('about'), this.i18n.t('aboutText'));
  }
  protected clearSelection(): void {
    this.selection.clear();
    this.decorations.clearSelection();
  }
  protected selectAll(): void {
    const project = this.workspace.project();
    if (project) this.selection.selectAll(project);
  }
  protected undoEdit(): void {
    this.history.undo();
  }
  protected redoEdit(): void {
    this.history.redo();
  }
  protected deleteSelection(): boolean {
    const decoration = this.selectedDecoration();
    const handled = decoration
      ? (this.decorations.delete(decoration.instanceId), true)
      : this.editor.deleteSelection();
    return handled;
  }
  protected showMovePanel(): void {
    if (this.groups.activeGroup()) {
      this.movePanelVisible.set(true);
    }
  }
  protected hideMovePanel(): void {
    this.groups.resetMove();
    this.movePanelVisible.set(false);
  }
  protected handleEditorShortcut(event: KeyboardEvent): void {
    if (
      this.settingsDialogOpen() ||
      this.controlsHelpOpen() ||
      this.assetManagerOpen() ||
      this.diagnosticsOpen() ||
      this.structureJsonImportOpen() ||
      this.structureJsonExportOpen() ||
      this.structureNbtExportOpen()
    )
      return;
    if (event.key === 'Escape') {
      if (this.leftDrawerOpen() || this.rightDrawerOpen()) {
        this.closeDrawers();
        event.preventDefault();
        return;
      }
      return;
    }
    const action = this.keyboard.actionForEvent(event);
    if (!action) return;
    if (action === 'tool-toggle' && event.repeat) return;
    if (isMovementAction(action)) {
      this.movementInput.keyDown(action, movementPhysicalKey(event));
      event.preventDefault();
      return;
    }
    if (action === 'delete-selection' && this.movementInput.shouldSuppressDestructiveAction()) {
      event.preventDefault();
      return;
    }
    const handled = this.executeKeyboardAction(action);
    if (handled) event.preventDefault();
  }

  protected handleEditorKeyup(event: KeyboardEvent): void {
    const key = movementPhysicalKey(event);
    this.movementInput.keyUp(key);
    if (!isEditableKeyboardTarget(event.target)) event.preventDefault();
  }

  protected handleFocusIn(event?: FocusEvent): void {
    const target = event?.target;
    if (target instanceof HTMLElement && target.classList.contains('left-resize-handle')) {
      this.focusedResizeSide = 'left';
    } else if (target instanceof HTMLElement && target.classList.contains('right-resize-handle')) {
      this.focusedResizeSide = 'right';
    } else if (target instanceof HTMLElement && target !== this.document.body) {
      this.focusedResizeSide = undefined;
    }
    this.clearPressedMovementActions();
  }
  protected handleViewportResize(): void {
    this.sidebarResize.clampToViewport();
    const side = this.focusedResizeSide;
    const view = this.document.defaultView;
    if (!side || !view) return;

    view.requestAnimationFrame(() => {
      if (view.innerWidth > 850) return;
      const editorBody = this.editorBody()?.nativeElement;
      const handle = editorBody?.querySelector<HTMLElement>(`.${side}-resize-handle`);
      if (!handle || view.getComputedStyle(handle).display !== 'none') return;

      const openerLabel = side === 'left' ? 'openLeftSidebar' : 'openRightSidebar';
      const opener = [
        ...(editorBody?.querySelectorAll<HTMLButtonElement>('.responsive-drawer-actions button') ??
          []),
      ].find((button) => button.getAttribute('aria-label') === this.i18n.t(openerLabel));
      opener?.focus();
      this.focusedResizeSide = undefined;
    });
  }
  protected handleVisibilityChange(_event?: Event): void {
    this.clearPressedMovementActions();
  }
  protected handleWindowBlur(_event?: FocusEvent): void {
    this.clearPressedMovementActions();
  }

  protected clearPressedMovementActions(): void {
    this.movementInput.clear();
  }
  private changeEditorMode(mode: '3d' | 'y-layer'): void {
    if (this.mode.mode() === mode) return;
    this.clearPressedMovementActions();
    this.mode.setMode(mode);
  }

  private executeKeyboardAction(action: KeyboardAction): boolean {
    if (action === 'undo') return this.history.undo();
    if (action === 'redo') return this.history.redo();
    if (action === 'select-all') {
      const project = this.workspace.project();
      if (!project) return false;
      this.selection.selectAll(project);
      return true;
    }
    if (action === 'clear-selection') {
      this.selection.clear();
      this.decorations.clearSelection();
      return true;
    }
    if (action === 'delete-selection') {
      const decoration = this.selectedDecoration();
      if (decoration) {
        this.decorations.delete(decoration.instanceId);
        return true;
      }
      return this.editor.deleteSelection();
    }
    if (action === 'tool-place') {
      this.tool.select('place');
      return true;
    }
    if (action === 'tool-select') {
      this.tool.select('select');
      return true;
    }
    if (action === 'tool-toggle') {
      this.tool.select(this.tool.active() === 'place' ? 'select' : 'place');
      return true;
    }
    if (action === 'mode-3d') {
      this.changeEditorMode('3d');
      return true;
    }
    if (action === 'mode-y-layer') {
      this.changeEditorMode('y-layer');
      return true;
    }
    if (action === 'fit-structure') {
      this.fitStructure();
      return true;
    }
    if (action === 'focus-selection') {
      if (!this.focusSelectionAvailable()) return false;
      this.focusSelection();
      return true;
    }
    if (action === 'save-project') {
      void this.saveProject();
      return true;
    }
    if (action.startsWith('quick-slot-')) {
      const index = Number(action.slice('quick-slot-'.length)) - 1;
      const entry = this.quickBar.entries()[index];
      if (!entry) return false;
      this.quickBar.select(entry);
      return true;
    }
    return false;
  }

  private currentViewport(): ViewportComponent | YLayerComponent | undefined {
    return this.mode.mode() === '3d' ? this.threeDViewport() : this.yLayerViewport();
  }
}
