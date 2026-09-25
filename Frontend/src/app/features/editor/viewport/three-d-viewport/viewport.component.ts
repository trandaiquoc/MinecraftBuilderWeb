import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, isDevMode, viewChild, signal } from '@angular/core';
import { ActiveBlockService } from '../../../../core/blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { PlacementStatus } from '../../../../core/editor/placement/placement';
import { isPointerClick } from '../../../../core/editor/input/interaction';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import { CameraStateService } from '../../../../core/editor/camera/camera-state.service';
import { CameraPreset, voxelCameraBounds } from '../../../../core/editor/camera/camera';
import { GroupService } from '../../../../core/editor/groups/group.service';
import { clampVoxelBox, faceLockedSelectionPlane, normalizeVoxelBox, voxelOnFaceLockedPlane } from '../../../../core/editor/selection/selection';
import { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import { blockHitWinsOverDecoration, pickAndSelectBlockFromViewportHit } from '../../../../core/editor/viewport/pick-block';
import { itemVisualTextureResources, resolveItemVisual } from '../../../../core/renderer/geometry/block-model-geometry';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ThemeService } from '../../../../core/ui/theme/theme.service';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { viewportThemePalette } from '../../../../core/renderer/engine/viewport-theme';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { SignTextSideService } from '../../../../core/block-entities/sign/sign-text-side.service';
import { coordinateKey } from '../../../../core/domain/coordinates';
import { visibleBlockEntries } from '../../../../core/editor/viewport/visible-blocks';
import { isSignDefinition, isSignId } from '../../../../core/editor/structure/structure-editor.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { decorationAabb } from '../../../../core/decorations/placement/decoration-placement';
import { facingFromNormal } from '../../../../core/decorations/placement/decoration-placement';
import { KeyboardBindingService } from '../../../../core/editor/input/keyboard-binding.service';
import { MouseAction } from '../../../../core/editor/input/mouse-bindings';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { ItemVisualService } from '../../../../core/items/catalog/item-visual.service';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';

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
  private readonly groups = inject(GroupService);
  protected readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly signTextSide = inject(SignTextSideService);
  private readonly decorations = inject(DecorationService);
  private readonly input = inject(KeyboardBindingService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly itemVisuals = inject(ItemVisualService);
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  private readonly resolveSpecialVisual = (id: string) => this.library.get(id)?.specialVisual;
  private readonly resolveBlockDefinition = (id: string) => this.library.get(id);
  private readonly resolveDecorationTexture = (resource: string) => this.assets.sources.resources.textureUrl(resource);
  private readonly resolveDecorationItemResources = (itemId: string) => itemVisualTextureResources(this.assets.sources.resources, itemId);
  private readonly resolveDecorationItemVisual = (itemId: string) => resolveItemVisual(this.assets.sources.resources, itemId);
  private readonly resolveDecorationItemPreview = (item: import('../../../../core/items/item-stack.types').ItemStackData) => this.itemVisuals.request(item, 'high').then((info) => info.previewUrls[0]);
  private readonly resolvePaintingTexture = (id: string) => this.paintingCatalog.get(id)?.assetPath;
  protected readonly status = signal<PlacementStatus>('invalid');
  protected readonly decorationReason = signal('');
  protected readonly target = signal<string>('');
  private readonly engine = new ThreeViewportEngine();
  private readonly hydrationOwner = this.hydrationStatus.claim();
  private readonly hydrationProgressUnsubscribe = this.engine.onHydrationProgress((progress) => this.hydrationStatus.publish(this.hydrationOwner, progress));
  private pointerStart?: { x: number; y: number };
  private gestureAction?: MouseAction;
  private pickConsumed = false;
  private boxCornerStart?: import('../../../../core/domain/project.types').VoxelCoordinate;
  private faceDragStart?: { readonly block: import('../../../../core/domain/project.types').VoxelCoordinate; readonly normal: import('../../../../core/editor/placement/placement').FaceNormal; readonly hitPoint?: { readonly x: number; readonly y: number; readonly z: number }; readonly plane: import('../../../../core/editor/selection/selection').FaceLockedSelectionPlane };
  private readonly sync = effect(() => { this.tool.active(); this.decorations.selectedId(); this.decorations.active(); const project = this.workspace.project(); const renderSelection = this.selection.renderState(project); this.engine.update(project, this.active.active(), { selected: this.selection.single(), selectedPositions: renderSelection.positions, selectionKind: renderSelection.kind, selectionCount: renderSelection.count, selectionBounds: renderSelection.bounds, selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview(), selectedDecorationId: this.decorations.selectedId(), activeDecoration: this.decorations.active() }); });
  private readonly themeSync = effect(() => { this.engine.applyTheme(viewportThemePalette(this.theme.editorBackground())); });
  private readonly controlSync = effect(() => { const preferences = this.preferences.preferences(); this.engine.setControlConfiguration(preferences.controls); this.engine.setMouseBindings(preferences.mouseBindings); this.engine.setBlockBrightness(preferences.accessibility.blockBrightness); });
  private readonly assetSync = effect(() => { this.engine.setVisualProvider(this.assets.visualProvider()); this.engine.setSpecialVisualDescriptorResolver(this.resolveSpecialVisual, this.library.catalogRevision()); this.engine.setBlockDefinitionResolver(this.resolveBlockDefinition); this.engine.setDecorationTextureProvider(this.resolveDecorationTexture); this.engine.setDecorationItemResourceProvider(this.resolveDecorationItemResources); this.engine.setDecorationItemVisualProvider(this.resolveDecorationItemVisual); this.engine.setDecorationItemPreviewProvider(this.resolveDecorationItemPreview); this.paintingCatalog.variants(); this.engine.setPaintingTextureResolver(this.resolvePaintingTexture); });
  private readonly lifecycleDiagnostics = effect(() => { const projectRestore = this.workspace.restoreStatus(); const assetStatus = this.assets.status(); const assets = this.assets.diagnostics(); if (isDevMode()) console.debug('[MinecraftBuilder][3D bootstrap]', { projectRestore, assetStatus, assets, viewport: this.engine.diagnostics() }); });

  ngAfterViewInit(): void { this.engine.setPlacementPlanProvider((_project, _active, target, context) => this.editor.planPlacement(target, context)); this.engine.mount(this.host().nativeElement); this.engine.restoreCamera(this.cameraState.get('3d')); const project = this.workspace.project(); const renderSelection = this.selection.renderState(project); this.engine.update(project, this.active.active(), { selected: this.selection.single(), selectedPositions: renderSelection.positions, selectionKind: renderSelection.kind, selectionCount: renderSelection.count, selectionBounds: renderSelection.bounds, selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); if (isDevMode()) console.debug('[MinecraftBuilder][3D mounted]', this.engine.diagnostics()); }
  ngOnDestroy(): void { const state = this.engine.cameraState(); if (state) this.cameraState.set('3d', state); this.hydrationProgressUnsubscribe(); this.hydrationStatus.release(this.hydrationOwner); this.sync.destroy(); this.themeSync.destroy(); this.controlSync.destroy(); this.assetSync.destroy(); this.lifecycleDiagnostics.destroy(); this.engine.dispose(); }

  fitStructure(): void { this.engine.fitStructure(); }
  focusSelection(): void {
    const decoration = this.decorations.selected();
    if (decoration) { const bounds = decorationAabb(decoration); this.engine.focusBounds(bounds); return; }
    const box = this.selection.box();
    if (box) { this.engine.focusBounds({ min: box.min, max: { x: box.max.x + 1, y: box.max.y + 1, z: box.max.z + 1 } }); return; }
    this.engine.focusBounds(this.selection.bounds(this.workspace.project()) ? { min: this.selection.bounds(this.workspace.project())!.min, max: { x: this.selection.bounds(this.workspace.project())!.max.x + 1, y: this.selection.bounds(this.workspace.project())!.max.y + 1, z: this.selection.bounds(this.workspace.project())!.max.z + 1 } } : undefined);
  }
  resetCamera(): void { this.engine.resetCamera(); }
  setCameraPreset(preset: CameraPreset): void { this.engine.setCameraPreset(preset); }

  protected resize(): void { this.engine.resize(); }
  protected statusLabel(): string { return this.i18n.t(this.status()); }
  protected pointerMove(event: PointerEvent): void { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, this.tool.active() === 'place'); const activeDecoration = this.decorations.active(); const status = activeDecoration ? (hit.decorationPlan?.status === 'valid' ? 'valid' : 'invalid') : hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status; this.decorationReason.set(activeDecoration ? hit.decorationPlan?.reason ?? '' : ''); this.engine.setGhostStatus(status); this.status.set(status); this.target.set(hit.target ? `${hit.target.x}, ${hit.target.y}, ${hit.target.z}` : ''); }
  protected pointerDown(event: PointerEvent): void {
    const action = this.input.mouseActionForEvent(event);
    if (!isEditorMouseAction(action)) return;
    event.preventDefault();
    this.capturePointer(event);
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.gestureAction = action;
    this.pickConsumed = false;
    this.boxCornerStart = undefined;
    if (action === 'pick-block') {
      const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, false);
      if (blockHitWinsOverDecoration(hit) && pickAndSelectBlockFromViewportHit(hit, (position) => this.editor.pick(position), (picked) => this.selectPickedBlock(picked.block!, picked.faceNormal))) this.pickConsumed = true;
      return;
    }
    if (action === 'primary-action' && this.tool.active() === 'select') {
      const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, false);
      this.boxCornerStart = hit.block ?? hit.target;
      const plane = hit.block && hit.faceNormal ? faceLockedSelectionPlane(hit.block, hit.faceNormal) : undefined;
      this.faceDragStart = plane && hit.block && hit.faceNormal ? { block: hit.block, normal: hit.faceNormal, hitPoint: hit.placementContext?.hitPoint, plane } : undefined;
    }
  }
  protected pointerUp(event: PointerEvent): void {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const gestureAction = this.gestureAction;
    this.gestureAction = undefined;
    const pickConsumed = this.pickConsumed;
    this.pickConsumed = false;
    const cornerStart = this.boxCornerStart;
    this.boxCornerStart = undefined;
    const faceDragStart = this.faceDragStart;
    this.faceDragStart = undefined;
    if (gestureAction) event.preventDefault();
    this.engine.endEditorPointerGesture();
    this.releasePointer(event);
    if (pickConsumed) return;
    const click = isPointerClick(start, { x: event.clientX, y: event.clientY }, this.preferences.preferences().controls.clickDragThreshold);
    if (!gestureAction) return;
    if (!click && gestureAction === 'primary-action' && this.tool.active() === 'select' && cornerStart && faceDragStart) {
      const project = this.workspace.project();
      const projected = this.engine.projectPointerToPlane(event, faceDragStart.plane);
      const cornerEnd = projected ? voxelOnFaceLockedPlane(projected, faceDragStart.plane) : undefined;
      if (project && cornerEnd) {
        const box = clampVoxelBox(normalizeVoxelBox(faceDragStart.block, cornerEnd), project.size);
        if (box) {
          const visibleKeys = new Set(visibleBlockEntries(project, { isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions() }).map((block) => coordinateKey(block.position)));
          this.selection.selectSurfaceBoxLogical(box, faceDragStart.normal, project, (id) => this.library.get(id), (block) => visibleKeys.has(coordinateKey(block.position)));
        }
      }
      return;
    }
    if (!click) return;
    const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), undefined, this.tool.active() === 'place');
    const activeDecoration = this.decorations.active();
    const decorationWins = !!hit.decoration && !blockHitWinsOverDecoration(hit);
    if (hit.decoration && decorationWins && (gestureAction !== 'primary-action' || this.tool.active() === 'select')) {
      if (gestureAction === 'delete-target') this.decorations.delete(hit.decoration.instanceId);
      else if (gestureAction === 'pick-block') this.decorations.pick(hit.decoration.instanceId);
      else if (this.tool.active() === 'select') this.decorations.select(hit.decoration.instanceId);
      return;
    }
    if (activeDecoration && hit.block && hit.faceNormal && this.tool.active() === 'place' && gestureAction === 'primary-action') {
      const facing = facingFromNormal(hit.faceNormal);
      if (facing && hit.decorationPlan?.status === 'valid') this.decorations.placeFromSupport(hit.block, facing);
      return;
    }
    if (activeDecoration && hit.block && this.tool.active() === 'select') { this.decorations.select(undefined); }
    const status = activeDecoration ? hit.decorationPlan?.status ?? hit.status : hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status;
    if (this.tool.active() === 'place' && gestureAction === 'primary-action' && hit.block && this.editor.canStackCandle(hit.block)) {
      this.editor.stackCandle(hit.block);
      return;
    }
    if (gestureAction === 'pick-block' && blockHitWinsOverDecoration(hit) && pickAndSelectBlockFromViewportHit(hit, (position) => this.editor.pick(position), (picked) => this.selectPickedBlock(picked.block!, picked.faceNormal))) return;
    else if (gestureAction === 'delete-target' && hit.block) this.editor.delete(hit.block);
    else if (gestureAction === 'primary-action' && this.tool.active() === 'select' && hit.block) this.selectPickedBlock(hit.block, hit.faceNormal);
    else if (gestureAction === 'primary-action' && this.tool.active() === 'select') this.selection.clear();
    else if (gestureAction === 'primary-action' && this.tool.active() === 'place' && hit.target && status !== 'invalid') this.editor.place(hit.target, hit.placementContext);
  }
  private selectPickedBlock(position: import('../../../../core/domain/project.types').VoxelCoordinate, faceNormal?: import('../../../../core/editor/placement/placement').FaceNormal): void {
    this.decorations.clearSelection();
    const project = this.workspace.project();
    if (!project) return;
    this.selection.selectLogical(position, project, (id) => this.library.get(id));
    const selected = project.blocks.find((block) => coordinateKey(block.position) === coordinateKey(position));
    if (selected && (isSignDefinition(this.library.get(selected.id)) || isSignId(selected.id))) this.signTextSide.setFromHit(selected, faceNormal);
  }
  protected reasonLabel(): string { const reason = this.decorationReason(); return reason === 'missing-support' ? this.i18n.t('decorationNeedsSupport') : reason === 'overlap-decoration' ? this.i18n.t('decorationOverlap') : reason === 'blocked-by-block' ? this.i18n.t('decorationBlocked') : reason === 'unsupported-face' ? this.i18n.t('decorationWallFace') : reason === 'out-of-bounds' ? this.i18n.t('decorationOutsideBounds') : ''; }
  protected pointerLeave(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture?.(event.pointerId)) return;
    this.pointerStart = undefined; this.gestureAction = undefined; this.pickConsumed = false; this.boxCornerStart = undefined; this.faceDragStart = undefined;
    this.engine.clearGhost(); this.status.set('invalid'); this.decorationReason.set(''); this.target.set('');
  }
  protected cancelPointer(event?: PointerEvent): void {
    if (event) this.releasePointer(event);
    this.engine.endEditorPointerGesture();
    this.pointerStart = undefined; this.gestureAction = undefined; this.pickConsumed = false; this.boxCornerStart = undefined; this.faceDragStart = undefined; this.engine.clearInput();
  }
  private capturePointer(event: PointerEvent): void { const target = event.currentTarget as HTMLElement | null; if (target?.setPointerCapture && !target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId); }
  private releasePointer(event: PointerEvent): void { const target = event.currentTarget as HTMLElement | null; if (target?.releasePointerCapture && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); }
  protected preventViewportWheel(event: WheelEvent): void { event.preventDefault(); }
  cameraKeyDown(action: import('../../../../core/editor/input/keyboard-bindings').MovementAction): void { this.engine.cameraKeyDown(action); }
  cameraKeyUp(action: import('../../../../core/editor/input/keyboard-bindings').MovementAction): void { this.engine.cameraKeyUp(action); }
}


function isEditorMouseAction(action: MouseAction | undefined): action is Exclude<MouseAction, 'orbit-camera' | 'pan-camera' | 'zoom-in' | 'zoom-out'> {
  return action === 'primary-action' || action === 'delete-target' || action === 'pick-block';
}
