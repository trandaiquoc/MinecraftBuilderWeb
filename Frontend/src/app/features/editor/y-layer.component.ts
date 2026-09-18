import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, isDevMode, signal, viewChild } from '@angular/core';
import { ActiveBlockService } from '../../core/blocks/active-block.service';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { StructureEditorService } from '../../core/editor/structure-editor.service';
import { SelectionService } from '../../core/editor/selection.service';
import { adjacentOccupiedLayer, blocksForLayers, clampLayer, jumpOccupiedLayer, layerCoordinate, YLayerVisibility } from '../../core/editor/y-layer';
import { PlacementStatus } from '../../core/editor/placement';
import { isPointerClick, pointerAction } from '../../core/editor/interaction';
import { EditorToolService } from '../../core/editor/tool.service';
import { CameraStateService } from '../../core/editor/camera-state.service';
import { CameraPreset } from '../../core/editor/camera';
import { ViewportStatusService } from '../../core/editor/viewport-status.service';
import { GroupService } from '../../core/editor/group.service';
import { clampVoxelBox, normalizeVoxelBox } from '../../core/editor/selection';
import { ThreeViewportEngine } from '../../core/renderer/three-viewport-engine';
import { VoxelCoordinate } from '../../core/domain/project.types';
import { I18nService } from '../../core/ui/i18n.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { ThemeService } from '../../core/ui/theme.service';
import { viewportThemePalette } from '../../core/renderer/viewport-theme';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';

@Component({ selector: 'app-y-layer', templateUrl: './y-layer.component.html', styleUrl: './y-layer.component.scss' })
export class YLayerComponent implements AfterViewInit, OnDestroy {
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  protected readonly workspace = inject(WorkspaceStateService);
  private readonly editor = inject(StructureEditorService);
  private readonly active = inject(ActiveBlockService);
  private readonly library = inject(BlockLibraryService);
  protected readonly selection = inject(SelectionService);
  private readonly tool = inject(EditorToolService);
  private readonly cameraState = inject(CameraStateService);
  private readonly viewportStatus = inject(ViewportStatusService);
  private readonly groups = inject(GroupService);
  protected readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly assets = inject(VanillaAssetsService);
  protected readonly visibility = signal<YLayerVisibility>('current-only');
  protected readonly status = signal<PlacementStatus>('invalid');
  protected readonly target = signal<string>('');
  private readonly engine = new ThreeViewportEngine();
  private pointerStart?: { x: number; y: number };
  private boxCornerStart?: VoxelCoordinate;
  private readonly sync = effect(() => { const project = this.workspace.project(); this.tool.active(); this.engine.update(project, this.active.active(), project ? { layerY: project.editorSettings.currentY, visibility: this.visibility(), referenceOpacity: project.editorSettings.referenceLayerOpacity, selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() } : { selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); });
  private readonly themeSync = effect(() => { this.engine.applyTheme(viewportThemePalette(this.theme.theme())); });
  private readonly assetSync = effect(() => { this.engine.setVisualProvider(this.assets.visualProvider()); });
  private readonly lifecycleDiagnostics = effect(() => { const projectRestore = this.workspace.restoreStatus(); const assetStatus = this.assets.status(); const assets = this.assets.diagnostics(); if (isDevMode()) console.debug('[MinecraftBuilder][Y-layer bootstrap]', { projectRestore, assetStatus, assets, viewport: this.engine.diagnostics() }); });

  ngAfterViewInit(): void { const element = this.host()?.nativeElement; if (element) this.engine.mount(element); this.engine.restoreCamera(this.cameraState.get('y-layer')); this.refresh(); if (isDevMode()) console.debug('[MinecraftBuilder][Y-layer mounted]', this.engine.diagnostics()); }
  ngOnDestroy(): void { const state = this.engine.cameraState(); if (state) this.cameraState.set('y-layer', state); this.viewportStatus.clear(); this.sync.destroy(); this.themeSync.destroy(); this.assetSync.destroy(); this.lifecycleDiagnostics.destroy(); this.engine.dispose(); }

  fitStructure(): void { this.engine.fitStructure(); }
  focusSelection(): void { this.engine.focusSelection(this.selection.single()); }
  resetCamera(): void { this.engine.resetCamera(); }
  setCameraPreset(preset: CameraPreset): void { this.engine.setCameraPreset(preset); }

  protected currentY(): number { return this.workspace.project()?.editorSettings.currentY ?? 0; }
  protected setLayer(value: string): void { const project = this.workspace.project(); if (!project) return; const y = clampLayer(Number(value), project.size); this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, currentY: y } }); }
  protected stepLayer(direction: -1 | 1): void { const project = this.workspace.project(); if (project) this.setLayer(String(clampLayer(this.currentY() + direction, project.size))); }
  protected jumpLayer(target: 'first' | 'last'): void { const project = this.workspace.project(); if (project) this.setLayer(String(jumpOccupiedLayer(project.blocks, this.currentY(), target))); }
  protected jumpAdjacent(direction: -1 | 1): void { const project = this.workspace.project(); if (project) this.setLayer(String(clampLayer(adjacentOccupiedLayer(this.currentY(), project.blocks, direction), project.size))); }
  protected setVisibility(value: string): void { this.visibility.set(value as YLayerVisibility); }
  protected resize(): void { this.engine.resize(); }
  protected pointerMove(event: PointerEvent): void { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.currentY(), this.tool.active() === 'place'); const status = hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status; this.engine.setGhostStatus(status); this.status.set(status); this.target.set(hit.target ? `${hit.target.x}, ${hit.target.y}, ${hit.target.z}` : ''); this.viewportStatus.set(hit.target, status); }
  protected pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.boxCornerStart = undefined;
    if (this.tool.active() === 'select') { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.currentY(), false); this.boxCornerStart = hit.target; }
  }
  protected pointerUp(event: PointerEvent): void {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const cornerStart = this.boxCornerStart;
    this.boxCornerStart = undefined;
    const click = isPointerClick(start, { x: event.clientX, y: event.clientY });
    if (event.button !== 0) return;
    if (!click && this.tool.active() === 'select' && cornerStart) {
      const project = this.workspace.project(); const hit = this.engine.hit(event, project, this.active.active(), this.currentY(), false);
      if (project && hit.target) { const box = clampVoxelBox(normalizeVoxelBox(cornerStart, hit.target), project.size); if (box) this.selection.selectBoxLogical(box, project, (id) => this.library.get(id)); }
      return;
    }
    if (!click) return;
    const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.currentY(), this.tool.active() === 'place');
    const status = hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status;
    if (this.tool.active() === 'place' && !event.ctrlKey && !event.altKey && hit.block && this.editor.canStackCandle(hit.block)) {
      this.editor.stackCandle(hit.block);
      return;
    }
    const action = pointerAction(this.tool.active(), { ctrl: event.ctrlKey, alt: event.altKey }, !!hit.block, !!hit.target && status !== 'invalid');
    if (action === 'pick' && hit.block) this.editor.pick(hit.block);
    else if (action === 'delete' && hit.block) this.editor.delete(hit.block);
    else if (action === 'select' && hit.block) { const project = this.workspace.project(); if (project) this.selection.selectLogical(hit.block, project, (id) => this.library.get(id)); }
    else if (action === 'clear-selection') this.selection.clear();
    else if (action === 'place' && hit.target) this.editor.place(hit.target, hit.placementContext);
  }
  protected statusLabel(): string { return this.i18n.t(this.status()); }
  protected setOpacity(value: string): void { const project = this.workspace.project(); if (!project) return; const opacity = Math.min(1, Math.max(0, Number(value))); this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, referenceLayerOpacity: opacity } }); }
  protected referenceOpacityPercent(): number { return Math.round((this.workspace.project()?.editorSettings.referenceLayerOpacity ?? .28) * 100); }
  protected pointerLeave(): void { this.pointerStart = undefined; this.engine.clearGhost(); this.status.set('invalid'); this.target.set(''); this.viewportStatus.clear(); }
  protected cancelPointer(): void { this.pointerStart = undefined; this.boxCornerStart = undefined; this.engine.clearInput(); }
  protected preventViewportWheel(event: WheelEvent): void { event.preventDefault(); }

  private refresh(): void { const project = this.workspace.project(); this.engine.update(project, this.active.active(), project ? { layerY: project.editorSettings.currentY, visibility: this.visibility(), referenceOpacity: project.editorSettings.referenceLayerOpacity, selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() } : { selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); }
}
