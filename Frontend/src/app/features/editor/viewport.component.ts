import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, isDevMode, viewChild, signal } from '@angular/core';
import { ActiveBlockService } from '../../core/blocks/active-block.service';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { StructureEditorService } from '../../core/editor/structure-editor.service';
import { PlacementStatus } from '../../core/editor/placement';
import { isPointerClick, pointerAction } from '../../core/editor/interaction';
import { SelectionService } from '../../core/editor/selection.service';
import { EditorToolService } from '../../core/editor/tool.service';
import { CameraStateService } from '../../core/editor/camera-state.service';
import { CameraPreset } from '../../core/editor/camera';
import { ViewportStatusService } from '../../core/editor/viewport-status.service';
import { GroupService } from '../../core/editor/group.service';
import { clampVoxelBox, normalizeVoxelBox } from '../../core/editor/selection';
import { ThreeViewportEngine } from '../../core/renderer/three-viewport-engine';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { I18nService } from '../../core/ui/i18n.service';
import { ThemeService } from '../../core/ui/theme.service';
import { viewportThemePalette } from '../../core/renderer/viewport-theme';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { SignTextSideService } from '../../core/editor/sign-text-side.service';
import { coordinateKey } from '../../core/domain/coordinates';
import { isSignId } from '../../core/editor/structure-editor.service';

@Component({ selector: 'app-viewport', templateUrl: './viewport.component.html', styleUrl: './viewport.component.scss' })
export class ViewportComponent implements AfterViewInit, OnDestroy {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly workspace = inject(WorkspaceStateService);
  private readonly active = inject(ActiveBlockService);
  private readonly library = inject(BlockLibraryService);
  private readonly editor = inject(StructureEditorService);
  private readonly selection = inject(SelectionService);
  private readonly tool = inject(EditorToolService);
  private readonly cameraState = inject(CameraStateService);
  private readonly viewportStatus = inject(ViewportStatusService);
  private readonly groups = inject(GroupService);
  protected readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly signTextSide = inject(SignTextSideService);
  protected readonly status = signal<PlacementStatus>('invalid');
  protected readonly target = signal<string>('');
  private readonly engine = new ThreeViewportEngine();
  private pointerStart?: { x: number; y: number };
  private boxCornerStart?: import('../../core/domain/project.types').VoxelCoordinate;
  private readonly sync = effect(() => { this.tool.active(); this.engine.update(this.workspace.project(), this.active.active(), { selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); });
  private readonly themeSync = effect(() => { this.engine.applyTheme(viewportThemePalette(this.theme.theme())); });
  private readonly assetSync = effect(() => { this.engine.setVisualProvider(this.assets.visualProvider()); });
  private readonly lifecycleDiagnostics = effect(() => { const projectRestore = this.workspace.restoreStatus(); const assetStatus = this.assets.status(); const assets = this.assets.diagnostics(); if (isDevMode()) console.debug('[MinecraftBuilder][3D bootstrap]', { projectRestore, assetStatus, assets, viewport: this.engine.diagnostics() }); });

  ngAfterViewInit(): void { this.engine.mount(this.host().nativeElement); this.engine.restoreCamera(this.cameraState.get('3d')); this.engine.update(this.workspace.project(), this.active.active(), { selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); if (isDevMode()) console.debug('[MinecraftBuilder][3D mounted]', this.engine.diagnostics()); }
  ngOnDestroy(): void { const state = this.engine.cameraState(); if (state) this.cameraState.set('3d', state); this.viewportStatus.clear(); this.sync.destroy(); this.themeSync.destroy(); this.assetSync.destroy(); this.lifecycleDiagnostics.destroy(); this.engine.dispose(); }

  fitStructure(): void { this.engine.fitStructure(); }
  focusSelection(): void { this.engine.focusSelection(this.selection.single()); }
  resetCamera(): void { this.engine.resetCamera(); }
  setCameraPreset(preset: CameraPreset): void { this.engine.setCameraPreset(preset); }

  protected resize(): void { this.engine.resize(); }
  protected statusLabel(): string { return this.i18n.t(this.status()); }
  protected pointerMove(event: PointerEvent): void { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, this.tool.active() === 'place'); const status = hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status; this.engine.setGhostStatus(status); this.status.set(status); this.target.set(hit.target ? `${hit.target.x}, ${hit.target.y}, ${hit.target.z}` : ''); this.viewportStatus.set(hit.target, status); }
  protected pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.boxCornerStart = undefined;
    if (this.tool.active() === 'select') { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, false); this.boxCornerStart = hit.block ?? hit.target; }
  }
  protected pointerUp(event: PointerEvent): void {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const cornerStart = this.boxCornerStart;
    this.boxCornerStart = undefined;
    const click = isPointerClick(start, { x: event.clientX, y: event.clientY });
    if (event.button !== 0) return;
    if (!click && this.tool.active() === 'select' && cornerStart) {
      const project = this.workspace.project(); const hit = this.engine.hit(event, project, this.active.active(), undefined, false); const cornerEnd = hit.block ?? hit.target;
      if (project && cornerEnd) { const box = clampVoxelBox(normalizeVoxelBox(cornerStart, cornerEnd), project.size); if (box) this.selection.selectBoxLogical(box, project, (id) => this.library.get(id)); }
      return;
    }
    if (!click) return;
    const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, this.tool.active() === 'place');
    const status = hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status;
    if (this.tool.active() === 'place' && !event.ctrlKey && !event.altKey && hit.block && this.editor.canStackCandle(hit.block)) {
      this.editor.stackCandle(hit.block);
      return;
    }
    const action = pointerAction(this.tool.active(), { ctrl: event.ctrlKey, alt: event.altKey }, !!hit.block, !!hit.target && status !== 'invalid');
    if (action === 'pick' && hit.block) this.editor.pick(hit.block);
    else if (action === 'delete' && hit.block) this.editor.delete(hit.block);
    else if (action === 'select' && hit.block) { const project = this.workspace.project(); if (project) { this.selection.selectLogical(hit.block, project, (id) => this.library.get(id)); const selected = project.blocks.find((block) => coordinateKey(block.position) === coordinateKey(hit.block!)); if (selected && isSignId(selected.id)) this.signTextSide.setFromHit(selected, hit.faceNormal); } }
    else if (action === 'clear-selection') this.selection.clear();
    else if (action === 'place' && hit.target) this.editor.place(hit.target, hit.placementContext);
  }
  protected pointerLeave(): void { this.pointerStart = undefined; this.engine.clearGhost(); this.status.set('invalid'); this.target.set(''); this.viewportStatus.clear(); }
  protected cancelPointer(): void { this.pointerStart = undefined; this.boxCornerStart = undefined; this.engine.clearInput(); }
  protected preventViewportWheel(event: WheelEvent): void { event.preventDefault(); }
}
