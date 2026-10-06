import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, input as angularInput, isDevMode, signal, viewChild } from '@angular/core';
import { ActiveBlockService } from '../../../../core/blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { adjacentOccupiedLayer, clampLayer, jumpOccupiedLayer, layerCoordinate, YLayerVisibility } from '../../../../core/editor/viewport/y-layer';
import { placementFeedbackForHit } from '../../../../core/renderer/interaction/viewport-hit-resolver';
import { isPointerClick } from '../../../../core/editor/input/interaction';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import { CameraStateService } from '../../../../core/editor/camera/camera-state.service';
import { CameraPreset, voxelCameraBounds } from '../../../../core/editor/camera/camera';
import { GroupService } from '../../../../core/editor/groups/group.service';
import { clampVoxelBox, normalizeVoxelBox } from '../../../../core/editor/selection/selection';
import { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import type { ViewportPerformanceEvidence, ViewportProjectionState } from '../../../../core/renderer/engine/three-viewport-engine';
import { blockHitWinsOverDecoration, pickAndSelectBlockFromViewportHit } from '../../../../core/editor/viewport/pick-block';
import { itemVisualTextureResources, resolveItemVisual } from '../../../../core/renderer/geometry/block-model-geometry';
import { VoxelCoordinate } from '../../../../core/domain/project.types';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { ProjectMutationHintService } from '../../../../core/editor/mutations/project-mutation-hint.service';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { ThemeService } from '../../../../core/ui/theme/theme.service';
import { viewportThemePalette } from '../../../../core/renderer/engine/viewport-theme';
import { VanillaAssetsService } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { decorationAabb, facingFromNormal } from '../../../../core/decorations/placement/decoration-placement';
import { ThemedSelectComponent, ThemedSelectOption } from '../../../../shared/ui/themed-select/themed-select.component';
import { KeyboardBindingService } from '../../../../core/editor/input/keyboard-binding.service';
import { MouseAction } from '../../../../core/editor/input/mouse-bindings';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { ItemVisualService } from '../../../../core/items/catalog/item-visual.service';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import { EditorSessionService } from '../../../../core/editor/state/editor-session.service';

export const Y_LAYER_PROJECTION_STATUS_DELAY_MS = 180;

@Component({ selector: 'app-y-layer', imports: [ThemedSelectComponent, LucideChevronLeft, LucideChevronRight, UiTooltipDirective], templateUrl: './y-layer.component.html', styleUrl: './y-layer.component.scss' })
export class YLayerComponent implements AfterViewInit, OnDestroy {
  readonly viewportActive = angularInput(true);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  protected readonly workspace = inject(WorkspaceStateService);
  private readonly mutationHints = inject(ProjectMutationHintService);
  private readonly layerIndex = inject(ProjectBlockRuntimeIndex);
  private readonly editor = inject(StructureEditorService);
  private readonly active = inject(ActiveBlockService);
  private readonly library = inject(BlockLibraryService);
  protected readonly selection = inject(SelectionService);
  private readonly tool = inject(EditorToolService);
  private readonly cameraState = inject(CameraStateService);
  private readonly groups = inject(GroupService);
  protected readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly assets = inject(VanillaAssetsService);
  private readonly decorations = inject(DecorationService);
  private readonly input = inject(KeyboardBindingService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly itemVisuals = inject(ItemVisualService);
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  private readonly session = inject(EditorSessionService);
  private readonly resolveSpecialVisual = (id: string) => this.library.get(id)?.specialVisual;
  private readonly resolveBlockDefinition = (id: string) => this.library.get(id);
  private readonly resolveDecorationTexture = (resource: string) => this.assets.sources.resources.textureUrl(resource);
  private readonly resolveDecorationItemResources = (itemId: string) => itemVisualTextureResources(this.assets.sources.resources, itemId);
  private readonly resolveDecorationItemVisual = (itemId: string) => resolveItemVisual(this.assets.sources.resources, itemId);
  private readonly resolveDecorationItemPreview = (item: import('../../../../core/items/item-stack.types').ItemStackData) => this.itemVisuals.request(item, 'high').then((info) => info.previewUrls[0]);
  private readonly resolvePaintingTexture = (id: string) => this.paintingCatalog.get(id)?.assetPath;
  protected readonly visibility = computed<YLayerVisibility>(() => this.workspace.project()?.editorSettings.layerVisibility ?? 'current-only');
  protected readonly visibilityOptions = computed<readonly ThemedSelectOption[]>(() => [
    { id: 'current-only', label: this.i18n.t('visibilityCurrent') }, { id: 'current-previous', label: this.i18n.t('visibilityPrevious') }, { id: 'current-next', label: this.i18n.t('visibilityNext') }, { id: 'previous-current-next', label: this.i18n.t('visibilityThree') }, { id: 'all-below', label: this.i18n.t('visibilityBelow') }, { id: 'whole-structure', label: this.i18n.t('visibilityWhole') },
  ]);
  protected readonly placementFeedback = signal<ReturnType<typeof placementFeedbackForHit> | undefined>(undefined);
  protected readonly decorationReason = signal('');
  protected readonly target = signal<string>('');
  private readonly engine = new ThreeViewportEngine();
  protected readonly projectionBusy = signal(false);
  protected readonly projectionIndicatorVisible = signal(false);
  private projectionIndicatorTimer?: ReturnType<typeof setTimeout>;
  private projectionIndicatorRevision?: number;
  private readonly projectionActivityUnsubscribe = this.engine.onProjectionActivity((state) => this.handleProjectionActivity(state));
  private readonly hydrationOwner = this.hydrationStatus.claim();
  private readonly hydrationProgressUnsubscribe = this.engine.onHydrationProgress((progress) => this.hydrationStatus.publish(this.hydrationOwner, progress));
  private readonly layerIndexSync = effect(() => { const project = this.workspace.project(); if (project) this.layerIndex.ensure(project); this.engine.setLayerIndex(this.layerIndex); });
  private pointerStart?: { x: number; y: number };
  private gestureAction?: MouseAction;
  private pickConsumed = false;
  private boxCornerStart?: VoxelCoordinate;
  private readonly lifecycleSync = effect(() => { if (this.viewportActive()) { this.hydrationStatus.activate(this.hydrationOwner); this.engine.resume(); } else this.engine.suspend(); });
  private readonly sync = effect(() => { const activeViewport = this.viewportActive(); const project = this.workspace.project(); this.tool.active(); this.decorations.selectedId(); this.decorations.active(); const renderSelection = this.selection.renderState(project); this.engine.update(project, this.active.active(), project ? { layerY: this.committedY(), visibility: this.visibility(), referenceOpacity: project.editorSettings.referenceLayerOpacity, selected: this.selection.single(), selectedPositions: renderSelection.positions, selectionKind: renderSelection.kind, selectionCount: renderSelection.count, selectionBounds: renderSelection.bounds, selectedDecorationId: this.decorations.selectedId(), activeDecoration: this.decorations.active(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() } : { selected: this.selection.single(), selectedPositions: renderSelection.positions, selectionKind: renderSelection.kind, selectionCount: renderSelection.count, selectionBounds: renderSelection.bounds, selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), groupMovePreview: this.groups.movePreview() }, activeViewport ? this.mutationHints.consume(project, 'y-layer-viewport') : undefined); });
  private readonly themeSync = effect(() => { this.engine.applyTheme(viewportThemePalette(this.theme.editorBackground())); });
  private readonly controlSync = effect(() => { const preferences = this.preferences.effectivePreferences(); this.engine.setControlConfiguration(preferences.controls); this.engine.setMouseBindings(preferences.mouseBindings); this.engine.setBlockBrightness(preferences.accessibility.blockBrightness); this.engine.setStructureBlockGuideVisible(preferences.showStructureBlockGuide); });
  private readonly assetSync = effect(() => { this.engine.setVisualProvider(this.assets.visualProvider()); this.engine.setSpecialVisualDescriptorResolver(this.resolveSpecialVisual, this.library.catalogRevision()); this.engine.setBlockDefinitionResolver(this.resolveBlockDefinition); this.engine.setDecorationTextureProvider(this.resolveDecorationTexture); this.engine.setDecorationItemResourceProvider(this.resolveDecorationItemResources); this.engine.setDecorationItemVisualProvider(this.resolveDecorationItemVisual); this.engine.setDecorationItemPreviewProvider(this.resolveDecorationItemPreview); this.paintingCatalog.variants(); this.engine.setPaintingTextureResolver(this.resolvePaintingTexture); });
  private readonly finalizationSync = effect(() => {
    if (!this.viewportActive()) return;
    const restore = this.assets.contentRestore();
    const terminal = restore.phase === 'ready' || restore.phase === 'partial' || restore.phase === 'error';
    this.engine.setMissingBlocksTerminal(terminal);
    this.hydrationStatus.setSourceRestoreState(this.hydrationOwner, { terminal, pending: !terminal, failed: restore.phase === 'error' });
    this.hydrationStatus.setFinalizationAuditHooks(this.hydrationOwner, () => {
      const progress = this.engine.finalizationAuditProgress();
      const finalization = progress.finalization;
      return { input: { progress, sourceRestoreTerminal: terminal, sourceRestorePending: !terminal, sourceRestoreFailed: restore.phase === 'error', providerRefreshPlanning: progress.providerRefreshPlanning, providerRefreshQueued: progress.providerRefreshQueued, providerRefreshRunning: progress.providerRefreshRunning, terrainPending: progress.terrainPending }, ownershipComplete: !!finalization && finalization.finalReadyBlocks + finalization.permanentMissingBlocks >= finalization.expectedBlocks };
    }, () => this.engine.reconcileFinalizationAccounting());
  });
  private readonly lifecycleDiagnostics = effect(() => { const projectRestore = this.workspace.restoreStatus(); const assetStatus = this.assets.status(); const assets = this.assets.diagnostics(); if (isDevMode()) console.debug('[MinecraftBuilder][Y-layer bootstrap]', { projectRestore, assetStatus, assets, viewport: this.engine.diagnostics() }); });

  ngAfterViewInit(): void { this.engine.setPlacementPlanProvider((project, active, target, context, lookup) => this.editor.planPlacement(target, context, lookup, active, project)); const element = this.host()?.nativeElement; if (element) this.engine.mount(element); this.engine.restoreCamera(this.cameraState.get('y-layer')); this.refresh(); if (isDevMode()) console.debug('[MinecraftBuilder][Y-layer mounted]', this.engine.diagnostics()); }
  ngOnDestroy(): void { const state = this.engine.cameraState(); if (state) this.cameraState.set('y-layer', state); this.session.clearCurrentYPreview(this.workspace.project()?.id); this.projectionActivityUnsubscribe(); if (this.projectionIndicatorTimer !== undefined) clearTimeout(this.projectionIndicatorTimer); this.projectionIndicatorTimer = undefined; this.projectionIndicatorRevision = undefined; this.hydrationProgressUnsubscribe(); this.hydrationStatus.release(this.hydrationOwner); this.sync.destroy(); this.lifecycleSync.destroy(); this.layerIndexSync.destroy(); this.themeSync.destroy(); this.controlSync.destroy(); this.assetSync.destroy(); this.finalizationSync.destroy(); this.lifecycleDiagnostics.destroy(); this.engine.dispose(); }

  fitStructure(): void { this.engine.fitStructure(); }
  performanceEvidence(): ViewportPerformanceEvidence { return this.engine.performanceEvidence(); }
  focusSelection(): void {
    const decoration = this.decorations.selected();
    if (decoration) { const bounds = decorationAabb(decoration); this.engine.focusBounds(bounds); return; }
    const box = this.selection.box();
    if (box) { this.engine.focusBounds({ min: box.min, max: { x: box.max.x + 1, y: box.max.y + 1, z: box.max.z + 1 } }); return; }
    const bounds = this.selection.bounds(this.workspace.project()); this.engine.focusBounds(bounds ? { min: bounds.min, max: { x: bounds.max.x + 1, y: bounds.max.y + 1, z: bounds.max.z + 1 } } : undefined);
  }
  resetCamera(): void { this.engine.resetCamera(); }
  setCameraPreset(preset: CameraPreset): void { this.engine.setCameraPreset(preset); }

  protected currentY(): number { return this.session.displayCurrentY(this.workspace.project()); }
  private committedY(): number { return this.session.committedCurrentY(this.workspace.project()); }
  protected previewLayer(value: string): void { const project = this.workspace.project(); if (!project || this.projectionBusy()) return; const y = clampLayer(Number(value), project.size); this.session.previewCurrentY(project.id, y); this.engine.setEditingPlanePreviewY(y); }
  protected commitLayer(value: string): void { const project = this.workspace.project(); if (!project || this.projectionBusy()) return; const y = clampLayer(Number(value), project.size); this.session.clearCurrentYPreview(project.id); if (project.editorSettings.currentY === y) { this.engine.setEditingPlanePreviewY(y); return; } this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, currentY: y } }); }
  protected setLayer(value: string): void { this.commitLayer(value); }
  protected stepLayer(direction: -1 | 1): void { const project = this.workspace.project(); if (project && !this.projectionBusy()) this.setLayer(String(clampLayer(this.currentY() + direction, project.size))); }
  protected jumpLayer(target: 'first' | 'last'): void { const project = this.workspace.project(); if (project && !this.projectionBusy()) this.setLayer(String(jumpOccupiedLayer(project.blocks, this.currentY(), target, this.layerIndex))); }
  protected jumpAdjacent(direction: -1 | 1): void { const project = this.workspace.project(); if (project && !this.projectionBusy()) this.setLayer(String(clampLayer(adjacentOccupiedLayer(this.currentY(), project.blocks, direction, this.layerIndex), project.size))); }
  protected setVisibility(value: string): void { const project = this.workspace.project(); if (!project || this.projectionBusy()) return; this.session.clearCurrentYPreview(project.id); if (project.editorSettings.layerVisibility === value) return; this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, layerVisibility: value as YLayerVisibility } }); }
  protected resize(): void { if (this.viewportActive()) this.engine.resize(); }
  protected pointerMove(event: PointerEvent): void { if (!this.viewportActive()) return; if (this.projectionBusy()) { this.clearInteractionFeedback(); return; } this.engine.hover(event, this.workspace.project(), this.active.active(), this.committedY(), this.tool.active() === 'place', (hit) => this.applyHoverHit(hit)); }
  private applyHoverHit(hit: import('../../../../core/renderer/engine/three-viewport-engine').ViewportHit): void { const activeDecoration = this.decorations.active(); const feedback = placementFeedbackForHit(hit, !!activeDecoration); this.decorationReason.set(activeDecoration ? hit.decorationPlan?.reason ?? '' : ''); this.engine.setGhostStatus(feedback?.status ?? 'invalid'); this.placementFeedback.set(feedback); this.target.set(hit.target ? `${hit.target.x}, ${hit.target.y}, ${hit.target.z}` : ''); }
  protected pointerDown(event: PointerEvent): void {
    if (!this.viewportActive()) return;
    if (this.projectionBusy()) return;
    const action = this.input.mouseActionForEvent(event);
    if (!isEditorMouseAction(action)) return;
    event.preventDefault();
    this.capturePointer(event);
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.gestureAction = action;
    this.pickConsumed = false;
    this.boxCornerStart = undefined;
    if (action === 'pick-block') {
      const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.committedY(), false);
      if (blockHitWinsOverDecoration(hit) && pickAndSelectBlockFromViewportHit(hit, (position) => this.editor.pick(position), (picked) => this.selectPickedBlock(picked.block!))) this.pickConsumed = true;
      return;
    }
    if (action === 'primary-action' && this.tool.active() === 'select') { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.committedY(), false); this.boxCornerStart = hit.target; }
  }
  protected pointerUp(event: PointerEvent): void {
    if (!this.viewportActive()) return;
    if (this.projectionBusy()) { this.pointerStart = undefined; this.gestureAction = undefined; this.pickConsumed = false; this.boxCornerStart = undefined; this.engine.endEditorPointerGesture(); this.releasePointer(event); return; }
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const gestureAction = this.gestureAction;
    this.gestureAction = undefined;
    const pickConsumed = this.pickConsumed;
    this.pickConsumed = false;
    const cornerStart = this.boxCornerStart;
    this.boxCornerStart = undefined;
    if (gestureAction) event.preventDefault();
    this.engine.endEditorPointerGesture();
    this.releasePointer(event);
    if (pickConsumed) return;
    const click = isPointerClick(start, { x: event.clientX, y: event.clientY }, this.preferences.preferences().controls.clickDragThreshold);
    if (!gestureAction) return;
    if (!click && gestureAction === 'primary-action' && this.tool.active() === 'select' && cornerStart) {
      const project = this.workspace.project(); const hit = this.engine.hit(event, project, this.active.active(), this.committedY(), false);
      if (project && hit.target) { const box = clampVoxelBox(normalizeVoxelBox(cornerStart, hit.target), project.size); if (box) this.selection.selectBoxLogical(box, project, (id) => this.library.get(id)); }
      return;
    }
    if (!click) return;
    const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.committedY(), this.tool.active() === 'place');
    const activeDecoration = this.decorations.active();
    const decorationWins = !!hit.decoration && !blockHitWinsOverDecoration(hit);
    if (hit.decoration && decorationWins && (gestureAction !== 'primary-action' || this.tool.active() === 'select')) {
      if (gestureAction === 'delete-target') this.decorations.delete(hit.decoration.instanceId);
      else if (gestureAction === 'pick-block') this.decorations.pick(hit.decoration.instanceId);
      else if (this.tool.active() === 'select') this.decorations.select(hit.decoration.instanceId);
      return;
    }
    if (activeDecoration && hit.block && hit.faceNormal && this.tool.active() === 'place' && gestureAction === 'primary-action') {
      const facing = facingFromNormal(hit.faceNormal); if (facing && hit.decorationPlan?.status === 'valid') this.decorations.placeFromSupport(hit.block, facing); return;
    }
    const status = hit.placement?.status ?? 'invalid';
    if (this.tool.active() === 'place' && gestureAction === 'primary-action' && hit.block && this.editor.canStackCandle(hit.block)) {
      this.editor.stackCandle(hit.block);
      return;
    }
    if (gestureAction === 'pick-block' && blockHitWinsOverDecoration(hit) && pickAndSelectBlockFromViewportHit(hit, (position) => this.editor.pick(position), (picked) => this.selectPickedBlock(picked.block!))) return;
    else if (gestureAction === 'delete-target' && hit.block) this.editor.delete(hit.block);
    else if (gestureAction === 'primary-action' && this.tool.active() === 'select' && hit.block) this.selectPickedBlock(hit.block);
    else if (gestureAction === 'primary-action' && this.tool.active() === 'select') this.selection.clear();
    else if (gestureAction === 'primary-action' && this.tool.active() === 'place' && hit.target && status !== 'invalid') this.editor.place(hit.target, hit.placementContext);
  }
  private selectPickedBlock(position: import('../../../../core/domain/project.types').VoxelCoordinate): void {
    this.decorations.clearSelection();
    const project = this.workspace.project();
    if (project) this.selection.selectLogical(position, project, (id) => this.library.get(id));
  }
  protected statusLabel(): string { return this.i18n.t(this.placementFeedback()?.status ?? 'invalid'); }
  protected setOpacity(value: string): void { const project = this.workspace.project(); if (!project) return; const opacity = Math.min(1, Math.max(0, Number(value))); this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, referenceLayerOpacity: opacity } }); }
  protected referenceOpacityPercent(): number { return Math.round((this.workspace.project()?.editorSettings.referenceLayerOpacity ?? .28) * 100); }
  protected reasonLabel(): string { const reason = this.decorationReason(); return reason === 'missing-support' ? this.i18n.t('decorationNeedsSupport') : reason === 'overlap-decoration' ? this.i18n.t('decorationOverlap') : reason === 'blocked-by-block' ? this.i18n.t('decorationBlocked') : reason === 'unsupported-face' ? this.i18n.t('decorationWallFace') : reason === 'out-of-bounds' ? this.i18n.t('decorationOutsideBounds') : ''; }
  protected pointerLeave(event: PointerEvent): void {
    if (!this.viewportActive()) return;
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture?.(event.pointerId)) return;
    this.pointerStart = undefined; this.gestureAction = undefined; this.pickConsumed = false; this.boxCornerStart = undefined;
    this.clearInteractionFeedback();
  }
  protected cancelPointer(event?: PointerEvent): void {
    if (!this.viewportActive()) return;
    if (event) this.releasePointer(event);
    this.engine.endEditorPointerGesture();
    this.pointerStart = undefined; this.gestureAction = undefined; this.pickConsumed = false; this.boxCornerStart = undefined; this.engine.clearInput();
  }
  private capturePointer(event: PointerEvent): void { const target = event.currentTarget as HTMLElement | null; if (target?.setPointerCapture && !target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId); }
  private releasePointer(event: PointerEvent): void { const target = event.currentTarget as HTMLElement | null; if (target?.releasePointerCapture && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); }
  protected preventViewportWheel(event: WheelEvent): void { event.preventDefault(); }
  cameraKeyDown(action: import('../../../../core/editor/input/keyboard-bindings').MovementAction): void { this.engine.cameraKeyDown(action); }
  cameraKeyUp(action: import('../../../../core/editor/input/keyboard-bindings').MovementAction): void { this.engine.cameraKeyUp(action); }
  clearCameraInput(): void { this.engine.clearInput(); }

  private refresh(): void { const project = this.workspace.project(); const renderSelection = this.selection.renderState(project); this.engine.update(project, this.active.active(), project ? { layerY: this.committedY(), visibility: this.visibility(), referenceOpacity: project.editorSettings.referenceLayerOpacity, selected: this.selection.single(), selectedPositions: renderSelection.positions, selectionKind: renderSelection.kind, selectionCount: renderSelection.count, selectionBounds: renderSelection.bounds, selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() } : { selected: this.selection.single(), selectedPositions: renderSelection.positions, selectionKind: renderSelection.kind, selectionCount: renderSelection.count, selectionBounds: renderSelection.bounds, selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), groupMovePreview: this.groups.movePreview() }); }

  private handleProjectionActivity(state: ViewportProjectionState): void {
    const busy = state.activity !== 'idle';
    this.projectionBusy.set(busy);
    if (!busy) {
      if (this.projectionIndicatorTimer !== undefined) clearTimeout(this.projectionIndicatorTimer);
      this.projectionIndicatorTimer = undefined;
      this.projectionIndicatorRevision = undefined;
      this.projectionIndicatorVisible.set(false);
      return;
    }
    if (this.projectionIndicatorRevision === state.revision) return;
    if (this.projectionIndicatorTimer !== undefined) clearTimeout(this.projectionIndicatorTimer);
    this.projectionIndicatorTimer = undefined;
    this.projectionIndicatorRevision = state.revision;
    this.projectionIndicatorVisible.set(false);
    this.clearInteractionFeedback();
    this.engine.endEditorPointerGesture();
    const revision = state.revision;
    this.projectionIndicatorTimer = setTimeout(() => {
      this.projectionIndicatorTimer = undefined;
      const current = this.engine.projectionActivity();
      if (current.revision === revision && current.activity !== 'idle') this.projectionIndicatorVisible.set(true);
    }, Y_LAYER_PROJECTION_STATUS_DELAY_MS);
  }

  private clearInteractionFeedback(): void { this.engine.clearGhost(); this.placementFeedback.set(undefined); this.decorationReason.set(''); this.target.set(''); }
}

function isEditorMouseAction(action: MouseAction | undefined): action is Exclude<MouseAction, 'orbit-camera' | 'pan-camera' | 'zoom-in' | 'zoom-out'> {
  return action === 'primary-action' || action === 'delete-target' || action === 'pick-block';
}
