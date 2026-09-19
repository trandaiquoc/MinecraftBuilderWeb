import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/ui/i18n.service';
import { ThemeService } from '../../core/ui/theme.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { BlockBrowserComponent } from './block-browser.component';
import { DecorationBrowserComponent } from './decoration-browser.component';
import { QuickBlockBarComponent } from './quick-block-bar.component';
import { SignInspectorComponent } from './sign-inspector.component';
import { ViewportComponent } from './viewport.component';
import { YLayerComponent } from './y-layer.component';
import { EditorModeService } from '../../core/editor/editor-mode.service';
import { EditorToolService } from '../../core/editor/tool.service';
import { CameraPreset } from '../../core/editor/camera';
import { SelectionService } from '../../core/editor/selection.service';
import { GroupService } from '../../core/editor/group.service';
import { StructureEditorService } from '../../core/editor/structure-editor.service';
import { ViewportStatusService } from '../../core/editor/viewport-status.service';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { coordinateKey } from '../../core/domain/coordinates';
import { blockGroupNames } from '../../core/editor/group-membership';
import { HistoryService } from '../../core/editor/history.service';
import { editorShortcutAction } from '../../core/editor/history-shortcuts';
import { IndexedDbProjectStore } from '../../core/persistence/indexeddb-project-store';
import { ProjectAutosaveService } from '../../core/persistence/project-autosave.service';
import { DialogService } from '../../core/ui/dialog.service';
import { EditorLayoutPreferencesService } from '../../core/ui/editor-layout-preferences.service';
import { clampGroupMovePanelPosition, PanelPosition } from '../../core/editor/group-move-panel';
import { filterGroups } from '../../core/editor/group-search';
import { DecorationService } from '../../core/decorations/decoration.service';

@Component({ selector: 'app-editor-shell', imports: [RouterLink, BlockBrowserComponent, DecorationBrowserComponent, QuickBlockBarComponent, SignInspectorComponent, ViewportComponent, YLayerComponent], templateUrl: './editor-shell.component.html', styleUrl: './editor-shell.component.scss', host: { '(document:keydown)': 'handleEditorShortcut($event)', '(document:click)': 'closeMenus()', '(document:pointermove)': 'movePanelDrag($event)', '(document:pointerup)': 'endMovePanelDrag($event)', '(document:pointercancel)': 'endMovePanelDrag($event)' } })
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
  protected readonly autosave = inject(ProjectAutosaveService);
  protected readonly layout = inject(EditorLayoutPreferencesService);
  private readonly dialogs = inject(DialogService);
  private readonly editor = inject(StructureEditorService);
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
  protected readonly selectedSupport = computed(() => {
    const block = this.selectedBlock();
    return block ? this.library.get(block.id)?.support ?? (block.kind === 'missing' ? 'unknown' : 'fallback') : undefined;
  });
  protected readonly stateEntries = computed(() => Object.entries(this.selectedBlock()?.state ?? {}));
  protected readonly selectedBlockCount = computed(() => { const project = this.workspace.project(); const box = this.selection.box(); return project && box ? project.blocks.filter((block) => block.position.x >= box.min.x && block.position.x <= box.max.x && block.position.y >= box.min.y && block.position.y <= box.max.y && block.position.z >= box.min.z && block.position.z <= box.max.z).length : 0; });
  protected readonly presets: readonly CameraPreset[] = ['perspective', 'top', 'front', 'back', 'left', 'right'];
  protected readonly newGroupName = signal('');
  protected readonly groupSearch = signal('');
  protected readonly stateFeedback = signal('');
  protected readonly selectedDefinition = computed(() => { const block = this.selectedBlock(); return block ? this.library.get(block.id) : undefined; });
  protected readonly selectedGroupNames = computed(() => { const project = this.workspace.project(); const block = this.selectedBlock(); return project && block ? blockGroupNames(block, project) : []; });
  protected readonly logicalSelectionCount = computed(() => this.selection.logicalPositions().length);
  protected readonly blockBrowserExpanded = signal(false);
  protected readonly leftSidebarTab = signal<'blocks' | 'decorations' | 'groups'>('blocks');
  protected readonly filteredGroups = computed(() => {
    const project = this.workspace.project();
    return project ? filterGroups(project.groups, this.groupSearch(), { locked: this.i18n.t('locked'), unlocked: this.i18n.t('unlocked') }) : [];
  });
  protected readonly activeMenu = signal<'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help' | undefined>(undefined);
  protected readonly cameraMenuOpen = signal(false);
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

  protected fitStructure(): void { this.currentViewport()?.fitStructure(); }
  protected focusSelection(): void { this.currentViewport()?.focusSelection(); }
  protected resetCamera(): void { this.currentViewport()?.resetCamera(); }
  protected setCameraPreset(preset: CameraPreset): void { this.currentViewport()?.setCameraPreset(preset); }
  protected presetLabel(preset: CameraPreset): string { return this.i18n.t(({ perspective: 'cameraPerspective', top: 'cameraTop', front: 'cameraFront', back: 'cameraBack', left: 'cameraLeft', right: 'cameraRight' } as const)[preset]); }
  protected supportLabel(support: string | undefined): string { return support ? this.i18n.supportLevel(support as 'full' | 'partial' | 'fallback' | 'unknown') : ''; }
  protected updateSelectedState(property: string, event: Event): void { const selected = this.selection.single(); const value = (event.target as HTMLSelectElement).value; if (!selected || !this.editor.updateBlockState(selected, property, value)) this.stateFeedback.set('stateEditUnsupported'); else this.stateFeedback.set(''); }
  protected rotateSelected(): void { const selected = this.selection.single(); if (!selected || !this.editor.rotateBlock(selected)) this.stateFeedback.set('rotationUnsupported'); else this.stateFeedback.set(''); }
  protected deleteSelectedDecoration(): void { const decoration = this.selectedDecoration(); if (decoration) this.decorations.delete(decoration.instanceId); }
  protected feedbackLabel(): string { const key = this.stateFeedback(); return key ? this.i18n.t(key as 'stateEditUnsupported' | 'rotationUnsupported') : ''; }
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
  protected toggleLayout(key: 'editorToolbarVisible' | 'leftSidebarVisible' | 'rightSidebarVisible' | 'quickBarVisible' | 'statusBarVisible'): void { this.layout.set(key, !this.layout.preferences()[key]); this.scheduleMovePanelClamp(); }
  protected resetLayout(): void { this.layout.reset(); }
  protected chooseLanguage(locale: 'en' | 'vi'): void { this.i18n.locale.set(locale); this.closeMenus(); }
  protected chooseTheme(theme: 'light' | 'dark'): void { if (this.theme.theme() !== theme) this.theme.toggle(); this.closeMenus(); }
  protected setBlockBrowserExpanded(expanded: boolean): void { this.blockBrowserExpanded.set(expanded); }
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
    if (event.key === 'Escape') { this.closeMenus(); return; }
    const action = editorShortcutAction(event); if (!action) return;
    if (action === 'select-all') { const project = this.workspace.project(); if (project) this.selection.selectAll(project, (id) => this.library.get(id)); event.preventDefault(); return; }
    if (action === 'delete-selection') { this.editor.deleteSelection(); event.preventDefault(); return; }
    const handled = action === 'undo' ? this.history.undo() : this.history.redo(); if (handled) event.preventDefault();
  }

  private currentViewport(): ViewportComponent | YLayerComponent | undefined {
    return this.mode.mode() === '3d' ? this.threeDViewport() : this.yLayerViewport();
  }
}
