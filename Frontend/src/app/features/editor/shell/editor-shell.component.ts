import { Component, ElementRef, OnDestroy, computed, effect, inject, isDevMode, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ThemeService } from '../../../core/ui/theme/theme.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { BlockBrowserComponent } from '../blocks/block-browser/block-browser.component';
import { DecorationBrowserComponent } from '../decorations/decoration-browser/decoration-browser.component';
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
import { isEditableKeyboardTarget, isMovementAction, KeyboardAction, keyboardRouteTrace, MovementAction } from '../../../core/editor/input/keyboard-bindings';
import { KeyboardBindingService } from '../../../core/editor/input/keyboard-binding.service';
import { QuickBlockBarService } from '../../../core/editor/quick-bar/quick-block-bar.service';
import { IndexedDbProjectStore } from '../../../core/persistence/project-store/indexeddb-project-store';
import { ProjectPersistenceService } from '../../../core/persistence/project-persistence.service';
import { ProjectAutosaveService } from '../../../core/persistence/autosave/project-autosave.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { EditorLayoutPreferencesService } from '../../../core/ui/preferences/editor-layout-preferences.service';
import { clampGroupMovePanelPosition, PanelPosition } from '../../../features/editor/shell/group-move/group-move-panel';
import { DecorationService } from '../../../core/decorations/decoration.service';
import { SettingsDialogComponent } from '../settings/settings-dialog/settings-dialog.component';
import { LucideChevronDown, LucideRedo2, LucideRotateCcw, LucideUndo2, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { GroupsPanelComponent } from '../groups/groups-panel/groups-panel.component';
import { SelectionInspectorComponent } from '../inspector/selection-inspector/selection-inspector.component';
import { EditorStatusBarComponent } from './editor-status-bar/editor-status-bar.component';
import { ShortcutsHelpDialogComponent } from '../settings/shortcuts-help/shortcuts-help-dialog.component';
import { AssetManagerDialogComponent } from '../tools/asset-manager/asset-manager-dialog.component';
import { ProjectDiagnosticsDialogComponent } from '../tools/diagnostics/project-diagnostics-dialog.component';
import { EditorSessionService } from '../../../core/editor/state/editor-session.service';
import { ProjectPackageImportService } from '../../../core/persistence/project-package/project-package-import.service';
import { ProjectImportStatusComponent } from '../project-import/project-import-status.component';
import { VanillaAssetsService } from '../../../core/assets/vanilla/vanilla-assets.service';
import { sanitizeFilename } from '../../../core/persistence/file-name';
import { StructureJsonExportDialogComponent } from '../structure-json/structure-json-export-dialog.component';
import { StructureJsonImportDialogComponent } from '../structure-json/structure-json-import-dialog.component';

export function hasEditorSelectionState(decorationSelected: boolean, logicalCount: number, boxSelected: boolean): boolean {
  return decorationSelected || logicalCount > 0 || boxSelected;
}

@Component({ selector: 'app-editor-shell', imports: [RouterLink, BlockBrowserComponent, DecorationBrowserComponent, GroupsPanelComponent, SelectionInspectorComponent, EditorStatusBarComponent, QuickBlockBarComponent, ViewportComponent, YLayerComponent, SettingsDialogComponent, ShortcutsHelpDialogComponent, AssetManagerDialogComponent, ProjectDiagnosticsDialogComponent, ProjectImportStatusComponent, StructureJsonExportDialogComponent, StructureJsonImportDialogComponent, LucideChevronDown, LucideRedo2, LucideRotateCcw, LucideUndo2, LucideX, UiTooltipDirective], templateUrl: './editor-shell.component.html', styleUrl: './editor-shell.component.scss', host: { '(document:keydown)': 'handleEditorShortcut($event)', '(document:keyup)': 'handleEditorKeyup($event)', '(document:focusin)': 'clearPressedMovementActions()', '(document:visibilitychange)': 'clearPressedMovementActions()', '(document:click)': 'closeMenus()', '(document:pointermove)': 'movePanelDrag($event); moveSidebarResize($event)', '(document:pointerup)': 'endMovePanelDrag($event); endSidebarResize($event)', '(document:pointercancel)': 'endMovePanelDrag($event); endSidebarResize($event)', '(window:blur)': 'clearPressedMovementActions()', '(window:resize)': 'clampSidebarWidths()' } })
export class EditorShellComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly mode = inject(EditorModeService);
  protected readonly tool = inject(EditorToolService);
  protected readonly selection = inject(SelectionService);
  protected readonly groups = inject(GroupService);
  protected readonly decorations = inject(DecorationService);
  protected readonly history = inject(HistoryService);
  private readonly keyboard = inject(KeyboardBindingService);
  private readonly quickBar = inject(QuickBlockBarService);
  protected readonly autosave = inject(ProjectAutosaveService);
  protected readonly layout = inject(EditorLayoutPreferencesService);
  private readonly dialogs = inject(DialogService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly editor = inject(StructureEditorService);
  private readonly router = inject(Router);
  private readonly persistence = new ProjectPersistenceService(new IndexedDbProjectStore());
  protected readonly importCoordinator = new ProjectPackageImportService(this.persistence);
  protected readonly importState = this.importCoordinator.state;
  private readonly library = inject(BlockLibraryService);
  private readonly session = inject(EditorSessionService);
  private readonly threeDViewport = viewChild(ViewportComponent);
  private readonly yLayerViewport = viewChild(YLayerComponent);
  protected readonly selectedDecoration = this.decorations.selected;
  protected readonly presets: readonly CameraPreset[] = ['perspective', 'top', 'front', 'back', 'left', 'right'];
  protected readonly logicalSelectionCount = computed(() => this.selection.count(this.workspace.project()));
  protected readonly hasEditorSelection = computed(() => hasEditorSelectionState(!!this.selectedDecoration(), this.logicalSelectionCount(), !!this.selection.box() || this.selection.kind() === 'all'));
  protected readonly focusSelectionAvailable = computed(() => !!this.selectedDecoration() || this.selection.hasAny(this.workspace.project()));
  protected readonly leftSidebarTab = signal<'blocks' | 'decorations' | 'groups'>('blocks');
  protected readonly activeMenu = signal<'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help' | undefined>(undefined);
  protected readonly cameraMenuOpen = signal(false);
  protected readonly deletingProject = signal(false);
  protected readonly settingsDialogOpen = signal(false);
  protected readonly controlsHelpOpen = signal(false);
  protected readonly assetManagerOpen = signal(false);
  protected readonly diagnosticsOpen = signal(false);
  protected readonly structureJsonExportOpen = signal(false);
  protected readonly structureJsonImportOpen = signal(false);
  protected readonly leftDrawerOpen = signal(false);
  protected readonly rightDrawerOpen = signal(false);
  private drawerOpener?: HTMLElement;
  private readonly editorBody = viewChild<ElementRef<HTMLElement>>('editorBody');
  private readonly leftDragWidth = signal<number | undefined>(undefined);
  private readonly rightDragWidth = signal<number | undefined>(undefined);
  protected readonly editorGridTemplate = computed(() => {
    const preferences = this.layout.preferences();
    const left = this.leftDragWidth() ?? preferences.leftSidebarWidth;
    const right = this.rightDragWidth() ?? preferences.rightSidebarWidth;
    if (!preferences.leftSidebarVisible && !preferences.rightSidebarVisible) return 'minmax(0, 1fr)';
    if (!preferences.leftSidebarVisible) return `minmax(0, 1fr) ${right}px`;
    if (!preferences.rightSidebarVisible) return `${left}px minmax(0, 1fr)`;
    return `${left}px minmax(0, 1fr) ${right}px`;
  });
  protected readonly movePanelVisible = signal(false);
  private readonly viewportHost = viewChild<ElementRef<HTMLElement>>('viewportHost');
  private readonly movePanel = viewChild<ElementRef<HTMLElement>>('groupMovePanel');
  protected readonly movePanelPosition = computed(() => {
    const preferences = this.layout.preferences();
    const host = this.viewportHost()?.nativeElement;
    const width = host?.clientWidth ?? 640;
    const height = host?.clientHeight ?? 480;
    const panel = this.movePanel()?.nativeElement;
    return clampGroupMovePanelPosition(
      { x: preferences.groupMovePanelX ?? Math.max(16, width - 316), y: preferences.groupMovePanelY ?? 16 },
      { width, height },
      { width: panel?.offsetWidth ?? 300, height: panel?.offsetHeight ?? 280 },
    );
  });
  private previousActiveGroupId: string | undefined;
  private moveDrag?: { readonly pointerId: number; readonly startX: number; readonly startY: number; readonly origin: PanelPosition };
  private sidebarDrag?: { readonly side: 'left' | 'right'; readonly pointerId: number; readonly startX: number; readonly origin: number };
  private readonly pressedMovementActions = new Map<string, MovementAction>();

  constructor() {
    void this.workspace.restore(new IndexedDbProjectStore());
    effect(() => {
      const activeGroupId = this.groups.activeGroupId();
      if (activeGroupId === this.previousActiveGroupId) return;
      this.previousActiveGroupId = activeGroupId;
      this.groups.resetMove();
      if (!activeGroupId) this.movePanelVisible.set(false);
    });
  }
  ngOnDestroy(): void { this.clearPressedMovementActions(); void this.autosave.flush().catch(() => undefined); }

  protected saveStatusLabel(): string { return this.i18n.t(this.autosave.status() === 'pending' || this.autosave.status() === 'saving' ? 'savingProject' : this.autosave.status() === 'error' ? 'saveProjectError' : 'projectSaved'); }
  protected shortcutTitle(action: KeyboardAction): string { return `${this.i18n.t(action === 'undo' ? 'undo' : 'redo')} (${this.keyboard.bindings()[action].replaceAll('|', ' / ')})`; }

  protected fitStructure(): void { this.currentViewport()?.fitStructure(); }
  protected focusSelection(): void { this.currentViewport()?.focusSelection(); }
  protected resetCamera(): void { this.currentViewport()?.resetCamera(); }
  protected setCameraPreset(preset: CameraPreset): void { this.currentViewport()?.setCameraPreset(preset); }
  protected presetLabel(preset: CameraPreset): string { return this.i18n.t(({ perspective: 'cameraPerspective', top: 'cameraTop', front: 'cameraFront', back: 'cameraBack', left: 'cameraLeft', right: 'cameraRight' } as const)[preset]); }
  protected deleteSelectedDecoration(): void { const decoration = this.selectedDecoration(); if (decoration) this.decorations.delete(decoration.instanceId); }
  protected handleSidebarTabKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const tabs = ['blocks', 'decorations', 'groups'] as const;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    this.leftSidebarTab.set(tabs[next]);
    document.getElementById(`sidebar-tab-${tabs[next]}`)?.focus();
  }
  protected setMoveOffset(axis: 'x' | 'y' | 'z', event: Event): void { this.groups.setMoveOffset(axis, Number((event.target as HTMLInputElement).value)); }
  protected setMoveStep(event: Event): void { this.groups.setMoveStep(Number((event.target as HTMLInputElement).value)); }
  protected nudgeMove(axis: 'x' | 'y' | 'z', direction: 1 | -1): void { this.groups.nudgeMove(axis, direction); }
  protected toggleAppMenu(menu: 'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help', event: Event): void {
    event.stopPropagation();
    this.cameraMenuOpen.set(false);
    this.activeMenu.update((current) => current === menu ? undefined : menu);
  }
  protected toggleCameraMenu(event: Event): void {
    event.stopPropagation();
    this.activeMenu.set(undefined);
    this.cameraMenuOpen.update((open) => !open);
  }
  protected handleAppMenuKeydown(event: KeyboardEvent): void {
    const trigger = event.target instanceof HTMLElement ? event.target.closest('.app-menu-trigger') : null;
    if (event.key === 'Escape' && (trigger || this.activeMenu())) {
      event.preventDefault();
      const activeTrigger = (trigger as HTMLElement | null) ?? document.querySelector<HTMLElement>('.app-menu-trigger.active');
      this.closeMenus();
      activeTrigger?.focus();
      return;
    }
    if (!this.activeMenu() || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    const entry = (trigger as HTMLElement | null)?.closest('.menu-entry') ?? document.querySelector('.menu-popover')?.parentElement;
    const items = entry?.querySelectorAll<HTMLButtonElement>('.menu-popover button:not(:disabled)');
    if (!items?.length) return;
    event.preventDefault();
    (event.key === 'ArrowUp' ? items[items.length - 1] : items[0]).focus();
  }
  protected closeMenus(): void { this.activeMenu.set(undefined); this.cameraMenuOpen.set(false); }
  protected openSettingsDialog(): void { this.closeMenus(); this.settingsDialogOpen.set(true); }
  protected openAssetManager(): void { this.closeMenus(); this.assetManagerOpen.set(true); }
  protected openProjectDiagnostics(): void { this.closeMenus(); this.diagnosticsOpen.set(true); }
  protected closeSettingsDialog(): void { this.settingsDialogOpen.set(false); }
  protected toggleLayout(key: 'editorToolbarVisible' | 'leftSidebarVisible' | 'rightSidebarVisible' | 'quickBarVisible' | 'statusBarVisible'): void { this.layout.set(key, !this.layout.preferences()[key]); this.scheduleMovePanelClamp(); this.closeMenus(); }
  protected resetLayout(): void { this.sidebarDrag = undefined; this.leftDragWidth.set(undefined); this.rightDragWidth.set(undefined); this.layout.reset(); }
  protected chooseLanguage(locale: 'en' | 'vi'): void { this.i18n.setLocale(locale); this.closeMenus(); }
  protected chooseTheme(theme: 'light' | 'dark' | 'craft'): void { this.theme.setPreset(theme); this.closeMenus(); }
  protected chooseFont(font: 'geist' | 'minecraft-style'): void { this.theme.setFont(font); this.closeMenus(); }
  protected chooseEditorBackground(background: 'dark' | 'light'): void { this.theme.setEditorBackground(background); this.closeMenus(); }
  protected setEditorMode(mode: '3d' | 'y-layer'): void { this.mode.setMode(mode); this.closeMenus(); }
  protected retryRestore(): void { void this.workspace.restore(new IndexedDbProjectStore()); }
  protected async backToProjects(): Promise<void> {
    if (!await this.confirmLeavingProtectedAssetOperation()) return;
    await this.router.navigateByUrl('/');
  }
  protected openDrawer(side: 'left' | 'right', event: Event): void {
    this.drawerOpener = event.currentTarget as HTMLElement;
    if (side === 'left') { this.leftDrawerOpen.set(true); this.rightDrawerOpen.set(false); }
    else { this.rightDrawerOpen.set(true); this.leftDrawerOpen.set(false); }
  }
  protected closeDrawers(returnFocus = true): void {
    this.leftDrawerOpen.set(false); this.rightDrawerOpen.set(false);
    if (returnFocus) { const opener = this.drawerOpener; this.drawerOpener = undefined; opener?.focus(); }
  }
  protected async navigateToProjects(): Promise<void> {
    if (!await this.confirmLeavingProtectedAssetOperation()) return;
    this.closeMenus(); await this.autosave.flush().catch(() => undefined); await this.router.navigateByUrl('/');
  }
  protected async saveProject(): Promise<void> {
    this.closeMenus();
    try { await this.autosave.flush(); await this.dialogs.success(this.i18n.t('saveProjectSuccess')); }
    catch { await this.dialogs.error(this.i18n.t('saveProjectError'), this.i18n.t('saveProjectError')); }
  }
  protected async deleteProject(): Promise<void> {
    const project = this.workspace.project();
    if (!project || this.deletingProject()) return;
    this.closeMenus();
    const name = project.metadata.name;
    this.deletingProject.set(true);
    try {
      const confirmed = await this.dialogs.confirm({ title: this.i18n.t('deleteProjectTitle'), text: this.i18n.t('deleteProjectText').replace('{name}', name), confirmButtonText: this.i18n.t('deleteProjectConfirm'), cancelButtonText: this.i18n.t('cancel'), icon: 'warning', destructive: true });
      if (!confirmed) return;
      await this.autosave.deleteProject(project.id);
      this.session.clearActiveProject();
      this.workspace.deactivate();
      await this.dialogs.success(this.i18n.t('deleteProjectSuccess'));
      await this.router.navigateByUrl('/');
    } catch {
      await this.dialogs.error(this.i18n.t('deleteProjectError'), this.i18n.t('deleteProjectError'));
    } finally {
      this.deletingProject.set(false);
    }
  }
  protected triggerProjectImport(input: HTMLInputElement): void { if (this.importState().stage !== 'idle' && this.importState().stage !== 'success' && this.importState().stage !== 'error') return; this.closeMenus(); input.value = ''; input.click(); }
  protected openStructureJsonImport(): void { this.closeMenus(); this.structureJsonImportOpen.set(true); }
  protected closeStructureJsonImport(): void { this.structureJsonImportOpen.set(false); }
  protected async importProjectPackage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    await this.importCoordinator.import(
      file,
      () => this.autosave.flush(),
      (project) => { this.session.resetForProjectChange(project.id, true); this.workspace.activate(project); },
    );
  }
  protected exportProjectPackage(): void {
    this.closeMenus();
    const project = this.workspace.project();
    if (!project) return;
    try {
      const blob = new Blob([this.persistence.exportPackage(project)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${sanitizeFilename(project.metadata.name)}.minecraftbuilder.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { void this.dialogs.error(this.i18n.t('exportProjectError'), this.i18n.t('exportProjectError')); }
  }
  protected showUnavailableFeature(): void { this.closeMenus(); void this.dialogs.info(this.i18n.t('featureUnavailable'), this.i18n.t('featureUnavailable')); }
  protected showStructureExportUnavailable(): void { this.closeMenus(); void this.dialogs.info(this.i18n.t('exportStructureNbt'), this.i18n.t('structureNbtUnavailable')); }
  protected openStructureJsonExport(): void { this.closeMenus(); this.structureJsonExportOpen.set(true); }
  protected closeStructureJsonExport(): void { this.structureJsonExportOpen.set(false); }
  protected showControlsHelp(): void { this.closeMenus(); this.controlsHelpOpen.set(true); }
  protected showAbout(): void { this.closeMenus(); void this.dialogs.info(this.i18n.t('about'), this.i18n.t('aboutText')); }
  protected clearSelection(): void { this.selection.clear(); this.decorations.clearSelection(); this.closeMenus(); }
  protected selectAll(): void { const project = this.workspace.project(); if (project) this.selection.selectAll(project, (id) => this.library.get(id)); this.closeMenus(); }
  protected undoEdit(): void { this.history.undo(); this.closeMenus(); }
  protected redoEdit(): void { this.history.redo(); this.closeMenus(); }
  protected deleteSelection(): boolean {
    const decoration = this.selectedDecoration();
    const handled = decoration ? (this.decorations.delete(decoration.instanceId), true) : this.editor.deleteSelection();
    this.closeMenus();
    return handled;
  }
  protected effectiveSidebarWidth(side: 'left' | 'right'): number { return side === 'left' ? this.leftDragWidth() ?? this.layout.preferences().leftSidebarWidth : this.rightDragWidth() ?? this.layout.preferences().rightSidebarWidth; }
  protected beginSidebarResize(side: 'left' | 'right', event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    this.sidebarDrag = { side, pointerId: event.pointerId, startX: event.clientX, origin: this.effectiveSidebarWidth(side) };
  }
  protected adjustSidebarWithKeyboard(side: 'left' | 'right', event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = side === 'left' ? (event.key === 'ArrowRight' ? 1 : -1) : (event.key === 'ArrowLeft' ? 1 : -1);
    this.layout.setSidebarWidth(side, this.clampSidebarWidth(side, this.effectiveSidebarWidth(side) + direction * 16));
  }
  protected moveSidebarResize(event: PointerEvent): void {
    const drag = this.sidebarDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = drag.side === 'left' ? event.clientX - drag.startX : drag.startX - event.clientX;
    const width = this.clampSidebarWidth(drag.side, drag.origin + delta);
    (drag.side === 'left' ? this.leftDragWidth : this.rightDragWidth).set(width);
  }
  protected endSidebarResize(event?: PointerEvent): void {
    const drag = this.sidebarDrag;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const width = this.effectiveSidebarWidth(drag.side);
    this.layout.setSidebarWidth(drag.side, width);
    (drag.side === 'left' ? this.leftDragWidth : this.rightDragWidth).set(undefined);
    this.sidebarDrag = undefined;
  }
  protected clampSidebarWidths(): void {
    const preferences = this.layout.preferences();
    for (const side of ['left', 'right'] as const) {
      const current = side === 'left' ? preferences.leftSidebarWidth : preferences.rightSidebarWidth;
      const clamped = this.clampSidebarWidth(side, current);
      if (clamped !== current) this.layout.setSidebarWidth(side, clamped);
    }
  }
  protected showMovePanel(): void { if (this.groups.activeGroup()) { this.movePanelVisible.set(true); this.scheduleMovePanelClamp(); } }
  protected hideMovePanel(): void { this.groups.resetMove(); this.movePanelVisible.set(false); this.moveDrag = undefined; }
  protected beginMovePanelDrag(event: PointerEvent): void {
    if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea'))) return;
    event.preventDefault();
    event.stopPropagation();
    const position = this.movePanelPosition();
    this.moveDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: position };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  protected movePanelDrag(event: PointerEvent): void {
    const drag = this.moveDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const position = this.clampMovePanelPosition({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY });
    this.layout.setGroupMovePanelPosition(position.x, position.y);
  }
  protected endMovePanelDrag(event?: PointerEvent): void {
    if (event && this.moveDrag && event.pointerId !== this.moveDrag.pointerId) return;
    this.moveDrag = undefined;
  }
  protected clampMovePanel(): void { this.persistClampedMovePanelPosition(); }
  protected moveReason(): string { const reason = this.groups.movePreview()?.reason; return reason === 'bounds' ? this.i18n.t('moveOutsideBounds') : reason === 'collision' ? this.i18n.t('moveCollision') : reason === 'locked' ? this.i18n.t('moveLocked') : ''; }
  private scheduleMovePanelClamp(): void {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this.persistClampedMovePanelPosition());
    else queueMicrotask(() => this.persistClampedMovePanelPosition());
  }
  private persistClampedMovePanelPosition(): void {
    if (!this.movePanelVisible()) return;
    const position = this.movePanelPosition();
    const preferences = this.layout.preferences();
    if (preferences.groupMovePanelX !== position.x || preferences.groupMovePanelY !== position.y) this.layout.setGroupMovePanelPosition(position.x, position.y);
  }
  private clampMovePanelPosition(position: PanelPosition): PanelPosition {
    const host = this.viewportHost()?.nativeElement;
    const panel = this.movePanel()?.nativeElement;
    return clampGroupMovePanelPosition(position, { width: host?.clientWidth ?? 640, height: host?.clientHeight ?? 480 }, { width: panel?.offsetWidth ?? 300, height: panel?.offsetHeight ?? 280 });
  }
  protected handleEditorShortcut(event: KeyboardEvent): void {
    if (this.settingsDialogOpen() || this.controlsHelpOpen() || this.assetManagerOpen() || this.diagnosticsOpen() || this.structureJsonImportOpen() || this.structureJsonExportOpen()) return;
    if (event.key === 'Escape') {
      if (this.leftDrawerOpen() || this.rightDrawerOpen()) { this.closeDrawers(); event.preventDefault(); return; }
      this.closeMenus(); return;
    }
    const action = this.keyboard.actionForEvent(event); if (!action) return;
    if (isMovementAction(action)) {
      this.pressedMovementActions.set(event.code || event.key, action);
      this.currentViewport()?.cameraKeyDown(action);
      this.traceKeyboardRoute(event, action);
      event.preventDefault();
      return;
    }
    this.traceKeyboardRoute(event, action, action === 'delete-selection' ? 'Delete selection' : undefined);
    const handled = this.executeKeyboardAction(action);
    if (handled) event.preventDefault();
  }

  protected handleEditorKeyup(event: KeyboardEvent): void {
    const key = event.code || event.key;
    const action = this.pressedMovementActions.get(key);
    if (!action) return;
    this.pressedMovementActions.delete(key);
    this.currentViewport()?.cameraKeyUp(action);
    if (!isEditableKeyboardTarget(event.target)) event.preventDefault();
  }

  protected clearPressedMovementActions(): void {
    const viewport = this.currentViewport();
    for (const action of this.pressedMovementActions.values()) viewport?.cameraKeyUp(action);
    this.pressedMovementActions.clear();
  }

  private traceKeyboardRoute(event: KeyboardEvent, action: KeyboardAction, mutation?: string): void {
    if (isDevMode()) console.debug('[MinecraftBuilder][keyboard route]', keyboardRouteTrace(event, action, mutation));
  }

  private executeKeyboardAction(action: KeyboardAction): boolean {
    if (action === 'undo') return this.history.undo();
    if (action === 'redo') return this.history.redo();
    if (action === 'select-all') { const project = this.workspace.project(); if (!project) return false; this.selection.selectAll(project, (id) => this.library.get(id)); return true; }
    if (action === 'clear-selection') { this.selection.clear(); this.decorations.clearSelection(); return true; }
    if (action === 'delete-selection') {
      const decoration = this.selectedDecoration();
      if (decoration) { this.decorations.delete(decoration.instanceId); return true; }
      return this.editor.deleteSelection();
    }
    if (action === 'tool-place') { this.tool.active.set('place'); return true; }
    if (action === 'tool-select') { this.tool.active.set('select'); return true; }
    if (action === 'mode-3d') { this.mode.setMode('3d'); return true; }
    if (action === 'mode-y-layer') { this.mode.setMode('y-layer'); return true; }
    if (action === 'fit-structure') { this.fitStructure(); return true; }
    if (action === 'focus-selection') { if (!this.focusSelectionAvailable()) return false; this.focusSelection(); return true; }
    if (action === 'save-project') { void this.saveProject(); return true; }
    if (action.startsWith('quick-slot-')) { const index = Number(action.slice('quick-slot-'.length)) - 1; const entry = this.quickBar.entries()[index]; if (!entry) return false; this.quickBar.select(entry); return true; }
    return false;
  }

  private currentViewport(): ViewportComponent | YLayerComponent | undefined {
    return this.mode.mode() === '3d' ? this.threeDViewport() : this.yLayerViewport();
  }
  private async confirmLeavingProtectedAssetOperation(): Promise<boolean> {
    if (!this.assets.activity.hasProtectedOperation()) return true;
    return this.dialogs.confirm({
      title: this.i18n.t('assetOperationLeaveTitle'),
      text: this.i18n.t('assetOperationLeaveText'),
      confirmButtonText: this.i18n.t('leave'),
      cancelButtonText: this.i18n.t('stay'),
      icon: 'warning',
      destructive: true,
    });
  }
  private clampSidebarWidth(side: 'left' | 'right', width: number): number {
    const total = this.editorBody()?.nativeElement.clientWidth || (typeof window === 'undefined' ? 1024 : window.innerWidth);
    const minimum = side === 'left' ? 180 : 200;
    const other = side === 'left' ? this.effectiveSidebarWidth('right') : this.effectiveSidebarWidth('left');
    const otherVisible = side === 'left' ? this.layout.preferences().rightSidebarVisible : this.layout.preferences().leftSidebarVisible;
    const maximum = Math.min(520, Math.max(minimum, total - (otherVisible ? other : 0) - 320));
    return Math.round(Math.min(maximum, Math.max(minimum, width)));
  }
}
