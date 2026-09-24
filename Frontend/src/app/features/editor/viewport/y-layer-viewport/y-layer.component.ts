import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, isDevMode, signal, viewChild } from '@angular/core';
import { ActiveBlockService } from '../../../../core/blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { adjacentOccupiedLayer, blocksForLayers, clampLayer, jumpOccupiedLayer, layerCoordinate, YLayerVisibility } from '../../../../core/editor/viewport/y-layer';
import { PlacementStatus } from '../../../../core/editor/placement/placement';
import { isPointerClick } from '../../../../core/editor/input/interaction';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import { CameraStateService } from '../../../../core/editor/camera/camera-state.service';
import { CameraPreset, voxelCameraBounds } from '../../../../core/editor/camera/camera';
import { GroupService } from '../../../../core/editor/groups/group.service';
import { clampVoxelBox, normalizeVoxelBox } from '../../../../core/editor/selection/selection';
import { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import { itemVisualTextureResources } from '../../../../core/renderer/geometry/block-model-geometry';
import { VoxelCoordinate } from '../../../../core/domain/project.types';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
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

@Component({ selector: 'app-y-layer', imports: [ThemedSelectComponent, LucideChevronLeft, LucideChevronRight, UiTooltipDirective], templateUrl: './y-layer.component.html', styleUrl: './y-layer.component.scss' })
export class YLayerComponent implements AfterViewInit, OnDestroy {
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  protected readonly workspace = inject(WorkspaceStateService);
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
  protected readonly visibility = computed<YLayerVisibility>(() => this.workspace.project()?.editorSettings.layerVisibility ?? 'current-only');
  protected readonly visibilityOptions = computed<readonly ThemedSelectOption[]>(() => [
    { id: 'current-only', label: this.i18n.t('visibilityCurrent') }, { id: 'current-previous', label: this.i18n.t('visibilityPrevious') }, { id: 'current-next', label: this.i18n.t('visibilityNext') }, { id: 'previous-current-next', label: this.i18n.t('visibilityThree') }, { id: 'all-below', label: this.i18n.t('visibilityBelow') }, { id: 'whole-structure', label: this.i18n.t('visibilityWhole') },
  ]);
  protected readonly status = signal<PlacementStatus>('invalid');
  protected readonly decorationReason = signal('');
  protected readonly target = signal<string>('');
  private readonly engine = new ThreeViewportEngine();
  private pointerStart?: { x: number; y: number };
  private gestureAction?: MouseAction;
  private boxCornerStart?: VoxelCoordinate;
  private readonly sync = effect(() => { const project = this.workspace.project(); this.tool.active(); this.decorations.selectedId(); this.decorations.active(); this.engine.update(project, this.active.active(), project ? { layerY: project.editorSettings.currentY, visibility: this.visibility(), referenceOpacity: project.editorSettings.referenceLayerOpacity, selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectedDecorationId: this.decorations.selectedId(), activeDecoration: this.decorations.active(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() } : { selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); });
  private readonly themeSync = effect(() => { this.engine.applyTheme(viewportThemePalette(this.theme.editorBackground())); });
  private readonly controlSync = effect(() => { const preferences = this.preferences.preferences(); this.engine.setControlConfiguration(preferences.controls); this.engine.setKeyboardBindings(preferences.shortcuts); this.engine.setMouseBindings(preferences.mouseBindings); this.engine.setBlockBrightness(preferences.accessibility.blockBrightness); });
  private readonly assetSync = effect(() => { this.engine.setVisualProvider(this.assets.visualProvider()); this.engine.setSpecialVisualDescriptorResolver((id) => this.library.get(id)?.specialVisual); this.engine.setBlockDefinitionResolver((id) => this.library.get(id)); this.engine.setDecorationTextureProvider((resource) => this.assets.provider()?.textureUrl(resource)); this.engine.setDecorationItemResourceProvider((itemId) => itemVisualTextureResources(this.assets.sources.resources, itemId)); this.engine.setPaintingTextureResolver((id) => this.paintingCatalog.get(id)?.assetPath); });
  private readonly lifecycleDiagnostics = effect(() => { const projectRestore = this.workspace.restoreStatus(); const assetStatus = this.assets.status(); const assets = this.assets.diagnostics(); if (isDevMode()) console.debug('[MinecraftBuilder][Y-layer bootstrap]', { projectRestore, assetStatus, assets, viewport: this.engine.diagnostics() }); });

  ngAfterViewInit(): void { this.engine.setPlacementPlanProvider((_project, _active, target, context) => this.editor.planPlacement(target, context)); const element = this.host()?.nativeElement; if (element) this.engine.mount(element); this.engine.restoreCamera(this.cameraState.get('y-layer')); this.refresh(); if (isDevMode()) console.debug('[MinecraftBuilder][Y-layer mounted]', this.engine.diagnostics()); }
  ngOnDestroy(): void { const state = this.engine.cameraState(); if (state) this.cameraState.set('y-layer', state); this.sync.destroy(); this.themeSync.destroy(); this.controlSync.destroy(); this.assetSync.destroy(); this.lifecycleDiagnostics.destroy(); this.engine.dispose(); }

  fitStructure(): void { this.engine.fitStructure(); }
  focusSelection(): void {
    const decoration = this.decorations.selected();
    if (decoration) { const bounds = decorationAabb(decoration); this.engine.focusBounds(bounds); return; }
    const box = this.selection.box();
    if (box) { this.engine.focusBounds({ min: box.min, max: { x: box.max.x + 1, y: box.max.y + 1, z: box.max.z + 1 } }); return; }
    this.engine.focusBounds(voxelCameraBounds(this.selection.logicalPositions()) ?? (this.selection.single() ? voxelCameraBounds([this.selection.single()!]) : undefined));
  }
  resetCamera(): void { this.engine.resetCamera(); }
  setCameraPreset(preset: CameraPreset): void { this.engine.setCameraPreset(preset); }

  protected currentY(): number { return this.workspace.project()?.editorSettings.currentY ?? 0; }
  protected setLayer(value: string): void { const project = this.workspace.project(); if (!project) return; const y = clampLayer(Number(value), project.size); this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, currentY: y } }); }
  protected stepLayer(direction: -1 | 1): void { const project = this.workspace.project(); if (project) this.setLayer(String(clampLayer(this.currentY() + direction, project.size))); }
  protected jumpLayer(target: 'first' | 'last'): void { const project = this.workspace.project(); if (project) this.setLayer(String(jumpOccupiedLayer(project.blocks, this.currentY(), target))); }
  protected jumpAdjacent(direction: -1 | 1): void { const project = this.workspace.project(); if (project) this.setLayer(String(clampLayer(adjacentOccupiedLayer(this.currentY(), project.blocks, direction), project.size))); }
  protected setVisibility(value: string): void { const project = this.workspace.project(); if (!project) return; this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, layerVisibility: value as YLayerVisibility } }); }
  protected resize(): void { this.engine.resize(); }
  protected pointerMove(event: PointerEvent): void { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.currentY(), this.tool.active() === 'place'); const activeDecoration = this.decorations.active(); const status = activeDecoration ? (hit.decorationPlan?.status === 'valid' ? 'valid' : 'invalid') : hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status; this.decorationReason.set(activeDecoration ? hit.decorationPlan?.reason ?? '' : ''); this.engine.setGhostStatus(status); this.status.set(status); this.target.set(hit.target ? `${hit.target.x}, ${hit.target.y}, ${hit.target.z}` : ''); }
  protected pointerDown(event: PointerEvent): void {
    const action = this.input.mouseActionForEvent(event);
    if (!isEditorMouseAction(action)) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.gestureAction = action;
    this.boxCornerStart = undefined;
    if (action === 'primary-action' && this.tool.active() === 'select') { const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.currentY(), false); this.boxCornerStart = hit.target; }
  }
  protected pointerUp(event: PointerEvent): void {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    const gestureAction = this.gestureAction;
    this.gestureAction = undefined;
    const cornerStart = this.boxCornerStart;
    this.boxCornerStart = undefined;
    const click = isPointerClick(start, { x: event.clientX, y: event.clientY }, this.preferences.preferences().controls.clickDragThreshold);
    if (!gestureAction) return;
    if (!click && gestureAction === 'primary-action' && this.tool.active() === 'select' && cornerStart) {
      const project = this.workspace.project(); const hit = this.engine.hit(event, project, this.active.active(), this.currentY(), false);
      if (project && hit.target) { const box = clampVoxelBox(normalizeVoxelBox(cornerStart, hit.target), project.size); if (box) this.selection.selectBoxLogical(box, project, (id) => this.library.get(id)); }
      return;
    }
    if (!click) return;
    const hit = this.engine.hit(event, this.workspace.project(), this.active.active(), this.currentY(), this.tool.active() === 'place');
    const activeDecoration = this.decorations.active();
    const decorationWins = !!hit.decoration && (hit.blockDistance === undefined || hit.decorationDistance === undefined || hit.decorationDistance <= hit.blockDistance);
    if (hit.decoration && decorationWins && (gestureAction !== 'primary-action' || this.tool.active() === 'select')) {
      if (gestureAction === 'delete-target') this.decorations.delete(hit.decoration.instanceId);
      else if (gestureAction === 'pick-block') this.decorations.pick(hit.decoration.instanceId);
      else if (this.tool.active() === 'select') this.decorations.select(hit.decoration.instanceId);
      return;
    }
    if (activeDecoration && hit.block && hit.faceNormal && this.tool.active() === 'place' && gestureAction === 'primary-action') {
      const facing = facingFromNormal(hit.faceNormal); if (facing && hit.decorationPlan?.status === 'valid') this.decorations.placeFromSupport(hit.block, facing); return;
    }
    const status = hit.target ? this.editor.validatePlacement(hit.target, hit.placementContext).status : hit.status;
    if (this.tool.active() === 'place' && gestureAction === 'primary-action' && hit.block && this.editor.canStackCandle(hit.block)) {
      this.editor.stackCandle(hit.block);
      return;
    }
    if (gestureAction === 'pick-block' && hit.block) this.editor.pick(hit.block);
    else if (gestureAction === 'delete-target' && hit.block) this.editor.delete(hit.block);
    else if (gestureAction === 'primary-action' && this.tool.active() === 'select' && hit.block) { this.decorations.clearSelection(); const project = this.workspace.project(); if (project) this.selection.selectLogical(hit.block, project, (id) => this.library.get(id)); }
    else if (gestureAction === 'primary-action' && this.tool.active() === 'select') this.selection.clear();
    else if (gestureAction === 'primary-action' && this.tool.active() === 'place' && hit.target && status !== 'invalid') this.editor.place(hit.target, hit.placementContext);
  }
  protected statusLabel(): string { return this.i18n.t(this.status()); }
  protected setOpacity(value: string): void { const project = this.workspace.project(); if (!project) return; const opacity = Math.min(1, Math.max(0, Number(value))); this.workspace.project.set({ ...project, editorSettings: { ...project.editorSettings, referenceLayerOpacity: opacity } }); }
  protected referenceOpacityPercent(): number { return Math.round((this.workspace.project()?.editorSettings.referenceLayerOpacity ?? .28) * 100); }
  protected reasonLabel(): string { const reason = this.decorationReason(); return reason === 'missing-support' ? this.i18n.t('decorationNeedsSupport') : reason === 'overlap-decoration' ? this.i18n.t('decorationOverlap') : reason === 'blocked-by-block' ? this.i18n.t('decorationBlocked') : reason === 'unsupported-face' ? this.i18n.t('decorationWallFace') : reason === 'out-of-bounds' ? this.i18n.t('decorationOutsideBounds') : ''; }
  protected pointerLeave(): void { this.pointerStart = undefined; this.gestureAction = undefined; this.engine.clearGhost(); this.status.set('invalid'); this.decorationReason.set(''); this.target.set(''); }
  protected cancelPointer(): void { this.pointerStart = undefined; this.gestureAction = undefined; this.boxCornerStart = undefined; this.engine.clearInput(); }
  protected preventViewportWheel(event: WheelEvent): void { event.preventDefault(); }

  private refresh(): void { const project = this.workspace.project(); this.engine.update(project, this.active.active(), project ? { layerY: project.editorSettings.currentY, visibility: this.visibility(), referenceOpacity: project.editorSettings.referenceLayerOpacity, selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() } : { selected: this.selection.single(), selectedPositions: this.selection.logicalPositions(), selectionBox: this.selection.box(), isolatedGroupId: this.groups.isolatedGroupId(), isolatedGroupPositions: this.groups.isolatedGroupPositions(), activeGroupId: this.groups.activeGroupId(), activeGroupPositions: this.groups.activeGroupPositions(), groupMovePreview: this.groups.movePreview() }); }
}

function isEditorMouseAction(action: MouseAction | undefined): action is Exclude<MouseAction, 'orbit-camera' | 'pan-camera' | 'zoom-in' | 'zoom-out'> {
  return action === 'primary-action' || action === 'delete-target' || action === 'pick-block';
}
