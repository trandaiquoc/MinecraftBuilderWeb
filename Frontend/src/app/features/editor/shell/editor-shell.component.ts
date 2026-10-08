import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import { isEditableKeyboardTarget, isMovementAction, KeyboardAction, movementPhysicalKey } from '../../../core/editor/input/keyboard-bindings';
import { EditorMovementInputSession } from '../../../core/editor/input/editor-movement-input-session';
import { KeyboardBindingService } from '../../../core/editor/input/keyboard-binding.service';
import { QuickBlockBarService } from '../../../core/editor/quick-bar/quick-block-bar.service';
import { IndexedDbProjectStore } from '../../../core/persistence/project-store/indexeddb-project-store';
import { ProjectAutosaveService } from '../../../core/persistence/autosave/project-autosave.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { EditorLayoutPreferencesService } from '../../../core/ui/preferences/editor-layout-preferences.service';
import { clampGroupMovePanelPosition, PanelPosition } from '../../../features/editor/shell/group-move/group-move-panel';
import { EditorSidebarResizeSession } from './editor-sidebar-resize-session';
import { DecorationService } from '../../../core/decorations/decoration.service';
import { SettingsDialogComponent } from '../settings/settings-dialog/settings-dialog.component';
import { LucideChevronDown, LucideRedo2, LucideRotateCcw, LucideUndo2, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { GroupsPanelComponent } from '../groups/groups-panel/groups-panel.component';
import { SelectionInspectorComponent } from '../inspector/selection-inspector/selection-inspector.component';
import { BlockUsagePanelComponent } from '../inspector/block-usage/block-usage-panel.component';
import { EditorStatusBarComponent } from './editor-status-bar/editor-status-bar.component';
import { ShortcutsHelpDialogComponent } from '../settings/shortcuts-help/shortcuts-help-dialog.component';
import { AssetManagerDialogComponent } from '../tools/asset-manager/asset-manager-dialog.component';
import { ProjectDiagnosticsDialogComponent } from '../tools/diagnostics/project-diagnostics-dialog.component';
import { EditorSessionService } from '../../../core/editor/state/editor-session.service';
import { StructureJsonExportDialogComponent } from '../structure-json/structure-json-export-dialog.component';
import { StructureJsonImportDialogComponent } from '../structure-json/structure-json-import-dialog.component';
import { StructureNbtExportDialogComponent } from '../minecraft-structure-export/structure-nbt-export-dialog.component';
import type { ViewportPerformanceEvidence } from '../../../core/renderer/engine/three-viewport-engine';

export function hasEditorSelectionState(decorationSelected: boolean, logicalCount: number, boxSelected: boolean): boolean {
  return decorationSelected || logicalCount > 0 || boxSelected;
}

@Component({ selector: 'app-editor-shell', imports: [RouterLink, BlockBrowserComponent, DecorationBrowserComponent, GroupsPanelComponent, SelectionInspectorComponent, BlockUsagePanelComponent, EditorStatusBarComponent, QuickBlockBarComponent, ViewportComponent, YLayerComponent, SettingsDialogComponent, ShortcutsHelpDialogComponent, AssetManagerDialogComponent, ProjectDiagnosticsDialogComponent, StructureJsonExportDialogComponent, StructureJsonImportDialogComponent, StructureNbtExportDialogComponent, LucideChevronDown, LucideRedo2, LucideRotateCcw, LucideUndo2, LucideX, UiTooltipDirective], templateUrl: './editor-shell.component.html', styleUrl: './editor-shell.component.scss', host: { '(document:keydown)': 'handleEditorShortcut($event)', '(document:keyup)': 'handleEditorKeyup($event)', '(document:focusin)': 'handleFocusIn($event)', '(document:visibilitychange)': 'handleVisibilityChange($event)', '(document:click)': 'closeMenus()', '(document:pointermove)': 'movePanelDrag($event); sidebarResize.move($event)', '(document:pointerup)': 'endMovePanelDrag($event); sidebarResize.end($event)', '(document:pointercancel)': 'endMovePanelDrag($event); sidebarResize.end($event)', '(window:blur)': 'handleWindowBlur($event)', '(window:resize)': 'sidebarResize.clampToViewport()' } })
export class EditorShellComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly mode = inject(EditorModeService);
  protected readonly visitedModes = signal<ReadonlySet<'3d' | 'y-layer'>>(new Set([this.mode.mode()]));
  private readonly visitedModeSync = effect(() => {
    const current = this.mode.mode();
    this.visitedModes.update((visited) => visited.has(current) ? visited : new Set([...visited, current]));
  });
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
  private readonly editor = inject(StructureEditorService);
  private readonly router = inject(Router);
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
  protected readonly structureNbtExportOpen = signal(false);
  protected readonly leftDrawerOpen = signal(false);
  protected readonly rightDrawerOpen = signal(false);
  protected readonly rightSidebarTab = signal<'selection' | 'block-usage'>('selection');
  private drawerOpener?: HTMLElement;
  private readonly editorBody = viewChild<ElementRef<HTMLElement>>('editorBody');
  protected readonly sidebarResize = new EditorSidebarResizeSession(this.layout, () => this.editorBody()?.nativeElement.clientWidth ?? 0);
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
  private readonly movementInput = new EditorMovementInputSession({
    movementDown: (action) => this.currentViewport()?.cameraKeyDown(action),
    movementUp: (action) => this.currentViewport()?.cameraKeyUp(action),
    clearMovement: () => this.currentViewport()?.clearCameraInput(),
  });

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
  ngOnDestroy(): void { this.sidebarResize.end(); this.clearPressedMovementActions(); void this.autosave.flush().catch(() => undefined); }

  protected saveStatusLabel(): string { return this.i18n.t(this.autosave.status() === 'pending' || this.autosave.status() === 'saving' ? 'savingProject' : this.autosave.status() === 'error' ? 'saveProjectError' : 'projectSaved'); }
  protected shortcutTitle(action: KeyboardAction): string { return `${this.i18n.t(action === 'undo' ? 'undo' : 'redo')} (${this.keyboard.bindings()[action].replaceAll('|', ' / ')})`; }

  protected fitStructure(): void { this.currentViewport()?.fitStructure(); }
  protected focusSelection(): void { this.currentViewport()?.focusSelection(); }
  protected resetCamera(): void { this.currentViewport()?.resetCamera(); }
  protected setCameraPreset(preset: CameraPreset): void { this.currentViewport()?.setCameraPreset(preset); }
  protected currentViewportPerformanceEvidence(): ViewportPerformanceEvidence | undefined { return this.currentViewport()?.performanceEvidence(); }
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
  protected resetLayout(): void { this.sidebarResize.reset(); this.layout.reset(); }
  protected chooseLanguage(locale: 'en' | 'vi'): void { this.i18n.setLocale(locale); this.closeMenus(); }
  protected chooseTheme(theme: 'light' | 'dark' | 'craft'): void { this.theme.setPreset(theme); this.closeMenus(); }
  protected chooseFont(font: 'geist' | 'minecraft-style'): void { this.theme.setFont(font); this.closeMenus(); }
  protected chooseEditorBackground(background: 'dark' | 'light'): void { this.theme.setEditorBackground(background); this.closeMenus(); }
  protected setEditorMode(mode: '3d' | 'y-layer'): void { this.changeEditorMode(mode); this.closeMenus(); }
  protected retryRestore(): void { void this.workspace.restore(new IndexedDbProjectStore()); }
  protected restoreRecovery(): void { void this.workspace.restoreRecovery(); }
  protected discardRecovery(): void { void this.workspace.discardRecovery(); }
  protected continueWithMain(): void { this.workspace.continueWithMain(); }
  protected async backToProjects(): Promise<void> {
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
    this.closeMenus(); await this.router.navigateByUrl('/');
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
  protected openStructureJsonImport(): void { this.closeMenus(); this.structureJsonImportOpen.set(true); }
  protected closeStructureJsonImport(): void { this.structureJsonImportOpen.set(false); }
  protected showUnavailableFeature(): void { this.closeMenus(); void this.dialogs.info(this.i18n.t('featureUnavailable'), this.i18n.t('featureUnavailable')); }
  protected openStructureNbtExport(): void { this.closeMenus(); this.structureNbtExportOpen.set(true); }
  protected closeStructureNbtExport(): void { this.structureNbtExportOpen.set(false); }
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
    if (this.settingsDialogOpen() || this.controlsHelpOpen() || this.assetManagerOpen() || this.diagnosticsOpen() || this.structureJsonImportOpen() || this.structureJsonExportOpen() || this.structureNbtExportOpen()) return;
    if (event.key === 'Escape') {
      if (this.leftDrawerOpen() || this.rightDrawerOpen()) { this.closeDrawers(); event.preventDefault(); return; }
      this.closeMenus(); return;
    }
    const action = this.keyboard.actionForEvent(event); if (!action) return;
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

  protected handleFocusIn(_event?: FocusEvent): void { this.clearPressedMovementActions(); }
  protected handleVisibilityChange(_event?: Event): void { this.clearPressedMovementActions(); }
  protected handleWindowBlur(_event?: FocusEvent): void { this.clearPressedMovementActions(); }

  protected clearPressedMovementActions(): void {
    this.movementInput.clear();
  }
  private changeEditorMode(mode: '3d' | 'y-layer'): void { if (this.mode.mode() === mode) return; this.clearPressedMovementActions(); this.mode.setMode(mode); }

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
    if (action === 'mode-3d') { this.changeEditorMode('3d'); return true; }
    if (action === 'mode-y-layer') { this.changeEditorMode('y-layer'); return true; }
    if (action === 'fit-structure') { this.fitStructure(); return true; }
    if (action === 'focus-selection') { if (!this.focusSelectionAvailable()) return false; this.focusSelection(); return true; }
    if (action === 'save-project') { void this.saveProject(); return true; }
    if (action.startsWith('quick-slot-')) { const index = Number(action.slice('quick-slot-'.length)) - 1; const entry = this.quickBar.entries()[index]; if (!entry) return false; this.quickBar.select(entry); return true; }
    return false;
  }

  private currentViewport(): ViewportComponent | YLayerComponent | undefined {
    return this.mode.mode() === '3d' ? this.threeDViewport() : this.yLayerViewport();
  }
}
