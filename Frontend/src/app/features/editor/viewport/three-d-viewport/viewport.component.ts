import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  Renderer2,
  effect,
  inject,
  input as angularInput,
  isDevMode,
  viewChild,
  signal,
} from '@angular/core';
import { ActiveBlockService } from '../../../../core/blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { placementFeedbackForHit } from '../../../../core/renderer/interaction/viewport-hit-resolver';
import { isPointerClick } from '../../../../core/editor/input/interaction';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import type { EditorTool } from '../../../../core/editor/state/tool.service';
import { CameraStateService } from '../../../../core/editor/camera/camera-state.service';
import { CameraPreset, voxelCameraBounds } from '../../../../core/editor/camera/camera';
import type { CameraState } from '../../../../core/editor/camera/camera';
import { GroupService } from '../../../../core/editor/groups/group.service';
import {
  clampVoxelBox,
  faceLockedSelectionPlane,
  normalizeVoxelBox,
  voxelOnFaceLockedPlane,
} from '../../../../core/editor/selection/selection';
import { screenSpaceMarqueeRect } from '../../../../core/renderer/interaction/screen-space-marquee-selection';
import type {
  ScreenPointerPosition,
  ScreenSpaceMarqueeRect,
} from '../../../../core/renderer/interaction/screen-space-marquee-selection';
import {
  ThreeViewportEngine,
  ViewportOwnershipDiagnostics,
  ViewportRuntimeDiagnostics,
} from '../../../../core/renderer/engine/three-viewport-engine';
import type { ViewportPerformanceEvidence } from '../../../../core/renderer/engine/three-viewport-engine';
import { blockHitWinsOverDecoration } from '../../../../core/editor/viewport/pick-block';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { createBlockVisibilityPredicate } from '../../../../core/editor/viewport/visible-blocks';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { decorationAabb } from '../../../../core/decorations/placement/decoration-placement';
import { KeyboardBindingService } from '../../../../core/editor/input/keyboard-binding.service';
import { MouseAction } from '../../../../core/editor/input/mouse-bindings';
import { ProjectMutationHintService } from '../../../../core/editor/mutations/project-mutation-hint.service';
import { runTerrainAtlasProbe } from '../../../../core/renderer/terrain/atlas/terrain-atlas-browser-runner';
import { ViewportRuntimeTrace } from '../../../../core/renderer/diagnostics/viewport-runtime-trace';
import { selectionFocusBounds } from '../../../../core/renderer/presentation/selection-bounds';
import {
  ViewportStatusService,
  hoverCoordinateForHit,
} from '../../../../core/editor/viewport/viewport-status.service';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import type { ViewportRuntimeTraceApi } from '../../../../core/renderer/diagnostics/viewport-runtime-trace';
import { ViewportSessionOwner } from '../shared/viewport-session-owner';
import {
  ViewportPreparationScheduler,
  type ViewportPreparationScope,
} from '../shared/viewport-preparation-scheduler';
import { ViewportHitInteractionWorkflow } from '../shared/viewport-hit-interaction-workflow';

declare global {
  interface Window {
    __mbViewportDiagnostics?: () => ViewportRuntimeDiagnostics;
  }
}

@Component({
  selector: 'app-viewport',
  templateUrl: './viewport.component.html',
  styleUrl: './viewport.component.scss',
})
export class ViewportComponent implements AfterViewInit, OnDestroy {
  readonly viewportActive = angularInput(true);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly selectionMarquee = viewChild<ElementRef<HTMLDivElement>>('selectionMarquee');
  private readonly workspace = inject(WorkspaceStateService);
  private readonly active = inject(ActiveBlockService);
  private readonly library = inject(BlockLibraryService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly renderer2 = inject(Renderer2);
  private readonly assets = inject(ContentAssetRuntimeService);
  private readonly editor = inject(StructureEditorService);
  private readonly selection = inject(SelectionService);
  private readonly tool = inject(EditorToolService);
  private readonly cameraState = inject(CameraStateService);
  private readonly groups = inject(GroupService);
  protected readonly i18n = inject(I18nService);
  private readonly decorations = inject(DecorationService);
  private readonly hitInteraction = inject(ViewportHitInteractionWorkflow);
  private readonly input = inject(KeyboardBindingService);
  private readonly mutationHints = inject(ProjectMutationHintService);
  private readonly viewportStatus = inject(ViewportStatusService);
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  protected readonly placementFeedback = signal<
    ReturnType<typeof placementFeedbackForHit> | undefined
  >(undefined);
  protected readonly decorationReason = signal('');
  protected readonly target = signal<string>('');
  private readonly engine = new ThreeViewportEngine();
  private readonly session = new ViewportSessionOwner(
    this.engine,
    () => this.viewportActive(),
    '3D',
  );
  private readonly preparationScheduler = inject(ViewportPreparationScheduler);
  private preparationWasHydrating = false;
  private readonly preparationProgressUnsubscribe = this.engine.onHydrationProgress((progress) => {
    if (progress.status === 'hydrating') {
      this.preparationWasHydrating = true;
    } else if (this.preparationWasHydrating) {
      this.preparationWasHydrating = false;
      this.preparationScheduler.retry('3d-inactive');
    }
  });
  private readonly viewReady = signal(false);
  private viewportMounted = false;
  private readonly viewportTrace = new ViewportRuntimeTrace({
    metadata: () => this.engine.runtimeTraceMetadata(),
    sample: () => this.engine.runtimeTraceSample(),
    checkpoint: () => this.engine.runtimeTraceHeavySample(),
  });
  private readonly viewportTraceApi: ViewportRuntimeTraceApi = this.viewportTrace.getApi();
  private readonly runtimeDiagnosticsCommand = () => this.engine.runtimeGhostDiagnostics();
  private readonly terrainAtlasProbeCommand = (
    blockId = 'minecraft:stone',
    state: Readonly<Record<string, string>> = {},
  ) => runTerrainAtlasProbe(this.engine, this.assets.visualProvider(), blockId, state);
  private get hydrationOwner() {
    return this.session.hydrationOwner;
  }
  private get viewportStatusOwner() {
    return this.session.viewportStatusOwner;
  }
  private previousTool?: EditorTool;
  private pointerStart?: { x: number; y: number };
  private lastPointerPosition?: ScreenPointerPosition;
  private capturedPointerId?: number;
  private gestureAction?: MouseAction;
  private pickConsumed = false;
  private faceDragStart?: {
    readonly block: import('../../../../core/domain/project.types').VoxelCoordinate;
    readonly normal: import('../../../../core/editor/placement/placement').FaceNormal;
    readonly hitPoint?: { readonly x: number; readonly y: number; readonly z: number };
    readonly plane: import('../../../../core/editor/selection/selection').FaceLockedSelectionPlane;
  };
  private freeSpaceDragStart?: {
    readonly project: ProjectDocument;
    readonly cameraState: CameraState | undefined;
  };
  private readonly onNativePointerMove = (event: PointerEvent) => this.pointerMove(event);
  private readonly mountActiveViewport = effect(() => {
    if (!this.viewReady() || !this.viewportActive() || this.viewportMounted) return;
    this.mountViewport();
  });
  private readonly cancelGestureWhenInactive = effect(() => {
    if (!this.viewportActive()) this.clearPointerGesture();
  });
  private readonly sync = effect(() => {
    this.viewReady();
    const activeViewport = this.viewportActive();
    this.decorations.selectedId();
    this.decorations.active();
    const project = this.workspace.project();
    if (this.freeSpaceDragStart && project !== this.freeSpaceDragStart.project)
      this.clearPointerGesture();
    this.engine.update(
      project,
      this.active.active(),
      this.renderOptions(project),
      activeViewport ? this.mutationHints.consume(project, 'three-d-viewport') : undefined,
    );
  });
  private readonly prepareViewportResources = effect(() => {
    if (!this.viewReady()) return;
    const isActiveViewport = this.viewportActive();
    const finalization = this.hydrationStatus.finalization();
    const project = this.workspace.project();
    const provider = this.assets.visualProvider();
    const providerGeneration = this.assets.generation();
    const visualRevision = this.library.catalogRevision();
    if (!project || !provider) {
      this.preparationScheduler.update('3d-inactive', undefined, false, 1, () => 'rejected');
      return;
    }
    const scope: ViewportPreparationScope = {
      projectId: project.id,
      project,
      blocks: project.blocks,
      decorations: project.decorations,
      provider,
      providerGeneration,
      visualRevision,
    };
    const activeViewportUsable =
      !!finalization && !finalization.loading && (finalization.ready || finalization.warning);
    this.preparationScheduler.update(
      '3d-inactive',
      scope,
      this.assets.contentReady() && activeViewportUsable && !isActiveViewport,
      1,
      () => {
        const current = this.workspace.project();
        if (this.viewportActive()) return 'rejected';
        if (
          !current ||
          current !== scope.project ||
          current.id !== scope.projectId ||
          current.blocks !== scope.blocks ||
          current.decorations !== scope.decorations ||
          this.assets.visualProvider() !== provider ||
          this.assets.generation() !== providerGeneration ||
          this.library.catalogRevision() !== visualRevision
        )
          return 'rejected';
        return this.engine.prepareInactiveViewport(
          current,
          this.active.active(),
          this.renderOptions(current),
        );
      },
    );
  });
  private readonly toolSync = effect(() => {
    const tool = this.tool.active();
    if (!shouldClearGhostForToolChange(this.previousTool, tool)) return;
    this.previousTool = tool;
    this.engine.clearGhost();
    this.viewportStatus.clear(this.viewportStatusOwner);
  });

  ngAfterViewInit(): void {
    this.engine.setPlacementPlanProvider((project, active, target, context, lookup) =>
      this.editor.planPlacement(target, context, lookup, active, project),
    );
    this.host().nativeElement.addEventListener('pointermove', this.onNativePointerMove, {
      passive: true,
    });
    this.viewReady.set(true);
  }

  private renderOptions(project: ProjectDocument | undefined) {
    const renderSelection = this.selection.renderState(project);
    return {
      exposedFaceRendering: true,
      selected: this.selection.single(),
      selectedPositions: renderSelection.positions,
      selectionKind: renderSelection.kind,
      selectionCount: renderSelection.count,
      selectionBounds: renderSelection.bounds,
      selectionBox: this.selection.box(),
      isolatedGroupId: this.groups.isolatedGroupId(),
      isolatedGroupPositions: this.groups.isolatedGroupPositions(),
      activeGroupId: this.groups.activeGroupId(),
      activeGroupPositions: this.groups.activeGroupPositions(),
      groupMovePreview: this.groups.movePreview(),
      selectedDecorationId: this.decorations.selectedId(),
      activeDecoration: this.decorations.active(),
    };
  }

  private mountViewport(): void {
    if (isDevMode() && typeof window !== 'undefined') {
      this.engine.setRuntimeDiagnosticsEnabled(true);
      // Arm the bounded dev trace before mount so the first hydration/update
      // is included. The user can replace it with a fresh run through the
      // exposed diagnostics API before a focused interaction sequence.
      this.viewportTrace.start('16d-a-session');
      this.viewportTrace.mark('BOOTSTRAP_3D');
      this.engine.setRuntimeTrace(this.viewportTrace);
      window.__mbViewportDiagnostics = this.runtimeDiagnosticsCommand;
    }
    this.engine.mount(this.host().nativeElement);
    if (isDevMode() && typeof window !== 'undefined') {
      window.__minecraftBuilderDiagnostics = {
        ...window.__minecraftBuilderDiagnostics,
        runTerrainAtlasProbe: this.terrainAtlasProbeCommand,
        viewportTrace: this.viewportTraceApi,
      };
    }
    const project = this.workspace.project();
    this.engine.restoreCamera(this.cameraState.get('3d', project?.id), project?.id);
    this.viewportMounted = true;
    if (isDevMode()) console.debug('[MinecraftBuilder][3D mounted]', this.engine.diagnostics());
  }
  ngOnDestroy(): void {
    this.clearPointerGesture();
    if (
      isDevMode() &&
      typeof window !== 'undefined' &&
      window.__mbViewportDiagnostics === this.runtimeDiagnosticsCommand
    )
      delete window.__mbViewportDiagnostics;
    if (
      isDevMode() &&
      typeof window !== 'undefined' &&
      (window.__minecraftBuilderDiagnostics?.runTerrainAtlasProbe ===
        this.terrainAtlasProbeCommand ||
        window.__minecraftBuilderDiagnostics?.viewportTrace === this.viewportTraceApi)
    ) {
      const diagnostics = { ...window.__minecraftBuilderDiagnostics };
      delete diagnostics.runTerrainAtlasProbe;
      if (diagnostics.viewportTrace === this.viewportTraceApi) delete diagnostics.viewportTrace;
      if (Object.keys(diagnostics).length) window.__minecraftBuilderDiagnostics = diagnostics;
      else delete window.__minecraftBuilderDiagnostics;
    }
    this.engine.setRuntimeTrace(undefined);
    this.viewportTrace.stop();
    this.engine.setRuntimeDiagnosticsEnabled(false);
    const state = this.viewportMounted ? this.engine.cameraState() : undefined;
    const projectId = this.workspace.project()?.id;
    if (state) this.cameraState.set('3d', state, projectId);
    this.host().nativeElement.removeEventListener('pointermove', this.onNativePointerMove);
    this.preparationProgressUnsubscribe();
    this.session.destroy();
    this.mountActiveViewport.destroy();
    this.sync.destroy();
    this.toolSync.destroy();
    this.prepareViewportResources.destroy();
    this.preparationScheduler.unregister('3d-inactive');
    this.engine.dispose();
  }

  fitStructure(): void {
    this.engine.fitStructure();
  }
  rendererDiagnostics(): ViewportOwnershipDiagnostics {
    return this.engine.rendererOwnershipDiagnostics();
  }
  performanceEvidence(): ViewportPerformanceEvidence {
    return this.engine.performanceEvidence();
  }
  focusSelection(): void {
    const decoration = this.decorations.selected();
    if (decoration) {
      const bounds = decorationAabb(decoration);
      this.engine.focusBounds(bounds);
      return;
    }
    const project = this.workspace.project();
    this.engine.focusBounds(
      selectionFocusBounds(this.selection.bounds(project), this.selection.box()),
    );
  }
  resetCamera(): void {
    this.engine.resetCamera();
  }
  setCameraPreset(preset: CameraPreset): void {
    this.engine.setCameraPreset(preset);
  }

  protected resize(): void {
    if (!this.viewportActive()) return;
    this.engine.resize();
    if (this.lastPointerPosition) this.updateMarqueePreview(this.lastPointerPosition);
  }
  protected statusLabel(): string {
    return this.i18n.t(this.placementFeedback()?.status ?? 'invalid');
  }
  protected pointerMove(event: PointerEvent): void {
    if (!this.viewportActive()) return;
    const pointer = { x: event.clientX, y: event.clientY };
    this.lastPointerPosition = pointer;
    this.updateMarqueePreview(pointer);
    const project = this.workspace.project();
    this.engine.hover(
      event,
      project,
      this.active.active(),
      undefined,
      this.tool.active() === 'place',
      (hit) => this.applyHoverHit(hit, project?.id),
    );
  }
  private applyHoverHit(
    hit: import('../../../../core/renderer/engine/three-viewport-engine').ViewportHit,
    projectId?: string,
  ): void {
    const activeDecoration = this.decorations.active();
    const feedback = placementFeedbackForHit(hit, !!activeDecoration);
    this.decorationReason.set(activeDecoration ? (hit.decorationPlan?.reason ?? '') : '');
    this.engine.setGhostStatus(feedback?.status ?? 'invalid');
    this.placementFeedback.set(feedback);
    this.target.set(hit.target ? `${hit.target.x}, ${hit.target.y}, ${hit.target.z}` : '');
    this.viewportStatus.publish(
      this.viewportStatusOwner,
      projectId,
      hoverCoordinateForHit(hit),
      feedback?.status ?? hit.placement?.status ?? 'invalid',
    );
  }
  protected pointerDown(event: PointerEvent): void {
    if (!this.viewportActive()) return;
    const action = this.input.mouseActionForEvent(event);
    if (!isEditorMouseAction(action)) return;
    event.preventDefault();
    this.hideSelectionMarquee();
    this.capturePointer(event);
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.lastPointerPosition = this.pointerStart;
    this.gestureAction = action;
    this.pickConsumed = false;
    this.faceDragStart = undefined;
    this.freeSpaceDragStart = undefined;
    if (action === 'pick-block') {
      const hit = this.engine.hit(
        event,
        this.workspace.project(),
        this.active.active(),
        undefined,
        false,
      );
      this.pickConsumed = this.hitInteraction.pickBlock(hit, '3d');
      return;
    }
    if (action === 'primary-action' && this.tool.active() === 'select') {
      const project = this.workspace.project();
      const hit = this.engine.hit(event, project, this.active.active(), undefined, false);
      const blockStart = blockHitWinsOverDecoration(hit) ? hit.block : undefined;
      const plane =
        blockStart && hit.faceNormal
          ? faceLockedSelectionPlane(blockStart, hit.faceNormal)
          : undefined;
      this.faceDragStart =
        plane && blockStart && hit.faceNormal
          ? {
              block: blockStart,
              normal: hit.faceNormal,
              hitPoint: hit.placementContext?.hitPoint,
              plane,
            }
          : undefined;
      if (!hit.block && !hit.decoration && project)
        this.freeSpaceDragStart = { project, cameraState: this.engine.cameraState() };
    }
  }
  protected pointerUp(event: PointerEvent): void {
    if (!this.viewportActive()) {
      this.cancelPointer(event);
      return;
    }
    const start = this.pointerStart;
    this.lastPointerPosition = undefined;
    this.pointerStart = undefined;
    const gestureAction = this.gestureAction;
    this.gestureAction = undefined;
    const pickConsumed = this.pickConsumed;
    this.pickConsumed = false;
    const faceDragStart = this.faceDragStart;
    this.faceDragStart = undefined;
    const freeSpaceDragStart = this.freeSpaceDragStart;
    this.freeSpaceDragStart = undefined;
    this.hideSelectionMarquee();
    if (gestureAction) event.preventDefault();
    this.engine.endEditorPointerGesture();
    this.releasePointer(event);
    if (pickConsumed) return;
    const click = isPointerClick(
      start,
      { x: event.clientX, y: event.clientY },
      this.preferences.preferences().controls.clickDragThreshold,
    );
    if (!gestureAction) return;
    if (
      !click &&
      gestureAction === 'primary-action' &&
      this.tool.active() === 'select' &&
      faceDragStart
    ) {
      const project = this.workspace.project();
      const projected = this.engine.projectPointerToPlane(event, faceDragStart.plane);
      const cornerEnd = projected
        ? voxelOnFaceLockedPlane(projected, faceDragStart.plane)
        : undefined;
      if (project && cornerEnd) {
        const box = clampVoxelBox(normalizeVoxelBox(faceDragStart.block, cornerEnd), project.size);
        if (box) {
          const isVisible = createBlockVisibilityPredicate(project, {
            isolatedGroupId: this.groups.isolatedGroupId(),
            isolatedGroupPositions: this.groups.isolatedGroupPositions(),
          });
          this.selection.selectSurfaceBoxLogical(
            box,
            faceDragStart.normal,
            project,
            (id) => this.library.get(id),
            isVisible,
          );
        }
      }
      return;
    }
    if (
      !click &&
      gestureAction === 'primary-action' &&
      this.tool.active() === 'select' &&
      freeSpaceDragStart
    ) {
      const project = this.workspace.project();
      if (
        !project ||
        !start ||
        project !== freeSpaceDragStart.project ||
        !sameCameraState(freeSpaceDragStart.cameraState, this.engine.cameraState())
      )
        return;
      const rect = this.marqueeRect(start, { x: event.clientX, y: event.clientY });
      const query = rect ? this.engine.screenSpaceMarqueeQuery(rect, project.size) : undefined;
      const isVisible = createBlockVisibilityPredicate(project, {
        isolatedGroupId: this.groups.isolatedGroupId(),
        isolatedGroupPositions: this.groups.isolatedGroupPositions(),
      });
      this.selection.selectMarqueeLogical(query, project, (id) => this.library.get(id), isVisible);
      return;
    }
    if (!click) return;
    const hit = this.engine.hit(
      event,
      this.workspace.project(),
      this.active.active(),
      undefined,
      this.tool.active() === 'place',
    );
    this.hitInteraction.applyClick(hit, gestureAction, this.tool.active(), '3d');
  }
  protected reasonLabel(): string {
    const reason = this.decorationReason();
    return reason === 'missing-support'
      ? this.i18n.t('decorationNeedsSupport')
      : reason === 'overlap-decoration'
        ? this.i18n.t('decorationOverlap')
        : reason === 'blocked-by-block'
          ? this.i18n.t('decorationBlocked')
          : reason === 'unsupported-face'
            ? this.i18n.t('decorationWallFace')
            : reason === 'out-of-bounds'
              ? this.i18n.t('decorationOutsideBounds')
              : '';
  }
  protected pointerLeave(event: PointerEvent): void {
    if (!this.viewportActive()) return;
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture?.(event.pointerId)) return;
    this.clearPointerGesture();
    this.engine.clearGhost();
    this.placementFeedback.set(undefined);
    this.decorationReason.set('');
    this.target.set('');
    this.viewportStatus.clear(this.viewportStatusOwner);
  }
  protected cancelPointer(event?: PointerEvent): void {
    if (event) this.releasePointer(event);
    this.engine.endEditorPointerGesture();
    this.clearPointerGesture();
    if (this.viewportActive()) this.engine.clearInput();
    this.viewportStatus.clear(this.viewportStatusOwner);
  }
  private capturePointer(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    this.capturedPointerId = event.pointerId;
    if (target?.setPointerCapture && !target.hasPointerCapture(event.pointerId))
      target.setPointerCapture(event.pointerId);
  }
  private releasePointer(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.releasePointerCapture && target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId);
    if (this.capturedPointerId === event.pointerId) this.capturedPointerId = undefined;
  }
  private updateMarqueePreview(pointer: ScreenPointerPosition): void {
    const start = this.pointerStart;
    const gesture = this.freeSpaceDragStart;
    if (
      !start ||
      !gesture ||
      this.gestureAction !== 'primary-action' ||
      this.tool.active() !== 'select' ||
      this.workspace.project() !== gesture.project ||
      !sameCameraState(gesture.cameraState, this.engine.cameraState()) ||
      isPointerClick(start, pointer, this.preferences.preferences().controls.clickDragThreshold)
    ) {
      this.hideSelectionMarquee();
      return;
    }
    this.showSelectionMarquee(this.marqueeRect(start, pointer));
  }
  private marqueeRect(
    start: ScreenPointerPosition | undefined,
    end: ScreenPointerPosition,
  ): ScreenSpaceMarqueeRect | undefined {
    if (!start) return undefined;
    const bounds = this.host().nativeElement.getBoundingClientRect();
    return screenSpaceMarqueeRect(start, end, bounds);
  }
  private showSelectionMarquee(rect: ScreenSpaceMarqueeRect | undefined): void {
    const element = this.selectionMarquee()?.nativeElement;
    if (!element || !rect) {
      this.hideSelectionMarquee();
      return;
    }
    this.renderer2.setStyle(element, 'left', `${rect.left}px`);
    this.renderer2.setStyle(element, 'top', `${rect.top}px`);
    this.renderer2.setStyle(element, 'width', `${rect.width}px`);
    this.renderer2.setStyle(element, 'height', `${rect.height}px`);
    this.renderer2.setProperty(element, 'hidden', false);
  }
  private hideSelectionMarquee(): void {
    const element = this.selectionMarquee()?.nativeElement;
    if (element) this.renderer2.setProperty(element, 'hidden', true);
  }
  private clearPointerGesture(): void {
    this.hideSelectionMarquee();
    if (this.capturedPointerId !== undefined) {
      const host = this.host().nativeElement;
      if (host.hasPointerCapture?.(this.capturedPointerId))
        host.releasePointerCapture?.(this.capturedPointerId);
      this.capturedPointerId = undefined;
    }
    this.pointerStart = undefined;
    this.lastPointerPosition = undefined;
    this.gestureAction = undefined;
    this.pickConsumed = false;
    this.faceDragStart = undefined;
    this.freeSpaceDragStart = undefined;
    this.engine.endEditorPointerGesture();
  }
  protected preventViewportWheel(event: WheelEvent): void {
    event.preventDefault();
  }
  cameraKeyDown(
    action: import('../../../../core/editor/input/keyboard-bindings').MovementAction,
  ): void {
    this.engine.cameraKeyDown(action);
  }
  cameraKeyUp(
    action: import('../../../../core/editor/input/keyboard-bindings').MovementAction,
  ): void {
    this.engine.cameraKeyUp(action);
  }
  clearCameraInput(): void {
    this.engine.clearInput();
  }
}

export function shouldClearGhostForToolChange(
  previousTool: EditorTool | undefined,
  nextTool: EditorTool,
): boolean {
  return previousTool !== nextTool;
}

function isEditorMouseAction(
  action: MouseAction | undefined,
): action is Exclude<MouseAction, 'orbit-camera' | 'pan-camera' | 'zoom-in' | 'zoom-out'> {
  return action === 'primary-action' || action === 'delete-target' || action === 'pick-block';
}

function sameCameraState(left: CameraState | undefined, right: CameraState | undefined): boolean {
  if (!left || !right) return left === right;
  return (
    sameVector(left.position, right.position) &&
    sameVector(left.target, right.target) &&
    sameVector(left.up, right.up)
  );
}

function sameVector(
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number },
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}
