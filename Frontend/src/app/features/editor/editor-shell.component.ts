import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18nService } from '../../core/ui/i18n.service';
import { ThemeService } from '../../core/ui/theme.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { BlockBrowserComponent } from './block-browser.component';
import { DecorationBrowserComponent } from './decoration-browser.component';
import { DecorationInspectorComponent } from './decoration-inspector.component';
import { QuickBlockBarComponent } from './quick-block-bar.component';
import { SignInspectorComponent } from './sign-inspector.component';
import { ViewportComponent } from './viewport.component';
import { YLayerComponent } from './y-layer.component';
import { EditorModeService } from '../../core/editor/editor-mode.service';
import { EditorToolService } from '../../core/editor/tool.service';
import { CameraPreset } from '../../core/editor/camera';
import { SelectionService } from '../../core/editor/selection.service';
import { GroupService } from '../../core/editor/group.service';
import { isSignId, StructureEditorService } from '../../core/editor/structure-editor.service';
import { ViewportStatusService } from '../../core/editor/viewport-status.service';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { coordinateKey } from '../../core/domain/coordinates';
import { blockGroupNames } from '../../core/editor/group-membership';
import { HistoryService } from '../../core/editor/history.service';
import { KeyboardAction } from '../../core/editor/keyboard-bindings';
import { KeyboardBindingService } from '../../core/editor/keyboard-binding.service';
import { QuickBlockBarService } from '../../core/editor/quick-block-bar.service';
import { IndexedDbProjectStore } from '../../core/persistence/indexeddb-project-store';
import { ProjectPersistenceService } from '../../core/persistence/project-persistence.service';
import { ProjectAutosaveService } from '../../core/persistence/project-autosave.service';
import { DialogService } from '../../core/ui/dialog.service';
import { EditorLayoutPreferencesService } from '../../core/ui/editor-layout-preferences.service';
import { clampGroupMovePanelPosition, PanelPosition } from '../../core/editor/group-move-panel';
import { filterGroups } from '../../core/editor/group-search';
import { DecorationService } from '../../core/decorations/decoration.service';
import { SettingsDialogComponent } from './settings-dialog.component';
import { LucideChevronDown, LucideRedo2, LucideRotateCcw, LucideUndo2, LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../shared/ui-tooltip.directive';
import { ThemedSelectComponent, ThemedSelectOption } from '../../shared/themed-select.component';
import { ShortcutsHelpDialogComponent } from './shortcuts-help-dialog.component';
import { AssetManagerDialogComponent } from './asset-manager-dialog.component';
import { ProjectDiagnosticsDialogComponent } from './project-diagnostics-dialog.component';

@Component({ selector: 'app-editor-shell', imports: [RouterLink, BlockBrowserComponent, DecorationBrowserComponent, DecorationInspectorComponent, QuickBlockBarComponent, SignInspectorComponent, ViewportComponent, YLayerComponent, SettingsDialogComponent, ShortcutsHelpDialogComponent, AssetManagerDialogComponent, ProjectDiagnosticsDialogComponent, ThemedSelectComponent, LucideChevronDown, LucideRedo2, LucideRotateCcw, LucideUndo2, LucideX, UiTooltipDirective], templateUrl: './editor-shell.component.html', styleUrl: './editor-shell.component.scss', host: { '(document:keydown)': 'handleEditorShortcut($event)', '(document:click)': 'closeMenus()', '(document:pointermove)': 'movePanelDrag($event); moveSidebarResize($event)', '(document:pointerup)': 'endMovePanelDrag($event); endSidebarResize($event)', '(document:pointercancel)': 'endMovePanelDrag($event); endSidebarResize($event)', '(window:resize)': 'clampSidebarWidths()' } })
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
  private readonly editor = inject(StructureEditorService);
  private readonly router = inject(Router);
  private readonly persistence = new ProjectPersistenceService(new IndexedDbProjectStore());
  protected readonly viewportStatus = inject(ViewportStatusService);
  private readonly library = inject(BlockLibraryService);
  private readonly threeDViewport = viewChild(ViewportComponent);
  private readonly yLayerViewport = viewChild(YLayerComponent);
  protected readonly selectedBlock = computed(() => {
    const project = this.workspace.project();
    const selected = this.selection.single();
    return project && selected ? project.blocks.find((block) => coordinateKey(block.position) === coordinateKey(selected)) : undefined;
  });
  protected readonly selectedDecoration = this.decorations.selected;
  protected readonly stateEntries = computed(() => Object.entries(this.selectedBlock()?.state ?? {}));
  protected readonly selectedBlockCount = computed(() => { const project = this.workspace.project(); const box = this.selection.box(); return project && box ? project.blocks.filter((block) => block.position.x >= box.min.x && block.position.x <= box.max.x && block.position.y >= box.min.y && block.position.y <= box.max.y && block.position.z >= box.min.z && block.position.z <= box.max.z).length : 0; });
  protected readonly presets: readonly CameraPreset[] = ['perspective', 'top', 'front', 'back', 'left', 'right'];
  protected readonly newGroupName = signal('');
  protected readonly groupSearch = signal('');
  protected readonly stateFeedback = signal('');
  protected readonly selectedDefinition = computed(() => { const block = this.selectedBlock(); return block ? this.library.get(block.id) : undefined; });
  protected readonly selectedBlockIsSign = computed(() => { const block = this.selectedBlock(); return !!block && isSignId(block.id); });
  protected readonly selectedGroupNames = computed(() => { const project = this.workspace.project(); const block = this.selectedBlock(); return project && block ? blockGroupNames(block, project) : []; });
  protected readonly logicalSelectionCount = computed(() => this.selection.logicalPositions().length);
  protected readonly leftSidebarTab = signal<'blocks' | 'decorations' | 'groups'>('blocks');
  protected readonly filteredGroups = computed(() => {
    const project = this.workspace.project();
    return project ? filterGroups(project.groups, this.groupSearch(), { locked: this.i18n.t('locked'), unlocked: this.i18n.t('unlocked') }) : [];
  });
  protected readonly activeMenu = signal<'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help' | undefined>(undefined);
  protected readonly cameraMenuOpen = signal(false);
  protected readonly settingsDialogOpen = signal(false);
  protected readonly controlsHelpOpen = signal(false);
  protected readonly assetManagerOpen = signal(false);
  protected readonly diagnosticsOpen = signal(false);
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
  ngOnDestroy(): void { void this.autosave.flush().catch(() => undefined); }

  protected saveStatusLabel(): string { return this.i18n.t(this.autosave.status() === 'pending' || this.autosave.status() === 'saving' ? 'savingProject' : this.autosave.status() === 'error' ? 'saveProjectError' : 'projectSaved'); }
  protected shortcutTitle(action: KeyboardAction): string { return `${this.i18n.t(action === 'undo' ? 'undo' : 'redo')} (${this.keyboard.bindings()[action].replaceAll('|', ' / ')})`; }

  protected fitStructure(): void { this.currentViewport()?.fitStructure(); }
  protected focusSelection(): void { this.currentViewport()?.focusSelection(); }
  protected resetCamera(): void { this.currentViewport()?.resetCamera(); }
  protected setCameraPreset(preset: CameraPreset): void { this.currentViewport()?.setCameraPreset(preset); }
  protected presetLabel(preset: CameraPreset): string { return this.i18n.t(({ perspective: 'cameraPerspective', top: 'cameraTop', front: 'cameraFront', back: 'cameraBack', left: 'cameraLeft', right: 'cameraRight' } as const)[preset]); }
  protected updateSelectedState(property: string, event: Event): void { const selected = this.selection.single(); const value = (event.target as HTMLSelectElement).value; if (!selected || !this.editor.updateBlockState(selected, property, value)) this.stateFeedback.set('stateEditUnsupported'); else this.stateFeedback.set(''); }
  protected updateSelectedStateValue(property: string, value: string): void { const selected = this.selection.single(); if (!selected || !this.editor.updateBlockState(selected, property, value)) this.stateFeedback.set('stateEditUnsupported'); else this.stateFeedback.set(''); }
  protected rotateSelected(): void { const selected = this.selection.single(); if (!selected || !this.editor.rotateBlock(selected)) this.stateFeedback.set('rotationUnsupported'); else this.stateFeedback.set(''); }
  protected deleteSelectedDecoration(): void { const decoration = this.selectedDecoration(); if (decoration) this.decorations.delete(decoration.instanceId); }
  protected feedbackLabel(): string { const key = this.stateFeedback(); return key ? this.i18n.t(key as 'stateEditUnsupported' | 'rotationUnsupported') : ''; }
  protected stateOptions(values: readonly string[]): readonly ThemedSelectOption[] { return values.map((value) => ({ id: value, label: this.i18n.stateValue(value) })); }
  protected createGroup(): void { if (this.groups.create(this.newGroupName().trim())) this.newGroupName.set(''); }
  protected updateGroupSearch(event: Event): void { this.groupSearch.set((event.target as HTMLInputElement).value); }
  protected clearGroupSearch(): void { this.groupSearch.set(''); }
  protected renameGroup(event: Event): void { this.groups.renameActive((event.target as HTMLInputElement).value); }
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
  protected setEditorMode(mode: '3d' | 'y-layer'): void { this.mode.mode.set(mode); this.closeMenus(); }
  protected async navigateToProjects(): Promise<void> { this.closeMenus(); await this.autosave.flush().catch(() => undefined); await this.router.navigateByUrl('/'); }
  protected async saveProject(): Promise<void> {
    this.closeMenus();
    try { await this.autosave.flush(); await this.dialogs.success(this.i18n.t('saveProjectSuccess')); }
    catch { await this.dialogs.error(this.i18n.t('saveProjectError'), this.i18n.t('saveProjectError')); }
  }
  protected triggerProjectImport(input: HTMLInputElement): void { this.closeMenus(); input.value = ''; input.click(); }
  protected async importProjectPackage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await this.autosave.flush();
      const imported = this.persistence.importPackage(await file.text());
      const summaries = await this.persistence.list();
      const collision = summaries.some((summary) => summary.id === imported.id);
      const id = collision ? createProjectId() : imported.id;
      const project = collision ? { ...imported, id, metadata: { ...imported.metadata, name: `${imported.metadata.name} (imported)`, updatedAt: new Date().toISOString() } } : imported;
      await this.persistence.create(project);
      this.workspace.activate(project);
      this.history.clear();
      this.selection.clear();
    } catch {
      await this.dialogs.error(this.i18n.t('importProjectTitle'), this.i18n.t('importProjectError'));
    } finally { input.value = ''; }
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
  protected showControlsHelp(): void { this.closeMenus(); this.controlsHelpOpen.set(true); }
  protected showAbout(): void { this.closeMenus(); void this.dialogs.info(this.i18n.t('about'), this.i18n.t('aboutText')); }
  protected clearSelection(): void { this.selection.clear(); this.closeMenus(); }
  protected selectAll(): void { const project = this.workspace.project(); if (project) this.selection.selectAll(project, (id) => this.library.get(id)); this.closeMenus(); }
  protected undoEdit(): void { this.history.undo(); this.closeMenus(); }
  protected redoEdit(): void { this.history.redo(); this.closeMenus(); }
  protected deleteSelection(): void { this.editor.deleteSelection(); this.closeMenus(); }
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
  protected async deleteGroupBlocks(): Promise<void> {
    const group = this.groups.activeGroup();
    if (!group || group.locked) return;
    const count = this.groups.activeGroupBlockCount();
    if (!count) return;
    const confirmed = await this.dialogs.confirm({
      title: this.i18n.t('deleteGroupBlocksTitle'),
      text: this.i18n.t('deleteGroupBlocksConfirmation').replace('{count}', String(count)).replace('{name}', group.name),
      confirmButtonText: this.i18n.t('deleteGroupBlocksConfirm'),
      cancelButtonText: this.i18n.t('cancel'),
    });
    if (confirmed) this.groups.deleteActiveBlocks();
  }

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
    if (this.settingsDialogOpen() || this.controlsHelpOpen() || this.assetManagerOpen() || this.diagnosticsOpen()) return;
    if (event.key === 'Escape') { this.closeMenus(); return; }
    const action = this.keyboard.actionForEvent(event); if (!action) return;
    const handled = this.executeKeyboardAction(action);
    if (handled) event.preventDefault();
  }

  private executeKeyboardAction(action: KeyboardAction): boolean {
    if (action === 'undo') return this.history.undo();
    if (action === 'redo') return this.history.redo();
    if (action === 'select-all') { const project = this.workspace.project(); if (!project) return false; this.selection.selectAll(project, (id) => this.library.get(id)); return true; }
    if (action === 'clear-selection') { this.selection.clear(); return true; }
    if (action === 'delete-selection') return this.editor.deleteSelection();
    if (action === 'tool-place') { this.tool.active.set('place'); return true; }
    if (action === 'tool-select') { this.tool.active.set('select'); return true; }
    if (action === 'mode-3d') { this.mode.mode.set('3d'); return true; }
    if (action === 'mode-y-layer') { this.mode.mode.set('y-layer'); return true; }
    if (action === 'fit-structure') { this.fitStructure(); return true; }
    if (action === 'focus-selection') { if (!this.selection.single()) return false; this.focusSelection(); return true; }
    if (action === 'save-project') { void this.saveProject(); return true; }
    if (action.startsWith('quick-slot-')) { const index = Number(action.slice('quick-slot-'.length)) - 1; const entry = this.quickBar.entries()[index]; if (!entry) return false; this.quickBar.select(entry); return true; }
    return false;
  }

  private currentViewport(): ViewportComponent | YLayerComponent | undefined {
    return this.mode.mode() === '3d' ? this.threeDViewport() : this.yLayerViewport();
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

function createProjectId(): string { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `project-${Date.now()}`; }
function sanitizeFilename(value: string): string { return value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'minecraft-project'; }
