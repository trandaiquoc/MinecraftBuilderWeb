import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { FaceNormal, resolveAttachmentPlacement, projectGridBounds, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit, PlacementContext, PlacementStatus } from '../../editor/placement/placement';
import { type LayerBlockIndex } from '../../editor/viewport/y-layer';
import { isBlockVisibleForViewport } from '../../editor/viewport/visible-blocks';
import { CameraBounds, CameraPreset, CameraState, projectCameraBounds } from '../../editor/camera/camera';
import { groupIdsOf, isBlockVisible } from '../../editor/groups/group-membership';
import { isDecorationVisible, decorationHasGroup } from '../../editor/groups/decoration-membership';
import type { GroupMovePreview } from '../../editor/groups/group-move-planner';
import { ViewportThemePalette, viewportThemePalette } from './viewport-theme';
import type { BlockVisualProvider, BlockVisualResult, VisualCacheStats } from '../visuals/block-visual-provider-contract';
import type { ResolvedItemVisual } from '../visuals/item-visual-resolver';
import type { NormalizedSpecialVisualDescriptor } from '../visuals/special-visual-contracts';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationPlacementPlan, decorationAabb, facingFromNormal, planDecorationPlacement } from '../../decorations/placement/decoration-placement';
import { DecorationTextureCache } from '../visuals/decoration-visuals';
import { DecorationRenderLifecycle } from '../visuals/decoration-render-lifecycle';
import { BlockRepresentationResourceOwner } from '../visuals/block-representation-resource-owner';
import { BlockRepresentationHydrationOwner } from '../visuals/block-representation-hydration-owner';
import { BlockRepresentationCommitOwner, type BlockRepresentationRenderTargets } from '../visuals/block-representation-commit-owner';
import type { BlockHydrationJob } from '../visuals/block-representation-contracts';
import { decorationRenderSignature } from '../visuals/decoration-render-signature';
import type { ItemStackData } from '../../items/item-stack.types';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import { MouseAction } from '../../editor/input/mouse-bindings';
import { RendererDiagnostics, RendererCounters } from './renderer-diagnostics';
import { normalizeBlockBrightness, viewportLightingForBrightness, ViewportLighting } from './viewport-lighting';
import { applyBlockBrightnessToMaterial, applyBlockBrightnessToObject, applyStructureGuideBrightnessToObject, setBlockBrightnessBaseColor, STRUCTURE_GUIDE_BRIGHTNESS } from './block-brightness';
import { FaceLockedSelectionPlane, FreeSpaceSelectionPlane, freeSpaceSelectionPlane } from '../../editor/selection/selection';
import { structureBlockGuidePosition } from './structure-block-guide';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { ViewportInteriorCullingOwner } from '../visibility/viewport-interior-culling-owner';
import { exposedFaceDirections, SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { fluidCoordinateFromHit } from '../interaction/viewport-raycast-controller';
import { compileInstanceTemplates as compileInstanceTemplatesFromCache, mergeInstanceTemplateParts as mergeInstanceTemplatePartsFromCache } from '../batching/instance-template-cache';
import type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
import { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import type { PlaceholderBatch } from '../batching/placeholder-batch-renderer';
import { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import { extractSurfaceFaceTemplates } from '../batching/surface-template-extractor';
import type { InstanceBatch } from '../batching/instance-batch-renderer';
import { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import { LayeredObjectPresentationOwner } from '../batching/layered-object-presentation-owner';
import type { SurfaceFaceBatch, SurfaceFaceMembership, SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { collectStaticModelDiagnostics, type StaticModelDiagnosticSnapshot } from '../diagnostics/static-model-diagnostics';
import { RenderRegionPolicy } from '../batching/render-region-policy';
import { RenderScheduler } from '../scheduling/render-scheduler';
import { ViewportHostLifecycleAdapter } from '../scheduling/viewport-host-lifecycle';
import { ViewportCameraInputController, cancelViewportFrame, requestViewportFrame } from '../scheduling/viewport-camera-input-controller';
import { ViewportCameraFramingController } from '../scheduling/viewport-camera-framing-controller';
import type { HydrationFinalizationSnapshot, HydrationProgressSnapshot } from '../scheduling/hydration-progress-tracker';
import { ViewportBlockHydrationPipeline } from '../hydration/viewport-block-hydration-pipeline';
import { MissingBlockAccountingOwner } from '../hydration/missing-block-accounting-owner';
import { ViewportHydrationExecutionOwner } from '../hydration/viewport-hydration-execution-owner';
import { ViewportHydrationLifecycleOwner, type HydrationCancellationReason } from '../hydration/viewport-hydration-lifecycle-owner';
import { ViewportHydrationSettlementOwner } from '../hydration/viewport-hydration-settlement-owner';
import { ViewportHydrationFinalizationOwner } from '../hydration/viewport-hydration-finalization-owner';
import { ViewportProviderRefreshPipeline } from '../provider/viewport-provider-refresh-pipeline';
import { ViewportProviderRefreshOwner, type ProviderRefreshCandidate } from '../provider/viewport-provider-refresh-owner';
import { resolvePlacementPreview } from '../interaction/viewport-hit-resolver';
import { ChunkSurfaceRenderer, type TerrainApplyResult, type TerrainOwnershipEvidence, type TerrainRepresentationCommitCallbacks, type TerrainRepresentationCommitStatus } from '../terrain/chunk-surface-renderer';
import type { CompiledTerrainChunk } from '../terrain/chunk-surface-mesher';
import { ViewportTerrainWorkflowOwner, type TerrainPlaceholderSignatureStore } from '../terrain/viewport-terrain-workflow-owner';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import type { TerrainAtlasMode } from '../terrain/atlas/terrain-texture-atlas';
import { runTerrainAtlasGpuProbe, runTerrainAtlasGpuProbeVariants, type TerrainAtlasGpuProbeBeforeVariant, type TerrainAtlasGpuProbeDraw, type TerrainAtlasGpuProbeResult, type TerrainAtlasGpuProbeVariantDraw, type TerrainAtlasGpuProbeVariantsResult } from '../terrain/atlas/terrain-atlas-gpu-probe';
import { cameraMovementScale, effectiveCameraMovementSpeed } from '../scheduling/camera-movement-speed';
import type { ViewportRuntimeTrace, ViewportTraceMetadata, ViewportTraceSample, TraceVector3 } from '../diagnostics/viewport-runtime-trace';
import { collectOwnershipDiagnostics, collectVisibleSceneDiagnostics } from '../diagnostics/renderer-diagnostics-collector';
import { collectRendererOwnershipDiagnostics } from '../diagnostics/renderer-ownership-diagnostics';
import { collectInstanceOwnershipViolations, collectInstanceOwnershipViolationsForKey } from '../diagnostics/instance-ownership-diagnostics';
import { captureViewportGhostSceneSnapshot } from '../diagnostics/viewport-snapshot-diagnostics';
import { ViewportRuntimeDiagnosticsOwner } from '../diagnostics/viewport-runtime-diagnostics-owner';
import type { ViewportControlConfiguration, ViewportDiagnostics, ViewportEmptyTransitionDiagnostics, ViewportGhostSceneSnapshot, ViewportHydrationDiagnostics, ViewportInstanceOwnershipEvent, ViewportOwnershipDiagnostics, ViewportPerformanceEvidence, ViewportProjectionState, ViewportRuntimeDiagnostics, ViewportVoxelOwnershipDiagnostic, VisibleSceneDiagnostics } from '../diagnostics/viewport-diagnostics-contracts';
export type { ViewportControlConfiguration, ViewportDiagnostics, ViewportEmptyTransitionDiagnostics, ViewportGhostSceneSnapshot, ViewportHydrationDiagnostics, ViewportInstanceOwnershipEvent, ViewportOwnershipDiagnostics, ViewportPerformanceEvidence, ViewportProjectionState, ViewportRuntimeDiagnostics, ViewportSuspiciousVisualDiagnostic, ViewportVisibleMeshDiagnostic, ViewportVoxelOwnershipDiagnostic, VisibleSceneDiagnostics } from '../diagnostics/viewport-diagnostics-contracts';
import { collectSceneRenderCost } from '../diagnostics/scene-render-cost';
import { collectPerformanceEvidence } from '../diagnostics/viewport-performance-evidence';
import { FluidChunkRenderer } from '../fluids/fluid-chunk-renderer';
import { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import { fluidChunkKey } from '../fluids/fluid-mesh-core';
import type { FluidWorldLookup } from '../fluids/fluid-state';
import { GroupIsolationPresentation, type GroupIsolationSnapshot, type IsolateBlockVisualSnapshot, type IsolateDecorationVisualSnapshot } from '../isolation/group-isolation-presentation';
import { EditingPlanePresenter } from '../presentation/editing-plane-presenter';
import { SelectionOverlayPresenter } from '../presentation/selection-overlay-presenter';
import { projectPointerToAxisPlane } from '../interaction/viewport-pointer-projection';
import { ViewportHoverController } from '../interaction/viewport-hover-controller';
import { ViewportRaycastController } from '../interaction/viewport-raycast-controller';
import { disposeObject } from '../presentation/renderer-resource-disposal';
import { BlockGhostPresenter } from '../presentation/block-ghost-presenter';
import { DecorationGhostPresenter } from '../presentation/decoration-ghost-presenter';
import { MovePreviewPresenter } from '../presentation/move-preview-presenter';
import { GroupHighlightPresenter } from '../presentation/group-highlight-presenter';
import { StructureBlockGuidePresenter } from '../presentation/structure-block-guide-presenter';
import { DecorationSelectionPresenter } from '../presentation/decoration-selection-presenter';
import { YLayerProjectionCoordinator, type VisibleBlockProjectionEntry } from './y-layer-projection-coordinator';
import { YLayerPresentationOwner, type YLayerPresentationFallbackReason } from './y-layer-presentation-owner';
import { YLayerRepresentationPrewarmOwner, type YLayerRepresentationPrewarmEvidence } from './y-layer-representation-prewarm-owner';
import { YLayerPresentationLifecycleOwner } from './y-layer-presentation-lifecycle-owner';
import { YLayerProjectionCommitOwner } from './y-layer-projection-commit-owner';
import type { YLayerVisualPreloadEvidence } from './y-layer-visual-preloader';
import { ViewportStructureSyncState } from './viewport-structure-sync-state';
import { ViewportStructureUpdatePlanner } from './viewport-structure-update-planner';
import { ViewportStructureReconciliationOwner, type ViewportStructureReconciliationPorts } from './viewport-structure-reconciliation-owner';
import { ViewportLocalMutationOwner, type ViewportLocalMutationPorts } from './viewport-local-mutation-owner';
import { ViewportCameraMotionController } from '../scheduling/viewport-camera-motion-controller';
import { blockCoordinateFromHit, surfaceFaceDirectionFromHit } from '../interaction/viewport-hit-ownership';
import { isHorizontalDirection, surfaceNeighbor, surfaceFaceNormal } from '../visibility/voxel-face-directions';
import { renderChunkKey as chunkKey, renderChunkBounds as stableChunkBounds, unitVoxelEnvelope, RENDER_CHUNK_SIZE } from '../batching/render-chunk-geometry';
import { DETAILED_SELECTION_OUTLINE_LIMIT } from '../presentation/selection-overlay-presenter';
import { selectionBounds } from '../presentation/selection-bounds';
import { createBoundedGrid } from '../geometry/bounded-grid-geometry';
import { compareEmptySnapshots } from '../diagnostics/viewport-empty-transition-diff';
import { canonicalRenderOptions, renderFilterKey } from './viewport-render-signatures';
import { stableValueKey } from '../../domain/stable-value-key';
import { ViewportBlockRepresentationStore, type RenderedBlockEntry } from './viewport-block-representation-store';
import { ViewportBlockIndexOwner } from './viewport-block-index-owner';
import type { ViewportHit, ViewportHoverListener, ViewportRenderOptions, ViewportEngineOptions, ViewportHydrationStatus, ViewportHydrationProgress, ViewportHydrationWorkSnapshot, ViewportPreparationAttempt, YLayerPrewarmTerminalNotification, PlacementPlanProvider } from './viewport-engine-contracts';
export type { ViewportHit, ViewportHoverListener, ViewportRenderOptions, ViewportEngineOptions, ViewportHydrationStatus, ViewportHydrationProgress } from './viewport-engine-contracts';


interface TerrainHydrationResult extends BlockVisualResult {
  readonly terrainTemplates?: readonly SurfaceFaceTemplate[];
}
type VisibleBlockEntry = VisibleBlockProjectionEntry;
export type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
export type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
export const VIEWPORT_BOOTSTRAP_SIZE: ProjectSize = { x: 16, y: 16, z: 16 };
export const VIEWPORT_HYDRATION_BATCH_SIZE = 96;
export const VIEWPORT_VISUAL_CONCURRENCY = 6;

export const VIEWPORT_INSTANCE_CHUNK_SIZE = RENDER_CHUNK_SIZE;
/** Presentation regions reduce far-view batch fragmentation while preserving culling locality. */
export const VIEWPORT_RENDER_REGION_SIZE = 32;
export const VIEWPORT_INSTANCE_THRESHOLD = 256;
const COOPERATIVE_INITIAL_Y_PROJECTION_THRESHOLD = 8_192;
export const VIEWPORT_HYDRATION_SYNC_BUDGET_MS = 7;
export const VIEWPORT_HYDRATION_MAX_JOBS_PER_BATCH = 256;
export const VIEWPORT_INTERACTIVE_HYDRATION_SYNC_BUDGET_MS = 1.5;
export const VIEWPORT_INTERACTIVE_HYDRATION_MAX_JOBS_PER_BATCH = 8;
export const VIEWPORT_CAMERA_IDLE_GRACE_MS = 160;
export const VIEWPORT_HYDRATION_HUD_WORK_THRESHOLD = 32;
export const VIEWPORT_HYDRATION_HUD_DELAY_MS = 180;
// The cap covers the observed 13,824-entry grass-block fallback population
// while keeping non-batchable content bounded on larger mixed projects.

/** Adds voxel/world translation without replacing a special visual's local vanilla transform. */
export function translateVisualToVoxel(object: THREE.Object3D, position: VoxelCoordinate): void {
  object.position.set(object.position.x + position.x, object.position.y + position.y, object.position.z + position.z);
}

export function viewportRenderSize(width: number, height: number): { readonly width: number; readonly height: number } {
  return { width: Math.max(Math.round(width), 1), height: Math.max(Math.round(height), 1) };
}

export class ThreeViewportEngine {
  private readonly scene = new THREE.Scene();
  private readonly blockIndexOwner = new ViewportBlockIndexOwner((name, delta = 1) => this.instrumentation.record(name as keyof RendererCounters, delta));
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly blocksGroup = new THREE.Group();
  private readonly decorationsGroup = new THREE.Group();
  private readonly canonicalRoot = new THREE.Group();
  private readonly isolationPresentation = new GroupIsolationPresentation(this.canonicalRoot, {
    onChanged: () => this.scheduleRender(),
    onCommitted: (keys) => this.commitIsolatePresentation(keys),
    onDeactivated: () => this.clearCommittedIsolatePresentation(),
    onFailed: () => { this.scheduleRender(); },
  });
  private readonly structureBlockGuidePresenter = new StructureBlockGuidePresenter({ scheduleRender: () => this.scheduleRender(), currentProvider: () => this.visualProvider });
  private get structureBlockGuideGroup(): THREE.Group { return this.structureBlockGuidePresenter.group; }
  private readonly blockGhostPresenter = new BlockGhostPresenter(this.scene, viewportThemePalette('dark'), {
    provider: () => this.visualProvider,
    providerGeneration: () => this.providerGeneration,
    blockLookup: () => this.blockIndexOwner.hasIndex ? (position) => this.blockIndexOwner.get(position) : undefined,
    record: (name) => this.instrumentation.record(name),
    scheduleRender: () => this.scheduleRender(),
  });
  private get ghost(): THREE.Mesh { return this.blockGhostPresenter.ghost; }
  private readonly selectionPresenter = new SelectionOverlayPresenter(this.scene, viewportThemePalette('dark'), DETAILED_SELECTION_OUTLINE_LIMIT);
  private readonly movePreviewPresenter = new MovePreviewPresenter(viewportThemePalette('dark'), {
    getBlock: (position) => this.blockIndexOwner.get(position),
    textureUrl: (resource) => this.decorationTextureUrl?.(resource),
    textureCache: () => this.decorationTextureCache,
    paintingResource: (variantId) => this.paintingResource?.(variantId),
    itemResources: (itemId) => this.decorationItemResources?.(itemId) ?? [],
    itemVisual: (itemId) => this.decorationItemVisual?.(itemId),
  });
  private get movePreviewGroup(): THREE.Group { return this.movePreviewPresenter.group; }
  private readonly decorationGhostPresenter = new DecorationGhostPresenter(viewportThemePalette('dark'), {
    textureUrl: (resource) => this.decorationTextureUrl?.(resource),
    itemResources: (itemId) => this.decorationItemResources?.(itemId) ?? [],
    itemVisual: (itemId) => this.decorationItemVisual?.(itemId),
    paintingResource: (variantId) => this.paintingResource?.(variantId),
    textureCache: () => this.decorationTextureCache,
    scheduleRender: () => this.scheduleRender(),
  });
  private get decorationGhostGroup(): THREE.Group { return this.decorationGhostPresenter.group; }
  private readonly decorationSelectionPresenter = new DecorationSelectionPresenter(viewportThemePalette('dark'), {
    selected: (id) => { const entry = this.decorationVisuals.get(id); return entry ? { object: entry.object } : undefined; },
  });
  private get decorationSelectionGroup(): THREE.Group { return this.decorationSelectionPresenter.group; }
  private readonly groupHighlightPresenter = new GroupHighlightPresenter(this.scene, viewportThemePalette('dark'), {
    visibleBlock: (key) => { const entry = this.yLayerProjection.visibleEntry(key); return entry ? { block: entry.block } : undefined; },
    blockAt: (position) => this.blockIndexOwner.get(position),
    isolated: (key) => this.isolatedKeys.has(key),
    isolationActive: () => this.isolationPresentation.isActive(),
    decorationIsolated: (entry) => decorationHasGroup(entry, this.renderOptions.isolatedGroupId ?? ''),
  });
  private get blockUsageHighlight(): THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | undefined { return this.groupHighlightPresenter.usageOverlay; }
  private set blockUsageHighlight(value: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | undefined) { this.groupHighlightPresenter.usageOverlay = value; }
  private get blockUsageHighlightCapacity(): number { return this.groupHighlightPresenter.usageCapacity; }
  private set blockUsageHighlightCapacity(value: number) { this.groupHighlightPresenter.usageCapacity = value; }
  private get blockUsageHighlightGeometry(): THREE.BoxGeometry { return this.groupHighlightPresenter.blockUsageHighlightGeometry; }
  private get blockUsageHighlightMaterial(): THREE.MeshBasicMaterial { return this.groupHighlightPresenter.blockUsageHighlightMaterial; }
  private get structureBlockGuideKey(): string { return this.structureBlockGuidePresenter.currentKey; }
  private set structureBlockGuideKey(value: string) { this.structureBlockGuidePresenter.currentKey = value; }
  private readonly fallbackGeometry = Object.assign(new THREE.BoxGeometry(1, 1, 1), { userData: { sharedFallbackGeometry: true } });
  private readonly fallbackMaterials = {
    normal: Object.assign(new THREE.MeshLambertMaterial({ color: 0x8a94a6 }), { userData: { sharedFallbackMaterial: true } }),
    reference: Object.assign(new THREE.MeshLambertMaterial({ color: 0x9aa5b5, transparent: true }), { userData: { sharedFallbackMaterial: true } }),
    missing: Object.assign(new THREE.MeshLambertMaterial({ color: 0xff5a67 }), { userData: { sharedFallbackMaterial: true } }),
  };
  private readonly placeholderGeometry = Object.assign(new THREE.BoxGeometry(1, 1, 1), { userData: { sharedPlaceholderGeometry: true } });
  private readonly placeholderMaterials = {
    // Normal placeholders are deliberately cheap opaque depth-writing meshes. Reference and
    // missing placeholders retain their transparency semantics below.
    normal: Object.assign(new THREE.MeshBasicMaterial({ color: 0x65717e, depthWrite: true }), { userData: { sharedPlaceholderMaterial: true } }),
    reference: Object.assign(new THREE.MeshLambertMaterial({ color: 0x65717e, transparent: true, opacity: .24, depthWrite: false }), { userData: { sharedPlaceholderMaterial: true } }),
    missing: Object.assign(new THREE.MeshLambertMaterial({ color: 0x9b5964, transparent: true, opacity: .58 }), { userData: { sharedPlaceholderMaterial: true } }),
  };
  private readonly placeholderRenderer = new PlaceholderBatchRenderer({
    blocksGroup: this.blocksGroup,
    geometry: this.placeholderGeometry,
    materials: this.placeholderMaterials,
    capacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 3,
    layerCapacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 2,
    chunkKey,
    chunkBounds: (chunk) => stableChunkBounds(chunk, unitVoxelEnvelope()),
    recordBounds: () => this.instrumentation.record('instancedBoundsComputations'),
  });
  private get placeholderBatches(): ReadonlyMap<string, PlaceholderBatch> { return this.placeholderRenderer.batches; }
  private get placeholderIndices(): ReadonlyMap<string, { readonly batchKey: string; readonly index: number }> { return this.placeholderRenderer.indices; }
  private readonly renderScheduler = new RenderScheduler(requestViewportFrame, cancelViewportFrame, {
    onInvalidation: () => this.instrumentation.record('renderInvalidations'),
    onCoalesced: () => { this.instrumentation.record('renderInvalidationsCoalesced'); this.instrumentation.record('coalescedRenderRequests'); },
  });
  private get ghostModel(): THREE.Group | undefined { return this.blockGhostPresenter.model; }
  private get ghostModelKey(): string { return this.blockGhostPresenter.modelKey; }
  private set ghostModelKey(value: string) { this.blockGhostPresenter.modelKey = value; }
  private get ghostPlan(): PlacementPlan | undefined { return this.blockGhostPresenter.plan; }
  private set ghostPlan(value: PlacementPlan | undefined) { this.blockGhostPresenter.plan = value; }
  private get ghostTarget(): VoxelCoordinate | undefined { return this.blockGhostPresenter.target; }
  private get lastHoverVisualKey(): string { return this.blockGhostPresenter.hoverVisualKey; }
  private set lastHoverVisualKey(value: string) { this.blockGhostPresenter.hoverVisualKey = value; }
  private get decorationGhostKey(): string { return this.decorationGhostPresenter.currentKey; }
  private set decorationGhostKey(value: string) { this.decorationGhostPresenter.currentKey = value; }
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private ground?: THREE.Mesh;
  private readonly editingPlanePresenter = new EditingPlanePresenter(this.scene, viewportThemePalette('dark'));
  private get editingPlane(): THREE.Mesh | undefined { return this.editingPlanePresenter.plane; }
  private get editingGrid(): THREE.LineSegments | undefined { return this.editingPlanePresenter.grid; }
  private get selectionOutline(): THREE.LineSegments { return this.selectionPresenter.selectionOutline; }
  private get selectionBox(): THREE.Box3Helper { return this.selectionPresenter.selectionBox; }
  private get logicalSelectionGroup(): THREE.Group { return this.selectionPresenter.logicalSelectionGroup; }
  private get logicalSelectionGeometry(): THREE.EdgesGeometry { return this.selectionPresenter.logicalSelectionGeometry; }
  private get logicalSelectionMaterial(): THREE.LineBasicMaterial { return this.selectionPresenter.logicalSelectionMaterial; }
  private projectGrid?: THREE.LineSegments;
  private boundsBox?: THREE.Box3Helper;
  private container?: HTMLElement;
  private readonly hostLifecycle = new ViewportHostLifecycleAdapter({
    onResize: () => this.resize(),
    onPointerDownCapture: (event) => this.onCanvasPointerDownCapture(event),
    onPointerUpCapture: (event) => this.onCanvasPointerUpCapture(event),
    onWheelCapture: (event) => this.onCanvasWheelCapture(event),
    onWindowBlur: () => this.onWindowBlur(),
    onVisibilityChange: () => this.onVisibilityChange(),
  });
  private project?: ProjectDocument;
  private get indexedProject(): ProjectDocument | undefined { return this.blockIndexOwner.currentProject; }
  private layerIndex?: LayerBlockIndex;
  private readonly yLayerPresentation = new YLayerPresentationOwner();
  private readonly yLayerProjection: YLayerProjectionCoordinator;
  private readonly yLayerPrewarm: YLayerRepresentationPrewarmOwner;
  private cachedBoundsKey = '';
  private lastActiveGroupProject?: ProjectDocument;
  private lastActiveGroupId?: string;
  private lastActiveGroupPositions?: readonly VoxelCoordinate[];
  private lastIsolatedGroupId?: string;
  private lastIsolatedGroupPositions?: readonly VoxelCoordinate[];
  private isolatedKeys = new Set<string>();
  private lastCommittedIsolateKey = '';
  private activeBlock?: ActiveBlock;
  private showStructureBlockGuide = true;
  private renderOptions: ViewportRenderOptions = {};
  private blockUsageHighlightId?: string;
  private blockUsageHighlightPositions?: readonly VoxelCoordinate[];
  private readonly renderOnControlChange = () => {
    this.instrumentation.record('controlChangeEvents');
    this.runtimeTrace?.record('controls-change');
    if (this.cameraMovementInProgress) {
      this.instrumentation.record('cameraChangeEventsDuringMovement');
      this.instrumentation.record('cameraRenderRequestsSuppressed');
      return;
    }
    this.requestCameraRender();
  };
  private cameraMovementInProgress = false;
  private get cameraGestureInProgress(): boolean { return this.cameraInput.gestureInProgress; }
  private set cameraGestureInProgress(value: boolean) { this.cameraInput.gestureInProgress = value; }
  private readonly onControlStart = () => {
    this.runtimeTrace?.record('controls-start');
    this.cancelPendingHover(true);
    this.ghost.visible = false;
    if (this.ghostModel) this.ghostModel.visible = false;
    this.clearDecorationGhost();
    this.requestCameraRender();
  };
  private readonly onControlEnd = () => { this.runtimeTrace?.record('controls-end'); this.requestCameraRender(); };
  private get cameraMoveFrame(): number | undefined { return this.cameraInput.movementFrame; }
  private set cameraMoveFrame(value: number | undefined) { this.cameraInput.movementFrame = value; }
  private get pressedActions(): Set<MovementAction> { return this.cameraInput.pressedActions as Set<MovementAction>; }
  private get temporaryMouseButton() { return this.cameraInput.temporaryButton; }
  private set temporaryMouseButton(value: { readonly key: 'LEFT' | 'MIDDLE' | 'RIGHT'; readonly previous: THREE.MOUSE | null | undefined } | undefined) { this.cameraInput.temporaryButton = value; }
  private readonly onWindowBlur = () => { this.runtimeTrace?.record('blur'); this.clearInput(); };
  private readonly onVisibilityChange = () => { this.runtimeTrace?.record('visibilitychange', { hidden: document.hidden }); if (document.hidden) this.clearInput(); };
  private readonly onCanvasPointerDownCapture = (event: PointerEvent) => {
    this.cameraInput.pointerDownCapture(event);
  };
  private readonly onCanvasPointerUpCapture = (event: PointerEvent) => { this.cameraInput.pointerUpCapture(event); };
  private readonly onCanvasWheelCapture = (event: WheelEvent) => {
    this.cameraInput.wheelCapture(event);
  };
  private palette: ViewportThemePalette = viewportThemePalette('dark');
  private visualProvider?: BlockVisualProvider;
  private decorationTextureUrl?: (resource: string) => string | undefined;
  private decorationTextureRevision?: unknown;
  private decorationItemResources?: (itemId: string) => readonly string[];
  private decorationItemResourcesRevision?: unknown;
  private decorationItemVisual?: (itemId: string) => ResolvedItemVisual | undefined;
  private decorationItemVisualRevision?: unknown;
  private decorationItemPreview?: (item: ItemStackData) => Promise<string | undefined>;
  private decorationItemPreviewRevision?: unknown;
  private paintingResource?: (variantId: string) => string | undefined;
  private paintingResourceRevision?: unknown;
  private specialVisualResolver?: (blockId: string) => ContentSpecialVisualDescriptor | undefined;
  private specialVisualRevision?: number;
  private specialVisualSignature = '';
  private definitionResolver?: (blockId: string) => BlockDefinition | undefined;
  private definitionResolverRevision?: unknown;
  private decorationTextureCache?: DecorationTextureCache;
  private placementPlanProvider?: PlacementPlanProvider;
  private get ghostGeneration(): number { return this.blockGhostPresenter.generation; }
  private disposed = false;
  private suspended = false;
  private backgroundPreparation = false;
  private suspendedNeedsRefresh = false;
  private renderCount = 0;
  private canvasSize = { width: 0, height: 0 };
  private themeApplied = false;
  private controlConfiguration: ViewportControlConfiguration = { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 9 };
  private readonly cameraFraming = new ViewportCameraFramingController(this.camera, () => this.controls, {
    project: () => this.project,
    renderOptions: () => this.renderOptions,
    scheduleRender: () => this.scheduleRender(),
  });
  private readonly cameraMotion = new ViewportCameraMotionController({
    camera: this.camera,
    controls: () => this.controls,
    configuration: () => this.controlConfiguration,
    markInteraction: () => this.markCameraInteraction(),
    requestRender: () => this.requestCameraRender(),
    onMovementStart: () => { this.cameraMovementInProgress = true; },
    onMovementEnd: () => { this.cameraMovementInProgress = false; },
    recordMetric: (name, delta) => this.instrumentation.record(name as keyof RendererCounters, delta),
    recordTrace: (event, details) => this.runtimeTrace?.record(event, details),
  });
  private readonly cameraInput = new ViewportCameraInputController(
    () => this.controls,
    {
      isSuspended: () => this.suspended,
      onControlChange: () => this.renderOnControlChange(),
      onControlStart: () => this.onControlStart(),
      onControlEnd: () => this.onControlEnd(),
      onPointerCameraStart: (button, action) => this.runtimeTrace?.record('pointer-camera-start', { button, action }),
      onPointerCameraEnd: (button) => this.runtimeTrace?.record('pointer-camera-end', { button }),
      onInteractionMarked: (until) => {
        this.cameraInteractingUntil = until;
        if (this.queuedBlockHydrationJobs() || this.queuedDecorationHydrationJobs()) this.hydrationLifecycle.schedule();
      },
      onMovementFrame: (actions, delta) => this.cameraMotion.moveCamera(actions, delta),
      onWheel: (action, deltaY, deltaMode) => this.cameraMotion.applyWheelZoom(action, deltaY, deltaMode),
    },
    this.controlConfiguration,
    VIEWPORT_CAMERA_IDLE_GRACE_MS,
  );
  private readonly blockRepresentations = new ViewportBlockRepresentationStore();
  private readonly visualFailureKeys = new Set<string>();
  private readonly yLayerPresentationLifecycle!: YLayerPresentationLifecycleOwner;
  private readonly yLayerProjectionCommit!: YLayerProjectionCommitOwner;
  private readonly yLayerPrewarmListeners = new Set<(notification: YLayerPrewarmTerminalNotification) => void>();
  private readonly structureReconciliation!: ViewportStructureReconciliationOwner;
  private readonly localMutation!: ViewportLocalMutationOwner;
  private terrainPipeline!: ViewportTerrainWorkflowOwner;
  private get placeholderSignatures(): TerrainPlaceholderSignatureStore { return this.terrainPipeline.placeholderState; }
  private readonly renderRegionPolicy = new RenderRegionPolicy(VIEWPORT_RENDER_REGION_SIZE);
  private readonly instanceRenderer: StaticModelBatchRenderer;
  private readonly layeredObjectPresentation: LayeredObjectPresentationOwner;
  private readonly fluidCoordinator: FluidRenderCoordinator;
  private readonly blockRepresentationResources: BlockRepresentationResourceOwner;
  private readonly blockRepresentationCommit: BlockRepresentationCommitOwner;
  private readonly blockRepresentationHydration: BlockRepresentationHydrationOwner;
  private get instanceBatches(): ReadonlyMap<string, InstanceBatch> { return this.instanceRenderer.batches; }
  private get instanceOwnershipIndex(): ReadonlyMap<string, { readonly batchKey: string; readonly index: number }> { return this.instanceRenderer.ownershipIndex; }
  /** Compatibility view for diagnostics/tests; ownership remains in the batching module. */
  private get reusableInstanceTemplates(): ReadonlyMap<string, CompiledInstanceTemplates> { return this.instanceRenderer.templateCacheView(); }
  private readonly decorationVisuals: DecorationRenderLifecycle;
  private staticModelDiagnosticsCache?: StaticModelDiagnosticSnapshot;
  private staticModelDiagnosticsBuildCount = 0;
  private readonly surfaceRenderer = new SurfaceFaceBatchRenderer({
    blocksGroup: this.blocksGroup,
    capacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 3,
    layerCapacity: VIEWPORT_RENDER_REGION_SIZE ** 2,
    chunkKey,
    stableBounds: stableChunkBounds,
    regionPolicy: this.renderRegionPolicy,
    unitEnvelope: unitVoxelEnvelope,
    record: (name, delta = 1) => this.instrumentation.record(name as keyof RendererCounters, delta),
    getEntry: (key) => this.blockRepresentations.get(key),
    setMemberships: (key, memberships) => this.blockRepresentationCommit.setSurfaceMemberships(key, memberships),
  });
  private get surfaceFaceBatches(): ReadonlyMap<string, SurfaceFaceBatch> { return this.surfaceRenderer.batches; }
  private get surfaceFaceOwnership(): ReadonlyMap<string, SurfaceFaceMembership[]> { return this.surfaceRenderer.ownership; }
  private get surfaceTemplateCache(): ReadonlyMap<string, readonly SurfaceFaceTemplate[]> { return this.surfaceRenderer.templateCache; }
  private readonly terrainRenderer: ChunkSurfaceRenderer;
  readonly terrainAtlasMode: TerrainAtlasMode;
  private readonly instanceTranslationMatrix = new THREE.Matrix4();
  private readonly hydrationPipeline = new ViewportBlockHydrationPipeline<BlockHydrationJob>({
    concurrency: VIEWPORT_VISUAL_CONCURRENCY,
    regularReservedCapacity: 4,
    providerRefreshCapacity: 2,
    onProgressRegression: () => this.instrumentation.record('hydrationProgressRegressions'),
    onProgress: (progress) => {
      this.runtimeTrace?.record('hydration-progress', { lane: progress.lane ?? 'structural', generation: progress.generation, status: progress.status, completed: progress.completed, total: progress.total, blocksCompleted: progress.blocksCompleted, blocksTotal: progress.blocksTotal, decorationsCompleted: progress.decorationsCompleted, decorationsTotal: progress.decorationsTotal, percent: progress.percent });
      if (progress.status !== 'hydrating' && this.project) this.activatePreparedYLayerPresentation(this.project, this.providerGeneration);
    },
  });
  private readonly hydrationExecutionOwner: ViewportHydrationExecutionOwner;
  private readonly hydrationLifecycle!: ViewportHydrationLifecycleOwner;
  private readonly hydrationSettlement!: ViewportHydrationSettlementOwner;
  private readonly hydrationFinalization!: ViewportHydrationFinalizationOwner;
  private readonly providerRefreshPipeline = new ViewportProviderRefreshPipeline<BlockVisualProvider, ProviderRefreshCandidate, BlockHydrationJob>(this.hydrationPipeline);
  private readonly providerRefreshOwner!: ViewportProviderRefreshOwner;
  private hemisphereLight?: THREE.HemisphereLight;
  private keyLight?: THREE.DirectionalLight;
  private blockBrightness = 3;
  private readonly structureSyncState = new ViewportStructureSyncState();
  private readonly structureUpdatePlanner: ViewportStructureUpdatePlanner;
  private decorationSyncKey = '';
  private syncedDecorationProject?: ProjectDocument;
  private get providerGeneration(): number { return this.providerRefreshPipeline.providerGeneration; }
  private get hydrationProgressState(): ViewportHydrationProgress { return this.hydrationPipeline.progressSnapshot(); }
  private providerStats?: VisualCacheStats;
  private get hydrationRunning(): number { return this.hydrationPipeline.runningTotal; }
  private cameraInteractingUntil = 0;
  private cameraRenderPending = false;
  private staticPixelRatio = 1;
  private lastRenderTimestamp = 0;
  private frameDurationMs = 0;
  private renderCpuMs = 0;
  private lastRendererMetrics = { calls: 0, triangles: 0, lines: 0, points: 0, geometries: 0, textures: 0 };
  private readonly hoverController = new ViewportHoverController<ViewportHit>({
    isSuspended: () => this.suspended,
    cameraGestureInProgress: () => this.cameraGestureInProgress,
    record: (name) => this.instrumentation.record(name),
    hit: (request) => this.performHit(request.clientX, request.clientY, request.project as ProjectDocument | undefined, request.active as ActiveBlock | undefined, request.planeY, request.showGhost),
  });
  private readonly raycastController = new ViewportRaycastController(this.raycaster, {
    classify: (position) => {
      const key = coordinateKey(position); const entry = this.yLayerProjection.visibleEntry(key);
      if (!entry || this.interiorCulling.has(key) || this.isolationPresentation.isActive() && !this.isolatedKeys.has(key)) return 'skip';
      return entry.role === 'normal' && entry.occlusionClass === 'opaque-full-cube' ? 'hit' : 'fallback';
    },
    objectsForVoxel: (position) => {
      const key = coordinateKey(position);
      if (this.isolationPresentation.isActive() && !this.isolatedKeys.has(key)) return [];
      const entry = this.blockRepresentations.get(key);
      const objects: THREE.Object3D[] = [];
      const add = (object: THREE.Object3D | undefined) => { if (object && !objects.some((existing) => existing.uuid === object.uuid)) objects.push(object); };
      if (entry) {
        add(entry.fallback); add(entry.object);
        if (entry.fluidChunkKey !== undefined) for (const object of this.fluidCoordinator.objectsForVoxel(key)) add(object);
        for (const membership of entry.surfaceFaceMemberships ?? this.surfaceFaceOwnership.get(key) ?? []) add(this.surfaceFaceBatches.get(membership.batchKey)?.mesh);
        if (entry.instanceBatchKey) for (const part of this.instanceBatches.get(entry.instanceBatchKey)?.parts ?? []) add(part);
      } else for (const membership of this.surfaceFaceOwnership.get(key) ?? []) add(this.surfaceFaceBatches.get(membership.batchKey)?.mesh);
      if (this.isolationPresentation.isActive()) for (const object of this.isolationPresentation.objectsForKey(key)) add(object);
      const placeholder = this.placeholderIndices.get(key);
      if (placeholder) add(this.placeholderBatches.get(placeholder.batchKey)?.mesh);
      return objects;
    },
    isPreciseHit: (hit, position) => {
      if (hit.object.userData['fluidChunk'] === true) {
        const fluidHit = fluidCoordinateFromHit(hit, (key) => this.fluidVoxelOwner(key));
        return !!fluidHit && coordinateKey(fluidHit) === coordinateKey(position);
      }
      const hitPosition = blockCoordinateFromHit(hit);
      return !hitPosition || coordinateKey(hitPosition) === coordinateKey(position);
    },
    record: (name, value = 1) => this.instrumentation.record(name, value),
  });
  private runtimeTrace?: ViewportRuntimeTrace;
  private readonly runtimeDiagnostics = new ViewportRuntimeDiagnosticsOwner();
  private readonly interiorCulling = new ViewportInteriorCullingOwner((name, delta = 1) => this.instrumentation.record(name, delta));
  private readonly missingBlockAccounting = new MissingBlockAccountingOwner();
  private get missingBlocksTerminal(): boolean { return this.missingBlockAccounting.isTerminal; }

  constructor(readonly instrumentation = new RendererDiagnostics(), options: ViewportEngineOptions = {}) {
    this.layeredObjectPresentation = new LayeredObjectPresentationOwner(
      this.blocksGroup,
      applyBlockRenderRole,
      (metric, delta = 1) => this.instrumentation.record(metric as keyof RendererCounters, delta),
    );
    this.decorationVisuals = new DecorationRenderLifecycle({
      group: this.decorationsGroup,
      textureUrl: () => this.decorationTextureUrl,
      textureCache: () => this.decorationTextureCache,
      paintingResource: () => this.paintingResource,
      itemResources: () => this.decorationItemResources,
      itemVisual: () => this.decorationItemVisual,
      itemPreview: () => this.decorationItemPreview,
      isSelected: (id) => this.renderOptions.selectedDecorationId === id,
      providerGeneration: () => this.providerGeneration,
      scheduleRender: () => this.scheduleRender(),
      scheduleHydration: () => this.hydrationLifecycle.schedule(),
      complete: (generation, id) => this.hydrationLifecycle.completePart(generation, 'decoration', id),
      record: (metric) => this.instrumentation.record(metric),
    });
    this.yLayerProjection = new YLayerProjectionCoordinator({
      isDisposed: () => this.disposed,
      isSuspended: () => this.suspended,
      applyDelta: (project, renderOptions, delta) => this.yLayerProjectionCommit.apply(project, renderOptions, delta.layers, delta.blockOverrides, delta.flushTerrain, delta.publishProgress),
      finishCooperativeWork: () => this.yLayerProjectionCommit.finishCooperativeWork(),
      keySettled: (key) => this.hydrationSettlement.isProjectionKeySettled(key),
      onCommit: (project, renderOptions) => {
        this.structureSyncState.commit(project, this.structureSyncState.keyFor(project, renderFilterKey(renderOptions)));
      },
      onWorkFailure: (error) => this.recoverFailedLayerProjection(error),
      record: (metric, delta = 1) => this.instrumentation.record(metric as keyof RendererCounters, delta),
      recordMax: (metric, value) => this.instrumentation.recordMax(metric, value),
    }, requestViewportFrame, cancelViewportFrame, this.yLayerPresentation);
    this.structureUpdatePlanner = new ViewportStructureUpdatePlanner(
      this.structureSyncState,
      this.yLayerProjection,
      COOPERATIVE_INITIAL_Y_PROJECTION_THRESHOLD,
    );
    this.terrainAtlasMode = options.terrainAtlasMode ?? 'on';
    this.fluidCoordinator = new FluidRenderCoordinator(new FluidChunkRenderer(this.blocksGroup), {
      onTerminal: (generation, keys) => {
        if (generation !== this.hydrationPipeline.generation || this.disposed) return;
        this.hydrationLifecycle.completeBlockBatch(generation, keys);
        if (this.yLayerPrewarm.isPreparingRepresentation) this.yLayerPrewarm.dependencySettled();
        this.providerRefreshOwner.releaseUnused();
        this.invalidateStaticModelDiagnostics();
        this.scheduleRender();
      },
      onFailure: (generation) => {
        if (generation !== this.hydrationPipeline.generation || this.disposed) return;
        this.publishProviderRefreshProgress();
      },
    });
    this.terrainRenderer = new ChunkSurfaceRenderer({
      blocksGroup: this.blocksGroup,
      terrainAtlasMode: this.terrainAtlasMode,
      shouldCommitChunk: options.terrainShouldCommitChunk,
      terrainGeneration: () => this.hydrationPipeline.generation,
      providerGeneration: () => this.providerGeneration,
      isCameraInteracting: () => this.isCameraInteracting(),
      onAsyncApply: (records, result) => {
        if (this.disposed) return;
        this.terrainPipeline.commit(records, result);
        if (result.failedKeys.length) this.terrainPipeline.enqueueFailed(result.failedKeys);
        this.scheduleRender();
        if (this.queuedBlockHydrationJobs()) this.hydrationLifecycle.schedule();
      },
      record: (name, delta = 1) => this.instrumentation.record(name as keyof RendererCounters, delta),
      onTiming: (stage, durationMs) => this.runtimeTrace?.recordDuration(stage, durationMs),
      isTimingEnabled: () => !!this.runtimeTrace?.isActive,
    });
    this.instanceRenderer = new StaticModelBatchRenderer({
      blocksGroup: this.blocksGroup,
      capacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 3,
      layerCapacity: VIEWPORT_RENDER_REGION_SIZE ** 2,
      chunkKey,
      stableBounds: stableChunkBounds,
      regionPolicy: this.renderRegionPolicy,
      instrumentation,
      getEntry: (key) => this.blockRepresentations.get(key),
      setEntryObject: (key, batchKey, index, object) => {
        this.blockRepresentationCommit.recordInstanceMembershipChange(key, batchKey, index, object);
      },
      trace: (phase, key, source) => this.traceInstanceOwnership(phase, key, source),
    });
    this.blockRepresentationResources = new BlockRepresentationResourceOwner({
      blocksGroup: this.blocksGroup,
      objectPresentation: {
        parentFor: (block) => this.layeredObjectPresentation.parentFor(block),
        release: (object) => this.layeredObjectPresentation.release(object),
      },
      terrain: { has: (key) => this.terrainRenderer.has(key), remove: (key) => this.terrainRenderer.remove(key), clear: () => this.terrainRenderer.clear(), dispose: () => this.terrainRenderer.dispose() },
      surface: { ownership: this.surfaceFaceOwnership, setVisible: (key, visible) => this.surfaceRenderer.setMemberVisible(key, visible), remove: (key, entry) => this.surfaceRenderer.remove(key, entry), clear: (entries) => this.surfaceRenderer.clear(entries) },
      instance: {
        ownershipIndex: this.instanceOwnershipIndex,
        memberships: (key, scanAll) => this.instanceRenderer.memberships(key, scanAll),
        setVisible: (key, visible) => this.instanceRenderer.setMemberVisible(key, visible),
        remove: (key, entry, source) => this.instanceRenderer.remove(key, entry, source),
        removeOrphaned: (key, source, entry) => this.instanceRenderer.removeOrphaned(key, source, entry),
        reconcile: (entries) => this.instanceRenderer.reconcile(entries),
      },
      placeholders: { remove: (key) => this.placeholderRenderer.remove(key), clear: () => this.placeholderRenderer.clear() },
      fallbackGeometry: this.fallbackGeometry,
      fallbackMaterials: this.fallbackMaterials,
      record: (metric, delta = 1) => this.instrumentation.record(metric as keyof RendererCounters, delta),
      invalidateDiagnostics: () => this.invalidateStaticModelDiagnostics(),
      trace: (phase, key, source, entry) => this.traceInstanceOwnership(phase as 'before-remove' | 'after-remove' | 'after-remove-entry', key, source as 'rollback' | 'reconcile', entry),
    });
    const representationTargets: BlockRepresentationRenderTargets = {
      terrain: {
        templatesFor: (key) => this.terrainRenderer.templatesFor(key),
        cacheTemplates: (key, templates) => this.terrainRenderer.cacheTemplates(key, templates),
        chunkKey,
        remove: (key) => this.terrainRenderer.remove(key),
        add: (block, key, templates, role, callbacks) => this.addTerrainVisual(block, key, templates, role, callbacks),
      },
      surface: {
        templatesFor: (key) => this.surfaceRenderer.templatesFor(key),
        cacheTemplates: (key, templates) => this.surfaceRenderer.cacheTemplates(key, templates),
        add: (block, key, templates, visible, role) => {
          const memberships = this.addSurfaceFaceVisual(block, key, templates, visible, role);
          return memberships ? { memberships, object: memberships.length ? this.surfaceFaceBatches.get(memberships[0].batchKey)?.mesh : undefined } : undefined;
        },
      },
      instances: {
        shouldAttempt: (allowInstancing, reusableKey) => this.instanceRenderer.shouldAttempt(allowInstancing, reusableKey),
        templateFor: (key) => this.instanceRenderer.templateFor(key),
        decisionFor: (key) => this.instanceRenderer.decisionFor(key),
        add: (object, block, key, reusableKey, source, role) => this.addInstanceVisual(object, block, key, reusableKey, source, role),
        addFromTemplates: (templates, block, key, source, compiled, role) => this.addInstanceVisualFromTemplates(templates, block, key, source, compiled, role),
      },
      object: {
        blocksGroup: this.blocksGroup,
        parentFor: (block) => this.layeredObjectPresentation.parentFor(block),
        release: (object) => this.layeredObjectPresentation.release(object),
        applyBrightness: (object) => applyBlockBrightnessToObject(object, this.blockBrightness),
        applyReferenceOpacity: (object, opacity) => applyBlockRenderRole(object, 'reference', opacity),
        familyFromReusableKey,
        extractSurfaceTemplates: extractSurfaceFaceTemplates,
      },
    };
    this.blockRepresentationCommit = new BlockRepresentationCommitOwner({
      store: this.blockRepresentations,
      resources: this.blockRepresentationResources,
      targets: representationTargets,
      lifecycle: {
        finished: (job, succeeded) => {
          if (job) {
            if (!succeeded) { this.visualFailureKeys.add(job.key); this.publishProviderRefreshProgress(); }
            else if (this.visualFailureKeys.delete(job.key)) this.publishProviderRefreshProgress();
          }
          this.recordProviderCacheStats();
          this.invalidateStaticModelDiagnostics();
          this.scheduleRender();
        },
        refreshFailed: (key) => { this.visualFailureKeys.add(key); this.publishProviderRefreshProgress(); this.invalidateStaticModelDiagnostics(); },
        cachedTemplateInserted: () => {
          this.instrumentation.record('reusableTemplateCacheHits');
          this.instrumentation.record('cachedTemplateInsertions');
        },
      },
    });
    this.blockRepresentationHydration = new BlockRepresentationHydrationOwner({
      store: this.blockRepresentations,
      provider: () => this.visualProvider,
      providerGeneration: () => this.providerGeneration,
      resolve: {
        reusableKey: (provider, block, world) => this.requestReusableVisualKey(provider, block, world),
        visual: (provider, block, world) => this.createProviderVisual(provider, block, world),
        terrain: (key, block, world, provider) => this.resolveTerrainHydration(key, block, world, provider),
      },
      commit: this.blockRepresentationCommit,
      invalidateDiagnostics: () => this.invalidateStaticModelDiagnostics(),
      releaseRetiredProviders: () => this.providerRefreshOwner.releaseUnused(),
    });
    this.terrainPipeline = new ViewportTerrainWorkflowOwner({
      representation: {
        store: this.blockRepresentations,
        commit: this.blockRepresentationCommit,
        visibleEntry: (key) => this.yLayerProjection.visibleEntry(key),
        visibleSignature: (key) => this.yLayerProjection.visibleEntry(key)?.signature,
        clearPending: (key) => this.hydrationPipeline.clearPendingSignature(key),
        pending: (key) => this.hydrationPipeline.hasPendingSignature(key),
        ensurePlaceholder: (key, block, role) => this.ensurePlaceholderVisual(key, block, role),
        removePlaceholder: (key) => this.placeholderRenderer.removeBulk([key]),
        complete: (generation, keys) => this.hydrationLifecycle.completeBlockBatch(generation, keys),
      },
      projection: {
        revision: () => this.yLayerProjection.revision,
        revisionFor: (key) => this.yLayerProjection.revisionForKey(key),
        disposed: () => this.disposed,
      },
      renderer: this.terrainRenderer,
      hydration: {
        generation: () => this.hydrationPipeline.generation,
        providerGeneration: () => this.providerGeneration,
        runningGenerationFor: (key) => this.hydrationPipeline.runningGenerationFor(key),
        removePending: (keys) => this.hydrationPipeline.removePendingKeys(keys),
        reorder: () => this.hydrationPipeline.prioritizeRegularJobs((job) => job.role),
        beginProgress: (lane) => this.hydrationLifecycle.beginProgress(lane),
        queuedBlocks: () => this.queuedBlockHydrationJobs(),
        schedule: () => this.hydrationLifecycle.schedule(),
      },
      fallback: {
        renderOptions: () => this.renderOptions,
        worldContext: () => ({ visualRevisionKey: this.blockIndexOwner.visualRevision, getBlock: (position: VoxelCoordinate) => this.blockIndexOwner.get(position) }),
        enqueue: (job) => this.hydrationPipeline.enqueueRegular(job),
        surfaceVisibleEntries: () => this.yLayerProjection.visibleEntriesByKey,
      },
      visual: {
        create: (provider, block, world) => this.createProviderVisual(provider, block, world),
        disposeTemplates: (templates) => { for (const template of templates) { template.geometry.dispose(); template.material.dispose(); } },
        acquireProviderReference: (provider) => this.blockRepresentationHydration.acquireProviderReference(provider),
      },
      trace: (event, details) => this.runtimeTrace?.record(event, details),
      recordProviderCacheStats: () => this.recordProviderCacheStats(),
      scheduleRender: () => this.scheduleRender(),
    });
    this.yLayerPrewarm = new YLayerRepresentationPrewarmOwner({
      project: () => this.project,
      options: () => this.renderOptions,
      provider: () => this.visualProvider,
      providerGeneration: () => this.providerGeneration,
      hydrationGeneration: () => this.hydrationPipeline.generation,
      isDisposed: () => this.disposed,
    }, {
      blockIndex: this.blockIndexOwner,
      representations: this.blockRepresentations,
      hydration: this.hydrationPipeline,
      projection: this.yLayerProjection,
      fluids: this.fluidCoordinator,
      instances: this.instanceRenderer,
      terrain: this.terrainRenderer,
      terrainWorkflow: this.terrainPipeline,
      representationHydration: this.blockRepresentationHydration,
    }, {
      createVisual: (provider, block, world) => this.createProviderVisual(provider, block, world),
      reusableKey: (provider, block, world) => this.requestReusableVisualKey(provider, block, world),
        visibleEntry: (block, options) => this.structureReconciliation.visibleEntry(block, options),
      scheduleHydration: (delay) => this.hydrationLifecycle.schedule(delay),
      activatePresentation: (project, generation) => this.activatePreparedYLayerPresentation(project, generation),
      record: (metric, delta = 1) => this.instrumentation.record(metric as keyof RendererCounters, delta),
      recordProviderCacheStats: () => this.recordProviderCacheStats(),
      invalidateDiagnostics: () => this.invalidateStaticModelDiagnostics(),
      removeRepresentation: (key, entry) => this.removeBlockEntry(key, entry),
      onTerminal: (notification) => this.publishYLayerPrewarmTerminal(notification),
    });
    this.yLayerPresentationLifecycle = new YLayerPresentationLifecycleOwner(this.yLayerPresentation, {
      project: () => this.project,
      options: () => this.renderOptions,
      provider: () => this.visualProvider,
      providerGeneration: () => this.providerGeneration,
      layerIndex: () => this.layerIndex,
      hasRepresentationPrewarm: () => this.yLayerPrewarm.isPreparingRepresentation,
      isDisposed: () => this.disposed,
    }, {
      representations: this.blockRepresentations,
      hydration: this.hydrationPipeline,
      providerRefresh: this.providerRefreshPipeline,
      instances: this.instanceRenderer,
      surfaces: this.surfaceRenderer,
      placeholders: this.placeholderRenderer,
      terrain: this.terrainPipeline,
      terrainRenderer: this.terrainRenderer,
      fluids: this.fluidCoordinator,
      culling: this.interiorCulling,
      layeredObjects: this.layeredObjectPresentation,
      projection: this.yLayerProjection,
      blockIndex: this.blockIndexOwner,
      diagnostics: this.instrumentation,
    });
    this.providerRefreshOwner = new ViewportProviderRefreshOwner(
      this.providerRefreshPipeline,
      this.hydrationPipeline,
      this.blockIndexOwner,
      this.blockRepresentations,
      this.yLayerProjection,
      this.fluidCoordinator,
      this.blockRepresentationHydration,
      {
        currentProject: () => this.project,
        currentOptions: () => this.renderOptions,
        layerIndex: () => this.layerIndex,
        isSuspended: () => this.suspended,
        markSuspendedRefresh: () => { this.suspendedNeedsRefresh = true; },
        reusableKey: (provider, block, world) => this.requestReusableVisualKey(provider, block, world),
        scheduleHydration: () => this.hydrationLifecycle.schedule(),
        publishProgress: () => this.publishProviderRefreshProgress(),
        trace: (event, details) => this.runtimeTrace?.record(event, details),
      },
    );
    this.yLayerProjectionCommit = new YLayerProjectionCommitOwner(
      this.blockIndexOwner,
      this.blockRepresentations,
      this.hydrationPipeline,
      this.yLayerProjection,
      this.structureSyncState,
      this.fluidCoordinator,
      this.interiorCulling,
      this.terrainRenderer,
      this.terrainPipeline,
      this.instanceRenderer,
      this.surfaceRenderer,
      this.blockRepresentationCommit,
      this.yLayerPrewarm,
      this.yLayerPresentationLifecycle,
      this.instrumentation,
      VIEWPORT_INSTANCE_THRESHOLD,
      () => this.visualProvider,
      () => this.missingBlocksTerminal,
      {
        removeRepresentation: (key, entry) => this.removeBlockEntry(key, entry),
        removePlaceholder: (key) => this.removePlaceholderVisual(key),
        ensurePlaceholder: (key, block, role) => this.ensurePlaceholderVisual(key, block, role),
        terrainCandidate: (key, entry, world, options) => this.structureReconciliation.terrainCandidate(key, entry, world, options),
        applyBlockRole: applyBlockRenderRole,
      },
      {
        beginProgress: () => this.hydrationLifecycle.beginProgress(),
        schedule: () => this.hydrationLifecycle.schedule(),
      },
      {
        applyLayerPresentation: (currentProject, options) => this.yLayerPresentationLifecycle.apply(currentProject, options),
        scheduleRender: () => this.scheduleRender(),
        trace: (event, details) => this.runtimeTrace?.record(event, details),
      },
    );
    this.hydrationExecutionOwner = new ViewportHydrationExecutionOwner({
      hydrationPipeline: this.hydrationPipeline,
      blockRepresentationHydration: this.blockRepresentationHydration,
      providerRefreshPipeline: this.providerRefreshPipeline,
      projection: this.yLayerProjection,
      decorations: this.decorationVisuals,
      diagnostics: this.instrumentation,
      runtimeTrace: () => this.runtimeTrace,
      isStopped: () => this.disposed || (this.suspended && !this.backgroundPreparation && !this.yLayerPrewarm.isPreparingRepresentation),
      isInteractive: () => this.isCameraInteracting(),
      rollbackPartialInstanceVisual: (key) => this.rollbackPartialInstanceVisual(key),
      markHydrationFailure: (job, error) => this.markHydrationFailure(job, error),
      publishProviderRefreshProgress: () => this.publishProviderRefreshProgress(),
      completeHydrationPart: (token, key) => this.hydrationLifecycle.completePart(token, 'block', key),
      onLayerPrewarmComplete: (job, authoritative) => this.yLayerPrewarm.onHydrationCompleted(job, authoritative),
    }, {
      syncBudgetMs: VIEWPORT_HYDRATION_SYNC_BUDGET_MS,
      interactiveSyncBudgetMs: VIEWPORT_INTERACTIVE_HYDRATION_SYNC_BUDGET_MS,
      maxJobsPerBatch: VIEWPORT_HYDRATION_MAX_JOBS_PER_BATCH,
      interactiveMaxJobsPerBatch: VIEWPORT_INTERACTIVE_HYDRATION_MAX_JOBS_PER_BATCH,
    });
    this.hydrationLifecycle = new ViewportHydrationLifecycleOwner(
      this.hydrationPipeline,
      this.yLayerPrewarm,
      this.terrainPipeline,
      this.decorationVisuals,
      this.providerRefreshOwner,
      this.instrumentation,
      {
        isDisposed: () => this.disposed,
        isSuspended: () => this.suspended,
        isBackgroundPreparation: () => this.backgroundPreparation,
        isLayerPrewarming: () => this.yLayerPrewarm.isPreparingRepresentation,
        cancellationDiagnostics: () => ({
          providerGeneration: this.providerGeneration,
          specialVisualRevision: this.specialVisualRevision,
          providerReady: !!this.visualProvider,
          projectId: this.project?.id,
          syncedProjectId: this.structureSyncState.snapshot().project?.id,
          queuedBlockHydrationJobs: this.queuedBlockHydrationJobs(),
          queuedDecorationHydrationJobs: this.queuedDecorationHydrationJobs(),
          hydrationRunning: this.hydrationRunning,
          pendingSignatureCount: this.hydrationPipeline.pendingCount,
          placeholderSignatureCount: this.placeholderSignatures.size,
          placeholderVisualCount: this.placeholderIndices.size,
          renderedBlockCount: this.visibleBlockRepresentationCount(),
          residentBlockCount: this.blockRepresentations.size,
          terrainHydrationPending: this.terrainPipeline.pendingGroupCount,
          cameraInteractionInProgress: this.cameraGestureInProgress || this.pressedActions.size > 0,
        }),
        trace: (event, details) => this.runtimeTrace?.record(event, details),
      },
      this.hydrationExecutionOwner.port,
    );
    this.hydrationSettlement = new ViewportHydrationSettlementOwner({
      hydration: this.hydrationPipeline,
      projection: this.yLayerProjection,
      culling: this.interiorCulling,
      terrainWorkflow: this.terrainPipeline,
      representations: this.blockRepresentations,
      terrain: this.terrainRenderer,
      surfaces: this.surfaceRenderer,
      instances: this.instanceRenderer,
      fluids: this.fluidCoordinator,
      placeholders: this.placeholderRenderer,
    });
    const structureReconciliationPorts: ViewportStructureReconciliationPorts = {
      blockIndex: this.blockIndexOwner,
      representations: this.blockRepresentations,
      hydration: this.hydrationPipeline,
      projection: this.yLayerProjection,
      syncState: this.structureSyncState,
      culling: this.interiorCulling,
      fluids: this.fluidCoordinator,
      terrain: this.terrainRenderer,
      terrainWorkflow: this.terrainPipeline,
      instances: this.instanceRenderer,
      surfaces: this.surfaceRenderer,
      representationCommit: this.blockRepresentationCommit,
      placeholders: this.placeholderRenderer,
      hydrationLifecycle: this.hydrationLifecycle,
      settlement: this.hydrationSettlement,
      diagnostics: this.instrumentation,
      provider: () => this.visualProvider,
      layerIndex: () => this.layerIndex,
      instanceThreshold: VIEWPORT_INSTANCE_THRESHOLD,
      missingBlocksTerminal: () => this.missingBlocksTerminal,
      requestReusableVisualKey: (provider, block, world) => this.requestReusableVisualKey(provider, block, world),
      removeRepresentation: (key, entry) => this.removeBlockEntry(key, entry),
      recordTrace: (event, details) => this.runtimeTrace?.record(event, details),
      recordInstanceOwnership: (phase, key, source) => this.traceInstanceOwnership(phase, key, source),
      scheduleRender: () => this.scheduleRender(),
    };
    this.structureReconciliation = new ViewportStructureReconciliationOwner(structureReconciliationPorts);
    const localMutationPorts: ViewportLocalMutationPorts = {
      ...structureReconciliationPorts,
      syncSpecialVisualDescriptors: () => { this.syncSpecialVisualDescriptors(); },
      recordMissingAccountingInvariant: (checkpoint) => this.recordMissingAccountingInvariant(checkpoint),
    };
    this.localMutation = new ViewportLocalMutationOwner(localMutationPorts, this.structureReconciliation);
    this.hydrationFinalization = new ViewportHydrationFinalizationOwner(
      {
        project: () => this.project,
        options: () => this.renderOptions,
        provider: () => this.visualProvider,
        missingBlocksTerminal: () => this.missingBlocksTerminal,
        progress: () => this.finalizationProgress(),
        recordMissingAccountingInvariant: (checkpoint) => this.recordMissingAccountingInvariant(checkpoint),
      },
      {
        blockIndex: this.blockIndexOwner,
        representations: this.blockRepresentations,
        hydration: this.hydrationPipeline,
        projection: this.yLayerProjection,
        culling: this.interiorCulling,
        fluids: this.fluidCoordinator,
        terrainWorkflow: this.terrainPipeline,
        representationCommit: this.blockRepresentationCommit,
        placeholders: this.placeholderRenderer,
        settlement: this.hydrationSettlement,
        reconciliation: this.structureReconciliation,
        instances: this.instanceRenderer,
        lifecycle: this.hydrationLifecycle,
        instanceThreshold: VIEWPORT_INSTANCE_THRESHOLD,
      },
      {
        removeRepresentation: (key, entry) => this.removeBlockEntry(key, entry),
        ensurePlaceholder: (key, entry) => this.ensurePlaceholderVisual(key, entry.block, entry.role),
        removePlaceholder: (key) => this.removePlaceholderVisual(key),
        queuedDecorationWork: () => this.queuedDecorationHydrationJobs(),
      },
    );
    this.structureBlockGuideGroup.name = 'structureBlockGuide';
  }

  mount(container: HTMLElement): void {
    if (this.disposed) return;
    if (this.renderer) { this.resize(); return; }
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.updatePixelRatioTargets();
    this.renderer.setPixelRatio(this.staticPixelRatio);
    this.hostLifecycle.mount(container, this.renderer.domElement);
    this.applyTheme(this.palette);
    this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x394454, 1);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1); this.keyLight.position.set(6, 10, 7);
    this.scene.add(this.hemisphereLight, this.keyLight);
    this.applyBlockBrightness();
    this.canonicalRoot.name = 'canonicalProjectRoot';
    this.canonicalRoot.add(this.blocksGroup, this.decorationsGroup);
    this.scene.add(this.canonicalRoot);
    this.scene.add(this.isolationPresentation.root);
    this.structureBlockGuideGroup.name = 'structureBlockGuide';
    this.scene.add(this.structureBlockGuideGroup);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.selectionPresenter.mount();
    this.scene.add(this.movePreviewGroup);
    this.groupHighlightPresenter.mount();
    this.groupHighlightPresenter.createUsageOverlay();
    this.scene.add(this.decorationGhostGroup);
    this.scene.add(this.decorationSelectionGroup);
    this.camera.position.set(12, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    delete this.controls.mouseButtons.LEFT;
    this.controls.enableZoom = false;
    this.controls.enablePan = true;
    this.cameraInput.attachControls(this.controls);
    this.resize();
    if (this.project) this.resetCamera();
    else this.cameraFraming.frameBounds(projectCameraBounds(VIEWPORT_BOOTSTRAP_SIZE));
    this.scheduleRender();
  }

  /** Pauses a retained viewport without releasing its scene, camera, or GPU resources. */
  suspend(): void {
    if (this.disposed || this.suspended) return;
    this.backgroundPreparation = false;
    this.suspended = true;
    this.cancelPendingHover(true);
    this.endEditorPointerGesture();
    this.clearInput();
    this.cameraGestureInProgress = false;
    this.cameraMovementInProgress = false;
    this.cameraRenderPending = false;
    this.yLayerProjection.cancel();
    this.renderScheduler.cancel();
    this.hydrationPipeline.cancelScheduledWork();
    this.providerRefreshOwner.cancelPlanning();
  }

  /** Resumes a retained viewport and lets its owner perform the current-state sync. */
  resume(): void {
    if (this.disposed || !this.suspended) return;
    this.backgroundPreparation = false;
    this.suspended = false;
    const needsRefresh = this.suspendedNeedsRefresh;
    if (this.suspendedNeedsRefresh) {
      this.structureSyncState.invalidateKey();
      this.decorationSyncKey = '';
      this.suspendedNeedsRefresh = false;
    }
    const deferred = this.providerRefreshOwner.takeDeferred();
    if (deferred && this.project && this.visualProvider === deferred.next) this.providerRefreshOwner.refresh(deferred.previous, deferred.next);
    if (!needsRefresh && !deferred) this.activatePreparedYLayerPresentation(this.project, this.providerGeneration);
    this.resize();
    if (this.queuedBlockHydrationJobs() || this.queuedDecorationHydrationJobs()) this.hydrationLifecycle.schedule();
    this.scheduleRender();
  }

  get isSuspended(): boolean { return this.suspended; }

  prepareYLayerVisualResources(project: ProjectDocument): ViewportPreparationAttempt {
    if (this.disposed || this.project !== project || this.renderOptions.layerY === undefined || !this.visualProvider)
      return 'rejected';
    const wasPreparing = this.yLayerPrewarm.isPreparingRepresentation || this.yLayerPrewarm.visualEvidence.state === 'preparing';
    this.yLayerPrewarm.prepare(project);
    const visualState = this.yLayerPrewarm.visualEvidence.state;
    const representationState = this.yLayerPrewarm.representationEvidence.state;
    if (visualState === 'preparing' || representationState === 'preparing')
      return wasPreparing ? 'in-progress' : 'accepted';
    if (
      visualState === 'cancelled' || visualState === 'failed' || visualState === 'idle' ||
      representationState === 'cancelled' || representationState === 'failed' || representationState === 'idle'
    )
      return 'rejected';
    return 'completed';
  }

  private activatePreparedYLayerPresentation(project: ProjectDocument | undefined, providerGeneration: number): void {
    if (this.disposed || this.suspended || this.yLayerProjection.hasDirectPresentation
      || !this.yLayerPresentationLifecycle.activatePrepared(project, providerGeneration)) return;
    const options = this.renderOptions;
    this.instrumentation.record('yLayerPresentationTransitions');
    this.runtimeTrace?.record('y-layer-presentation', { mode: 'resident-batches', layerY: options.layerY, visibility: options.visibility, residentBlocks: this.blockRepresentations.size, instanceMembers: this.instanceOwnershipIndex.size, activation: 'prewarm-complete' });
  }

  /**
   * Reconciles an inactive retained scene without mounting a second WebGL renderer.
   * `completed` means the synchronous structure/decorations sync committed; the
   * hydration and GPU readiness contracts remain independently authoritative.
   */
  prepareInactiveViewport(project: ProjectDocument, active: ActiveBlock | undefined, options: ViewportRenderOptions): ViewportPreparationAttempt {
    if (this.disposed || !this.suspended || this.renderer || this.project?.id !== project.id || this.project.blocks !== project.blocks) return 'rejected';
    const workWasPending = this.inactivePreparationWorkPending();
    this.backgroundPreparation = true;
    this.suspended = false;
    try {
      this.update(project, active, options);
      this.prepareYLayerVisualResources(project);
      const sync = this.structureSyncState.snapshot();
      const expectedKey = this.structureSyncState.keyFor(project, renderFilterKey(options));
      const decorationKey = `${project.id}|${renderFilterKey(options)}|${this.decorationVisuals.revision}`;
      if (sync.project === project && sync.syncKey === expectedKey && this.syncedDecorationProject === project && this.decorationSyncKey === decorationKey) {
        this.suspendedNeedsRefresh = false;
        return 'completed';
      }
      const workPending = this.inactivePreparationWorkPending();
      if (workPending) return workWasPending ? 'in-progress' : 'accepted';
      return 'rejected';
    } finally {
      this.suspended = true;
    }
  }

  private inactivePreparationWorkPending(): boolean {
    const work = this.hydrationPipeline.workCounts();
    return this.yLayerProjection.state.activity !== 'idle'
      || work.regularQueued > 0
      || work.providerRefreshQueued > 0
      || work.regularRunning > 0
      || work.providerRefreshRunning > 0
      || this.queuedDecorationHydrationJobs() > 0
      || this.terrainPipeline.pendingGroupCount > 0
      || this.fluidCoordinator.pendingCount > 0
      || this.providerRefreshPipeline.isPlanning
      || this.yLayerPrewarm.isPreparingRepresentation
      || this.yLayerPrewarm.visualEvidence.state === 'preparing';
  }

  publishCurrentHydrationProgress(): void {
    if (this.disposed) return;
    this.hydrationPipeline.publishProgress(this.hydrationPipeline.progressSnapshot());
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.themeApplied = true;
    this.scene.background = new THREE.Color(palette.background);
    this.blockGhostPresenter.applyTheme(palette);
    this.decorationGhostPresenter.applyTheme(palette);
    this.movePreviewPresenter.applyTheme(palette);
    (this.projectGrid?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.grid);
    this.editingPlanePresenter.applyTheme(palette);
    (this.boundsBox?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.bounds);
    this.selectionPresenter.applyTheme(palette);
    this.fallbackMaterials.normal.color.setHex(palette.block);
    this.fallbackMaterials.reference.color.setHex(palette.referenceBlock);
    this.fallbackMaterials.missing.color.setHex(palette.missingBlock);
    this.placeholderMaterials.normal.color.setHex(palette.block);
    this.placeholderMaterials.reference.color.setHex(palette.referenceBlock);
    this.placeholderMaterials.missing.color.setHex(palette.missingBlock);
    for (const material of Object.values(this.fallbackMaterials)) setBlockBrightnessBaseColor(material);
    for (const material of Object.values(this.placeholderMaterials)) setBlockBrightnessBaseColor(material);
    this.applyBlockBrightness();
    this.groupHighlightPresenter.applyTheme(palette);
    this.decorationSelectionPresenter.applyTheme(palette);
    this.movePreviewGroup.traverse((object) => { if (object instanceof THREE.Mesh) (object.material as THREE.MeshBasicMaterial).color.setHex(object.userData['previewInvalid'] ? palette.invalid : palette.valid); });
    this.scheduleRender();
  }

  setBlockBrightness(value: number): void {
    this.blockBrightness = normalizeBlockBrightness(value);
    this.applyBlockBrightness();
    if (this.renderer) this.scheduleRender();
  }

  setLayerIndex(index: LayerBlockIndex | undefined): void { this.layerIndex = index; }
  setBlockUsageHighlight(id: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void { this.blockUsageHighlightId = id; this.blockUsageHighlightPositions = positions; this.updateBlockUsageHighlight(id, positions); this.scheduleRender(); }

  /** Updates reference presentation without invalidating model or terrain caches. */
  setReferenceOpacity(value: number): void {
    const opacity = Math.max(0, Math.min(1, value));
    this.renderOptions = { ...this.renderOptions, referenceOpacity: opacity };
    this.fallbackMaterials.reference.transparent = true;
    this.fallbackMaterials.reference.opacity = opacity;
    this.placeholderMaterials.reference.transparent = true;
    this.placeholderMaterials.reference.opacity = opacity;
    this.instanceRenderer.setReferenceOpacity(opacity);
    this.terrainRenderer.setReferenceOpacity(opacity);
    this.surfaceRenderer.setReferenceOpacity(opacity);
    for (const entry of this.blockRepresentations.values()) {
      if (entry.role !== 'reference' || !entry.object || entry.instanceBatchKey !== undefined || entry.terrainChunkKey !== undefined || entry.surfaceFaceMemberships !== undefined) continue;
      applyBlockRenderRole(entry.object, 'reference', opacity);
    }
    this.scheduleRender();
  }

  lighting(): ViewportLighting { return viewportLightingForBrightness(this.blockBrightness); }

  private applyBlockBrightness(): void {
    const lighting = viewportLightingForBrightness(this.blockBrightness);
    if (this.hemisphereLight) this.hemisphereLight.intensity = lighting.hemisphereIntensity;
    if (this.keyLight) this.keyLight.intensity = lighting.directionalIntensity;
    for (const material of Object.values(this.fallbackMaterials)) applyBlockBrightnessToMaterial(material, this.blockBrightness);
    for (const material of Object.values(this.placeholderMaterials)) applyBlockBrightnessToMaterial(material, this.blockBrightness);
    applyBlockBrightnessToObject(this.blocksGroup, this.blockBrightness);
    for (const compiled of this.instanceRenderer.templates()) for (const template of compiled.templates) applyBlockBrightnessToMaterial(template.material, this.blockBrightness);
    for (const templates of this.surfaceTemplateCache.values()) for (const template of templates) applyBlockBrightnessToMaterial(template.material, this.blockBrightness);
    this.terrainRenderer.applyMaterial((material) => applyBlockBrightnessToMaterial(material, this.blockBrightness));
  }

  setControlConfiguration(configuration: ViewportControlConfiguration): void {
    this.controlConfiguration = { ...configuration };
    this.cameraInput.setControlConfiguration(this.controlConfiguration);
  }

  setStructureBlockGuideVisible(visible: boolean): void {
    if (this.showStructureBlockGuide === visible) return;
    this.showStructureBlockGuide = visible;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  cameraKeyDown(action: MovementAction): void { if (this.disposed || this.suspended) return; this.runtimeTrace?.record('movement-keydown', { action }); this.cameraInput.cameraKeyDown(action); }
  cameraKeyUp(action: MovementAction): void { if (this.disposed || this.suspended) return; this.runtimeTrace?.record('movement-keyup', { action }); this.cameraInput.cameraKeyUp(action); }

  setMouseBindings(bindings: Readonly<Record<MouseAction, string>>): void {
    this.cameraInput.setMouseBindings(bindings);
  }

  private restoreTemporaryMouseButton(): void { this.cameraInput.endEditorPointerGesture(); }

  resize(): void {
    if (this.suspended || !this.renderer || !this.container) return;
    this.updatePixelRatioTargets();
    this.applyPixelRatio(this.staticPixelRatio);
    const { width, height } = this.container.getBoundingClientRect();
    const size = viewportRenderSize(width, height);
    this.canvasSize = size;
    this.camera.aspect = size.width / size.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(size.width, size.height, false);
    this.runtimeTrace?.record('resize', { cssWidth: width, cssHeight: height, backingWidth: size.width, backingHeight: size.height });
    this.scheduleRender();
  }

  setVisualProvider(provider: BlockVisualProvider | undefined): void {
    if (this.visualProvider === provider) return;
    this.yLayerPrewarm.cancel();
    const previousProvider = this.visualProvider;
    const previousProviderGeneration = this.providerGeneration;
    const previousFluidEntries = !provider
      ? [...this.blockRepresentations.values()].filter((entry) => entry.fluidChunkKey !== undefined)
      : [];
    this.visualProvider = provider;
    this.providerRefreshOwner.transition(previousProvider, provider);
    this.fluidCoordinator.setProvider(provider?.fluidRenderResolver && provider.fluidTexture ? {
      contractKey: provider.fluidRenderContractKey ?? `provider-object-v1|${this.providerGeneration}`,
      resolver: provider.fluidRenderResolver,
      texture: provider.fluidTexture.bind(provider),
    } : undefined, provider);
    if (!provider) for (const entry of previousFluidEntries) {
      this.blockRepresentationCommit.setFluidRepresentation(entry.key, undefined, true);
      this.blockRepresentationCommit.updateProvider(entry.key, undefined);
      this.blockRepresentationCommit.setFallback(entry, this.ensureFallbackVisual(entry));
    }
    this.providerStats = undefined;
    this.runtimeTrace?.record('provider-generation', { previousProviderGeneration, providerGeneration: this.providerGeneration, hasProvider: !!provider, previousProvider: !!previousProvider });
    this.specialVisualSignature = '';
    this.ghostModelKey = '';
    // A provider becoming available for the first time must promote the
    // placeholder-only scene. A handoff between live providers is different:
    // existing terrain remains authoritative until a changed visual commits.
    const requiresStructureResync = !previousProvider || !provider;
    if (requiresStructureResync) this.structureSyncState.invalidateKey();
    if (provider) this.syncSpecialVisualDescriptors();
    if (previousProvider && provider) {
      if (this.suspended) this.providerRefreshOwner.defer(previousProvider, provider);
      else this.providerRefreshOwner.refresh(previousProvider, provider);
    }
    const hadVisibleCache = this.yLayerProjection.visibleProject === this.project;
    if (this.suspended) {
      this.suspendedNeedsRefresh = true;
      return;
    }
    this.update(this.project, this.activeBlock, this.renderOptions);
    if (hadVisibleCache && !requiresStructureResync) this.resyncCurrentFluidProvider();
    if (!provider && previousFluidEntries.length) this.hydrationLifecycle.completeBlockBatch(this.hydrationPipeline.generation, previousFluidEntries.map((entry) => entry.key));
    this.providerRefreshOwner.releaseUnused();
  }

  /** Marks unresolved Missing blocks as terminal fallbacks once source restore is terminal. */
  setMissingBlocksTerminal(terminal: boolean): void {
    if (!this.missingBlockAccounting.setTerminal(terminal, this.yLayerProjection.visibleEntries, (key, state) => this.hydrationPipeline.syncMissingBlockState(key, state))) return;
    this.hydrationPipeline.refreshProgress();
    this.scheduleRender();
  }

  private resyncCurrentFluidProvider(): void {
    if (!this.project) return;
    const visible = this.yLayerProjection.hasVisibleProjection(this.project, this.renderOptions)
      ? this.yLayerProjection.visibleEntries
      : this.structureReconciliation.visibleBlocks(this.project, this.renderOptions);
    this.structureReconciliation.syncVisibleFluids(this.project, this.renderOptions, visible, this.fluidWorldContext());
  }

  private fluidWorldContext(): FluidWorldLookup {
    return {
      visualRevisionKey: this.blockIndexOwner.visualRevision,
      getBlock: (position) => this.blockIndexOwner.get(position),
      getDefinition: (blockId) => this.definitionResolver?.(blockId),
      getOcclusionClass: (block) => this.visualProvider?.occlusionClass?.(block) ?? 'unknown',
    };
  }
  setSpecialVisualDescriptorResolver(resolver: ((blockId: string) => ContentSpecialVisualDescriptor | undefined) | undefined, revision?: number): void {
    if (resolver === this.specialVisualResolver && revision === this.specialVisualRevision) return;
    this.yLayerPrewarm.cancel();
    this.specialVisualResolver = resolver;
    this.specialVisualRevision = revision;
    if (this.suspended) {
      this.suspendedNeedsRefresh = true;
      return;
    }
    if (this.syncSpecialVisualDescriptors()) {
      if (this.visualProvider) this.providerRefreshOwner.refresh(this.visualProvider, this.visualProvider);
      this.update(this.project, this.activeBlock, this.renderOptions);
    } else {
      this.structureBlockGuideKey = '';
      this.update(this.project, this.activeBlock, this.renderOptions);
    }
  }
  setDecorationTextureProvider(provider: ((resource: string) => string | undefined) | undefined, revision?: unknown): void {
    if (provider === this.decorationTextureUrl && Object.is(revision, this.decorationTextureRevision)) return;
    this.decorationTextureCache?.dispose();
    this.decorationTextureCache = provider ? new DecorationTextureCache(provider, undefined, () => this.scheduleRender()) : undefined;
    this.decorationTextureUrl = provider;
    this.decorationTextureRevision = revision;
    this.decorationVisuals.advanceRevision();
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemResourceProvider(provider: ((itemId: string) => readonly string[]) | undefined, revision?: unknown): void {
    if (provider === this.decorationItemResources && Object.is(revision, this.decorationItemResourcesRevision)) return;
    this.decorationItemResources = provider;
    this.decorationItemResourcesRevision = revision;
    this.decorationVisuals.advanceRevision();
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemVisualProvider(provider: ((itemId: string) => ResolvedItemVisual | undefined) | undefined, revision?: unknown): void {
    if (provider === this.decorationItemVisual && Object.is(revision, this.decorationItemVisualRevision)) return;
    this.decorationItemVisual = provider;
    this.decorationItemVisualRevision = revision;
    this.decorationVisuals.advanceRevision();
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemPreviewProvider(provider: ((item: ItemStackData) => Promise<string | undefined>) | undefined, revision?: unknown): void {
    if (provider === this.decorationItemPreview && Object.is(revision, this.decorationItemPreviewRevision)) return;
    this.decorationItemPreview = provider;
    this.decorationItemPreviewRevision = revision;
    this.decorationVisuals.advanceRevision();
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setPaintingTextureResolver(provider: ((variantId: string) => string | undefined) | undefined, revision?: unknown): void {
    if (provider === this.paintingResource && Object.is(revision, this.paintingResourceRevision)) return;
    this.paintingResource = provider;
    this.paintingResourceRevision = revision;
    this.decorationVisuals.advanceRevision();
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  setPlacementPlanProvider(provider: PlacementPlanProvider | undefined): void { this.placementPlanProvider = provider; }
  setBlockDefinitionResolver(resolver: ((blockId: string) => BlockDefinition | undefined) | undefined, revision?: unknown): void {
    if (this.definitionResolver === resolver && Object.is(revision, this.definitionResolverRevision)) return;
    this.definitionResolver = resolver;
    this.definitionResolverRevision = revision;
    this.structureBlockGuideKey = '';
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  private ensureSpatialIndex(project: ProjectDocument | undefined, force = false, preserveForIncrementalTransition = false): void {
    this.blockIndexOwner.ensure(project, force, preserveForIncrementalTransition);
  }

  private collectSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): readonly NormalizedSpecialVisualDescriptor[] {
    return this.blockIndexOwner.specialVisualIdsFor(this.activeBlock?.id, plannedBlocks).flatMap((id) => { const descriptor = this.specialVisualResolver?.(id); return descriptor ? [{ ...descriptor, contentId: id }] : []; });
  }

  private requestReusableVisualKey(provider: BlockVisualProvider, block: PlacedBlock, worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }): string | undefined {
    const key = provider.reusableVisualKey?.(block, worldContext);
    this.instanceRenderer.recordReusableKey(key, this.specialVisualResolver?.(block.id)?.contractId ?? 'generic-json');
    return key;
  }

  private syncSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): boolean {
    const descriptors = this.collectSpecialVisualDescriptors(plannedBlocks);
    const signature = stableValueKey(descriptors.slice().sort((left, right) => left.contentId.localeCompare(right.contentId)));
    const changed = signature !== this.specialVisualSignature;
    if (!changed) return false;
    this.specialVisualSignature = signature;
    this.visualProvider?.setSpecialVisualDescriptors?.(descriptors);
    return changed;
  }

  /**
   * Compares the visual contract of the old and new providers without using
   * provider object identity as a structure invalidation signal. Equal
   * reusable keys keep their compiled terrain/instance representation.
   */
  update(project: ProjectDocument | undefined, active: ActiveBlock | undefined, options: ViewportRenderOptions = {}, mutationHint?: ProjectMutationHint): void {
    if (options.layerY !== undefined && options.layerIndex === undefined && this.layerIndex) {
      options = { ...options, layerIndex: this.layerIndex };
    }
    const previousProject = this.project;
    const previousActive = this.activeBlock;
    const hadDirectPresentation = this.yLayerProjection.hasDirectPresentation;
    if (project?.blocks !== previousProject?.blocks) this.yLayerPrewarm.cancel();
    const previousOptions = this.renderOptions;
    const updatePlan = this.structureUpdatePlanner.plan({
      project,
      previousProject,
      previousOptions,
      options,
      mutationHint,
      layerIndex: this.layerIndex,
      indexedProject: this.indexedProject,
      suspended: this.suspended,
      backgroundPreparation: this.backgroundPreparation,
    });
    const {
      structureState,
      projectChanged,
      previousSyncKey,
      nextSyncKey,
      structureInputsUnchanged,
      groupPresentationOnly,
      isolatePresentationChanged,
      presentationInputsUnchanged,
      referenceOpacityOnly,
      projectionDelta,
      projectionTargetInFlight,
      projectIdentityOnly,
      layerProjectionOnly,
      incrementalMutation,
      metadataMutation,
      full,
      bootstrapInitialYProjection,
    } = updatePlan;
    this.project = project;
    this.activeBlock = active;
    this.renderOptions = options;
    this.yLayerPresentationLifecycle.apply(project, options);
    if (!layerProjectionOnly) this.yLayerProjection.cancel();
    if (this.suspended) {
      if (this.backgroundPreparation && (project !== previousProject && !structureInputsUnchanged || nextSyncKey !== previousSyncKey || !!mutationHint)) {
        this.backgroundPreparation = false;
        this.hydrationLifecycle.cancel(project !== previousProject ? 'project-identity-changed' : 'structure-sync-key-changed', { source: 'inactive-y-layer-prewarm-invalidated', previousProjectId: previousProject?.id, nextProjectId: project?.id });
        this.clearPersistentVisuals();
      }
      const nextDecorationKey = project ? `${project.id}|${renderFilterKey(options)}|${this.decorationVisuals.revision}` : 'empty';
      const needsRefresh = this.structureSyncState.requiresSuspendedRefresh(project, renderFilterKey(previousOptions) !== renderFilterKey(options), nextDecorationKey !== this.decorationSyncKey);
      this.suspendedNeedsRefresh = this.suspendedNeedsRefresh || needsRefresh;
      if (!needsRefresh && !this.suspendedNeedsRefresh && project) {
        this.structureSyncState.commit(project, nextSyncKey);
        this.yLayerProjection.setCommitted(project, options);
        this.yLayerProjection.associateVisibleProjection(project, options);
        if (project.decorations === structureState.project?.decorations) {
          this.syncedDecorationProject = project;
          this.decorationSyncKey = nextDecorationKey;
        }
      }
      return;
    }
    const inPlaceBlockMutation = this.structureSyncState.hasInPlaceBlockMutation(project);
    this.ensureSpatialIndex(project, incrementalMutation || layerProjectionOnly ? false : inPlaceBlockMutation, incrementalMutation || layerProjectionOnly);
    const retainsDirectScopeForMutation = hadDirectPresentation && !!project && !!previousProject
      && project.id === previousProject.id && project.groups === previousProject.groups
      && project.blocks !== previousProject.blocks && this.yLayerPresentationLifecycle.canRetainForMutation(project, mutationHint);
    const mayKeepDirectPresentation = !!project && !!previousProject && !this.suspended && !mutationHint
      && project.id === previousProject.id && project.blocks === previousProject.blocks
      && (project.groups === previousProject.groups || groupPresentationOnly)
      && (layerProjectionOnly || hadDirectPresentation || groupPresentationOnly || isolatePresentationChanged
        || presentationInputsUnchanged && options.layerY !== undefined && options.visibility !== undefined);
    const presentationTransition = this.yLayerPresentationLifecycle.synchronizeDirect({
      project,
      previousProject,
      options,
      allowed: mayKeepDirectPresentation,
      hadDirectPresentation,
      retainDirectPresentation: retainsDirectScopeForMutation,
      layerProjectionOnly,
    });
    const directPresentation = presentationTransition.direct;
    const directFallbackReason = presentationTransition.fallbackReason;
    if (directPresentation && presentationTransition.transitioned) {
      this.instrumentation.record('yLayerPresentationTransitions');
      this.runtimeTrace?.record('y-layer-presentation', { mode: 'resident-batches', layerY: options.layerY, visibility: options.visibility, residentBlocks: this.blockRepresentations.size, instanceMembers: this.instanceOwnershipIndex.size });
    }
    const projectionFallbackFromDirect = hadDirectPresentation && !directPresentation && !retainsDirectScopeForMutation;
    const usesProjectionFallback = layerProjectionOnly && !directPresentation;
    if (projectionFallbackFromDirect || usesProjectionFallback && !hadDirectPresentation) {
      this.instrumentation.record('yLayerPresentationFallbacks');
      this.runtimeTrace?.record('y-layer-presentation-fallback', { reason: directFallbackReason ?? 'incomplete-residency', layerY: options.layerY, visibility: options.visibility, residentBlocks: this.blockRepresentations.size, projectBlocks: project?.blocks.length ?? 0 });
    }
    if (!(directPresentation && !mutationHint && active?.id === previousActive?.id)) this.syncSpecialVisualDescriptors();
    const syncKey = nextSyncKey;
    const blockInputChanged = !referenceOpacityOnly && !layerProjectionOnly && !projectIdentityOnly && (project !== structureState.project || syncKey !== structureState.syncKey)
      || projectionFallbackFromDirect;
    const decorationKey = project ? `${project.id}|${renderFilterKey(options)}|${this.decorationVisuals.revision}` : 'empty';
    const decorationInputChanged = project?.id !== this.syncedDecorationProject?.id
      || project?.decorations !== this.syncedDecorationProject?.decorations
      || decorationKey !== this.decorationSyncKey;
    if (directPresentation && project) {
      this.yLayerProjection.setCommitted(project, options);
      this.structureSyncState.commit(project, syncKey);
    } else if (!projectionFallbackFromDirect && layerProjectionOnly && project && !projectionTargetInFlight && projectionDelta.changedLayers.length) this.yLayerProjection.request(project, options, options.layerIndex ?? this.layerIndex);
    else if (!projectionFallbackFromDirect && layerProjectionOnly && project && !projectionTargetInFlight) {
      this.yLayerProjection.setCommitted(project, options);
      this.yLayerProjection.associateVisibleProjection(project, options);
      this.structureSyncState.commit(project, syncKey);
    }
    if (blockInputChanged || inPlaceBlockMutation) {
      const projectIdentityChanged = project !== structureState.project;
      const incrementalProjectChange = projectIdentityChanged && !full && this.blockRepresentations.size === 0 && (this.queuedBlockHydrationJobs() > 0 || this.hydrationPipeline.pendingCount > 0 || this.placeholderSignatures.size > 0);
      if (projectionFallbackFromDirect && project) {
        this.hydrationLifecycle.cancel('structure-sync-key-changed', { source: 'y-layer-direct-presentation-fallback', reason: directFallbackReason });
        this.reconcileStructure(project, options, true);
      } else if (incrementalMutation && project && mutationHint) {
        if (metadataMutation && mutationHint?.kind === 'metadata-delta') this.localMutation.applyMetadataMutation(previousProject!, previousOptions, project, options, mutationHint);
        else this.localMutation.applyMutation(project, options, mutationHint);
      } else {
        if (full || !incrementalProjectChange && (projectIdentityChanged || inPlaceBlockMutation)) {
          const reason: HydrationCancellationReason = inPlaceBlockMutation ? 'in-place-project-mutation' : full ? 'structure-sync-key-changed' : 'project-identity-changed';
          this.hydrationLifecycle.cancel(reason, {
            projectIdentityChanged,
            structureSyncKeyChanged: full,
            renderFilterChanged: renderFilterKey(previousOptions) !== renderFilterKey(options),
            previousProjectId: structureState.project?.id,
            nextProjectId: project?.id,
            previousProjectUpdatedAt: structureState.project?.metadata.updatedAt,
            nextProjectUpdatedAt: project?.metadata.updatedAt,
            previousSyncKey,
            nextSyncKey,
          });
        }
        if (bootstrapInitialYProjection && project) {
          const bootstrapOptions: ViewportRenderOptions = { ...options, visibility: 'current-only' };
          const bootstrapSyncKey = this.structureSyncState.keyFor(project, renderFilterKey(bootstrapOptions));
          this.reconcileStructure(project, bootstrapOptions, true);
          this.yLayerProjection.setCommitted(project, bootstrapOptions);
          this.structureSyncState.commit(project, bootstrapSyncKey);
          this.yLayerProjection.request(project, options, options.layerIndex ?? this.layerIndex);
        } else {
          this.reconcileStructure(project, options, full);
        }
      }
      if (!bootstrapInitialYProjection) {
        if (project) this.yLayerProjection.setCommitted(project, options);
        this.structureSyncState.commit(project, syncKey);
      }
    }
    if (referenceOpacityOnly && project) {
      this.setReferenceOpacity(options.referenceOpacity ?? .28);
      this.yLayerProjection.setCommitted(project, { ...(this.yLayerProjection.committedOptionsFor(project) ?? previousOptions), referenceOpacity: options.referenceOpacity });
      this.yLayerProjection.associateVisibleProjection(project, options);
      this.structureSyncState.commit(project, syncKey);
    }
    if (projectIdentityOnly) {
      if (project) {
        this.yLayerProjection.setCommitted(project, options);
        this.yLayerProjection.associateVisibleProjection(project, options);
        this.structureSyncState.commit(project, syncKey);
        this.syncedDecorationProject = project;
        this.decorationSyncKey = decorationKey;
      }
    }
    if (layerProjectionOnly) {
      if (previousOptions.referenceOpacity !== options.referenceOpacity) this.setReferenceOpacity(options.referenceOpacity ?? .28);
    }
    if (decorationInputChanged) {
      if (metadataMutation && mutationHint?.kind === 'metadata-delta' && project && previousProject) this.applyMetadataDecorationMutation(previousProject, previousOptions, project, options, mutationHint);
      else if (!blockInputChanged) this.decorationVisuals.cancelPending();
      this.decorationSyncKey = decorationKey;
      this.syncedDecorationProject = project;
      if (!metadataMutation) {
        this.reconcileDecorations(project, options, false);
        this.hydrationLifecycle.beginProgress();
      }
    }
    if (isolatePresentationChanged) {
      if (options.isolatedGroupId) this.applyIsolatePresentation(project, options);
      else this.isolationPresentation.deactivate();
    } else if (this.isolationPresentation.state() !== 'inactive' && (project !== previousProject || !!mutationHint)) {
      this.refreshIsolatePresentation(project, options);
    }
    if (!blockInputChanged && !inPlaceBlockMutation && !decorationInputChanged) this.instrumentation.record('overlayOnlyUpdates');
    this.setProjectBounds(project);
    this.updateStructureBlockGuide(project, options);
    this.setEditingPlane(options.layerY, project);
    const visualSelection = this.visibleSelection(project, options);
    this.updateSelection(visualSelection.selected, visualSelection.positions, visualSelection.kind, visualSelection.count, visualSelection.bounds, visualSelection.box);
    this.updateActiveGroup(project, options.activeGroupId, options.activeGroupPositions);
    if (Object.prototype.hasOwnProperty.call(options, 'highlightedBlockId') || Object.prototype.hasOwnProperty.call(options, 'highlightedBlockPositions')) { this.blockUsageHighlightId = options.highlightedBlockId; this.blockUsageHighlightPositions = options.highlightedBlockPositions; }
    this.updateBlockUsageHighlight(this.blockUsageHighlightId, this.blockUsageHighlightPositions);
    this.updateMovePreview(project, options.groupMovePreview);
    this.updateGhostModel(active, this.ghostPlan);
    this.clearDecorationGhost();
    this.updateDecorationSelection(options.selectedDecorationId);
    if (options.selectedDecorationId) {
      this.decorationVisuals.hydrateSelectedItemPreview(options.selectedDecorationId);
    }
    this.updateGhost(undefined, project, active);
    this.recordProviderCacheStats();
    if (project && this.controls && (projectChanged || this.cameraFraming.cameraProjectId !== project.id)) {
      this.cameraFraming.cameraProjectId = project.id;
      this.fitStructure();
    } else if (project && this.controls && !this.cameraFraming.hasCameraFrame) this.resetCamera();
    this.scheduleRender();
    const projectBlockCount = project?.blocks.length ?? 0;
    this.runtimeDiagnostics.observeProjectBlockCount(projectBlockCount, () => this.captureGhostSceneSnapshot());
    this.recordSpatialLookupDelta();
  }

  private recordSpatialLookupDelta(): void {
    this.blockIndexOwner.recordLookupDelta();
  }

  setRuntimeDiagnosticsEnabled(enabled: boolean): void {
    this.runtimeDiagnostics.setEnabled(enabled, this.project?.blocks.length ?? 0);
  }

  setRuntimeTrace(trace: ViewportRuntimeTrace | undefined): void { this.runtimeTrace = trace; }

  runtimeTraceMetadata(): ViewportTraceMetadata {
    const project = this.project;
    const capabilities = this.renderer?.capabilities;
    return {
      minecraftVersion: '1.21.1',
      projectId: project?.id,
      projectBlocks: project?.blocks.length ?? 0,
      visibleLogicalBlocks: this.expectedVisibleBlockCount(),
      decorations: project?.decorations?.length ?? 0,
      atlasMode: this.terrainAtlasMode,
      controlConfiguration: { ...this.controlConfiguration },
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      viewportCss: { width: this.container?.getBoundingClientRect().width ?? 0, height: this.container?.getBoundingClientRect().height ?? 0 },
      rendererBacking: { width: this.renderer?.domElement.width ?? 0, height: this.renderer?.domElement.height ?? 0 },
      hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
      deviceMemory: typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
      webgl: capabilities ? { isWebGL2: capabilities.isWebGL2, maxTextures: capabilities.maxTextures, maxTextureSize: capabilities.maxTextureSize, maxSamples: capabilities.maxSamples } : undefined,
      providerGeneration: this.providerGeneration,
      specialVisualRevision: this.specialVisualRevision,
    };
  }

  runtimeTraceSample(): ViewportTraceSample {
    const target = this.controls?.target ?? new THREE.Vector3();
    const offset = this.camera.position.clone().sub(target);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const counters = this.instrumentation.snapshot();
    const terrain = this.terrainRenderer.lightEvidence();
    const currentGenerationRunning = this.hydrationPipeline.runningGenerationCount(this.hydrationPipeline.generation);
    const workCounts = this.hydrationPipeline.workCounts();
    const hydration = this.hydrationProgressState;
    const staticModels = { available: !!this.staticModelDiagnosticsCache, buildCount: this.staticModelDiagnosticsBuildCount };
    return {
      camera: { position: toTraceVector(this.camera.position), target: toTraceVector(target), offset: toTraceVector(offset), distance: offset.length(), direction: toTraceVector(direction), quaternion: [this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w], up: toTraceVector(this.camera.up), fov: this.camera.fov, aspect: this.camera.aspect },
      dpr: { staticPixelRatio: this.staticPixelRatio, interactivePixelRatio: this.staticPixelRatio, appliedPixelRatio: this.renderer?.getPixelRatio() ?? this.staticPixelRatio, interactiveResolutionActive: false, canvasCss: { width: this.container?.getBoundingClientRect().width ?? 0, height: this.container?.getBoundingClientRect().height ?? 0 }, backingWidth: this.renderer?.domElement.width ?? 0, backingHeight: this.renderer?.domElement.height ?? 0, cameraAspect: this.camera.aspect },
      hydration: { ...hydration, queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(), running: this.hydrationRunning, regularQueued: workCounts.regularQueued, providerRefreshQueued: workCounts.providerRefreshQueued, regularRunning: workCounts.regularRunning, providerRefreshRunning: workCounts.providerRefreshRunning, currentGenerationRunning, staleRunning: Math.max(0, this.hydrationRunning - currentGenerationRunning), pendingSignatureCount: this.hydrationPipeline.pendingCount, placeholderSignatureCount: this.placeholderSignatures.size, placeholderVisualCount: this.placeholderIndices.size, renderedBlockCount: this.expectedVisibleBlockCount(), residentBlockCount: this.blockRepresentations.size, expectedVisibleBlockCount: this.expectedVisibleBlockCount(), terrainHydrationPending: this.terrainPipeline.pendingGroupCount, hydrationScheduled: this.hydrationPipeline.isScheduled(), hydrationTimerActive: this.hydrationPipeline.isTimerActive(), currentBatchBudget: this.hydrationPipeline.batchBudget, isCameraInteracting: this.isCameraInteracting(), interactiveMode: false },
      counters,
      render: { ...this.lastRendererMetrics, renderCpuMs: this.renderCpuMs, frameDurationMs: this.frameDurationMs, cameraRenderPending: this.cameraRenderPending, renderSchedulerPending: this.renderScheduler.scheduled, object3dCount: this.scene.children.length, visibleMeshCount: this.blocksGroup.children.length + this.decorationsGroup.children.length, instanceBatchCount: this.instanceBatches.size, surfaceBatchCount: this.surfaceFaceBatches.size, terrainMeshCount: terrain['terrainChunkMeshes'], standaloneMeshCount: 0, renderRegionCount: this.instanceBatches.size + this.surfaceFaceBatches.size },
      generations: { providerGeneration: this.providerGeneration, hydrationGeneration: this.hydrationPipeline.generation, specialVisualRevision: this.specialVisualRevision },
      terrain: { ...terrain },
      staticModels: { ...staticModels },
      fluids: { ...this.fluidCoordinator.lightDiagnostics() },
      build: { effectiveMovementSpeed: effectiveCameraMovementSpeed(this.controlConfiguration.cameraMoveSpeed, offset.length()), cameraMovementScale: cameraMovementScale(offset.length()), cameraMoveSpeed: this.controlConfiguration.cameraMoveSpeed, verticalMoveSpeed: this.controlConfiguration.verticalMoveSpeed },
    };
  }

  /** Rich, explicitly requested evidence. Never used by the 50ms heartbeat sample. */
  runtimeTraceHeavySample(): ViewportTraceSample {
    const light = this.runtimeTraceSample();
    const terrain = this.terrainRenderer.evidence();
    const staticModels = this.staticModelDiagnostics();
    const evidence = this.performanceEvidence();
    return {
      ...light,
      render: { ...light.render, ...evidence },
      terrain: { ...terrain, terrainAtlas: { ...terrain.terrainAtlas } },
      staticModels: { ...staticModels },
      fluids: { ...this.fluidCoordinator.diagnostics() },
    };
  }

  private staticModelDiagnostics(): StaticModelDiagnosticSnapshot {
    if (this.staticModelDiagnosticsCache) return this.staticModelDiagnosticsCache;
    const metrics = this.instanceRenderer.metrics();
    this.staticModelDiagnosticsBuildCount += 1;
    this.staticModelDiagnosticsCache = collectStaticModelDiagnostics([...this.blockRepresentations.values()].map((entry) => ({ ...entry, id: entry.block.id })), metrics, this.instanceRenderer.templatePartCounts());
    return this.staticModelDiagnosticsCache;
  }

  private invalidateStaticModelDiagnostics(): void { this.staticModelDiagnosticsCache = undefined; }

  runtimeGhostDiagnostics(): ViewportRuntimeDiagnostics {
    const current = this.captureGhostSceneSnapshot();
    const emptyTransitions = this.runtimeDiagnostics.emptyTransitionSnapshots;
    const firstEmpty = emptyTransitions.at(-2) ?? null;
    const secondEmpty = emptyTransitions.at(-1) ?? null;
    const differences = firstEmpty && secondEmpty ? compareEmptySnapshots(firstEmpty, secondEmpty) : null;
    return { current, emptyTransitions: { firstEmpty, secondEmpty, differences } };
  }

  private reconcileStructure(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean, visibleOverride?: readonly VisibleBlockEntry[]): void {
    if (!project) {
      this.runtimeTrace?.record('reconcile', { full, projectBlocks: 0 });
      this.instrumentation.record('structuralReconciles');
      if (full) this.instrumentation.record('fullReconcileFallbacks');
      this.clearPersistentVisuals();
      this.interiorCulling.clear();
      this.structureSyncState.replaceVisiblePositions([]);
      this.traceInstanceOwnership('after-reconcile', undefined, 'reconcile');
      return;
    }
    this.structureReconciliation.reconcile(project, options, full, this.providerGeneration, visibleOverride);
  }


  private recoverFailedLayerProjection(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.runtimeTrace?.record('y-layer-projection-failed', { error: detail, recovery: 'full-reconcile' });
    if (this.disposed) return;
    if (this.suspended) {
      this.suspendedNeedsRefresh = true;
      this.structureSyncState.invalidateKey();
      return;
    }
    const project = this.project;
    if (!project) return;
    this.yLayerProjection.cancel();
    this.hydrationLifecycle.cancel('structure-sync-key-changed', { source: 'y-layer-projection-recovery', error: detail });
    const syncKey = this.structureSyncState.keyFor(project, renderFilterKey(this.renderOptions));
    this.reconcileStructure(project, this.renderOptions, true);
    this.yLayerProjection.setCommitted(project, this.renderOptions);
    this.structureSyncState.commit(project, syncKey);
  }

  private applyMetadataDecorationMutation(previousProject: ProjectDocument, previousOptions: ViewportRenderOptions, project: ProjectDocument, options: ViewportRenderOptions, hint: Extract<ProjectMutationHint, { readonly kind: 'metadata-delta' }>): void {
    this.decorationVisuals.applyMetadataChanges(
      hint.decorationChanges ?? [],
      previousProject,
      previousOptions,
      project,
      options,
      this.hydrationPipeline.generation,
    );
  }

  private applyIsolatePresentation(project: ProjectDocument | undefined, options: ViewportRenderOptions): void {
    if (!project || !options.isolatedGroupId) {
      this.isolationPresentation.deactivate();
      return;
    }
    const positions = options.isolatedGroupPositions ?? [];
    const keys = new Set(positions.map((position) => coordinateKey(position)));
    const blocks = this.isolateBlockSnapshots(project, keys);
    const decorations: IsolateDecorationVisualSnapshot[] = [];
    for (const current of this.decorationVisuals.values()) {
      const decoration = current.decoration;
      if (!decorationHasGroup(decoration, options.isolatedGroupId) || !isDecorationVisible(decoration, project.groups)) continue;
      decorations.push({ id: decoration.instanceId, decoration, object: current.object });
    }
    const blockMap = new Map(blocks.map((entry) => [entry.key, entry.block] as const));
    const snapshot: GroupIsolationSnapshot = {
      blocks,
      decorations,
      fluidProvider: this.fluidCoordinator.providerSnapshot(),
      fluidWorld: {
        getBlock: (position) => blockMap.get(coordinateKey(position)),
        getDefinition: (blockId) => this.definitionResolver?.(blockId),
        getOcclusionClass: (block) => this.visualProvider?.occlusionClass?.(block) ?? 'unknown',
      },
      isolateKeys: keys,
    };
    this.isolationPresentation.prepare(snapshot);
  }

  private refreshIsolatePresentation(project: ProjectDocument | undefined, options: ViewportRenderOptions): void {
    if (this.isolationPresentation.state() !== 'inactive' && options.isolatedGroupId) this.applyIsolatePresentation(project, options);
  }

  private commitIsolatePresentation(keys: ReadonlySet<string>): void {
    this.isolatedKeys = new Set(keys);
    const project = this.structureSyncState.snapshot().project;
    if (project) {
      const selection = this.visibleSelection(project, this.renderOptions);
      this.updateSelection(selection.selected, selection.positions, selection.kind, selection.count, selection.bounds, selection.box);
      this.updateActiveGroup(project, this.renderOptions.activeGroupId, this.renderOptions.activeGroupPositions);
      this.updateBlockUsageHighlight(this.blockUsageHighlightId, this.blockUsageHighlightPositions);
    }
    this.scheduleRender();
  }

  private clearCommittedIsolatePresentation(): void {
    this.isolatedKeys.clear();
    const project = this.structureSyncState.snapshot().project;
    if (project) {
      const selection = this.visibleSelection(project, this.renderOptions);
      this.updateSelection(selection.selected, selection.positions, selection.kind, selection.count, selection.bounds, selection.box);
      this.updateActiveGroup(project, this.renderOptions.activeGroupId, this.renderOptions.activeGroupPositions);
      this.updateBlockUsageHighlight(this.blockUsageHighlightId, this.blockUsageHighlightPositions);
    }
    this.scheduleRender();
  }

  private isolateBlockSnapshots(project: ProjectDocument, keys: ReadonlySet<string>): readonly IsolateBlockVisualSnapshot[] {
    const terrainRecords = this.terrainRenderer.recordsForKeys(keys);
    const terrainByKey = new Map(terrainRecords.map((record) => [record.key, record] as const));
    const fluidByKey = new Map(this.fluidCoordinator.recordsForKeys(keys).map((record) => [coordinateKey(record.block.position), record] as const));
    const snapshots: IsolateBlockVisualSnapshot[] = [];
    for (const key of keys) {
      const [x, y, z] = key.split(',').map(Number);
      const block = this.blockIndexOwner.get({ x, y, z });
      if (!block || !isBlockVisible(block, project.groups)) continue;
      const entry = this.blockRepresentations.get(key);
      const terrain = terrainByKey.get(key);
      const fluid = fluidByKey.get(key);
      let instanceTemplates: InstancePartTemplate[] | undefined;
      if (entry?.instanceBatchKey !== undefined) instanceTemplates = [...(this.instanceBatches.get(entry.instanceBatchKey)?.templates ?? [])];
      let surfaceTemplates: SurfaceFaceTemplate[] | undefined;
      let surfaceDirections: Set<SurfaceFaceDirection> | undefined;
      if (entry?.surfaceFaceMemberships?.length && entry.reusableVisualKey) {
        const cached = this.surfaceTemplateCache.get(entry.reusableVisualKey);
        if (cached) {
          surfaceTemplates = [...cached];
          surfaceDirections = new Set(entry.surfaceFaceMemberships.flatMap((membership) => {
            const direction = this.surfaceFaceBatches.get(membership.batchKey)?.directions[membership.index];
            return direction ? [direction] : [];
          }));
          // Canonical surface membership may have culled a face against a
          // neighbour that is intentionally absent from the isolate view.
          // Re-expose those faces without touching canonical ownership.
          for (const direction of ['north', 'south', 'east', 'west', 'up', 'down'] as const) {
            if (!keys.has(coordinateKey(surfaceNeighbor(entry.block.position, direction)))) surfaceDirections.add(direction);
          }
        }
      }
      const standalone = entry && !terrain && !fluid && !instanceTemplates && !surfaceTemplates ? entry.object ?? entry.fallback : undefined;
      snapshots.push({ key, block, terrain, fluid, instanceTemplates, surfaceTemplates, surfaceDirections, standalone });
    }
    return snapshots;
  }


  private visibleSelection(project: ProjectDocument | undefined, options: ViewportRenderOptions): { readonly selected?: VoxelCoordinate; readonly positions?: readonly VoxelCoordinate[]; readonly kind?: string; readonly count?: number; readonly bounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly box?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } } {
    if (!project) return { selected: options.selected, positions: options.selectedPositions, kind: options.selectionKind, count: options.selectionCount, bounds: options.selectionBounds, box: options.selectionBox };
    if (!options.selected && !options.selectedPositions?.length && !options.selectionBounds && !options.selectionBox) {
      return { kind: options.selectionKind, count: 0 };
    }
    if (this.yLayerProjection.hasDirectPresentation) {
      const isVisible = (position: VoxelCoordinate): boolean => this.yLayerProjection.hasVisibleEntry(coordinateKey(position));
      const positions = (options.selectedPositions ?? []).filter(isVisible);
      const selected = options.selected && isVisible(options.selected) ? options.selected : undefined;
      return { selected, positions, kind: options.selectionKind, count: positions.length || (selected ? 1 : 0) };
    }
    const cachedProjection = this.canUseCachedVisibleProjection(project, options);
    const visible = cachedProjection ? this.yLayerProjection.visibleEntries : this.structureReconciliation.visibleBlocks(project, options);
    const visibleKeys = cachedProjection ? this.yLayerProjection.visibleEntriesByKey : new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    const isInProjection = (position: VoxelCoordinate): boolean => visibleKeys.has(coordinateKey(position)) && (!this.isolationPresentation.isActive() || this.isolatedKeys.has(coordinateKey(position)));
    const positions = (options.selectedPositions ?? []).filter(isInProjection);
    const selected = options.selected && isInProjection(options.selected) ? options.selected : undefined;
    const inBounds = (position: VoxelCoordinate, bounds: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }): boolean => position.x >= bounds.min.x && position.x <= bounds.max.x && position.y >= bounds.min.y && position.y <= bounds.max.y && position.z >= bounds.min.z && position.z <= bounds.max.z;
    const boundedVisible = options.selectionBounds ? visible.filter((entry) => inBounds(entry.block.position, options.selectionBounds!) && isInProjection(entry.block.position)).map((entry) => entry.block.position) : [];
    const bounds = options.selectionBounds ? selectionBounds(boundedVisible) : undefined;
    const box = options.selectionBox && visible.some((entry) => inBounds(entry.block.position, options.selectionBox!) && isInProjection(entry.block.position)) ? options.selectionBox : undefined;
    const count = options.selectionBounds ? boundedVisible.length : positions.length || (selected ? 1 : 0);
    return { selected, positions, kind: options.selectionKind, count, bounds, box };
  }

  private canUseCachedVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    return this.yLayerProjection.canUseCachedVisibleProjection(project, options);
  }

  private expectedVisibleBlockCount(): number {
    if (!this.project) return 0;
    return this.yLayerProjection.cachedVisibleBlockCount(this.project, this.renderOptions)
      ?? this.blockRepresentations.size;
  }

  private recordMissingAccountingInvariant(checkpoint: string): void {
    if (!this.runtimeDiagnostics.enabled && !this.runtimeTrace?.isActive) return;
    const projectMissing = new Set((this.project?.blocks ?? []).filter((block) => block.kind === 'missing').map((block) => coordinateKey(block.position)));
    const staleKeys = this.hydrationPipeline.missingStateKeys().filter((key) => !projectMissing.has(key));
    if (staleKeys.length) this.runtimeTrace?.record('missing-accounting-anomaly', { checkpoint, staleKeys: staleKeys.length });
  }

  private setHydrationDecorationScope(ids: readonly string[]): void {
    this.hydrationPipeline.setDecorationScope(ids);
  }

  private adoptCommittedDecorationOwnership(entries: readonly PlacedDecoration[]): void {
    const adopted = entries
      .filter((decoration) => {
        const entry = this.decorationVisuals.get(decoration.instanceId);
        return entry?.signature === `${decorationRenderSignature(decoration)}|${this.decorationVisuals.revision}`
          && !this.decorationVisuals.hasPending(decoration.instanceId);
      })
      .map((decoration) => decoration.instanceId);
    if (adopted.length) this.hydrationPipeline.adoptDecorationIds(this.hydrationPipeline.generation, adopted);
  }


  private publishHydrationProgress(progress: ViewportHydrationProgress): void {
    // Kept as a narrow test seam; normal accounting lives in the tracker.
    this.hydrationPipeline.publishProgress(progress as HydrationProgressSnapshot);
  }

  private requestCameraRender(): void {
    if (this.disposed) return;
    this.instrumentation.record('cameraRenderRequests');
    if (this.cameraRenderPending) this.instrumentation.record('cameraRenderRequestsCoalesced');
    this.runtimeTrace?.record('render-request', { coalesced: this.cameraRenderPending });
    this.cameraRenderPending = true;
    this.scheduleRender();
  }

  private isCameraInteracting(): boolean {
    return this.cameraInput.isCameraInteracting() || performance.now() < this.cameraInteractingUntil;
  }

  private markCameraInteraction(): void {
    this.cameraInput.markCameraInteraction();
  }

  private updatePixelRatioTargets(): void {
    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
    this.staticPixelRatio = Math.min(devicePixelRatio, 2);
  }

  private applyPixelRatio(pixelRatio: number): void {
    if (!this.renderer || this.renderer.getPixelRatio() === pixelRatio) return;
    this.renderer.setPixelRatio(pixelRatio);
    if (this.canvasSize.width > 0 && this.canvasSize.height > 0) this.renderer.setSize(this.canvasSize.width, this.canvasSize.height, false);
  }

  private queuedBlockHydrationJobs(): number {
    return this.hydrationPipeline.queuedWork();
  }
  private queuedDecorationHydrationJobs(): number { return this.decorationVisuals.queuedCount; }
  private compactHydrationQueues(): void { this.hydrationPipeline.compactWork(); this.decorationVisuals.compactQueue(); }
  private compactConsumedHydrationQueues(): void { this.hydrationPipeline.compactConsumedWork(); this.decorationVisuals.compactQueue(); }

  private markHydrationFailure(job: BlockHydrationJob, error: unknown): void {
    const entry = this.blockRepresentations.get(job.key);
    if (!entry) return;
    const fallback = this.ensureFallbackVisual(entry);
    fallback.userData['renderMode'] = 'fallback';
    fallback.userData['diagnostics'] = [{ code: 'GEOMETRY_BUILD_FAILED', message: error instanceof Error ? error.message : 'Visual construction failed' }];
    this.scheduleRender();
  }

  private rollbackPartialInstanceVisual(key: string): void {
    this.blockRepresentationCommit.rollbackPartial(key);
  }

  private scheduleRender(): void {
    if (this.disposed || this.suspended) return;
    this.renderScheduler.request(() => this.renderFrame());
  }

  private renderFrame(): void {
    if (this.disposed || this.suspended) return;
    if (this.cameraRenderPending) {
      this.cameraRenderPending = false;
      this.instrumentation.record('cameraRendersExecuted');
    }
    this.runtimeTrace?.record('render-frame');
    this.render();
  }

  private ensurePlaceholderVisual(key: string, block: ProjectDocument['blocks'][number], role: RenderedBlockEntry['role']): void {
    this.placeholderRenderer.ensure(key, block.position, role, groupIdsOf(block));
  }

  private ensurePlaceholderVisualsBulk(entries: readonly VisibleBlockEntry[]): void {
    this.placeholderRenderer.ensureBulk(entries.map((entry) => ({
      key: coordinateKey(entry.block.position),
      position: entry.block.position,
      role: entry.role,
      groupIds: groupIdsOf(entry.block),
    })));
  }

  private removePlaceholderVisual(key: string): void {
    this.blockRepresentationResources.removePlaceholder(key);
  }

  private clearPlaceholderVisuals(): void {
    this.blockRepresentationCommit.clearPlaceholders();
  }

  private createProviderVisual(provider: BlockVisualProvider, block: ProjectDocument['blocks'][number], worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }): Promise<TerrainHydrationResult> {
    this.instrumentation.record('modelResolutions');
    this.instrumentation.record('providerObjectCreations');
    const traceActive = !!this.runtimeTrace?.isActive;
    const started = traceActive ? performance.now() : 0;
    try { return Promise.resolve(provider.create(block, worldContext)).finally(() => { if (traceActive) this.runtimeTrace?.recordDuration('provider.create', performance.now() - started); }); }
    catch (error) { if (traceActive) this.runtimeTrace?.recordDuration('provider.create', performance.now() - started); return Promise.reject(error); }
  }

  private resolveTerrainHydration(reusableKey: string, block: ProjectDocument['blocks'][number], worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }, provider: BlockVisualProvider): Promise<TerrainHydrationResult> {
    const pending = this.terrainPipeline.resolveTemplatesFor(reusableKey, () => this.createProviderVisual(provider, block, worldContext), provider);
    return pending.then((templates) => templates
      ? { object: undefined, terrainTemplates: templates, resolved: { blockId: block.id, state: block.state, parts: [], support: 'full' as const, diagnostics: [], trace: { blockstateResource: '', matchedVariantKeys: [], selectedModelIds: [], modelResources: [], parentResources: [], elementCount: 0, faceCount: 0, textureResources: [] } }, mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }
      : this.createProviderVisual(provider, block, worldContext));
  }

  private ensureFallbackVisual(entry: RenderedBlockEntry, referenceOpacity = .28): THREE.Mesh {
    return this.blockRepresentationCommit.ensureFallback(entry, referenceOpacity);
  }

  private addSurfaceFaceVisual(block: ProjectDocument['blocks'][number], key: string, templates: readonly SurfaceFaceTemplate[], visible: ReadonlyMap<string, VisibleBlockEntry>, role: 'normal' | 'reference' = 'normal'): readonly SurfaceFaceMembership[] | undefined {
    const visibleEntry = visible.get(key);
    if (!visibleEntry) return undefined;
    return this.surfaceRenderer.add(block, key, templates, new Set(exposedFaceDirections(visibleEntry, visible)), role, this.renderOptions.referenceOpacity ?? .28);
  }

  private addTerrainVisual(block: ProjectDocument['blocks'][number], key: string, templates: readonly SurfaceFaceTemplate[], role: 'normal' | 'reference' = 'normal', callbacks?: TerrainRepresentationCommitCallbacks): TerrainRepresentationCommitStatus {
    return this.terrainRenderer.upsertAndCommit({ key, block, templates, role }, callbacks);
  }

  private removeSurfaceFaceVisual(key: string, entry?: RenderedBlockEntry): void {
    this.surfaceRenderer.remove(key, entry);
  }

  private clearSurfaceFaceResources(): void {
    this.blockRepresentationCommit.clear();
  }

  private addInstanceVisual(object: THREE.Object3D, block: ProjectDocument['blocks'][number], key: string, reusableKey?: string, source: 'provider-async' | 'cached-template' = 'provider-async', role: 'normal' | 'reference' = 'normal'): { readonly batchKey: string; readonly index: number; readonly object?: THREE.Object3D } | undefined {
    const membership = this.instanceRenderer.tryAdd(object, block, key, reusableKey, source, role);
    return membership ? { ...membership, object: this.instanceBatches.get(membership.batchKey)?.parts[0] } : undefined;
  }

  private addInstanceVisualFromTemplates(templates: readonly InstancePartTemplate[], block: ProjectDocument['blocks'][number], key: string, source: 'provider-async' | 'cached-template' = 'provider-async', compiled?: CompiledInstanceTemplates, role: 'normal' | 'reference' = 'normal'): { readonly batchKey: string; readonly index: number; readonly object?: THREE.Object3D } | undefined {
    const membership = this.instanceRenderer.addFromTemplates(templates, block, key, source, compiled, role);
    return membership ? { ...membership, object: this.instanceBatches.get(membership.batchKey)?.parts[0] } : undefined;
  }

  /** Returns every physical logical-key membership, including stale ownership. */
  private instanceMemberships(key: string, scanAll = false): readonly { readonly batchKey: string; readonly index: number }[] {
    return this.instanceRenderer.memberships(key, scanAll);
  }

  private removeOrphanedInstanceMemberships(key: string, source: 'rollback' | 'reconcile', entry = this.blockRepresentations.get(key)): void {
    this.blockRepresentationCommit.removeOrphanedInstanceMemberships(key, source, entry);
  }

  /** Repairs only stale/duplicate memberships; it never rebuilds valid batches. */
  private reconcileInstanceOwnership(): void {
    this.blockRepresentationCommit.reconcileInstances();
  }

  private removeBlockEntry(key: string, entry: RenderedBlockEntry): void {
    this.visualFailureKeys.delete(key);
    this.blockRepresentationCommit.remove(key, entry);
  }

  private recordProviderCacheStats(): void {
    const stats = this.visualProvider?.cacheStats?.(); if (!stats) return;
    const previous = this.providerStats;
    for (const key of ['resolvedModelCacheHits', 'resolvedModelCacheMisses', 'geometryCacheHits', 'geometryCacheMisses', 'textureCacheHits', 'textureCacheMisses'] as const) this.instrumentation.record(key, Math.max(0, stats[key] - (previous?.[key] ?? 0)));
    this.providerStats = stats;
  }

  private clearReusableInstanceTemplates(): void {
    this.instanceRenderer.clearTemplates();
  }


  private clearPersistentVisuals(): void {
    for (const [key, entry] of this.blockRepresentations) this.removeBlockEntry(key, entry);
    this.interiorCulling.clear();
    this.fluidCoordinator.clear();
    this.providerRefreshOwner.releaseUnused();
    this.decorationVisuals.clear();
    this.clearPlaceholderVisuals();
    this.clearReusableInstanceTemplates();
    this.instanceRenderer.resetMetrics();
    this.clearSurfaceFaceResources();
    this.hydrationPipeline.clearPendingSignatures();
    this.placeholderSignatures.clear();
    this.yLayerProjection.clear();
    this.structureSyncState.clear();
    this.decorationSyncKey = '';
    this.syncedDecorationProject = undefined;
    this.blockIndexOwner.clear();
    this.ghostPlan = undefined;
    this.lastHoverVisualKey = '';
    this.decorationGhostKey = '';
    this.lastActiveGroupProject = undefined;
    this.lastActiveGroupId = undefined;
    this.lastActiveGroupPositions = undefined;
    this.lastIsolatedGroupId = undefined;
    this.lastIsolatedGroupPositions = undefined;
    this.groupHighlightPresenter.clearUsage();
  }

  private reconcileDecorations(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean): void {
    const visible = this.decorationVisuals.reconcile(project, options, this.hydrationPipeline.generation, full);
    this.setHydrationDecorationScope(visible.map((decoration) => decoration.instanceId));
    this.adoptCommittedDecorationOwnership(visible);
    if (!project) this.setHydrationDecorationScope([]);
  }

  private updateDecorationSelection(selectedId: string | undefined): void {
    this.decorationSelectionPresenter.update(selectedId);
  }

  hit(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    if (this.disposed || this.suspended) return {};
    return this.performHit(event.clientX, event.clientY, project, active, planeY, showGhost);
  }

  /** Coalesces hover work to one raycast per animation frame. Commit paths use hit() synchronously. */
  hover(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY: number | undefined, showGhost: boolean, listener: ViewportHoverListener): void {
    if (this.disposed) return;
    this.hoverController.hover({ clientX: event.clientX, clientY: event.clientY, project, active, planeY, showGhost, listener });
  }

  private cancelPendingHover(countAsSuppressed: boolean): void {
    this.hoverController.cancel(countAsSuppressed);
  }

  private ddaPick(project: ProjectDocument): { readonly position: VoxelCoordinate; readonly normal: FaceNormal; readonly point: THREE.Vector3; readonly distance: number } | undefined {
    if (!this.blockIndexOwner.hasIndex) return undefined;
    return this.raycastController.pick(this.raycaster.ray, project.size);
  }

  private performHit(clientX: number, clientY: number, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!this.renderer || !this.container || !project) return {};
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const decorationRoot = this.isolationPresentation.isActive() ? this.isolationPresentation.root : this.decorationsGroup;
    const blockRoot = this.isolationPresentation.isActive() ? this.isolationPresentation.root : this.blocksGroup;
    const decorationHit = this.raycaster.intersectObjects(decorationRoot.children, true).find((hit) => !!hit.object.userData['decoration']);
    const ddaHit = planeY === undefined ? this.ddaPick(project) : undefined;
    const blockHit = planeY === undefined ? undefined : this.raycaster.intersectObjects(blockRoot.children, true).find((hit) => !hit.object.userData['decoration']);
    const decoration = decorationHit?.object.userData['decoration'] as PlacedDecoration | undefined;
    let target: VoxelCoordinate | undefined;
    let block: VoxelCoordinate | undefined;
    let faceNormal: FaceNormal | undefined;
    let hitPoint: THREE.Vector3 | undefined;
    let attachment: ReturnType<typeof resolveAttachmentPlacement>;
    if (planeY !== undefined && this.editingPlane) {
      const planeHit = this.raycaster.intersectObject(this.editingPlane, false)[0];
      if (planeHit) { target = targetFromEditingPlaneHit(planeHit.point, planeY, project.size); faceNormal = { x: 0, y: 1, z: 0 }; hitPoint = planeHit.point; }
    } else if (ddaHit) {
      block = ddaHit.position;
      faceNormal = ddaHit.normal;
      hitPoint = ddaHit.point;
    } else if (blockHit) {
      block = blockCoordinateFromHit(blockHit) ?? fluidCoordinateFromHit(blockHit, (key) => this.fluidVoxelOwner(key));
      if (block) {
        const surfaceDirection = surfaceFaceDirectionFromHit(blockHit);
        const normal = surfaceDirection ? surfaceFaceNormal(surfaceDirection) : (blockHit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().transformDirection(blockHit.object.matrixWorld);
        faceNormal = { x: normal.x, y: normal.y, z: normal.z };
        hitPoint = blockHit.point;
      }
    } else if (this.ground) {
      const groundHit = this.raycaster.intersectObject(this.ground, false)[0];
      if (groundHit) { target = targetFromGridHit(groundHit.point); faceNormal = { x: 0, y: 1, z: 0 }; hitPoint = groundHit.point; }
    }
    if (blockHit) {
      const hitVoxel = blockCoordinateFromHit(blockHit) ?? fluidCoordinateFromHit(blockHit, (key) => this.fluidVoxelOwner(key));
      if (hitVoxel && (planeY === undefined || hitVoxel.y === planeY)) block = hitVoxel;
    }
    const facing = active?.state['facing'];
    attachment = block && hitPoint ? resolveAttachmentPlacement(active?.id, block, hitPoint, this.blockIndexOwner.hasIndex ? this.blockIndexOwner : project.blocks, this.definitionResolver) : undefined;
    if (attachment) {
      if (!target) target = attachment.target;
      faceNormal = { x: 0, y: attachment.snapType === 'chain-extension' ? 1 : -1, z: 0 };
    } else if (!target && block && faceNormal) target = targetFromBlockFace(block, faceNormal);
    const placementContext = faceNormal ? { faceNormal, hitPoint: hitPoint ? { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } : undefined, facing: isHorizontalDirection(facing) ? facing : undefined, yaw: cameraYaw(this.camera), stateOverride: attachment?.stateOverride } : undefined;
    const previewStarted = showGhost && typeof performance !== 'undefined' ? performance.now() : 0;
    const placement = resolvePlacementPreview({ requested: showGhost && !this.renderOptions.activeDecoration, project, active, target, context: placementContext, lookup: this.blockIndexOwner.hasIndex ? this.blockIndexOwner : undefined, provider: this.placementPlanProvider });
    if (previewStarted) this.instrumentation.record('placementPreviewMs', Math.max(0, performance.now() - previewStarted));
    const decorationPlan = showGhost && this.renderOptions.activeDecoration && block && faceNormal ? planDecorationPlacement(project, this.renderOptions.activeDecoration, block, facingFromNormal(faceNormal) ?? 'up') : undefined;
    const previewStatus = decorationPlan?.status ?? placement.status;
    if (showGhost) {
      this.syncSpecialVisualDescriptors(placement.plan?.blocks ?? []);
      this.ghostPlan = placement.plan;
      this.updateGhostModel(active, placement.plan);
      this.updateGhost(target, project, active, previewStatus ?? 'invalid', placement.plan);
      if (this.renderOptions.activeDecoration && decorationPlan?.decoration) this.updateDecorationGhost(decorationPlan.decoration, decorationPlan.status);
      else this.clearDecorationGhost();
    } else {
      this.clearDecorationGhost();
    }
    const hoverVisualKey = `${target ? coordinateKey(target) : ''}|${previewStatus ?? ''}|${this.ghostModelKey}|${decorationPlan?.decoration ? stableValueKey(decorationPlan.decoration) : ''}`;
    if (hoverVisualKey !== this.lastHoverVisualKey) { this.lastHoverVisualKey = hoverVisualKey; this.scheduleRender(); }
    if (started) { const elapsed = Math.max(0, performance.now() - started); this.instrumentation.record('hoverPickMs', elapsed); this.instrumentation.record('hoverPickCount'); this.instrumentation.record('hoverPickMaxMs', Math.max(0, elapsed - this.instrumentation.snapshot().hoverPickMaxMs)); }
    if (previewStarted) { const elapsed = Math.max(0, performance.now() - previewStarted); this.instrumentation.record('placementPreviewCount'); this.instrumentation.record('placementPreviewMaxMs', Math.max(0, elapsed - this.instrumentation.snapshot().placementPreviewMaxMs)); }
    this.recordSpatialLookupDelta();
    return { target, block, placement: placement.status ? { status: placement.status, plan: placement.plan } : undefined, faceNormal, placementContext, decoration, decorationPlan, decorationDistance: decorationHit?.distance, blockDistance: ddaHit?.distance ?? blockHit?.distance };
  }

  private fluidVoxelOwner(key: string): boolean { return this.isolationPresentation.isActive() ? this.isolationPresentation.fluidCoordinateOwner(key) : this.fluidCoordinator.hasVoxel(key); }

  /** Projects a pointer ray onto the face plane captured at the beginning of a 3D selection drag. */
  projectPointerToPlane(event: PointerEvent, plane: FaceLockedSelectionPlane): { readonly x: number; readonly y: number; readonly z: number } | undefined {
    if (!this.renderer || !this.container) return undefined;
    return projectPointerToAxisPlane(event, this.renderer.domElement, this.camera, this.raycaster, plane.axis, plane.coordinate);
  }

  /** Projects an empty-space selection gesture onto a camera-facing world plane. */
  projectPointerToFreeSpace(event: PointerEvent, project: ProjectDocument, plane?: FreeSpaceSelectionPlane): { readonly point: { readonly x: number; readonly y: number; readonly z: number }; readonly plane: FreeSpaceSelectionPlane } | undefined {
    if (!this.renderer || !this.container) return undefined;
    const resolvedPlane = plane ?? freeSpaceSelectionPlane(project.size, this.camera.getWorldDirection(new THREE.Vector3()));
    const point = this.projectPointerToAxisPlane(event, resolvedPlane.axis, resolvedPlane.coordinate);
    return point ? { point, plane: resolvedPlane } : undefined;
  }

  private projectPointerToAxisPlane(event: PointerEvent, axis: 'x' | 'y' | 'z', coordinate: number): { readonly x: number; readonly y: number; readonly z: number } | undefined {
    if (!this.renderer || !this.container) return undefined;
    return projectPointerToAxisPlane(event, this.renderer.domElement, this.camera, this.raycaster, axis, coordinate);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.decorationTextureCache?.dispose(); this.decorationTextureCache = undefined;
    this.hostLifecycle.dispose();
    this.cameraInput.dispose();
    this.controls?.dispose();
    this.clearInput();
    this.cancelPendingHover(false);
    this.yLayerProjection.dispose();
    this.yLayerPrewarm.dispose();
    this.yLayerPrewarmListeners.clear();
    this.hydrationLifecycle.cancel('dispose');
    this.blockRepresentationHydration.dispose();
    this.isolationPresentation.dispose();
    this.isolatedKeys.clear();
    const provider = this.visualProvider;
    this.cameraRenderPending = false;
    this.renderScheduler.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.terrainPipeline.dispose();
    this.blockRepresentationCommit.dispose();
    this.fluidCoordinator.dispose();
    this.instanceRenderer.clear();
    this.blocksGroup.clear();
    this.decorationVisuals.clear();
    for (const child of this.decorationsGroup.children) disposeObject(child);
    this.decorationsGroup.clear();
    this.selectionPresenter.dispose();
    this.editingPlanePresenter.dispose();
    this.groupHighlightPresenter.dispose();
    this.decorationGhostPresenter.dispose();
    this.decorationSelectionPresenter.dispose();
    this.structureBlockGuidePresenter.dispose();
    this.blockGhostPresenter.dispose();
    this.movePreviewPresenter.dispose();
    this.ground?.geometry.dispose();
    (this.ground?.material as THREE.Material | undefined)?.dispose();
    this.projectGrid?.geometry.dispose();
    (this.projectGrid?.material as THREE.Material | undefined)?.dispose();
    this.boundsBox?.geometry.dispose();
    (this.boundsBox?.material as THREE.Material | undefined)?.dispose();
    this.fallbackGeometry.dispose();
    this.fallbackMaterials.normal.dispose(); this.fallbackMaterials.reference.dispose(); this.fallbackMaterials.missing.dispose();
    this.clearPlaceholderVisuals();
    this.placeholderGeometry.dispose();
    this.placeholderMaterials.normal.dispose(); this.placeholderMaterials.reference.dispose(); this.placeholderMaterials.missing.dispose();
    this.providerRefreshOwner.retire(provider);
    this.providerRefreshOwner.dispose();
    this.providerRefreshOwner.releaseUnused();
    this.visualProvider = undefined;
    this.renderer = undefined;
    this.container = undefined;
  }

  diagnostics(): ViewportDiagnostics {
    return { initialized: !!this.renderer, disposed: this.disposed, canvasWidth: this.canvasSize.width, canvasHeight: this.canvasSize.height, gridExists: !!this.projectGrid, boundsExists: !!this.boundsBox, rendererExists: !!this.renderer, sceneExists: true, cameraExists: true, controlsExist: !!this.controls, themeApplied: this.themeApplied, resizeApplied: this.canvasSize.width > 0 && this.canvasSize.height > 0, renderMode: 'demand', renderCount: this.renderCount };
  }

  visibleSceneDiagnostics(): VisibleSceneDiagnostics {
    const expected = this.project ? this.structureReconciliation.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedKeys = [...new Set(expected.map((entry) => coordinateKey(entry.block.position)))];
    return collectVisibleSceneDiagnostics({ expectedKeys, renderedKeys: this.blockRepresentations.keys(), placeholderKeys: this.placeholderIndices.keys(), pendingKeys: this.hydrationPipeline.pendingKeys() });
  }

  private visibleBlockRepresentationCount(): number {
    const directCount = this.yLayerProjection.directVisibleEntryCount();
    if (directCount !== undefined) return directCount;
    let count = 0;
    for (const entry of this.blockRepresentations.values()) {
      if (entry.presentationVisible !== false && this.yLayerProjection.hasVisibleEntry(entry.key)) count += 1;
    }
    return count;
  }

  ownershipDiagnostics(): readonly ViewportVoxelOwnershipDiagnostic[] {
    const expected = this.project ? new Set(this.structureReconciliation.visibleBlocks(this.project, this.renderOptions).map((entry) => coordinateKey(entry.block.position))) : new Set<string>();
      const queued = new Set(this.hydrationPipeline.regularJobs().map((job) => job.key));
    return collectOwnershipDiagnostics({ expectedKeys: expected, renderedKeys: this.blockRepresentations.keys(), placeholderKeys: this.placeholderIndices.keys(), pendingSignatures: this.hydrationPipeline.pendingSnapshot(), queuedKeys: queued, runningKeys: this.hydrationPipeline.runningKeyGenerationsSnapshot() });
  }

  private traceInstanceOwnership(phase: ViewportInstanceOwnershipEvent['phase'], key?: string, source?: ViewportInstanceOwnershipEvent['source'], entry?: RenderedBlockEntry): void {
    if (!this.runtimeDiagnostics.enabled) return;
    const physicalMemberships = key ? this.instanceMemberships(key) : [];
    const previousEntry = entry && (entry.instanceBatchKey !== undefined || entry.instanceIndex !== undefined) ? { ...(entry.instanceBatchKey !== undefined ? { batchKey: entry.instanceBatchKey } : {}), ...(entry.instanceIndex !== undefined ? { index: entry.instanceIndex } : {}) } : undefined;
    const violations = key ? collectInstanceOwnershipViolationsForKey({ batches: this.instanceBatches.values(), ownershipIndex: this.instanceOwnershipIndex, renderedEntries: this.blockRepresentations, runtimeChecks: this.runtimeDiagnostics.enabled }, key) : collectInstanceOwnershipViolations({ batches: this.instanceBatches.values(), ownershipIndex: this.instanceOwnershipIndex, renderedEntries: this.blockRepresentations, runtimeChecks: this.runtimeDiagnostics.enabled });
    this.runtimeDiagnostics.recordInstanceOwnership({ phase, ...(key ? { key } : {}), ...(source ? { source } : {}), generation: this.hydrationPipeline.generation, ...(previousEntry ? { previousEntry } : {}), physicalMemberships, violations });
  }

  rendererOwnershipDiagnostics(): ViewportOwnershipDiagnostics {
    const expected = this.project ? this.structureReconciliation.visibleBlocks(this.project, this.renderOptions) : [];
    const ghostTarget = this.ghostTarget;
    const previewState = {
      ghostVisible: this.ghost.visible,
      ghostModelPresent: !!this.ghostModel,
      ghostModelVisible: !!this.ghostModel?.visible,
      ghostModelKey: this.ghostModelKey,
      ghostGeneration: this.ghostGeneration,
      ...(ghostTarget ? { ghostTarget: { ...ghostTarget } } : {}),
      movePreviewChildren: this.movePreviewGroup.children.length,
      decorationGhostChildren: this.decorationGhostGroup.children.length,
      logicalSelectionChildren: this.logicalSelectionGroup.children.length,
      selectionOutlineVisible: this.selectionOutline.visible,
      reusableTemplateCount: this.instanceRenderer.templates().length,
    };
    return collectRendererOwnershipDiagnostics({
      scene: this.scene,
      canonicalRoot: this.canonicalRoot,
      roots: [
        { object: this.blocksGroup, name: 'blocksGroup' }, { object: this.decorationsGroup, name: 'decorationsGroup' },
        { object: this.ghost, name: 'ghost' }, { object: this.ghostModel, name: 'ghostModel' },
        { object: this.movePreviewGroup, name: 'movePreviewGroup' }, { object: this.decorationGhostGroup, name: 'decorationGhostGroup' },
        { object: this.decorationSelectionGroup, name: 'decorationSelectionGroup' }, { object: this.logicalSelectionGroup, name: 'logicalSelectionGroup' },
        { object: this.structureBlockGuideGroup, name: 'structureBlockGuide' }, { object: this.projectGrid, name: 'projectGrid' },
        { object: this.ground, name: 'ground' }, { object: this.editingPlane, name: 'editingPlane' }, { object: this.boundsBox, name: 'boundsBox' },
        { object: this.selectionOutline, name: 'selectionOutline' }, { object: this.selectionBox, name: 'selectionBox' },
        { object: this.isolationPresentation.root, name: 'groupIsolationPresentation' },
      ],
      projectBlockCount: this.project?.blocks.length ?? 0,
      expectedKeys: new Set(expected.map((entry) => coordinateKey(entry.block.position))),
      renderedEntries: this.blockRepresentations,
      placeholderIndices: this.placeholderIndices,
      pendingSignatures: this.hydrationPipeline.pendingSnapshot(),
      placeholderSignatures: this.placeholderSignatures.snapshot(),
      queuedKeys: this.hydrationPipeline.regularJobs().map((job) => job.key),
      runningKeys: this.hydrationPipeline.runningKeyGenerationsSnapshot(),
      instanceBatches: this.instanceBatches.values(),
      instanceOwnershipIndex: this.instanceOwnershipIndex,
      placeholderBatches: this.placeholderBatches.values(),
      runtimeChecks: this.runtimeDiagnostics.enabled,
      preview: previewState,
      previewActivity: { activeBlock: !!this.activeBlock, groupMoveActive: !!this.renderOptions.groupMovePreview, decorationActive: !!this.renderOptions.activeDecoration },
      hydration: {
        queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(),
        running: this.hydrationRunning,
        pendingSignatureCount: this.hydrationPipeline.pendingCount,
        placeholderSignatureCount: this.placeholderSignatures.size,
        runningOwnershipCount: this.hydrationPipeline.runningCount,
      },
    });
  }

  private captureGhostSceneSnapshot(): ViewportGhostSceneSnapshot {
    return captureViewportGhostSceneSnapshot(this.rendererOwnershipDiagnostics(), this.activeBlock ? { id: this.activeBlock.id, state: { ...this.activeBlock.state } } : undefined, this.runtimeDiagnostics.instanceOwnershipTrace);
  }

  rendererCounters(): RendererCounters {
    return this.instrumentation.snapshot();
  }

  yLayerVisualPreloadEvidence(): YLayerVisualPreloadEvidence {
    return this.yLayerPrewarm.visualEvidence;
  }

  yLayerRepresentationPrewarmEvidence(): YLayerRepresentationPrewarmEvidence {
    return this.yLayerPrewarm.representationEvidence;
  }

  isolationDiagnostics() {
    return this.isolationPresentation.diagnostics();
  }

  performanceEvidence(): ViewportPerformanceEvidence {
    const renderCost = collectSceneRenderCost({ scene: this.scene, blocksGroup: this.blocksGroup, decorationsGroup: this.decorationsGroup, instanceBatches: this.instanceBatches.values(), surfaceBatches: this.surfaceFaceBatches.values(), placeholderBatches: this.placeholderBatches.values(), renderedBlocks: this.blockRepresentations.values(), renderedDecorations: this.decorationVisuals.values() });
    return collectPerformanceEvidence({ counters: this.instrumentation.snapshot(), terrain: this.terrainRenderer.evidence(), renderCost, staticModelMetrics: this.instanceRenderer.metrics(), fluidDiagnostics: this.fluidCoordinator.diagnostics(), lastRendererMetrics: this.lastRendererMetrics, renderedBlocks: this.visibleBlockRepresentationCount(), residentBlocks: this.blockRepresentations.size, renderedDecorations: this.decorationVisuals.size, renderRegionSize: this.renderRegionPolicy.size, instanceBatchCount: this.instanceBatches.size, surfaceFaceBatchCount: this.surfaceFaceBatches.size, terrainHydrationQueue: this.terrainPipeline.pendingGroupCount, hydrationQueue: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(), hydrationRunning: this.hydrationRunning, interiorBlocksCulled: this.interiorCulling.size, frameDurationMs: this.frameDurationMs, renderCpuMs: this.renderCpuMs, spatialIndexLookups: this.blockIndexOwner.lookupCount, terrainAtlasMode: this.terrainAtlasMode });
  }

  hydrationProgress(): ViewportHydrationProgress { return this.hydrationProgressState; }

  /** Coarse finalization snapshot for the status/readiness coordinator. */
  finalizationProgress(): ViewportHydrationProgress { return this.withProviderRefreshProgress(this.hydrationProgressState); }

  /** Bounded watchdog-only ownership audit; never called from the frame loop. */
  finalizationAuditProgress(includeOwnership = true): ViewportHydrationProgress {
    return this.hydrationFinalization.auditProgress(includeOwnership);
  }

  /** Watchdog repair adopts committed ownership and requeues only verified gaps. */
  reconcileFinalizationAccounting(): void {
    this.hydrationFinalization.reconcileAccounting();
  }

  terrainOwnershipFor(key: string): TerrainOwnershipEvidence | undefined {
    return this.terrainRenderer.ownershipFor(key);
  }

  /** Test/development-only hook; normal viewport rendering never probes the GPU. */
  runTerrainAtlasGpuProbe(source: TerrainAtlasGpuProbeDraw, atlas: TerrainAtlasGpuProbeDraw, size = 32): TerrainAtlasGpuProbeResult | undefined {
    return this.renderer ? runTerrainAtlasGpuProbe(this.renderer, source, atlas, size) : undefined;
  }
  /** Test/development-only multi-variant atlas diagnostics. */
  runTerrainAtlasGpuProbeVariants(source: TerrainAtlasGpuProbeDraw, variants: readonly TerrainAtlasGpuProbeVariantDraw[], size = 32, beforeVariant?: TerrainAtlasGpuProbeBeforeVariant): TerrainAtlasGpuProbeVariantsResult | undefined {
    return this.renderer ? runTerrainAtlasGpuProbeVariants(this.renderer, source, variants, size, beforeVariant) : undefined;
  }

  hydrationDiagnostics(): ViewportHydrationDiagnostics {
    const currentGenerationRunning = this.hydrationPipeline.runningGenerationCount(this.hydrationPipeline.generation);
    const workCounts = this.hydrationPipeline.workCounts();
    const directVisibleBlockCount = this.yLayerProjection.directVisibleEntryCount();
    const visibleEntries = this.project && directVisibleBlockCount === undefined ? this.structureReconciliation.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedVisibleBlockCount = directVisibleBlockCount ?? visibleEntries.length;
    const queuedKeys = new Set(this.hydrationPipeline.regularJobs().filter((job) => job.token === this.hydrationPipeline.generation).map((job) => job.key));
    const orphanedHydrationSample: string[] = [];
    let orphanedHydrationCount = 0;
    if (this.visualProvider && this.project && directVisibleBlockCount === undefined) {
      for (const entry of visibleEntries) {
        const key = coordinateKey(entry.block.position);
        if (this.interiorCulling.has(key)) continue;
        const rendered = this.blockRepresentations.get(key);
      const isFinal = !!rendered && (rendered.terrainChunkKey !== undefined || rendered.surfaceFaceMemberships !== undefined || rendered.object !== undefined && rendered.object !== rendered.fallback || rendered.instanceBatchKey !== undefined || rendered.fallback?.userData['renderMode'] !== undefined);
        if (entry.block.kind === 'missing' || isFinal || queuedKeys.has(key) || this.hydrationPipeline.runningGenerationFor(key) === this.hydrationPipeline.generation) continue;
        if (this.hydrationPipeline.hasPendingSignature(key) || this.placeholderSignatures.has(key) || this.placeholderIndices.has(key) || !!rendered) {
          orphanedHydrationCount += 1;
          if (orphanedHydrationSample.length < 12) orphanedHydrationSample.push(key);
        }
      }
    }
    const runningByGeneration = Object.fromEntries([...this.hydrationPipeline.runningGenerationSnapshot()].map(([generation, count]) => [String(generation), count]));
    return {
      generation: this.hydrationPipeline.generation,
      queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(),
      running: this.hydrationRunning,
      globalRunning: this.hydrationRunning,
      currentGenerationRunning,
      staleRunning: Math.max(0, this.hydrationRunning - currentGenerationRunning),
      hydrationScheduled: this.hydrationPipeline.isScheduled(),
      hydrationTimerActive: this.hydrationPipeline.isTimerActive(),
      hydrationBatchBudget: this.hydrationPipeline.batchBudget,
      pendingSignatureCount: this.hydrationPipeline.pendingCount,
      placeholderSignatureCount: this.placeholderSignatures.size,
      placeholderVisualCount: this.placeholderIndices.size,
      renderedBlockCount: directVisibleBlockCount ?? this.visibleBlockRepresentationCount(),
      residentBlockCount: this.blockRepresentations.size,
      expectedVisibleBlockCount,
      runningOwnershipCount: this.hydrationPipeline.runningCount,
      runningByGeneration,
      orphanedHydrationCount,
      orphanedHydrationSample,
      completed: this.hydrationProgressState.completed,
      total: this.hydrationProgressState.total,
      scheduled: this.hydrationPipeline.isScheduled(),
      regularQueued: workCounts.regularQueued,
      providerRefreshQueued: workCounts.providerRefreshQueued,
      regularRunning: workCounts.regularRunning,
      providerRefreshRunning: workCounts.providerRefreshRunning,
      providerRefreshPlanning: this.providerRefreshPipeline.isPlanning,
      providerRefreshPlanningProcessed: this.providerRefreshPipeline.planningDiagnostics.processed,
      providerRefreshPlanningTotal: this.providerRefreshPipeline.planningDiagnostics.total,
      providerRefreshPlanningConsidered: this.providerRefreshPipeline.planningDiagnostics.considered,
      providerRefreshPlanningQueued: this.providerRefreshPipeline.planningDiagnostics.queued,
      providerRefreshPlanningMaxSliceMs: this.providerRefreshPipeline.planningDiagnostics.maxSliceMs,
      providerRefreshPlanningYields: this.providerRefreshPipeline.planningDiagnostics.yields,
      providerRefreshPlanningDurationMs: this.providerRefreshPipeline.planningDiagnostics.durationMs,
    };
  }

  onHydrationProgress(listener: (progress: ViewportHydrationProgress) => void): () => void {
    return this.hydrationPipeline.onProgress((progress) => listener(this.withProviderRefreshProgress(progress)));
  }

  onProjectionActivity(listener: (state: ViewportProjectionState) => void): () => void {
    return this.yLayerProjection.onActivity(listener);
  }

  onYLayerPrewarmTerminal(
    listener: (notification: YLayerPrewarmTerminalNotification) => void,
  ): () => void {
    if (this.disposed) return () => undefined;
    this.yLayerPrewarmListeners.add(listener);
    return () => this.yLayerPrewarmListeners.delete(listener);
  }

  private publishYLayerPrewarmTerminal(notification: YLayerPrewarmTerminalNotification): void {
    if (
      this.disposed ||
      this.project?.id !== notification.projectId ||
      this.project.blocks !== notification.blocks ||
      this.visualProvider !== notification.provider ||
      this.providerGeneration !== notification.providerGeneration
    )
      return;
    for (const listener of [...this.yLayerPrewarmListeners]) listener(notification);
  }

  projectionActivity(): ViewportProjectionState {
    return this.yLayerProjection.state;
  }

  private withProviderRefreshProgress(progress: HydrationProgressSnapshot): ViewportHydrationProgress {
    const workCounts = this.hydrationPipeline.workCounts();
    const work: ViewportHydrationWorkSnapshot = {
      blockQueued: workCounts.regularQueued + workCounts.providerRefreshQueued,
      blockRunning: this.hydrationPipeline.runningGenerationCount(this.hydrationPipeline.generation),
      decorationQueued: this.queuedDecorationHydrationJobs(),
      terrainPending: this.terrainPipeline.pendingGroupCount,
      fluidPending: this.fluidCoordinator.pendingCount,
      projectionPending: this.yLayerProjection.state.activity !== 'idle',
    };
    const renderingFailureCount = this.visualFailureKeys.size + this.fluidCoordinator.failedCount + this.fluidCoordinator.fallbackCount;
    const refresh = this.providerRefreshPipeline.progress;
    const baseFinalization = progress.finalization;
    if (!refresh && !this.providerRefreshPipeline.isPlanning) return { ...progress, providerRefreshPlanning: false, providerRefreshQueued: workCounts.providerRefreshQueued, providerRefreshRunning: workCounts.providerRefreshRunning, terrainPending: this.terrainPipeline.pendingGroupCount, work, renderingFailureCount };
    const refreshTotal = refresh?.total ?? 0;
    const refreshCompleted = refresh?.completed ?? 0;
    const baseFinalReady = baseFinalization?.finalReadyBlocks ?? progress.blocksCompleted;
    const expectedBlocks = baseFinalization?.expectedBlocks ?? progress.blocksTotal;
    const finalization: HydrationFinalizationSnapshot = {
      expectedBlocks,
      finalReadyBlocks: Math.max(0, baseFinalReady - refreshTotal + refreshCompleted),
      provisionalMissingBlocks: baseFinalization?.provisionalMissingBlocks ?? 0,
      permanentMissingBlocks: baseFinalization?.permanentMissingBlocks ?? 0,
      pendingBlocks: Math.max(0, (baseFinalization?.pendingBlocks ?? 0) + refreshTotal - refreshCompleted),
    };
    return {
      ...progress,
      lane: 'content',
      status: 'hydrating',
      completed: refreshCompleted,
      total: refreshTotal,
      blocksCompleted: refreshCompleted,
      blocksTotal: refreshTotal,
      decorationsCompleted: 0,
      decorationsTotal: 0,
      percent: refreshTotal ? refreshCompleted / refreshTotal * 100 : 0,
      providerRefreshPlanning: this.providerRefreshPipeline.isPlanning,
      providerRefreshQueued: this.hydrationPipeline.queuedProviderRefreshWork(),
      providerRefreshRunning: this.hydrationPipeline.workCounts().providerRefreshRunning,
      terrainPending: this.terrainPipeline.pendingGroupCount,
      work,
      renderingFailureCount,
      finalization,
      ...(refresh ? { providerRefreshCompleted: refresh.completed, providerRefreshTotal: refresh.total } : {}),
    };
  }

  private publishProviderRefreshProgress(): void {
    this.hydrationPipeline.publishProgress(this.hydrationPipeline.progressSnapshot());
  }

  private setEditingPlane(y: number | undefined, project: ProjectDocument | undefined): void {
    this.editingPlanePresenter.set(y, project);
  }

  /** Moves only the existing Y-layer guides; it never changes projection state. */
  setEditingPlanePreviewY(y: number): void {
    if (this.disposed) return;
    this.editingPlanePresenter.setPreviewY(y);
    this.scheduleRender();
  }

  clearGhost(): void {
    this.blockGhostPresenter.clear();
  }
  private clearDecorationGhost(): void {
    this.decorationGhostPresenter.clear();
  }
  private updateDecorationGhost(candidate: PlacedDecoration, status: DecorationPlacementPlan['status']): void {
    this.decorationGhostPresenter.update(candidate, status);
  }
  clearInput(): void { this.cameraInput.clearInput(); }
  /** Restores OrbitControls mappings when an editor gesture captured the parent host. */
  endEditorPointerGesture(): void { this.restoreTemporaryMouseButton(); }
  setGhostStatus(status: PlacementStatus): void {
    this.blockGhostPresenter.setStatus(status);
  }

  cameraState(): CameraState | undefined {
    return this.cameraFraming.cameraState();
  }

  restoreCamera(state: CameraState | undefined, projectId?: string): void {
    this.cameraFraming.restoreCamera(state, projectId);
  }

  fitStructure(): void {
    this.cameraFraming.fitStructure();
  }

  focusSelection(position: VoxelCoordinate | undefined): void {
    this.cameraFraming.focusSelection(position);
  }

  focusBounds(bounds: CameraBounds | undefined): void {
    this.cameraFraming.focusBounds(bounds);
  }

  resetCamera(): void {
    this.cameraFraming.resetCamera();
  }

  setCameraPreset(preset: CameraPreset): void {
    this.cameraFraming.setCameraPreset(preset);
  }

  private setProjectBounds(project: ProjectDocument | undefined): void {
    const size = project?.size ?? VIEWPORT_BOOTSTRAP_SIZE;
    const boundsKey = `${size.x},${size.y},${size.z}`;
    if (boundsKey === this.cachedBoundsKey) return;
    this.cachedBoundsKey = boundsKey;
    this.instrumentation.record('projectBoundsRebuilds');
    const bounds = projectGridBounds(size);
    this.projectGrid?.geometry.dispose();
    (this.projectGrid?.material as THREE.Material | undefined)?.dispose();
    if (this.projectGrid) this.scene.remove(this.projectGrid);
    this.projectGrid = createBoundedGrid(size.x, size.z, this.palette.grid);
    this.scene.add(this.projectGrid);
    this.boundsBox?.geometry.dispose();
    (this.boundsBox?.material as THREE.Material | undefined)?.dispose();
    if (this.boundsBox) this.scene.remove(this.boundsBox);
    this.boundsBox = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z), new THREE.Vector3(bounds.maxEdge.x, bounds.maxEdge.y, bounds.maxEdge.z)), this.palette.bounds);
    this.scene.add(this.boundsBox);
    if (!this.ground) {
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      this.ground.rotation.x = -Math.PI / 2;
      this.scene.add(this.ground);
    }
    this.ground.geometry.dispose();
    this.ground.geometry = new THREE.PlaneGeometry(size.x, size.z);
    this.ground.position.set(size.x / 2, 0, size.z / 2);
    this.ground.visible = true;
  }

  private updateSelection(selected: VoxelCoordinate | undefined, selectedPositions: readonly VoxelCoordinate[] | undefined, kind: string | undefined, count: number | undefined, aggregateBounds: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined, box: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined): void {
    this.selectionPresenter.update({ selected, selectedPositions, kind, count, aggregateBounds, box });
  }

  private updateActiveGroup(project: ProjectDocument | undefined, activeGroupId: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void {
    const committedIsolateKey = this.isolationPresentation.isActive() ? [...this.isolatedKeys].sort().join('|') : '';
    if (project === this.lastActiveGroupProject && activeGroupId === this.lastActiveGroupId && positions === this.lastActiveGroupPositions && committedIsolateKey === this.lastCommittedIsolateKey) return;
    this.lastActiveGroupProject = project;
    this.lastActiveGroupId = activeGroupId;
    this.lastActiveGroupPositions = positions;
    this.lastCommittedIsolateKey = committedIsolateKey;
    this.groupHighlightPresenter.updateActiveGroup(project, activeGroupId, positions);
  }

  private updateBlockUsageHighlight(id: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void {
    this.groupHighlightPresenter.updateUsage(id, positions);
  }

  private updateStructureBlockGuide(project: ProjectDocument | undefined, options: ViewportRenderOptions): void {
    const enabled = this.showStructureBlockGuide;
    const definition = this.definitionResolver?.('minecraft:structure_block');
    const key = project && enabled && this.visualProvider && definition
      ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${this.providerGeneration}|${options.structureBlockGuideRevision ?? 0}|${definition.sourceId ?? ''}`
      : `${project?.id ?? 'none'}|${enabled ? 'waiting' : 'hidden'}|${this.providerGeneration}`;
    const guidePosition = project ? structureBlockGuidePosition(projectGridBounds(project.size).min) : { x: 0, y: 0, z: 0 };
    this.structureBlockGuidePresenter.update(key, project, enabled, definition, this.visualProvider, guidePosition);
  }

  private clearStructureBlockGuide(): void {
    this.structureBlockGuidePresenter.clear();
  }

  private updateMovePreview(project: ProjectDocument | undefined, preview: GroupMovePreview | undefined): void {
    this.movePreviewPresenter.update(project, preview);
  }

  private updateGhost(target: VoxelCoordinate | undefined, project: ProjectDocument | undefined, active: ActiveBlock | undefined, status: PlacementStatus = 'invalid', plan?: PlacementPlan): void {
    this.blockGhostPresenter.update(target, project, active, status, plan);
  }

  private updateGhostModel(active: ActiveBlock | undefined, plan?: PlacementPlan): void {
    this.blockGhostPresenter.updateModel(active, plan);
  }

  private render(): void {
    if (!this.renderer) return;
    const now = performance.now();
    if (this.lastRenderTimestamp > 0) this.frameDurationMs = this.frameDurationMs === 0 ? now - this.lastRenderTimestamp : this.frameDurationMs * .8 + (now - this.lastRenderTimestamp) * .2;
    this.lastRenderTimestamp = now;
    const renderStarted = performance.now();
    this.instrumentation.record('actualSceneRenders');
    this.renderer.render(this.scene, this.camera);
    const elapsed = performance.now() - renderStarted;
    this.renderCpuMs = this.renderCpuMs === 0 ? elapsed : this.renderCpuMs * .8 + elapsed * .2;
    this.runtimeTrace?.recordDuration('renderer.render', elapsed);
    const info = this.renderer.info;
    this.lastRendererMetrics = { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points, geometries: info.memory.geometries, textures: info.memory.textures };
    this.renderCount++;
  }

}

function cameraYaw(camera: THREE.Camera): number {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  return THREE.MathUtils.radToDeg(Math.atan2(-forward.x, forward.z));
}

function toTraceVector(value: THREE.Vector3): TraceVector3 { return { x: value.x, y: value.y, z: value.z }; }
function familyFromReusableKey(key: string | undefined): string | undefined { const prefix = 'special-template-v1|'; return key?.startsWith(prefix) ? key.slice(prefix.length).split('|', 1)[0] : undefined; }
function applyBlockRenderRole(object: THREE.Object3D, role: 'normal' | 'reference', opacity: number): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const originals = Array.isArray(child.material) ? child.material : [child.material];
    if (child.userData['blockRoleOriginalMaterials'] === undefined) child.userData['blockRoleOriginalMaterials'] = originals;
    const materials = originals.map((material) => {
      if (material.userData['blockRoleMaterial'] === true) return material;
      const presentation = material.clone();
      presentation.userData['blockRoleMaterial'] = true;
      presentation.userData['blockRoleBaseTransparent'] = material.transparent;
      presentation.userData['blockRoleBaseOpacity'] = material.opacity;
      presentation.userData['blockRoleBaseDepthWrite'] = material.depthWrite;
      return presentation;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
    for (const material of materials) {
      const transparent = role === 'reference' || material.userData['blockRoleBaseTransparent'] === true;
      const nextOpacity = role === 'reference' ? opacity : Number(material.userData['blockRoleBaseOpacity'] ?? 1);
      const nextDepthWrite = Boolean(material.userData['blockRoleBaseDepthWrite'] ?? true);
      if (material.transparent !== transparent) material.transparent = transparent;
      material.opacity = nextOpacity;
      material.depthWrite = nextDepthWrite;
      material.needsUpdate = true;
    }
  });
}

export const mergeInstanceTemplateParts = mergeInstanceTemplatePartsFromCache;
export const compileInstanceTemplates = compileInstanceTemplatesFromCache;
