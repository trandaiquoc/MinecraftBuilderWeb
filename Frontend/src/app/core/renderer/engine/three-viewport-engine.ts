import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { FaceNormal, resolveAttachmentPlacement, projectGridBounds, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit, PlacementContext, PlacementStatus } from '../../editor/placement/placement';
import { planYLayerProjectionDelta, type LayerBlockIndex } from '../../editor/viewport/y-layer';
import { isBlockVisibleForViewport, visibleBlockEntries } from '../../editor/viewport/visible-blocks';
import { CameraBounds, CameraPreset, CameraState, CameraVector, projectCameraBounds } from '../../editor/camera/camera';
import { isBlockVisible } from '../../editor/groups/group-membership';
import { isDecorationVisible, decorationHasGroup } from '../../editor/groups/decoration-membership';
import { GroupMovePreview } from '../../editor/groups/group.service';
import { ViewportThemePalette, viewportThemePalette } from './viewport-theme';
import { BlockVisualProvider, VisualCacheStats } from '../geometry/block-model-geometry';
import type { BlockVisualResult } from '../geometry/block-model-geometry';
import type { ResolvedBlockModel } from '../../blocks/resolver';
import type { ResolvedItemVisual } from '../visuals/item-visual-resolver';
import type { NormalizedSpecialVisualDescriptor } from '../visuals/special-block-visuals';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationPlacementPlan, decorationAabb, facingFromNormal, planDecorationPlacement } from '../../decorations/placement/decoration-placement';
import { applyDecorationItemPreview, createDecorationVisual, DecorationTextureCache } from '../visuals/decoration-visuals';
import type { ItemStackData } from '../../items/item-stack.types';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import { MouseAction } from '../../editor/input/mouse-bindings';
import { RendererDiagnostics, RendererCounters } from './renderer-diagnostics';
import { normalizeBlockBrightness, viewportLightingForBrightness, ViewportLighting } from './viewport-lighting';
import { applyBlockBrightnessToMaterial, applyBlockBrightnessToObject, applyStructureGuideBrightnessToObject, setBlockBrightnessBaseColor, STRUCTURE_GUIDE_BRIGHTNESS } from './block-brightness';
import { FaceLockedSelectionPlane, FreeSpaceSelectionPlane, freeSpaceSelectionPlane } from '../../editor/selection/selection';
import { structureBlockGuidePosition } from './structure-block-guide';
import { coordinateNeighbors, hasConfirmedOpaqueNeighbors } from '../visibility/interior-occlusion';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { exposedFaceDirections, SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { ProjectBlockSpatialIndex } from '../../domain/project-block-spatial-index';
import { fluidCoordinateFromHit } from '../interaction/viewport-raycast-controller';
import { compileInstanceTemplates as compileInstanceTemplatesFromCache, mergeInstanceTemplateParts as mergeInstanceTemplatePartsFromCache } from '../batching/instance-template-cache';
import type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
import { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import type { PlaceholderBatch } from '../batching/placeholder-batch-renderer';
import { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import { extractSurfaceFaceTemplates } from '../batching/surface-template-extractor';
import type { InstanceBatch } from '../batching/instance-batch-renderer';
import { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceBatch, SurfaceFaceMembership, SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { collectStaticModelDiagnostics, type StaticModelDiagnosticSnapshot } from '../diagnostics/static-model-diagnostics';
import { RenderRegionPolicy } from '../batching/render-region-policy';
import { RenderScheduler } from '../scheduling/render-scheduler';
import { ViewportHostLifecycleAdapter } from '../scheduling/viewport-host-lifecycle';
import { ViewportCameraInputController, cancelViewportFrame, requestViewportFrame } from '../scheduling/viewport-camera-input-controller';
import { ViewportCameraFramingController } from '../scheduling/viewport-camera-framing-controller';
import { HydrationScheduler } from '../scheduling/hydration-scheduler';
import { HydrationWorkCoordinator } from '../scheduling/hydration-work-coordinator';
import { HydrationProgressTracker } from '../scheduling/hydration-progress-tracker';
import type { HydrationBlockScopeDelta, HydrationFinalizationSnapshot, HydrationLane, HydrationProgressSnapshot } from '../scheduling/hydration-progress-tracker';
import { adoptCommittedHydrationKeys } from '../hydration/hydration-generation-adoption';
import { ProviderRefreshCoordinator } from '../provider/provider-refresh-coordinator';
import { ProviderRefreshPlanner, type ProviderRefreshPlannerProgress } from '../provider/provider-refresh-planner';
import { resolvePlacementPreview } from '../interaction/viewport-hit-resolver';
import { ChunkSurfaceRenderer, type TerrainApplyResult, type TerrainBlockChange, type TerrainOwnershipEvidence, type TerrainSurfaceRecord } from '../terrain/chunk-surface-renderer';
import type { CompiledTerrainChunk } from '../terrain/chunk-surface-mesher';
import { isCompiledTerrainEntry, isTerrainRenderableEntry } from '../terrain/terrain-classifier';
import { groupTerrainCandidates } from '../terrain/terrain-hydration-coordinator';
import { blockMutationHint, type ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import type { TerrainAtlasMode } from '../terrain/atlas/terrain-texture-atlas';
import { runTerrainAtlasGpuProbe, runTerrainAtlasGpuProbeVariants, type TerrainAtlasGpuProbeBeforeVariant, type TerrainAtlasGpuProbeDraw, type TerrainAtlasGpuProbeResult, type TerrainAtlasGpuProbeVariantDraw, type TerrainAtlasGpuProbeVariantsResult } from '../terrain/atlas/terrain-atlas-gpu-probe';
import { nextCameraDistanceFromWheel, wheelMagnitude, type WheelZoomAction } from '../scheduling/camera-wheel-zoom';
import { cameraMovementScale, effectiveCameraMovementSpeed } from '../scheduling/camera-movement-speed';
import type { ViewportRuntimeTrace, ViewportTraceMetadata, ViewportTraceSample, TraceVector3 } from '../diagnostics/viewport-runtime-trace';
import { collectOwnershipDiagnostics, collectVisibleSceneDiagnostics } from '../diagnostics/renderer-diagnostics-collector';
import { collectInstanceOwnershipViolations, collectInstanceOwnershipViolationsForKey } from '../diagnostics/instance-ownership-diagnostics';
import { captureViewportGhostSceneSnapshot } from '../diagnostics/viewport-snapshot-diagnostics';
import type { ViewportControlConfiguration, ViewportDiagnostics, ViewportEmptyTransitionDiagnostics, ViewportGhostSceneSnapshot, ViewportHydrationDiagnostics, ViewportInstanceOwnershipEvent, ViewportOwnershipDiagnostics, ViewportPerformanceEvidence, ViewportProjectionActivity, ViewportProjectionState, ViewportRuntimeDiagnostics, ViewportSuspiciousVisualDiagnostic, ViewportVisibleMeshDiagnostic, ViewportVoxelOwnershipDiagnostic, VisibleSceneDiagnostics } from '../diagnostics/viewport-diagnostics-contracts';
export type { ViewportControlConfiguration, ViewportDiagnostics, ViewportEmptyTransitionDiagnostics, ViewportGhostSceneSnapshot, ViewportHydrationDiagnostics, ViewportInstanceOwnershipEvent, ViewportOwnershipDiagnostics, ViewportPerformanceEvidence, ViewportProjectionActivity, ViewportProjectionState, ViewportRuntimeDiagnostics, ViewportSuspiciousVisualDiagnostic, ViewportVisibleMeshDiagnostic, ViewportVoxelOwnershipDiagnostic, VisibleSceneDiagnostics } from '../diagnostics/viewport-diagnostics-contracts';
import { collectSceneRenderCost } from '../diagnostics/scene-render-cost';
import { collectPerformanceEvidence } from '../diagnostics/viewport-performance-evidence';
import { FluidChunkRenderer } from '../fluids/fluid-chunk-renderer';
import { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import { fluidChunkKey } from '../fluids/fluid-mesh-core';
import { planLocalRenderDelta } from '../mutations/local-render-delta';
import { applyLocalFluidDelta } from '../mutations/local-fluid-render-delta';
import type { FluidWorldLookup, ResolvedFluidRenderState } from '../fluids/fluid-state';
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
import { blockCoordinateFromHit, cameraActionMovementDelta, canonicalRenderOptions, chunkKey, compareEmptySnapshots, createBoundedGrid, decorationSignature, DETAILED_SELECTION_OUTLINE_LIMIT, emptyResolvedModel, isHorizontalDirection, isolateKey, renderFilterKey, stableChunkBounds, stableValue, surfaceFaceDirectionFromHit, surfaceNeighbor, surfaceFaceNormal, unitVoxelEnvelope, vectorValue, boundsOfPositions, blockRenderSignature } from './viewport-render-helpers';
export { cameraMovementDirection, cameraMovementDelta, blockCoordinateFromHit, surfaceFaceDirectionFromHit, surfaceFaceNormal } from './viewport-render-helpers';
import type { ViewportHit, ViewportHoverListener, ViewportRenderOptions, ViewportEngineOptions, ViewportHydrationStatus, ViewportHydrationProgress, PlacementPlanProvider } from './viewport-engine-contracts';
type HydrationCancellationReason = 'structure-sync-key-changed' | 'project-identity-changed' | 'in-place-project-mutation' | 'dispose';
export type { ViewportHit, ViewportHoverListener, ViewportRenderOptions, ViewportEngineOptions, ViewportHydrationStatus, ViewportHydrationProgress } from './viewport-engine-contracts';


interface RenderedBlockEntry {
  readonly key: string;
  block: ProjectDocument['blocks'][number];
  readonly signature: string;
  readonly role: 'normal' | 'reference' | 'missing';
  fallback?: THREE.Mesh;
  revision: number;
  object?: THREE.Object3D;
  instanceBatchKey?: string;
  instanceIndex?: number;
  surfaceFaceMemberships?: readonly SurfaceFaceMembership[];
  surfaceExposedFaceCount?: number;
  surfaceNeighborFacesCulled?: number;
  terrainChunkKey?: string;
  /** Provider that owns the currently committed visual/resources. */
  provider?: BlockVisualProvider;
  reusableVisualKey?: string;
  staticModelAttempted?: boolean;
  staticModelDecision?: ReturnType<StaticModelBatchRenderer['decisionFor']>;
  staticModelFamily?: string;
  fluidChunkKey?: string;
  fluidFallback?: boolean;
}

interface RenderedDecorationEntry {
  readonly id: string;
  decoration: PlacedDecoration;
  readonly signature: string;
  readonly object: THREE.Object3D;
}

interface BlockHydrationJob {
  readonly token: number;
  readonly projectionRevision: number;
  readonly key: string;
  readonly block: ProjectDocument['blocks'][number];
  readonly signature: string;
  readonly role: RenderedBlockEntry['role'];
  readonly worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined };
  readonly options: ViewportRenderOptions;
  readonly allowInstancing: boolean;
  readonly surfaceFastPathEligible: boolean;
  readonly surfaceVisibleEntries: ReadonlyMap<string, VisibleBlockEntry>;
  readonly providerRefresh?: boolean;
  readonly providerRefreshGeneration?: number;
}

interface ProviderRefreshCandidate {
  readonly key: string;
  readonly entry: RenderedBlockEntry;
  readonly visibleEntry: VisibleBlockEntry;
  readonly previousProvider: BlockVisualProvider;
  readonly nextProvider: BlockVisualProvider;
  readonly worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined };
  readonly visible: ReadonlyMap<string, VisibleBlockEntry>;
}
interface DecorationHydrationJob {
  readonly token: number;
  readonly id: string;
  readonly decoration: PlacedDecoration;
  readonly signature: string;
}

interface TerrainHydrationResult extends BlockVisualResult {
  readonly terrainTemplates?: readonly SurfaceFaceTemplate[];
}

type VisibleBlockEntry = { readonly block: ProjectDocument['blocks'][number]; readonly role: 'normal' | 'reference' | 'missing'; readonly signature: string; readonly occlusionClass: OcclusionClass };
interface TerrainHydrationCandidate {
  readonly key: string;
  readonly next: VisibleBlockEntry;
  readonly reusableKey: string;
  readonly worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined };
  readonly provider: BlockVisualProvider;
}
export type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
export type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
export const VIEWPORT_BOOTSTRAP_SIZE: ProjectSize = { x: 16, y: 16, z: 16 };
export const VIEWPORT_HYDRATION_BATCH_SIZE = 96;
export const VIEWPORT_VISUAL_CONCURRENCY = 6;
export const VIEWPORT_INSTANCE_CHUNK_SIZE = 16;
/** Presentation regions reduce far-view batch fragmentation while preserving culling locality. */
export const VIEWPORT_RENDER_REGION_SIZE = 32;
export const VIEWPORT_INSTANCE_THRESHOLD = 256;
export const VIEWPORT_HYDRATION_SYNC_BUDGET_MS = 7;
export const VIEWPORT_HYDRATION_MAX_JOBS_PER_BATCH = 256;
export const VIEWPORT_INTERACTIVE_HYDRATION_SYNC_BUDGET_MS = 1.5;
export const VIEWPORT_INTERACTIVE_HYDRATION_MAX_JOBS_PER_BATCH = 8;
export const VIEWPORT_CAMERA_IDLE_GRACE_MS = 160;
export const VIEWPORT_HYDRATION_HUD_WORK_THRESHOLD = 32;
export const VIEWPORT_HYDRATION_HUD_DELAY_MS = 180;
const Y_LAYER_PROJECTION_SLICE_BLOCK_LIMIT = 256;

/** Adds voxel/world translation without replacing a special visual's local vanilla transform. */
export function translateVisualToVoxel(object: THREE.Object3D, position: VoxelCoordinate): void {
  object.position.set(object.position.x + position.x, object.position.y + position.y, object.position.z + position.z);
}

export function viewportRenderSize(width: number, height: number): { readonly width: number; readonly height: number } {
  return { width: Math.max(Math.round(width), 1), height: Math.max(Math.round(height), 1) };
}

export class ThreeViewportEngine {
  private readonly scene = new THREE.Scene();
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
    onFailed: () => { this.requestedIsolatedKeys.clear(); this.scheduleRender(); },
  });
  private readonly structureBlockGuidePresenter = new StructureBlockGuidePresenter({ scheduleRender: () => this.scheduleRender(), currentProvider: () => this.visualProvider });
  private get structureBlockGuideGroup(): THREE.Group { return this.structureBlockGuidePresenter.group; }
  private readonly blockGhostPresenter = new BlockGhostPresenter(this.scene, viewportThemePalette('dark'), {
    provider: () => this.visualProvider,
    providerGeneration: () => this.providerGeneration,
    blockLookup: () => this.spatialIndex ? (position) => this.spatialIndex?.get(position) : undefined,
    record: (name) => this.instrumentation.record(name),
    scheduleRender: () => this.scheduleRender(),
  });
  private get ghost(): THREE.Mesh { return this.blockGhostPresenter.ghost; }
  private readonly selectionPresenter = new SelectionOverlayPresenter(this.scene, viewportThemePalette('dark'), DETAILED_SELECTION_OUTLINE_LIMIT);
  private readonly movePreviewPresenter = new MovePreviewPresenter(viewportThemePalette('dark'), {
    getBlock: (position) => this.spatialIndex?.get(position),
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
    selected: (id) => { const entry = this.renderedDecorations.get(id); return entry ? { object: entry.object } : undefined; },
  });
  private get decorationSelectionGroup(): THREE.Group { return this.decorationSelectionPresenter.group; }
  private readonly groupHighlightPresenter = new GroupHighlightPresenter(this.scene, viewportThemePalette('dark'), {
    visibleBlock: (key) => { const entry = this.cachedVisibleMap.get(key); return entry ? { block: entry.block } : undefined; },
    blockAt: (position) => this.spatialIndex?.get(position),
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
    chunkKey,
    chunkBounds: (chunk) => stableChunkBounds(chunk, unitVoxelEnvelope()),
    recordBounds: () => this.instrumentation.record('instancedBoundsComputations'),
  });
  private get placeholderBatches(): Map<string, PlaceholderBatch> { return this.placeholderRenderer.batches; }
  private get placeholderIndices(): Map<string, { readonly batchKey: string; readonly index: number }> { return this.placeholderRenderer.indices; }
  private readonly renderScheduler = new RenderScheduler(requestViewportFrame, cancelViewportFrame, {
    onInvalidation: () => this.instrumentation.record('renderInvalidations'),
    onCoalesced: () => { this.instrumentation.record('renderInvalidationsCoalesced'); this.instrumentation.record('coalescedRenderRequests'); },
  });
  private readonly hydrationScheduler = new HydrationScheduler<never>();
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
  private readonly editingPlanePresenter = new EditingPlanePresenter(this.scene, createBoundedGrid, viewportThemePalette('dark'));
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
  private spatialIndex?: ProjectBlockSpatialIndex;
  private spatialIndexProject?: ProjectDocument;
  private spatialIndexBlocksReference?: readonly ProjectDocument['blocks'][number][];
  private cachedVisibleEntries: VisibleBlockEntry[] = [];
  private layerIndex?: LayerBlockIndex;
  private cachedVisibleMap = new Map<string, VisibleBlockEntry>();
  private readonly cachedVisibleIndices = new Map<string, number>();
  private cachedVisibleKey = '';
  private cachedVisibleProject?: ProjectDocument;
  private committedProjection?: { readonly project: ProjectDocument; readonly options: ViewportRenderOptions };
  private pendingProjection?: { readonly project: ProjectDocument; readonly options: ViewportRenderOptions };
  private projectionFrame?: number;
  private projectionRevision = 0;
  private projectionWorkToken = 0;
  private projectionActivityState: ViewportProjectionActivity = 'idle';
  private projectionActivityRevision = 0;
  private readonly projectionActivityListeners = new Set<(state: ViewportProjectionState) => void>();
  private readonly projectionPendingKeys = new Set<string>();
  private projectionSettlementTimer?: ReturnType<typeof setTimeout>;
  /** Layers touched by a cooperative job that has not reached a coherent projection yet. */
  private readonly inFlightProjectionLayers = new Set<number>();
  private readonly projectionKeyRevisions = new Map<string, number>();
  private structuralSpecialVisualIds = new Set<string>();
  private cachedBoundsKey = '';
  private observedSpatialIndexLookups = 0;
  private lastActiveGroupProject?: ProjectDocument;
  private lastActiveGroupId?: string;
  private lastActiveGroupPositions?: readonly VoxelCoordinate[];
  private lastIsolatedGroupId?: string;
  private lastIsolatedGroupPositions?: readonly VoxelCoordinate[];
  private isolatedKeys = new Set<string>();
  private requestedIsolatedKeys = new Set<string>();
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
  private decorationItemResources?: (itemId: string) => readonly string[];
  private decorationItemVisual?: (itemId: string) => ResolvedItemVisual | undefined;
  private decorationItemPreview?: (item: ItemStackData) => Promise<string | undefined>;
  private paintingResource?: (variantId: string) => string | undefined;
  private specialVisualResolver?: (blockId: string) => ContentSpecialVisualDescriptor | undefined;
  private specialVisualRevision?: number;
  private specialVisualSignature = '';
  private definitionResolver?: (blockId: string) => BlockDefinition | undefined;
  private decorationTextureCache?: DecorationTextureCache;
  private placementPlanProvider?: PlacementPlanProvider;
  private get ghostGeneration(): number { return this.blockGhostPresenter.generation; }
  private disposed = false;
  private suspended = false;
  private suspendedNeedsRefresh = false;
  private deferredProviderRefresh?: { readonly previous: BlockVisualProvider; readonly next: BlockVisualProvider };
  private renderCount = 0;
  private canvasSize = { width: 0, height: 0 };
  private themeApplied = false;
  private controlConfiguration: ViewportControlConfiguration = { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 9 };
  private readonly cameraFraming = new ViewportCameraFramingController(this.camera, () => this.controls, {
    project: () => this.project,
    renderOptions: () => this.renderOptions,
    scheduleRender: () => this.scheduleRender(),
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
        if (this.queuedBlockHydrationJobs() || this.queuedDecorationHydrationJobs()) this.scheduleHydrationPump();
      },
      onMovementFrame: (actions, delta) => this.moveCamera(actions, delta),
      onWheel: (action, deltaY, deltaMode) => this.applyWheelZoom(action, deltaY, deltaMode),
    },
    this.controlConfiguration,
    VIEWPORT_CAMERA_IDLE_GRACE_MS,
  );
  private readonly renderedBlocks = new Map<string, RenderedBlockEntry>();
  private readonly hydrationWork = new HydrationWorkCoordinator<BlockHydrationJob>({ concurrency: VIEWPORT_VISUAL_CONCURRENCY, regularReservedCapacity: 4, providerRefreshCapacity: 2 });
  private get hydrationRunning(): number { return this.hydrationWork.runningTotal(); }
  private readonly providerLifecycle = new ProviderRefreshCoordinator<BlockVisualProvider>();
  private readonly pendingTerrainTemplates = new Map<string, Promise<readonly SurfaceFaceTemplate[] | undefined>>();
  private readonly renderRegionPolicy = new RenderRegionPolicy(VIEWPORT_RENDER_REGION_SIZE);
  private readonly instanceRenderer: StaticModelBatchRenderer;
  private readonly fluidCoordinator: FluidRenderCoordinator;
  private get instanceBatches(): Map<string, InstanceBatch> { return this.instanceRenderer.batches; }
  private get instanceOwnershipIndex(): Map<string, { readonly batchKey: string; readonly index: number }> { return this.instanceRenderer.ownershipIndex; }
  /** Compatibility view for diagnostics/tests; ownership remains in the batching module. */
  private get reusableInstanceTemplates(): ReadonlyMap<string, CompiledInstanceTemplates> { return this.instanceRenderer.templateCacheView(); }
  private readonly renderedDecorations = new Map<string, RenderedDecorationEntry>();
  private staticModelDiagnosticsCache?: StaticModelDiagnosticSnapshot;
  private staticModelDiagnosticsBuildCount = 0;
  private readonly surfaceRenderer = new SurfaceFaceBatchRenderer({
    blocksGroup: this.blocksGroup,
    capacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 3,
    chunkKey,
    stableBounds: stableChunkBounds,
    regionPolicy: this.renderRegionPolicy,
    unitEnvelope: unitVoxelEnvelope,
    record: (name, delta = 1) => this.instrumentation.record(name as keyof RendererCounters, delta),
    getEntry: (key) => this.renderedBlocks.get(key),
  });
  private get surfaceFaceBatches(): Map<string, SurfaceFaceBatch> { return this.surfaceRenderer.batches; }
  private get surfaceFaceOwnership(): Map<string, SurfaceFaceMembership[]> { return this.surfaceRenderer.ownership; }
  private get surfaceTemplateCache(): Map<string, readonly SurfaceFaceTemplate[]> { return this.surfaceRenderer.templateCache; }
  private readonly terrainRenderer: ChunkSurfaceRenderer;
  readonly terrainAtlasMode: TerrainAtlasMode;
  private readonly instanceTranslationMatrix = new THREE.Matrix4();
  private readonly hydrationProgressTracker = new HydrationProgressTracker(
    () => this.instrumentation.record('hydrationProgressRegressions'),
    (progress) => this.runtimeTrace?.record('hydration-progress', { lane: progress.lane ?? 'structural', generation: progress.generation, status: progress.status, completed: progress.completed, total: progress.total, blocksCompleted: progress.blocksCompleted, blocksTotal: progress.blocksTotal, decorationsCompleted: progress.decorationsCompleted, decorationsTotal: progress.decorationsTotal, percent: progress.percent }),
  );
  private hemisphereLight?: THREE.HemisphereLight;
  private keyLight?: THREE.DirectionalLight;
  private blockBrightness = 3;
  private structureSyncKey = '';
  private syncedProject?: ProjectDocument;
  private syncedBlockCount?: number;
  private syncedBlocksReference?: readonly ProjectDocument['blocks'][number][];
  private decorationSyncKey = '';
  private syncedDecorationProject?: ProjectDocument;
  private decorationRevision = 0;
  private get providerGeneration(): number { return this.providerLifecycle.generation; }
  private get hydrationProgressState(): ViewportHydrationProgress { return this.hydrationProgressTracker.snapshot(); }
  private providerRefreshProgress?: { total: number; completed: number; startedAt: number };
  private providerRefreshPlanning = false;
  private providerRefreshGeneration = 0;
  private readonly providerRefreshPlanner = new ProviderRefreshPlanner<ProviderRefreshCandidate, BlockHydrationJob>();
  private providerRefreshPlanningDiagnostics = { processed: 0, total: 0, considered: 0, queued: 0, maxSliceMs: 0, yields: 0, durationMs: 0 };
  private providerStats?: VisualCacheStats;
  private hydrationGeneration = 0;
  private readonly pendingHydrationSignatures = new Map<string, string>();
  /** Ownership signatures for final fallback placeholders (no async job). */
  private readonly placeholderSignatures = new Map<string, string>();
  private readonly runningHydrationKeys = new Map<string, number>();
  private readonly runningHydrationRevisions = new Map<string, number>();
  private readonly runningHydrationSignatures = new Map<string, string>();
  private decorationHydrationQueue: DecorationHydrationJob[] = [];
  private decorationHydrationQueueHead = 0;
  private readonly pendingDecorationSignatures = new Map<string, string>();
  private terrainHydrationPending = 0;
  private readonly hydrationRunningByGeneration = new Map<number, number>();
  private hydrationBatchBudget = 0;
  private hydrationBatchDeadline = 0;
  private hydrationTimer?: ReturnType<typeof setTimeout>;
  private hydrationScheduled = false;
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
      const key = coordinateKey(position); const entry = this.cachedVisibleMap.get(key);
      if (!entry || this.culledBlockKeys.has(key) || this.isolationPresentation.isActive() && !this.isolatedKeys.has(key)) return 'skip';
      return entry.role === 'normal' && entry.occlusionClass === 'opaque-full-cube' ? 'hit' : 'fallback';
    },
    objectsForVoxel: (position) => {
      const key = coordinateKey(position);
      if (this.isolationPresentation.isActive() && !this.isolatedKeys.has(key)) return [];
      const entry = this.renderedBlocks.get(key);
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
  private fallbackGeometryCounted = false;
  private readonly fallbackMaterialRoles = new Set<string>();
  private runtimeDiagnosticsEnabled = false;
  private runtimeTrace?: ViewportRuntimeTrace;
  private runtimeObservedProjectBlockCount = 0;
  private readonly emptyTransitionSnapshots: ViewportGhostSceneSnapshot[] = [];
  private readonly instanceOwnershipTrace: ViewportInstanceOwnershipEvent[] = [];
  private readonly culledBlockKeys = new Set<string>();
  private readonly previousVisibleBlockPositions = new Map<string, VoxelCoordinate>();
  private missingBlocksTerminal = false;

  constructor(readonly instrumentation = new RendererDiagnostics(), options: ViewportEngineOptions = {}) {
    this.terrainAtlasMode = options.terrainAtlasMode ?? 'on';
    this.fluidCoordinator = new FluidRenderCoordinator(new FluidChunkRenderer(this.blocksGroup), {
      onTerminal: (generation, keys) => {
        if (generation !== this.hydrationGeneration || this.disposed) return;
        this.completeHydrationBatch(generation, keys);
        this.releaseUnusedRetiredProviders();
        this.invalidateStaticModelDiagnostics();
        this.scheduleRender();
      },
    });
    this.terrainRenderer = new ChunkSurfaceRenderer({
      blocksGroup: this.blocksGroup,
      terrainAtlasMode: this.terrainAtlasMode,
      shouldCommitChunk: options.terrainShouldCommitChunk,
      terrainGeneration: () => this.hydrationGeneration,
      providerGeneration: () => this.providerGeneration,
      isCameraInteracting: () => this.isCameraInteracting(),
      onAsyncApply: (records, result) => {
        this.commitTerrainRecords(records, result);
        if (result.failedKeys.length) this.enqueueFailedTerrainKeys(result.failedKeys);
        this.scheduleRender();
        if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
      },
      record: (name, delta = 1) => this.instrumentation.record(name as keyof RendererCounters, delta),
      onTiming: (stage, durationMs) => this.runtimeTrace?.recordDuration(stage, durationMs),
      isTimingEnabled: () => !!this.runtimeTrace?.isActive,
    });
    this.instanceRenderer = new StaticModelBatchRenderer({
      blocksGroup: this.blocksGroup,
      capacity: VIEWPORT_INSTANCE_CHUNK_SIZE ** 3,
      chunkKey,
      stableBounds: stableChunkBounds,
      regionPolicy: this.renderRegionPolicy,
      instrumentation,
      getEntry: (key) => this.renderedBlocks.get(key),
      setEntryObject: (key, batchKey, index, object) => {
        const entry = this.renderedBlocks.get(key);
        if (!entry) return;
        entry.instanceBatchKey = batchKey;
        entry.instanceIndex = index;
        if (object) entry.object = object;
      },
      trace: (phase, key, source) => this.traceInstanceOwnership(phase, key, source),
    });
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
    this.suspended = true;
    this.cancelPendingHover(true);
    this.endEditorPointerGesture();
    this.clearInput();
    this.cameraGestureInProgress = false;
    this.cameraMovementInProgress = false;
    this.cameraRenderPending = false;
    this.cancelPendingProjection();
    this.renderScheduler.cancel();
    this.hydrationScheduler.cancel();
    this.hydrationScheduled = false;
    this.hydrationTimer = undefined;
    this.providerRefreshPlanner.cancel();
    this.providerRefreshPlanning = false;
    this.providerRefreshProgress = undefined;
    this.providerRefreshGeneration += 1;
  }

  /** Resumes a retained viewport and lets its owner perform the current-state sync. */
  resume(): void {
    if (this.disposed || !this.suspended) return;
    this.suspended = false;
    if (this.suspendedNeedsRefresh) {
      this.structureSyncKey = '';
      this.decorationSyncKey = '';
      this.suspendedNeedsRefresh = false;
    }
    const deferred = this.deferredProviderRefresh;
    this.deferredProviderRefresh = undefined;
    if (deferred && this.project && this.visualProvider === deferred.next) this.queueProviderRefresh(deferred.previous, deferred.next);
    this.resize();
    if (this.queuedBlockHydrationJobs() || this.queuedDecorationHydrationJobs()) this.scheduleHydrationPump();
    this.scheduleRender();
  }

  get isSuspended(): boolean { return this.suspended; }

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
    for (const entry of this.renderedBlocks.values()) {
      if (entry.role !== 'reference' || !entry.object || entry.instanceBatchKey !== undefined || entry.terrainChunkKey !== undefined || entry.surfaceFaceMemberships !== undefined) continue;
      applyReferenceOpacityToObject(entry.object, opacity);
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

  private applyWheelZoom(action: WheelZoomAction, deltaY: number, deltaMode: number): void {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = offset.length();
    const nextDistance = nextCameraDistanceFromWheel({
      distance,
      deltaY,
      deltaMode,
      action,
      sensitivity: this.controlConfiguration.zoomSensitivity,
      minDistance: this.controls.minDistance,
      maxDistance: this.controls.maxDistance,
    });
    this.runtimeTrace?.record('wheel', { action, deltaY, deltaMode, magnitude: wheelMagnitude(deltaY, deltaMode), sensitivity: this.controlConfiguration.zoomSensitivity, distanceBefore: distance, distanceAfter: nextDistance });
    if (distance > 0) this.camera.position.copy(this.controls.target).add(offset.normalize().multiplyScalar(nextDistance));
    this.controls.update();
    this.requestCameraRender();
  }

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
    const previousProvider = this.visualProvider;
    const previousProviderGeneration = this.providerGeneration;
    const previousFluidEntries = !provider
      ? [...this.renderedBlocks.values()].filter((entry) => entry.fluidChunkKey !== undefined)
      : [];
    this.visualProvider = provider;
    this.providerLifecycle.transition(previousProvider, provider);
    this.fluidCoordinator.setProvider(provider?.fluidRenderResolver && provider.fluidTexture ? {
      contractKey: provider.fluidRenderContractKey ?? `provider-object-v1|${this.providerGeneration}`,
      resolver: provider.fluidRenderResolver,
      texture: provider.fluidTexture.bind(provider),
    } : undefined, provider);
    if (!provider) for (const entry of previousFluidEntries) {
      entry.fluidChunkKey = undefined;
      entry.fluidFallback = true;
      entry.provider = undefined;
      this.ensureFallbackVisual(entry);
    }
    this.providerStats = undefined;
    this.runtimeTrace?.record('provider-generation', { previousProviderGeneration, providerGeneration: this.providerGeneration, hasProvider: !!provider, previousProvider: !!previousProvider });
    this.specialVisualSignature = '';
    this.ghostModelKey = '';
    // A provider becoming available for the first time must promote the
    // placeholder-only scene. A handoff between live providers is different:
    // existing terrain remains authoritative until a changed visual commits.
    const requiresStructureResync = !previousProvider || !provider;
    if (requiresStructureResync) this.structureSyncKey = '';
    if (provider) this.syncSpecialVisualDescriptors();
    if (previousProvider && provider) {
      if (this.suspended) this.deferredProviderRefresh = { previous: this.deferredProviderRefresh?.previous ?? previousProvider, next: provider };
      else this.queueProviderRefresh(previousProvider, provider);
    }
    const hadVisibleCache = this.cachedVisibleProject === this.project;
    if (this.suspended) {
      this.suspendedNeedsRefresh = true;
      return;
    }
    this.update(this.project, this.activeBlock, this.renderOptions);
    if (hadVisibleCache && !requiresStructureResync) this.resyncCurrentFluidProvider();
    if (!provider && previousFluidEntries.length) this.completeHydrationBatch(this.hydrationGeneration, previousFluidEntries.map((entry) => entry.key));
    this.releaseUnusedRetiredProviders();
  }

  /** Marks unresolved Missing blocks as terminal fallbacks once source restore is terminal. */
  setMissingBlocksTerminal(terminal: boolean): void {
    if (this.missingBlocksTerminal === terminal) return;
    this.missingBlocksTerminal = terminal;
    for (const entry of this.cachedVisibleEntries) {
      if (entry.block.kind === 'missing') this.hydrationProgressTracker.syncMissingBlockState(coordinateKey(entry.block.position), terminal ? 'permanent' : 'provisional');
    }
    this.hydrationProgressTracker.refresh();
    this.scheduleRender();
  }

  private resyncCurrentFluidProvider(): void {
    if (!this.project) return;
    const visible = this.cachedVisibleProject === this.project && this.cachedVisibleKey === renderFilterKey(this.renderOptions)
      ? this.cachedVisibleEntries
      : this.visibleBlocks(this.project, this.renderOptions);
    const worldContext = this.fluidWorldContext();
    this.syncFluidVisuals(visible, worldContext);
  }

  private fluidWorldContext(): FluidWorldLookup {
    return {
      getBlock: (position) => this.spatialIndex?.get(position),
      getDefinition: (blockId) => this.definitionResolver?.(blockId),
      getOcclusionClass: (block) => this.visualProvider?.occlusionClass?.(block) ?? 'unknown',
    };
  }
  setSpecialVisualDescriptorResolver(resolver: ((blockId: string) => ContentSpecialVisualDescriptor | undefined) | undefined, revision?: number): void {
    if (resolver === this.specialVisualResolver && revision === this.specialVisualRevision) return;
    this.specialVisualResolver = resolver;
    this.specialVisualRevision = revision;
    if (this.suspended) {
      this.suspendedNeedsRefresh = true;
      return;
    }
    if (this.syncSpecialVisualDescriptors()) {
      if (this.visualProvider) this.queueProviderRefresh(this.visualProvider, this.visualProvider);
      this.update(this.project, this.activeBlock, this.renderOptions);
    } else {
      this.structureBlockGuideKey = '';
      this.update(this.project, this.activeBlock, this.renderOptions);
    }
  }
  setDecorationTextureProvider(provider: ((resource: string) => string | undefined) | undefined): void {
    if (provider === this.decorationTextureUrl) return;
    this.decorationTextureCache?.dispose();
    this.decorationTextureCache = provider ? new DecorationTextureCache(provider, undefined, () => this.scheduleRender()) : undefined;
    this.decorationTextureUrl = provider;
    this.decorationRevision += 1;
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemResourceProvider(provider: ((itemId: string) => readonly string[]) | undefined): void {
    if (provider === this.decorationItemResources) return;
    this.decorationItemResources = provider;
    this.decorationRevision += 1;
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemVisualProvider(provider: ((itemId: string) => ResolvedItemVisual | undefined) | undefined): void {
    if (provider === this.decorationItemVisual) return;
    this.decorationItemVisual = provider;
    this.decorationRevision += 1;
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemPreviewProvider(provider: ((item: ItemStackData) => Promise<string | undefined>) | undefined): void {
    if (provider === this.decorationItemPreview) return;
    this.decorationItemPreview = provider;
    this.decorationRevision += 1;
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setPaintingTextureResolver(provider: ((variantId: string) => string | undefined) | undefined): void {
    if (provider === this.paintingResource) return;
    this.paintingResource = provider;
    this.decorationRevision += 1;
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  setPlacementPlanProvider(provider: PlacementPlanProvider | undefined): void { this.placementPlanProvider = provider; }
  setBlockDefinitionResolver(resolver: ((blockId: string) => BlockDefinition | undefined) | undefined): void {
    if (this.definitionResolver === resolver) return;
    this.definitionResolver = resolver;
    this.structureBlockGuideKey = '';
    if (this.suspended) { this.suspendedNeedsRefresh = true; return; }
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  private ensureSpatialIndex(project: ProjectDocument | undefined, force = false, preserveForIncrementalTransition = false): void {
    if (!project) { this.spatialIndex = undefined; this.spatialIndexProject = undefined; this.spatialIndexBlocksReference = undefined; this.structuralSpecialVisualIds.clear(); this.observedSpatialIndexLookups = 0; return; }
    if (preserveForIncrementalTransition && !force && this.spatialIndex) {
      this.spatialIndexProject = project;
      this.spatialIndexBlocksReference = project.blocks;
      return;
    }
    if (!force && this.spatialIndexProject === project && this.spatialIndexBlocksReference === project.blocks && this.spatialIndex) return;
    this.spatialIndex = new ProjectBlockSpatialIndex(project.blocks);
    this.spatialIndexProject = project;
    this.spatialIndexBlocksReference = project.blocks;
    this.observedSpatialIndexLookups = 0;
    this.structuralSpecialVisualIds = new Set(project.blocks.map((block) => block.id));
    this.instrumentation.record('spatialIndexBuilds');
  }

  private collectSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): readonly NormalizedSpecialVisualDescriptor[] {
    const ids = new Set([...this.structuralSpecialVisualIds, ...(this.activeBlock ? [this.activeBlock.id] : []), ...plannedBlocks.map((block) => block.id)]);
    return [...ids].flatMap((id) => { const descriptor = this.specialVisualResolver?.(id); return descriptor ? [{ ...descriptor, contentId: id }] : []; });
  }

  private requestReusableVisualKey(provider: BlockVisualProvider, block: PlacedBlock, worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }): string | undefined {
    const key = provider.reusableVisualKey?.(block, worldContext);
    this.instanceRenderer.recordReusableKey(key, this.specialVisualResolver?.(block.id)?.contractId ?? 'generic-json');
    return key;
  }

  private syncSpecialVisualDescriptors(plannedBlocks: readonly PlacedBlock[] = []): boolean {
    const descriptors = this.collectSpecialVisualDescriptors(plannedBlocks);
    const signature = stableValue(descriptors.slice().sort((left, right) => left.contentId.localeCompare(right.contentId)));
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
  private queueProviderRefresh(previousProvider: BlockVisualProvider, nextProvider: BlockVisualProvider): void {
    if (!this.project) return;
    if (this.suspended) {
      this.deferredProviderRefresh = { previous: this.deferredProviderRefresh?.previous ?? previousProvider, next: nextProvider };
      this.suspendedNeedsRefresh = true;
      return;
    }
    this.providerRefreshPlanner.cancel();
    this.hydrationWork.clearPendingProviderRefresh();
    const planGeneration = ++this.providerRefreshGeneration;
    this.providerRefreshPlanning = true;
    this.providerRefreshProgress = undefined;
    this.providerRefreshPlanningDiagnostics = { processed: 0, total: 0, considered: 0, queued: 0, maxSliceMs: 0, yields: 0, durationMs: 0 };
    this.runtimeTrace?.record('provider-refresh-planning-start', { generation: planGeneration });
    this.publishProviderRefreshProgress();
    const worldContext = { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) };
    const visible = this.cachedVisibleProject === this.project && this.cachedVisibleKey === renderFilterKey(this.renderOptions)
      ? this.cachedVisibleMap
      : new Map(this.visibleBlocks(this.project, this.renderOptions).map((entry) => [coordinateKey(entry.block.position), entry] as const));
    const inputs: ProviderRefreshCandidate[] = [...this.renderedBlocks].flatMap(([key, entry]) => {
      const visibleEntry = visible.get(key);
      return visibleEntry ? [{ key, entry, visibleEntry, previousProvider, nextProvider, worldContext, visible }] : [];
    });
    this.providerRefreshPlanner.start(inputs, (candidate) => {
      // Missing entries are finalized by the bounded content-resolution lane;
      // re-queuing them here would duplicate the pink -> resolved build.
      if (candidate.entry.block.kind === 'missing') return { considered: false };
      if (candidate.entry.fluidChunkKey !== undefined || this.fluidCoordinator.isClaimed(candidate.key)) return { considered: true };
      const oldKey = this.requestReusableVisualKey(candidate.entry.provider ?? candidate.previousProvider, candidate.entry.block, candidate.worldContext);
      const newKey = this.requestReusableVisualKey(candidate.nextProvider, candidate.entry.block, candidate.worldContext);
      if (oldKey === newKey && oldKey !== undefined) return { considered: true };
      return {
        considered: true,
        job: {
          token: this.hydrationGeneration,
          projectionRevision: this.projectionRevisionForKey(candidate.key),
          key: candidate.key,
          block: candidate.visibleEntry.block,
          signature: candidate.visibleEntry.signature,
          role: candidate.visibleEntry.role,
          worldContext: candidate.worldContext,
          options: this.renderOptions,
          allowInstancing: false,
          surfaceFastPathEligible: this.renderOptions.exposedFaceRendering === true && isCompiledTerrainEntry(candidate.visibleEntry),
          surfaceVisibleEntries: candidate.visible,
          providerRefresh: true,
          providerRefreshGeneration: planGeneration,
        },
      };
    }, {
      onProgress: (progress: ProviderRefreshPlannerProgress) => {
        if (planGeneration !== this.providerRefreshGeneration) return;
        this.providerRefreshPlanningDiagnostics = { ...this.providerRefreshPlanningDiagnostics, processed: progress.processed, total: progress.total, considered: progress.considered, queued: progress.queued, maxSliceMs: progress.maxSliceMs, yields: progress.yields };
        this.runtimeTrace?.record('provider-refresh-planning-progress', { ...progress });
      },
      onComplete: (result) => {
        if (planGeneration !== this.providerRefreshGeneration) return;
        this.providerRefreshPlanning = false;
        const queued = result.jobs.reduce((count, job) => count + (this.hydrationWork.enqueueProviderRefresh(job) ? 1 : 0), 0);
        this.providerRefreshPlanningDiagnostics = { processed: result.processed, total: inputs.length, considered: result.considered, queued, maxSliceMs: result.maxSliceMs, yields: result.yields, durationMs: result.durationMs };
        this.runtimeTrace?.record('provider-refresh-planning-end', { generation: planGeneration, considered: result.considered, queued, processed: result.processed, durationMs: result.durationMs, maxSliceMs: result.maxSliceMs, yields: result.yields });
        this.runtimeTrace?.record('provider-refresh-queued', { queued });
        if (queued) {
          this.providerRefreshProgress = { total: queued, completed: 0, startedAt: performance.now() };
          this.runtimeTrace?.record('provider-refresh-start', { queued });
        }
        this.publishProviderRefreshProgress();
        if (this.hydrationWork.queuedProviderRefresh()) this.scheduleHydrationPump();
      },
      onCancel: () => {
        if (planGeneration !== this.providerRefreshGeneration) return;
        this.providerRefreshPlanning = false;
        this.providerRefreshProgress = undefined;
        this.runtimeTrace?.record('provider-refresh-planning-cancel-terminal', { generation: planGeneration });
        this.publishProviderRefreshProgress();
      },
      onError: (error) => {
        if (planGeneration !== this.providerRefreshGeneration) return;
        this.providerRefreshPlanning = false;
        this.providerRefreshProgress = undefined;
        this.runtimeTrace?.record('provider-refresh-planning-error-terminal', { generation: planGeneration, message: error instanceof Error ? error.message : String(error) });
        this.publishProviderRefreshProgress();
      },
    });
  }

  private releaseUnusedRetiredProviders(): void {
    this.providerLifecycle.releaseUnused({
      referenced: (provider) => [...this.renderedBlocks.values()].some((entry) => entry.provider === provider) || this.fluidCoordinator.referencedProviders().has(provider),
      queued: (provider) => this.hydrationWork.providerRefreshJobs().some((job) => job.key && this.renderedBlocks.get(job.key)?.provider === provider),
    });
  }

  update(project: ProjectDocument | undefined, active: ActiveBlock | undefined, options: ViewportRenderOptions = {}, mutationHint?: ProjectMutationHint): void {
    const previousProject = this.project;
    const projectChanged = project?.id !== previousProject?.id;
    const previousOptions = this.renderOptions;
    const isolatePresentationChanged = isolateKey(previousOptions) !== isolateKey(options);
    const previousSyncKey = this.structureSyncKey;
    const nextSyncKey = project ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${renderFilterKey(options)}` : 'empty';
    const referenceOpacityOnly = !!project && !!previousProject && project.blocks === previousProject.blocks && project.id === previousProject.id && project.size.x === previousProject.size.x && project.size.y === previousProject.size.y && project.size.z === previousProject.size.z && renderFilterKey(previousOptions) === renderFilterKey(options) && previousOptions.referenceOpacity !== options.referenceOpacity;
    const projectionBase = this.committedProjection && this.committedProjection.project === previousProject ? this.committedProjection.options : previousOptions;
    const projectionDelta = planYLayerProjectionDelta(projectionBase.layerY, projectionBase.visibility, options.layerY, options.visibility, options.layerIndex ?? this.layerIndex);
    const layerProjectionOnly = !!project && !!previousProject && project.blocks === previousProject.blocks && project.id === previousProject.id && project.size.x === previousProject.size.x && project.size.y === previousProject.size.y && project.size.z === previousProject.size.z && !mutationHint && projectionDelta.changed && previousOptions.visibility === options.visibility && !!options.visibility && options.layerY !== undefined && previousOptions.layerY !== undefined && renderFilterKey(previousOptions) === renderFilterKey(options);
    const incrementalMutation = !!project && !!previousProject && project !== previousProject && !!mutationHint && nextSyncKey === previousSyncKey && renderFilterKey(previousOptions) === renderFilterKey(options) && this.cachedVisibleProject === previousProject && this.spatialIndexProject === previousProject;
    const metadataMutation = mutationHint?.kind === 'metadata-delta';
    this.project = project;
    this.activeBlock = active;
    this.renderOptions = options;
    if (!layerProjectionOnly) this.cancelPendingProjection();
    if (this.suspended) {
      const nextDecorationKey = project ? `${project.id}|${renderFilterKey(options)}|${this.decorationRevision}` : 'empty';
      this.suspendedNeedsRefresh = this.suspendedNeedsRefresh
        || project !== this.syncedProject
        || project?.blocks !== this.syncedBlocksReference
        || project?.size.x !== this.syncedProject?.size.x
        || project?.size.y !== this.syncedProject?.size.y
        || project?.size.z !== this.syncedProject?.size.z
        || renderFilterKey(previousOptions) !== renderFilterKey(options)
        || nextDecorationKey !== this.decorationSyncKey;
      return;
    }
    const inPlaceBlockMutation = project === this.syncedProject && project !== undefined && (project.blocks !== this.syncedBlocksReference || project.blocks.length !== this.syncedBlockCount);
    this.ensureSpatialIndex(project, incrementalMutation || layerProjectionOnly ? false : inPlaceBlockMutation, incrementalMutation || layerProjectionOnly);
    this.syncSpecialVisualDescriptors();
    const syncKey = nextSyncKey;
    const blockInputChanged = !referenceOpacityOnly && !layerProjectionOnly && (project !== this.syncedProject || syncKey !== this.structureSyncKey);
    const decorationKey = project ? `${project.id}|${renderFilterKey(options)}|${this.decorationRevision}` : 'empty';
    const decorationInputChanged = project !== this.syncedDecorationProject || decorationKey !== this.decorationSyncKey;
    const full = syncKey !== this.structureSyncKey;
    if (layerProjectionOnly && project && projectionDelta.changedLayers.length) this.scheduleLayerProjectionCommit(project, options);
    if (blockInputChanged || inPlaceBlockMutation) {
      const projectIdentityChanged = project !== this.syncedProject;
      const incrementalProjectChange = projectIdentityChanged && !full && this.renderedBlocks.size === 0 && (this.queuedBlockHydrationJobs() > 0 || this.pendingHydrationSignatures.size > 0 || this.placeholderSignatures.size > 0);
      if (incrementalMutation && project && mutationHint) {
        if (metadataMutation) this.applyMetadataMutation(previousProject!, previousOptions, project, options, mutationHint);
        else this.applyIncrementalMutation(project, options, mutationHint);
      } else {
        if (full || !incrementalProjectChange && (projectIdentityChanged || inPlaceBlockMutation)) {
          const reason: HydrationCancellationReason = inPlaceBlockMutation ? 'in-place-project-mutation' : full ? 'structure-sync-key-changed' : 'project-identity-changed';
          this.cancelHydration(reason, {
            projectIdentityChanged,
            structureSyncKeyChanged: full,
            renderFilterChanged: renderFilterKey(previousOptions) !== renderFilterKey(options),
            previousProjectId: this.syncedProject?.id,
            nextProjectId: project?.id,
            previousProjectUpdatedAt: this.syncedProject?.metadata.updatedAt,
            nextProjectUpdatedAt: project?.metadata.updatedAt,
            previousSyncKey,
            nextSyncKey,
          });
        }
        this.reconcileStructure(project, options, full);
      }
      if (project) this.committedProjection = { project, options };
      this.structureSyncKey = syncKey;
      this.syncedProject = project;
      this.syncedBlockCount = project?.blocks.length;
      this.syncedBlocksReference = project?.blocks;
    }
    if (referenceOpacityOnly) {
      this.setReferenceOpacity(options.referenceOpacity ?? .28);
      if (project) this.committedProjection = { project, options: { ...(this.committedProjection?.options ?? previousOptions), referenceOpacity: options.referenceOpacity } };
      this.cachedVisibleProject = project;
      this.syncedProject = project;
      this.syncedBlockCount = project?.blocks.length;
      this.syncedBlocksReference = project?.blocks;
      this.structureSyncKey = syncKey;
    }
    if (layerProjectionOnly) {
      if (previousOptions.referenceOpacity !== options.referenceOpacity) this.setReferenceOpacity(options.referenceOpacity ?? .28);
    }
    if (decorationInputChanged) {
      if (metadataMutation && project && previousProject) this.applyMetadataDecorationMutation(previousProject, previousOptions, project, options, mutationHint!);
      else if (!blockInputChanged) this.cancelDecorationHydration();
      this.decorationSyncKey = decorationKey;
      this.syncedDecorationProject = project;
      if (!metadataMutation) {
        this.reconcileDecorations(project, options, false);
        this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
      }
    }
    if (isolatePresentationChanged) {
      if (options.isolatedGroupId) this.applyIsolatePresentation(project, options);
      else { this.requestedIsolatedKeys.clear(); this.isolationPresentation.deactivate(); }
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
      const selectedDecoration = this.renderedDecorations.get(options.selectedDecorationId);
      if (selectedDecoration) this.hydrateDecorationItemPreview(selectedDecoration);
    }
    this.updateGhost(undefined, project, active);
    this.recordProviderCacheStats();
    if (project && this.controls && (projectChanged || this.cameraFraming.cameraProjectId !== project.id)) {
      this.cameraFraming.cameraProjectId = project.id;
      this.fitStructure();
    } else if (project && this.controls && !this.cameraFraming.hasCameraFrame) this.resetCamera();
    this.scheduleRender();
    const projectBlockCount = project?.blocks.length ?? 0;
    if (this.runtimeDiagnosticsEnabled && this.runtimeObservedProjectBlockCount > 0 && projectBlockCount === 0) {
      this.emptyTransitionSnapshots.push(this.captureGhostSceneSnapshot());
      if (this.emptyTransitionSnapshots.length > 2) this.emptyTransitionSnapshots.shift();
    }
    this.runtimeObservedProjectBlockCount = projectBlockCount;
    this.recordSpatialLookupDelta();
  }

  private recordSpatialLookupDelta(): void {
    const total = this.spatialIndex?.lookups ?? 0;
    if (total > this.observedSpatialIndexLookups) this.instrumentation.record('spatialIndexLookups', total - this.observedSpatialIndexLookups);
    this.observedSpatialIndexLookups = total;
  }

  setRuntimeDiagnosticsEnabled(enabled: boolean): void {
    this.runtimeDiagnosticsEnabled = enabled;
    this.runtimeObservedProjectBlockCount = this.project?.blocks.length ?? 0;
    this.emptyTransitionSnapshots.length = 0;
    this.instanceOwnershipTrace.length = 0;
  }

  setRuntimeTrace(trace: ViewportRuntimeTrace | undefined): void { this.runtimeTrace = trace; }

  runtimeTraceMetadata(): ViewportTraceMetadata {
    const project = this.project;
    const capabilities = this.renderer?.capabilities;
    return {
      minecraftVersion: '1.21.1',
      projectId: project?.id,
      projectBlocks: project?.blocks.length ?? 0,
      visibleLogicalBlocks: this.cachedVisibleEntries.length,
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
    const currentGenerationRunning = this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0;
    const workCounts = this.hydrationWork.counts();
    const hydration = this.hydrationProgressState;
    const staticModels = { available: !!this.staticModelDiagnosticsCache, buildCount: this.staticModelDiagnosticsBuildCount };
    return {
      camera: { position: toTraceVector(this.camera.position), target: toTraceVector(target), offset: toTraceVector(offset), distance: offset.length(), direction: toTraceVector(direction), quaternion: [this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w], up: toTraceVector(this.camera.up), fov: this.camera.fov, aspect: this.camera.aspect },
      dpr: { staticPixelRatio: this.staticPixelRatio, interactivePixelRatio: this.staticPixelRatio, appliedPixelRatio: this.renderer?.getPixelRatio() ?? this.staticPixelRatio, interactiveResolutionActive: false, canvasCss: { width: this.container?.getBoundingClientRect().width ?? 0, height: this.container?.getBoundingClientRect().height ?? 0 }, backingWidth: this.renderer?.domElement.width ?? 0, backingHeight: this.renderer?.domElement.height ?? 0, cameraAspect: this.camera.aspect },
      hydration: { ...hydration, queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(), running: this.hydrationRunning, regularQueued: workCounts.regularQueued, providerRefreshQueued: workCounts.providerRefreshQueued, regularRunning: workCounts.regularRunning, providerRefreshRunning: workCounts.providerRefreshRunning, currentGenerationRunning, staleRunning: Math.max(0, this.hydrationRunning - currentGenerationRunning), pendingSignatureCount: this.pendingHydrationSignatures.size, placeholderSignatureCount: this.placeholderSignatures.size, placeholderVisualCount: this.placeholderIndices.size, renderedBlockCount: this.renderedBlocks.size, expectedVisibleBlockCount: this.cachedVisibleEntries.length, terrainHydrationPending: this.terrainHydrationPending, hydrationScheduled: this.hydrationScheduled, hydrationTimerActive: this.hydrationScheduler.timerActive, currentBatchBudget: this.hydrationBatchBudget, isCameraInteracting: this.isCameraInteracting(), interactiveMode: false },
      counters,
      render: { ...this.lastRendererMetrics, renderCpuMs: this.renderCpuMs, frameDurationMs: this.frameDurationMs, cameraRenderPending: this.cameraRenderPending, renderSchedulerPending: this.renderScheduler.scheduled, object3dCount: this.scene.children.length, visibleMeshCount: this.blocksGroup.children.length + this.decorationsGroup.children.length, instanceBatchCount: this.instanceBatches.size, surfaceBatchCount: this.surfaceFaceBatches.size, terrainMeshCount: terrain['terrainChunkMeshes'], standaloneMeshCount: 0, renderRegionCount: this.instanceBatches.size + this.surfaceFaceBatches.size },
      generations: { providerGeneration: this.providerGeneration, hydrationGeneration: this.hydrationGeneration, specialVisualRevision: this.specialVisualRevision },
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
    this.staticModelDiagnosticsCache = collectStaticModelDiagnostics([...this.renderedBlocks.values()].map((entry) => ({ ...entry, id: entry.block.id })), metrics, this.instanceRenderer.templatePartCounts());
    return this.staticModelDiagnosticsCache;
  }

  private invalidateStaticModelDiagnostics(): void { this.staticModelDiagnosticsCache = undefined; }

  runtimeGhostDiagnostics(): ViewportRuntimeDiagnostics {
    const current = this.captureGhostSceneSnapshot();
    const firstEmpty = this.emptyTransitionSnapshots.at(-2) ?? null;
    const secondEmpty = this.emptyTransitionSnapshots.at(-1) ?? null;
    const differences = firstEmpty && secondEmpty ? compareEmptySnapshots(firstEmpty, secondEmpty) : null;
    return { current, emptyTransitions: { firstEmpty, secondEmpty, differences } };
  }

  private scheduleLayerProjectionCommit(project: ProjectDocument, options: ViewportRenderOptions): void {
    this.pendingProjection = { project, options };
    this.instrumentation.record('yLayerProjectionRequests');
    this.setProjectionActivity('applying', this.projectionRevision + 1);
    if (this.projectionFrame !== undefined) {
      this.instrumentation.record('yLayerProjectionRequestsCoalesced');
      return;
    }
    this.projectionFrame = requestViewportFrame(() => {
      this.projectionFrame = undefined;
      const pending = this.pendingProjection;
      this.pendingProjection = undefined;
      if (!pending || this.disposed || this.suspended) {
        this.setProjectionActivity('idle', this.projectionActivityRevision);
        return;
      }
      const base = this.committedProjection;
      if (!base || base.project.id !== pending.project.id || base.project.blocks !== pending.project.blocks) {
        this.setProjectionActivity('idle', this.projectionActivityRevision);
        return;
      }
      const delta = planYLayerProjectionDelta(base.options.layerY, base.options.visibility, pending.options.layerY, pending.options.visibility, pending.options.layerIndex ?? this.layerIndex);
      const changedLayers = [...new Set([...delta.changedLayers, ...this.inFlightProjectionLayers])].sort((left, right) => left - right);
      if (!changedLayers.length) {
        this.setProjectionActivity('idle', this.projectionActivityRevision);
        return;
      }
      this.projectionRevision += 1;
      this.projectionActivityRevision = this.projectionRevision;
      this.projectionPendingKeys.clear();
      void this.applyLayerProjectionWork(pending.project, pending.options, changedLayers).then((completed) => {
        if (!completed || this.disposed) return;
        this.committedProjection = { project: pending.project, options: pending.options };
        this.syncedProject = pending.project;
        this.syncedBlockCount = pending.project.blocks.length;
        this.syncedBlocksReference = pending.project.blocks;
        this.structureSyncKey = `${pending.project.id}|${pending.project.size.x},${pending.project.size.y},${pending.project.size.z}|${renderFilterKey(pending.options)}`;
        this.instrumentation.record('yLayerProjectionCommits');
        this.setProjectionActivity('settling', this.projectionRevision);
        this.scheduleProjectionSettlementCheck(this.projectionRevision);
      });
    });
  }

  private cancelPendingProjection(): void {
    this.projectionWorkToken += 1;
    this.inFlightProjectionLayers.clear();
    this.projectionPendingKeys.clear();
    if (this.projectionSettlementTimer !== undefined) clearTimeout(this.projectionSettlementTimer);
    this.projectionSettlementTimer = undefined;
    if (this.projectionFrame !== undefined) cancelViewportFrame(this.projectionFrame);
    this.projectionFrame = undefined;
    this.pendingProjection = undefined;
    this.setProjectionActivity('idle', this.projectionRevision);
  }

  private setProjectionActivity(activity: ViewportProjectionActivity, revision: number): void {
    if (this.projectionActivityState === activity && this.projectionActivityRevision === revision) return;
    this.projectionActivityState = activity;
    this.projectionActivityRevision = revision;
    const state = this.projectionActivity();
    for (const listener of this.projectionActivityListeners) listener(state);
  }

  private scheduleProjectionSettlementCheck(revision: number): void {
    if (this.disposed || this.projectionActivityRevision !== revision || this.projectionActivityState !== 'settling') return;
    if (this.projectionSettlementTimer !== undefined) return;
    this.projectionSettlementTimer = setTimeout(() => {
      this.projectionSettlementTimer = undefined;
      if (this.disposed || this.projectionActivityRevision !== revision || this.projectionActivityState !== 'settling') return;
      const settled = [...this.projectionPendingKeys].every((key) => this.projectionKeySettled(key));
      if (settled) {
        this.projectionPendingKeys.clear();
        this.setProjectionActivity('idle', revision);
      } else this.scheduleProjectionSettlementCheck(revision);
    }, 0);
  }

  private projectionKeySettled(key: string): boolean {
    if (!this.cachedVisibleMap.has(key)) return true;
    if (this.culledBlockKeys.has(key) || this.placeholderSignatures.has(key)) return true;
    if (this.pendingHydrationSignatures.has(key) || this.runningHydrationKeys.has(key)) return false;
    const entry = this.renderedBlocks.get(key);
    return !!entry && this.hasCommittedBlockOwnership(key, entry);
  }

  private projectionRevisionForKey(key: string): number { return this.projectionKeyRevisions.get(key) ?? 0; }

  private bumpProjectionRevisions(keys: ReadonlySet<string>): void {
    for (const key of keys) this.projectionKeyRevisions.set(key, this.projectionRevisionForKey(key) + 1);
  }

  private reconcileStructure(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean, visibleOverride?: readonly VisibleBlockEntry[], projection = false): void {
    this.runtimeTrace?.record('reconcile', { full, projectBlocks: project?.blocks.length ?? 0 });
    if (!projection) this.instrumentation.record('structuralReconciles');
    if (full) this.instrumentation.record('fullReconcileFallbacks');
    if (!project) {
      this.clearPersistentVisuals();
      this.culledBlockKeys.clear();
      this.previousVisibleBlockPositions.clear();
      this.traceInstanceOwnership('after-reconcile', undefined, 'reconcile');
      return;
    }
    this.compactHydrationQueues();
    const worldContext = { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) };
    const visible = visibleOverride ?? this.visibleBlocks(project, options);
    this.setHydrationBlockScope(visible);
    this.cachedVisibleEntries = [...visible];
    this.cachedVisibleMap = new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    this.cachedVisibleIndices.clear();
    this.cachedVisibleEntries.forEach((entry, index) => this.cachedVisibleIndices.set(coordinateKey(entry.block.position), index));
    this.cachedVisibleKey = renderFilterKey(options);
    this.cachedVisibleProject = project;
    const allVisibleMap = new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    const changed = new Set<string>();
    for (const [key, entry] of this.renderedBlocks) {
      if (!allVisibleMap.has(key)) {
        changed.add(key);
        for (const neighbor of coordinateNeighbors(entry.block.position)) changed.add(coordinateKey(neighbor));
      }
    }
    for (const [key, position] of this.previousVisibleBlockPositions) {
      if (!allVisibleMap.has(key)) {
        changed.add(key);
        for (const neighbor of coordinateNeighbors(position)) changed.add(coordinateKey(neighbor));
      }
    }
    for (const entry of visible) {
      const key = coordinateKey(entry.block.position);
      const current = this.renderedBlocks.get(key);
      const pendingSignature = this.pendingHydrationSignatures.get(key);
      const placeholderSignature = this.placeholderSignatures.get(key);
      if (full || !current || current.signature !== entry.signature || current.role !== entry.role) {
        if (!( !current && pendingSignature === entry.signature) && !( !current && !this.visualProvider && placeholderSignature === entry.signature)) changed.add(key);
      }
    }
    if (!full) for (const key of [...changed]) {
      const position = allVisibleMap.get(key)?.block.position ?? this.previousVisibleBlockPositions.get(key) ?? this.renderedBlocks.get(key)?.block.position;
      if (!position) continue;
      for (const neighbor of coordinateNeighbors(position)) if (allVisibleMap.has(coordinateKey(neighbor))) changed.add(coordinateKey(neighbor));
    }
    const terrainAffectedPositions = [...changed].map((key) => allVisibleMap.get(key)?.block.position ?? this.previousVisibleBlockPositions.get(key)).filter((position): position is VoxelCoordinate => !!position);
    this.syncFluidVisuals(visible, worldContext, full ? undefined : terrainAffectedPositions);
    // Initial terrain occupancy is committed together with the first bulk
    // terrain batch. Incremental edits retain the existing conservative sync.
    if (!full) this.terrainRenderer.syncOccupancy(visible, terrainAffectedPositions);
    this.updateInteriorCulling(visible, full, changed);
    // Culling is a terminal ownership family even when it intentionally has
    // no RenderedBlockEntry. Adopt only after the current culling state exists.
    this.adoptCommittedBlockOwnership(visible);
    const renderVisible = visible.filter((entry) => {
      if (this.fluidCoordinator.isClaimed(coordinateKey(entry.block.position))) return false;
      if (options.exposedFaceRendering === true && isTerrainRenderableEntry(entry)) return true;
      return !this.culledBlockKeys.has(coordinateKey(entry.block.position));
    });
    // Once a large scene has established instance batches, keep incremental
    // removals in that representation even when the remaining visible set is
    // temporarily below the creation threshold.
    const allowInstancing = renderVisible.length >= VIEWPORT_INSTANCE_THRESHOLD || this.instanceBatches.size > 0;
    const visibleMap = new Map(renderVisible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    this.hydrationWork.retainPending((job) => {
      const next = visibleMap.get(job.key);
      return !!next && job.signature === next.signature;
    });
    if (full) this.instrumentation.record('fullSceneRebuilds');
    for (const [key, entry] of this.renderedBlocks) if (entry.fluidChunkKey === undefined && !visibleMap.has(key)) { this.removeBlockEntry(key, entry); this.pendingHydrationSignatures.delete(key); this.placeholderSignatures.delete(key); this.instrumentation.record('blockRemovals'); }
    for (const key of this.placeholderIndices.keys()) if (!visibleMap.has(key)) this.removePlaceholderVisual(key);
    for (const key of this.pendingHydrationSignatures.keys()) if (!visibleMap.has(key)) this.pendingHydrationSignatures.delete(key);
    for (const key of this.placeholderSignatures.keys()) if (!visibleMap.has(key)) this.placeholderSignatures.delete(key);
    for (const [key, entry] of visibleMap) {
      const current = this.renderedBlocks.get(key);
      const pendingSignature = this.pendingHydrationSignatures.get(key);
      const placeholderSignature = this.placeholderSignatures.get(key);
      if (full || !current || current.signature !== entry.signature || current.role !== entry.role) {
        if (!current && pendingSignature === entry.signature) continue;
        // A placeholder is only an existing representation. It is not proof
        // that real hydration is queued. Once a provider becomes available,
        // placeholder-only entries must be promoted to hydration work.
        if (!current && !this.visualProvider && placeholderSignature === entry.signature) continue;
        changed.add(key);
      }
      if (!changed.has(key) && current) this.removePlaceholderVisual(key);
    }
    const changedEntries = [...changed].map((key) => visibleMap.get(key)).filter((entry): entry is VisibleBlockEntry => !!entry);
    if (full) this.ensurePlaceholderVisualsBulk(changedEntries);
    const terrainCandidates: TerrainHydrationCandidate[] = [];
    for (const key of changed) {
      const next = visibleMap.get(key); if (!next) continue;
      const previous = this.renderedBlocks.get(key);
      if (previous) { this.removeBlockEntry(key, previous); this.instrumentation.record('blockUpdates'); }
      else if (this.pendingHydrationSignatures.get(key) === undefined && this.placeholderSignatures.get(key) === undefined) this.instrumentation.record('blockAdds');
      if (!full) this.ensurePlaceholderVisual(key, next.block, next.role);
      this.pendingHydrationSignatures.set(key, next.signature);
      this.instrumentation.record('blockVisualCreations');
      // A fallback-only scene has no asynchronous visual work. Keep the
      // placeholder as the final representation instead of scheduling work
      // that cannot produce a real model.
      if (!this.visualProvider) {
        this.pendingHydrationSignatures.delete(key);
        this.placeholderSignatures.set(key, next.signature);
        continue;
      }
      this.placeholderSignatures.delete(key);
      const terrainCandidate = this.terrainCandidate(key, next, worldContext, options);
      if (terrainCandidate) {
        this.renderedBlocks.set(key, { key, block: next.block, signature: next.signature, role: next.role, revision: 0, provider: this.visualProvider, reusableVisualKey: terrainCandidate.reusableKey });
        terrainCandidates.push(terrainCandidate);
      } else this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, projectionRevision: this.projectionRevisionForKey(key), key, block: next.block, signature: next.signature, role: next.role, worldContext, options, allowInstancing, surfaceFastPathEligible: options.exposedFaceRendering === true && isCompiledTerrainEntry(next), surfaceVisibleEntries: allVisibleMap });
    }
    if (terrainCandidates.length) this.scheduleTerrainBatch(terrainCandidates, visible, terrainAffectedPositions, full, false, 'structural');
    const normalJobs: BlockHydrationJob[] = [];
    const referenceJobs: BlockHydrationJob[] = [];
    const missingJobs: BlockHydrationJob[] = [];
    const pendingHydrationJobs = this.hydrationWork.regularJobs();
    for (const job of pendingHydrationJobs) {
      if (job.role === 'normal') normalJobs.push(job);
      else if (job.role === 'reference') referenceJobs.push(job);
      else missingJobs.push(job);
    }
    this.hydrationWork.replaceRegular([...normalJobs, ...referenceJobs, ...missingJobs]);
    const previousMax = this.instrumentation.snapshot().maxPendingVisualJobs;
    if (this.queuedBlockHydrationJobs() > previousMax) this.instrumentation.record('maxPendingVisualJobs', this.queuedBlockHydrationJobs() - previousMax);
    this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
    if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    this.reconcileInstanceOwnership();
    this.previousVisibleBlockPositions.clear();
    for (const entry of visible) this.previousVisibleBlockPositions.set(coordinateKey(entry.block.position), { ...entry.block.position });
    this.traceInstanceOwnership('after-reconcile', undefined, 'reconcile');
  }

  private syncFluidVisuals(visible: readonly VisibleBlockEntry[], worldContext: FluidWorldLookup, changedPositions?: readonly VoxelCoordinate[]): void {
    const records = this.visualProvider?.fluidRenderResolver && this.visualProvider.fluidTexture
      ? visible.flatMap((entry) => {
        const state = this.visualProvider!.fluidRenderResolver!.resolve(entry.block, worldContext);
        return state ? [{ block: entry.block, state, role: entry.role === 'reference' ? 'reference' as const : 'normal' as const }] : [];
      })
      : [];
    const visibleByKey = new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    const nextKeys = new Set(records.map((record) => coordinateKey(record.block.position)));
    for (const key of this.fluidCoordinator.claimedKeys()) {
      if (nextKeys.has(key)) continue;
      const entry = this.renderedBlocks.get(key);
      if (entry?.fluidChunkKey !== undefined) this.renderedBlocks.delete(key);
    }
    for (const record of records) {
      const key = coordinateKey(record.block.position);
      const entry = visibleByKey.get(key);
      if (!entry) continue;
      const previous = this.renderedBlocks.get(key);
      if (previous && previous.fluidChunkKey === undefined) this.removeBlockEntry(key, previous);
      this.renderedBlocks.set(key, { key, block: entry.block, signature: entry.signature, role: entry.role, revision: 0, provider: this.visualProvider, fluidChunkKey: fluidChunkKey(entry.block.position) });
    }
    if (!records.length && !this.visualProvider?.fluidRenderResolver) this.fluidCoordinator.clear();
    const hydrationGeneration = this.hydrationGeneration;
    void this.fluidCoordinator.sync(records, worldContext, hydrationGeneration, changedPositions).then(() => { this.invalidateStaticModelDiagnostics(); this.scheduleRender(); });
  }

  private terrainCandidate(key: string, next: VisibleBlockEntry, worldContext: TerrainHydrationCandidate['worldContext'], options: ViewportRenderOptions): TerrainHydrationCandidate | undefined {
    const provider = this.visualProvider;
    if (!provider || options.exposedFaceRendering !== true || !isTerrainRenderableEntry(next)) return undefined;
    const reusableKey = this.requestReusableVisualKey(provider, next.block, worldContext);
    return reusableKey ? { key, next, reusableKey, worldContext, provider } : undefined;
  }

  private visibleEntry(block: ProjectDocument['blocks'][number], options: ViewportRenderOptions): VisibleBlockEntry {
    const role = block.kind === 'missing' ? 'missing' : options.layerY !== undefined && block.position.y !== options.layerY ? 'reference' : 'normal';
    this.instrumentation.record('blockSignatureComputations');
    return { block, role, signature: `${blockRenderSignature(block)}|${role}`, occlusionClass: this.visualProvider?.occlusionClass?.(block) ?? 'unknown' };
  }

  private cacheVisibleEntry(key: string, entry: VisibleBlockEntry): void {
    const index = this.cachedVisibleIndices.get(key);
    this.cachedVisibleMap.set(key, entry);
    if (index === undefined) {
      this.cachedVisibleIndices.set(key, this.cachedVisibleEntries.length);
      this.cachedVisibleEntries.push(entry);
    } else this.cachedVisibleEntries[index] = entry;
  }

  private removeCachedVisibleEntry(key: string): void {
    this.cachedVisibleMap.delete(key);
    const index = this.cachedVisibleIndices.get(key);
    if (index === undefined) return;
    const lastIndex = this.cachedVisibleEntries.length - 1;
    if (index !== lastIndex) {
      const last = this.cachedVisibleEntries[lastIndex];
      this.cachedVisibleEntries[index] = last;
      this.cachedVisibleIndices.set(coordinateKey(last.block.position), index);
    }
    this.cachedVisibleEntries.pop();
    this.cachedVisibleIndices.delete(key);
  }

  private async applyLayerProjectionWork(project: ProjectDocument, options: ViewportRenderOptions, changedLayers: readonly number[]): Promise<boolean> {
    const token = ++this.projectionWorkToken;
    const layerIndex = options.layerIndex ?? this.layerIndex;
    const blocksForLayer = (layer: number): readonly ProjectDocument['blocks'][number][] => layerIndex?.blocksAtY(layer) ?? project.blocks.filter((block) => block.position.y === layer);
    const cooperative = options.visibility === 'all-below' && changedLayers.length > 8;
    if (!cooperative) {
      if (token !== this.projectionWorkToken) return false;
      this.applyLayerProjectionDelta(project, options, changedLayers);
      this.inFlightProjectionLayers.clear();
      return token === this.projectionWorkToken;
    }

    const batches: Array<{ readonly layers: readonly number[]; readonly blocks: ReadonlyMap<number, readonly ProjectDocument['blocks'][number][]> }> = [];
    for (const layer of changedLayers) {
      const blocks = blocksForLayer(layer);
      if (!blocks.length) {
        batches.push({ layers: [layer], blocks: new Map([[layer, []]]) });
        continue;
      }
      for (let start = 0; start < blocks.length; start += Y_LAYER_PROJECTION_SLICE_BLOCK_LIMIT) {
        batches.push({ layers: [layer], blocks: new Map([[layer, blocks.slice(start, start + Y_LAYER_PROJECTION_SLICE_BLOCK_LIMIT)]]) });
      }
    }

    for (let index = 0; index < batches.length; index += 1) {
      if (token !== this.projectionWorkToken) {
        this.instrumentation.record('yLayerProjectionCancellations');
        return false;
      }
      const slice = batches[index];
      const sliceLayers = slice.layers;
      for (const layer of sliceLayers) this.inFlightProjectionLayers.add(layer);
      const started = performance.now();
      this.applyLayerProjectionDelta(project, options, sliceLayers, slice.blocks, false, false);
      const sliceMs = performance.now() - started;
      this.instrumentation.record('yLayerProjectionSlices');
      this.instrumentation.recordMax('yLayerProjectionMaxSliceMs', sliceMs);
      if (index + 1 < batches.length) {
        this.instrumentation.record('yLayerProjectionYields');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    this.updateHydrationOrder();
    this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
    if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    this.inFlightProjectionLayers.clear();
    return token === this.projectionWorkToken;
  }

  private applyLayerProjectionDelta(project: ProjectDocument, options: ViewportRenderOptions, changedLayers: readonly number[], blockOverrides?: ReadonlyMap<number, readonly ProjectDocument['blocks'][number][]>, flushTerrain = true, publishProgress = true): void {
    const started = performance.now();
    const layerIndex = options.layerIndex ?? this.layerIndex;
    const blocksForLayer = (layer: number): readonly ProjectDocument['blocks'][number][] => blockOverrides?.get(layer) ?? layerIndex?.blocksAtY(layer) ?? project.blocks.filter((block) => block.position.y === layer);
    const changes = new Map<string, { readonly before?: VisibleBlockEntry; readonly after?: VisibleBlockEntry; readonly position: VoxelCoordinate }>();
    for (const layer of changedLayers) {
      for (const block of blocksForLayer(layer)) {
        const key = coordinateKey(block.position);
        if (changes.has(key)) continue;
        const before = this.cachedVisibleMap.get(key);
        const after = isBlockVisibleForViewport(block, project, { ...canonicalRenderOptions(options), layerIndex }) ? this.visibleEntry(block, options) : undefined;
        if (before?.signature === after?.signature && before?.role === after?.role) continue;
        changes.set(key, { before, after, position: block.position });
      }
    }

    let addedVisible = 0;
    let removedVisible = 0;
    let roleChanged = 0;
    const added: string[] = [];
    const removed: string[] = [];
    const invalidated: string[] = [];
    const missing = new Map<string, 'resolved' | 'provisional' | 'permanent'>();
    for (const [key, change] of changes) {
      if (!change.before && change.after) { addedVisible += 1; added.push(key); }
      else if (change.before && !change.after) { removedVisible += 1; removed.push(key); }
      else if (change.before && change.after) { roleChanged += change.before.role !== change.after.role ? 1 : 0; invalidated.push(key); }
      if (change.after) missing.set(key, change.after.block.kind === 'missing' ? (this.missingBlocksTerminal ? 'permanent' : 'provisional') : 'resolved');
      if (change.after) this.cacheVisibleEntry(key, change.after);
      else this.removeCachedVisibleEntry(key);
      if (change.after) this.previousVisibleBlockPositions.set(key, { ...change.position });
      else this.previousVisibleBlockPositions.delete(key);
    }
    this.cachedVisibleProject = project;
    this.cachedVisibleKey = renderFilterKey(options);
    const changedProjectionKeys = new Set(changes.keys());
    if (!changedProjectionKeys.size) {
      const durationMs = performance.now() - started;
      this.instrumentation.record('yLayerProjectionCommitMs', durationMs);
      this.instrumentation.recordMax('yLayerProjectionMaxCommitMs', durationMs);
      return;
    }
    const scopeDelta: HydrationBlockScopeDelta = { add: added, remove: removed, invalidate: invalidated, missing };
    for (const key of changedProjectionKeys) this.projectionPendingKeys.add(key);
    this.hydrationProgressTracker.applyBlockScopeDelta(scopeDelta, false);
    this.instrumentation.record('yLayerProjectionChangedLayers', changedLayers.length);
    this.instrumentation.record('yLayerProjectionChangedBlocks', changes.size);
    this.instrumentation.record('yLayerProjectionAddedVisible', addedVisible);
    this.instrumentation.record('yLayerProjectionRemovedVisible', removedVisible);
    this.instrumentation.record('yLayerProjectionRoleChanged', roleChanged);
    this.hydrationWork.removePendingKeys(changedProjectionKeys);
    this.bumpProjectionRevisions(changedProjectionKeys);
    for (const key of changedProjectionKeys) {
      this.pendingHydrationSignatures.delete(key);
      this.placeholderSignatures.delete(key);
    }

    const worldContext = { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) };
    const fluidKeys = this.syncProjectionFluidDelta(changes, worldContext);
    this.updateInteriorCullingDelta(changes);
    const terrainChanges: TerrainBlockChange[] = [];
    const allowInstancing = this.cachedVisibleEntries.length >= VIEWPORT_INSTANCE_THRESHOLD || this.instanceBatches.size > 0;
    for (const [key, change] of changes) {
      const current = this.renderedBlocks.get(key);
      if (!change.after) {
        if (current) this.removeBlockEntry(key, current);
        else this.terrainRenderer.remove(key);
        this.removePlaceholderVisual(key);
        terrainChanges.push({ key, position: change.position, afterOpaque: false });
        continue;
      }
      if (fluidKeys.has(key)) continue;
      if (current && (current.signature !== change.after.signature || current.role !== change.after.role)) this.removeBlockEntry(key, current);
      this.ensurePlaceholderVisual(key, change.after.block, change.after.role);
      this.pendingHydrationSignatures.set(key, change.after.signature);
      if (!this.visualProvider) {
        this.pendingHydrationSignatures.delete(key);
        this.placeholderSignatures.set(key, change.after.signature);
        terrainChanges.push({ key, position: change.position, afterOpaque: false });
        continue;
      }
      this.placeholderSignatures.delete(key);
      this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, projectionRevision: this.projectionRevisionForKey(key), key, block: change.after.block, signature: change.after.signature, role: change.after.role, worldContext, options, allowInstancing, surfaceFastPathEligible: options.exposedFaceRendering === true && isCompiledTerrainEntry(change.after), surfaceVisibleEntries: this.cachedVisibleMap });
      terrainChanges.push({ key, position: change.position, afterOpaque: isCompiledTerrainEntry(change.after) });
    }
    if (terrainChanges.length) this.terrainRenderer.applyBlockChanges(terrainChanges, flushTerrain, [...changedProjectionKeys]);
    if (publishProgress) {
      this.updateHydrationOrder();
      this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
      if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    }
    const durationMs = performance.now() - started;
    this.instrumentation.record('yLayerProjectionCommitMs', durationMs);
    this.instrumentation.recordMax('yLayerProjectionMaxCommitMs', durationMs);
    this.runtimeTrace?.record('y-layer-projection-delta', { layers: changedLayers, changedBlocks: changes.size, addedVisible, removedVisible, roleChanged, projectionRevision: this.projectionRevision, durationMs });
  }

  private updateInteriorCullingDelta(changes: ReadonlyMap<string, { readonly before?: VisibleBlockEntry; readonly after?: VisibleBlockEntry; readonly position: VoxelCoordinate }>): void {
    const dirty = new Set<string>();
    for (const change of changes.values()) {
      dirty.add(coordinateKey(change.position));
      for (const neighbor of coordinateNeighbors(change.position)) dirty.add(coordinateKey(neighbor));
    }
    for (const key of dirty) {
      const entry = this.cachedVisibleMap.get(key);
      if (!entry) { if (this.culledBlockKeys.delete(key)) this.instrumentation.record('interiorBlocksCulled', -1); continue; }
      this.instrumentation.record('interiorCullingChecks');
      this.setInteriorCulled(entry, hasConfirmedOpaqueNeighbors(entry, this.cachedVisibleMap));
    }
  }

  private syncProjectionFluidDelta(changes: ReadonlyMap<string, { readonly before?: VisibleBlockEntry; readonly after?: VisibleBlockEntry; readonly position: VoxelCoordinate }>, worldContext: FluidWorldLookup): ReadonlySet<string> {
    const resolver = this.visualProvider?.fluidRenderResolver;
    if (!resolver || !this.visualProvider?.fluidTexture) return new Set<string>();
    const fluidChanges: Array<{ readonly position: VoxelCoordinate; readonly before?: { readonly block: ProjectDocument['blocks'][number]; readonly state: ResolvedFluidRenderState; readonly role: 'normal' | 'reference' }; readonly after?: { readonly block: ProjectDocument['blocks'][number]; readonly state: ResolvedFluidRenderState; readonly role: 'normal' | 'reference' } }> = [];
    const afterKeys = new Set<string>();
    for (const [key, change] of changes) {
      const beforeState = change.before && resolver.resolve(change.before.block, worldContext);
      const afterState = change.after && resolver.resolve(change.after.block, worldContext);
      this.instrumentation.record('yLayerProjectionFluidBlocksVisited', 1);
      const before = beforeState ? { block: change.before!.block, state: beforeState, role: change.before!.role === 'reference' ? 'reference' as const : 'normal' as const } : undefined;
      const after = afterState ? { block: change.after!.block, state: afterState, role: change.after!.role === 'reference' ? 'reference' as const : 'normal' as const } : undefined;
      if (after) afterKeys.add(key);
      if (before || after) fluidChanges.push({ position: change.position, before, after });
      const current = this.renderedBlocks.get(key);
      if (after) {
        if (current && current.fluidChunkKey === undefined) this.removeBlockEntry(key, current);
        this.renderedBlocks.set(key, { key, block: after.block, signature: change.after!.signature, role: change.after!.role, revision: 0, provider: this.visualProvider, fluidChunkKey: fluidChunkKey(after.block.position) });
      } else if (current?.fluidChunkKey !== undefined) this.renderedBlocks.delete(key);
    }
    if (fluidChanges.length) void this.fluidCoordinator.syncDelta(fluidChanges, [...changes.values()].map((change) => change.position), worldContext, this.hydrationGeneration).then(() => { this.invalidateStaticModelDiagnostics(); this.scheduleRender(); });
    return afterKeys;
  }

  private applyMetadataMutation(previousProject: ProjectDocument, previousOptions: ViewportRenderOptions, project: ProjectDocument, options: ViewportRenderOptions, hint: Extract<ProjectMutationHint, { readonly kind: 'metadata-delta' }>): void {
    const visibilityChanges: Array<{ readonly position: VoxelCoordinate; readonly before?: ProjectDocument['blocks'][number]; readonly after?: ProjectDocument['blocks'][number] }> = [];
    for (const change of hint.changes) {
      const before = change.before;
      const after = change.after;
      if (!before || !after) continue;
      const beforeVisible = isBlockVisibleForViewport(before, previousProject, { ...canonicalRenderOptions(previousOptions), layerIndex: previousOptions.layerIndex ?? this.layerIndex });
      const afterVisible = isBlockVisibleForViewport(after, project, { ...canonicalRenderOptions(options), layerIndex: options.layerIndex ?? this.layerIndex });
      if (beforeVisible !== afterVisible) visibilityChanges.push({ position: after.position, before, after });
      else {
        this.spatialIndex?.replace(before.position, after);
        if (afterVisible) this.cacheVisibleEntry(coordinateKey(after.position), this.visibleEntry(after, options));
        const rendered = this.renderedBlocks.get(coordinateKey(after.position));
        if (rendered) rendered.block = after;
      }
    }
    if (visibilityChanges.length) {
      this.applyIncrementalMutation(project, options, blockMutationHint(visibilityChanges, hint.source ?? 'group-visibility'));
    } else {
      this.spatialIndexProject = project;
      this.spatialIndexBlocksReference = project.blocks;
      this.cachedVisibleProject = project;
      this.cachedVisibleKey = renderFilterKey(options);
    }
    this.runtimeTrace?.record('group-metadata-delta', { source: hint.source ?? 'unknown', changedBlocks: hint.changes.length, visibilityChangedBlocks: visibilityChanges.length });
    this.scheduleRender();
  }

  private applyMetadataDecorationMutation(previousProject: ProjectDocument, previousOptions: ViewportRenderOptions, project: ProjectDocument, options: ViewportRenderOptions, hint: Extract<ProjectMutationHint, { readonly kind: 'metadata-delta' }>): void {
    const visible = (decoration: PlacedDecoration | undefined, current: ProjectDocument, currentOptions: ViewportRenderOptions): boolean => !!decoration && isDecorationVisible(decoration, current.groups) && (currentOptions.layerY === undefined || decoration.anchor.y === currentOptions.layerY || currentOptions.visibility === 'whole-structure' || currentOptions.visibility === 'all-below' && decoration.anchor.y <= (currentOptions.layerY ?? decoration.anchor.y));
    for (const change of hint.decorationChanges ?? []) {
      const beforeVisible = visible(change.before, previousProject, previousOptions);
      const afterVisible = visible(change.after, project, options);
      const current = this.renderedDecorations.get(change.id);
      if (beforeVisible && afterVisible && current && change.after) current.decoration = change.after;
      else if (beforeVisible && !afterVisible && current) {
        this.removeDecorationEntry(change.id, current);
        this.pendingDecorationSignatures.delete(change.id);
        this.decorationHydrationQueue = this.decorationHydrationQueue.filter((job) => job.id !== change.id);
      } else if (!beforeVisible && afterVisible && change.after && !current) {
        const signature = `${decorationSignature(change.after)}|${this.decorationRevision}`;
        this.pendingDecorationSignatures.set(change.id, signature);
        this.decorationHydrationQueue.push({ token: this.hydrationGeneration, id: change.id, decoration: change.after, signature });
      }
    }
    this.decorationHydrationQueueHead = 0;
    if (this.decorationHydrationQueue.length) this.scheduleHydrationPump();
  }

  private applyIsolatePresentation(project: ProjectDocument | undefined, options: ViewportRenderOptions): void {
    if (!project || !options.isolatedGroupId) {
      this.requestedIsolatedKeys.clear();
      this.isolationPresentation.deactivate();
      return;
    }
    const positions = options.isolatedGroupPositions ?? [];
    const keys = new Set(positions.map((position) => coordinateKey(position)));
    this.requestedIsolatedKeys = keys;
    const blocks = this.isolateBlockSnapshots(project, keys);
    const decorations: IsolateDecorationVisualSnapshot[] = [];
    for (const current of this.renderedDecorations.values()) {
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
    const project = this.syncedProject;
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
    const project = this.syncedProject;
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
      const block = this.spatialIndex?.get({ x, y, z });
      if (!block || !isBlockVisible(block, project.groups)) continue;
      const entry = this.renderedBlocks.get(key);
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

  private applyIncrementalMutation(project: ProjectDocument, options: ViewportRenderOptions, hint: ProjectMutationHint): void {
    const lane: HydrationLane = hint.origin === 'content-resolution' ? 'content' : 'local';
    // Keep every asynchronous retry spawned by this mutation in the same
    // accounting lane as the originating operation. In particular, local
    // terrain work must not reopen the global "Building Structure" lane.
    this.hydrationLane = lane;
    this.hydrationProgressTracker.setLane(lane);
    const tracePrefix = lane === 'content' ? 'content-resolution' : 'local-edit';
    this.runtimeTrace?.record(`${tracePrefix}-start`, { source: hint.source ?? 'unknown', changes: hint.changes.length });
    this.runtimeTrace?.record('incremental-reconcile', { changedVoxelCount: hint.changes.length, source: hint.source ?? 'unknown' });
    this.instrumentation.record('hintedProjectMutations');
    this.instrumentation.record('incrementalBlockReconciles');
    this.compactHydrationQueues();
    const delta = planLocalRenderDelta(hint);
    const changedKeys = new Set(delta.mutatedKeys);
    const affectedPositions = new Map(delta.affectedPositions);
    const hintedKeys = new Set(delta.hintedKeys);
    if (lane === 'content') this.runtimeTrace?.record('content-resolution-delta', { changed: hint.changes.length, affected: affectedPositions.size });
    for (const change of hint.changes) {
      const beforeKey = change.before ? coordinateKey(change.before.position) : coordinateKey(change.position);
      const afterKey = change.after ? coordinateKey(change.after.position) : coordinateKey(change.position);
      if (change.before && change.after && beforeKey !== afterKey) this.hydrationProgressTracker.removeBlockKey(beforeKey);
      if (change.before && !change.after) this.hydrationProgressTracker.removeBlockKey(beforeKey);
      if (change.after) {
        if (!this.hydrationProgressTracker.hasBlockKey(afterKey)) this.hydrationProgressTracker.addBlockKey(afterKey);
        else this.hydrationProgressTracker.invalidate('block', afterKey);
        this.hydrationProgressTracker.syncMissingBlockState(afterKey, change.after.kind === 'missing' ? (this.missingBlocksTerminal ? 'permanent' : 'provisional') : 'resolved');
      }
      this.spatialIndex?.replace(change.before?.position, change.after);
      if (change.after) this.structuralSpecialVisualIds.add(change.after.id);
    }
    this.hydrationProgressTracker.refresh();
    if (lane === 'content') this.recordMissingAccountingInvariant('content-resolution-delta');
    this.syncSpecialVisualDescriptors();
    this.instrumentation.record('incrementalChangedVoxels', affectedPositions.size);
    this.spatialIndexProject = project;
    this.spatialIndexBlocksReference = project.blocks;
    this.cachedVisibleProject = project;
    this.cachedVisibleKey = renderFilterKey(options);
    for (const [key, position] of affectedPositions) {
      const block = this.spatialIndex?.get(position);
      if (block && isBlockVisibleForViewport(block, project, canonicalRenderOptions(options))) this.cacheVisibleEntry(key, this.visibleEntry(block, options));
      else this.removeCachedVisibleEntry(key);
      if (block) this.previousVisibleBlockPositions.set(key, { ...block.position });
      else this.previousVisibleBlockPositions.delete(key);
    }
    const localCulling = [...affectedPositions.keys()];
    for (const key of localCulling) {
      const entry = this.cachedVisibleMap.get(key);
      if (!entry) { if (this.culledBlockKeys.delete(key)) this.instrumentation.record('interiorBlocksCulled', -1); continue; }
      this.instrumentation.record('interiorCullingChecks');
      this.setInteriorCulled(entry, hasConfirmedOpaqueNeighbors(entry, this.cachedVisibleMap));
    }
    this.hydrationWork.removePendingKeys(changedKeys);
    for (const key of changedKeys) {
      this.pendingHydrationSignatures.delete(key);
      this.placeholderSignatures.delete(key);
    }
    const worldContext = { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) };
    this.runtimeTrace?.record('fluid-delta-start', { changed: hint.changes.length, affected: affectedPositions.size });
    const fluidKeys = applyLocalFluidDelta(hint, [...affectedPositions.values()], {
      resolver: this.visualProvider?.fluidRenderResolver,
      hasTexture: !!this.visualProvider?.fluidTexture,
      getBlock: (position) => this.spatialIndex?.get(position),
      getVisibleEntry: (key) => this.cachedVisibleMap.get(key),
      getRenderedEntry: (key) => this.renderedBlocks.get(key),
      removeRenderedEntry: (key) => this.renderedBlocks.delete(key),
      removeBlockEntry: (key, entry) => this.removeBlockEntry(key, entry as RenderedBlockEntry),
      setFluidEntry: (key, block, entry) => this.renderedBlocks.set(key, { key, block, signature: entry.signature, role: entry.role, revision: 0, provider: this.visualProvider, fluidChunkKey: fluidChunkKey(block.position) }),
      fluidCoordinator: this.fluidCoordinator,
      worldContext,
      hydrationGeneration: this.hydrationGeneration,
      layerY: options.layerY,
      onComplete: () => { this.runtimeTrace?.record('fluid-delta-end', { changed: hint.changes.length }); this.invalidateStaticModelDiagnostics(); this.scheduleRender(); },
    });
    const terrainChanges: TerrainBlockChange[] = [];
    const terrainCandidates: TerrainHydrationCandidate[] = [];
    const preparedTerrainRecords = new Map<string, TerrainSurfaceRecord>();
    const preparedTerrainCandidates = new Map<string, TerrainHydrationCandidate>();
    const renderableKeys = new Set<string>();
    for (const key of changedKeys) {
      const next = this.cachedVisibleMap.get(key);
      const renderable = !!next && (options.exposedFaceRendering === true && isTerrainRenderableEntry(next) || !this.culledBlockKeys.has(key));
      const current = this.renderedBlocks.get(key);
      if (!renderable) {
        if (current) { this.removeBlockEntry(key, current); this.instrumentation.record('blockRemovals'); }
        if (this.placeholderIndices.has(key)) this.removePlaceholderVisual(key);
        terrainChanges.push({ key, position: affectedPositions.get(key) ?? current?.block.position ?? { x: 0, y: 0, z: 0 }, afterOpaque: false });
        continue;
      }
      renderableKeys.add(key);
      if (fluidKeys.has(key) && !hintedKeys.has(key)) continue;
      const needsUpdate = hintedKeys.has(key) || !current || current.signature !== next!.signature || current.role !== next!.role || current.terrainChunkKey !== undefined;
      if (fluidKeys.has(key)) {
        if (current) { this.removeBlockEntry(key, current); this.instrumentation.record('blockUpdates'); }
        if (this.placeholderIndices.has(key)) this.removePlaceholderVisual(key);
        terrainChanges.push({ key, position: next!.block.position, afterOpaque: false });
        continue;
      }
      const candidate = this.terrainCandidate(key, next!, worldContext, options);
      const cachedTemplates = candidate ? this.terrainRenderer.templatesFor(candidate.reusableKey) : undefined;
      if (needsUpdate && current) { this.removeBlockEntry(key, current); this.instrumentation.record('blockUpdates'); }
      if (!needsUpdate && current) continue;
      this.ensurePlaceholderVisual(key, next!.block, next!.role);
      this.pendingHydrationSignatures.set(key, next!.signature);
      this.instrumentation.record('blockVisualCreations');
      if (!this.visualProvider) {
        this.pendingHydrationSignatures.delete(key); this.placeholderSignatures.set(key, next!.signature);
        terrainChanges.push({ key, position: next!.block.position, afterOpaque: false });
        continue;
      }
      if (candidate && cachedTemplates) {
        const record: TerrainSurfaceRecord = { key, block: next!.block, templates: cachedTemplates, role: next!.role === 'reference' ? 'reference' : 'normal' };
        this.renderedBlocks.set(key, { key, block: next!.block, signature: next!.signature, role: next!.role, revision: 0, provider: this.visualProvider, reusableVisualKey: candidate.reusableKey });
        preparedTerrainRecords.set(key, record);
        preparedTerrainCandidates.set(key, candidate);
        terrainChanges.push({ key, position: next!.block.position, after: record, afterOpaque: next!.role === 'normal' });
      } else if (candidate) {
        this.renderedBlocks.set(key, { key, block: next!.block, signature: next!.signature, role: next!.role, revision: 0 });
        terrainChanges.push({ key, position: next!.block.position, afterOpaque: false });
        terrainCandidates.push(candidate);
      } else {
        terrainChanges.push({ key, position: next!.block.position, afterOpaque: false });
        this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, projectionRevision: this.projectionRevisionForKey(key), key, block: next!.block, signature: next!.signature, role: next!.role, worldContext, options, allowInstancing: true, surfaceFastPathEligible: options.exposedFaceRendering === true && isCompiledTerrainEntry(next!), surfaceVisibleEntries: this.cachedVisibleMap });
      }
    }
    // Keep existing terrain records for affected neighbors while updating only
    // occupancy at the changed voxel positions.
    for (const [key, position] of affectedPositions) {
      if (fluidKeys.has(key)) continue;
      if (renderableKeys.has(key) && terrainChanges.some((change) => change.key === key)) continue;
      const entry = this.cachedVisibleMap.get(key);
      const terrain = entry && isCompiledTerrainEntry(entry) ? this.terrainRenderer.templatesFor(this.visualProvider ? this.requestReusableVisualKey(this.visualProvider, entry.block, worldContext) ?? '' : '') : undefined;
      terrainChanges.push({ key, position, afterOpaque: !!terrain });
    }
    const terrainResult = this.terrainRenderer.applyBlockChanges(terrainChanges, true, [...delta.hydrationInvalidatedKeys]);
    if (!terrainResult.pending) this.commitTerrainRecords(preparedTerrainRecords.values(), terrainResult);
    const representedTerrainKeys = new Set(terrainResult.representedKeys);
    if (!terrainResult.pending) this.enqueueFailedTerrainCandidates([...preparedTerrainCandidates.entries()].filter(([key]) => !representedTerrainKeys.has(key)).map(([, candidate]) => candidate), lane);
    if (terrainCandidates.length) this.scheduleTerrainBatch(terrainCandidates, [], [...affectedPositions.values()], false, true, lane);
    this.updateHydrationOrder();
    this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs(), lane);
    if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    // InstanceBatchRenderer updates swap-back ownership atomically for every
    // touched entry. Full ownership reconciliation remains on structural
    // rebuilds and diagnostics, not on the local edit hot path.
    this.traceInstanceOwnership('after-reconcile', undefined, 'reconcile');
    this.runtimeTrace?.record(`${tracePrefix}-end`, { mutatedKeys: changedKeys.size, dependencyKeys: delta.dependencyKeys.size, terrainChunks: terrainResult.rebuiltChunks.length, terrainPending: terrainResult.pending ?? false });
  }

  private commitTerrainRecords(records: Iterable<TerrainSurfaceRecord>, result: TerrainApplyResult, projectionRevision = this.projectionRevision): void {
    if (projectionRevision !== this.projectionRevision) return;
    const represented = new Set(result.representedKeys);
    const failed = new Set(result.failedKeys);
    for (const key of failed) {
      const current = this.renderedBlocks.get(key);
      if (!current || represented.has(key)) continue;
      current.terrainChunkKey = undefined;
      this.ensurePlaceholderVisual(key, current.block, current.role);
      if (!this.pendingHydrationSignatures.has(key)) this.placeholderSignatures.set(key, current.signature);
    }
    for (const record of records) {
      const current = this.renderedBlocks.get(record.key);
      if (!current || current.signature !== this.cachedVisibleMap.get(record.key)?.signature) continue;
      if (!represented.has(record.key)) continue;
      current.terrainChunkKey = chunkKey(record.block.position);
      this.pendingHydrationSignatures.delete(record.key);
      this.placeholderSignatures.delete(record.key);
      this.placeholderRenderer.removeBulk([record.key]);
    }
    const hydrationKeys = [...new Set(result.hydrationCandidateKeys ?? result.changedKeys)].filter((key) => represented.has(key));
    if (hydrationKeys.length) {
      this.completeHydrationBatch(this.hydrationGeneration, hydrationKeys);
      this.runtimeTrace?.record('terrain-commit-hydration', { candidateKeys: (result.hydrationCandidateKeys ?? result.changedKeys).length, completedKeys: hydrationKeys.length, publishCount: 1 });
    }
  }

  private updateHydrationOrder(): void {
    const normal: BlockHydrationJob[] = [], reference: BlockHydrationJob[] = [], missing: BlockHydrationJob[] = [];
    for (const job of this.hydrationWork.regularJobs()) (job.role === 'normal' ? normal : job.role === 'reference' ? reference : missing).push(job);
    this.hydrationWork.replaceRegular([...normal, ...reference, ...missing]);
  }

  private scheduleTerrainBatch(candidates: readonly TerrainHydrationCandidate[], occupancyEntries: readonly VisibleBlockEntry[], affectedPositions: readonly VoxelCoordinate[], initial: boolean, local = false, lane: HydrationLane = local ? 'local' : 'structural'): void {
    const groups = groupTerrainCandidates(candidates);
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate] as const));
    const token = this.hydrationGeneration;
    const projectionRevision = this.projectionRevision;
    const projectionRevisions = new Map(candidates.map((candidate) => [candidate.key, this.projectionRevisionForKey(candidate.key)] as const));
    const providerGeneration = this.providerGeneration;
    const resolved = [...groups.entries()].map(([reusableKey, group]) => {
      const cached = this.terrainRenderer.templatesFor(reusableKey);
      if (cached) return Promise.resolve({ reusableKey, group, templates: cached, owned: false });
      this.terrainHydrationPending += 1;
      return this.resolveTerrainTemplates(reusableKey, group[0].next.block, group[0].worldContext, group[0].provider)
        .then((templates) => ({ reusableKey, group, templates, owned: true }), () => ({ reusableKey, group, templates: undefined, owned: false }));
    });
    const pendingGroups = resolved.filter((_, index) => !this.terrainRenderer.templateCache.has([...groups.keys()][index])).length;
    if (pendingGroups) this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs(), lane);
    void Promise.all(resolved).then((results) => {
      const staleProjection = [...projectionRevisions].some(([key, revision]) => this.projectionRevisionForKey(key) !== revision);
      if (token !== this.hydrationGeneration || staleProjection || providerGeneration !== this.providerGeneration || this.disposed) {
        for (const result of results) if (result.owned && result.templates && ![...this.terrainRenderer.templateCache.values()].some((templates) => templates === result.templates)) this.disposeTerrainTemplates(result.templates);
        this.terrainHydrationPending = Math.max(0, this.terrainHydrationPending - pendingGroups);
        // A structural batch can become stale because a local edit replaced
        // its projection while the provider promise was pending. Requeue the
        // current representation in the lane that owns that replacement; do
        // not resurrect the old global build indicator.
        if (!this.disposed && token === this.hydrationGeneration && providerGeneration === this.providerGeneration) this.enqueueFailedTerrainCandidates(candidates, this.hydrationLane);
        return;
      }
      const usable: TerrainSurfaceRecord[] = [];
      const failed: TerrainHydrationCandidate[] = [];
      for (const result of results) {
        if (result.templates) {
          this.terrainRenderer.cacheTemplates(result.reusableKey, result.templates);
          for (const candidate of result.group) {
            const current = this.renderedBlocks.get(candidate.key);
            if (!current || current.signature !== candidate.next.signature) continue;
            usable.push({ key: candidate.key, block: candidate.next.block, templates: result.templates, role: candidate.next.role === 'reference' ? 'reference' : 'normal' });
          }
        } else failed.push(...result.group);
      }
      const result = local
        ? this.terrainRenderer.applyBlockChanges(usable.map((record) => ({ key: record.key, position: record.block.position, after: record, afterOpaque: record.role === 'normal' })), true)
        : this.terrainRenderer.bulkUpsert(usable, initial ? occupancyEntries : undefined, affectedPositions, { initial });
      if (!result.pending) this.commitTerrainRecords(usable, result, projectionRevision);
      const represented = new Set(result.representedKeys);
      for (const record of usable) if (!result.pending && !represented.has(record.key)) {
        const candidate = candidateByKey.get(record.key);
        if (candidate) failed.push(candidate);
      }
      this.enqueueFailedTerrainCandidates(failed, lane);
      this.terrainHydrationPending = Math.max(0, this.terrainHydrationPending - pendingGroups);
      this.recordProviderCacheStats();
      this.scheduleRender();
      if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    }).catch(() => {
      // Promise.all is intentionally normalized above; this is only a guard
      // for an unexpected coordinator failure.
      this.terrainHydrationPending = Math.max(0, this.terrainHydrationPending - pendingGroups);
      this.enqueueFailedTerrainKeys(candidates.map((candidate) => candidate.key), lane);
    });
  }

  private enqueueFailedTerrainCandidates(candidates: readonly TerrainHydrationCandidate[], lane: HydrationLane = this.hydrationLane): void {
    this.enqueueFailedTerrainKeys(candidates.map((candidate) => candidate.key), lane);
  }

  /** Reconstructs fallback work from current viewport state after an async terrain disposition. */
  private enqueueFailedTerrainKeys(keys: readonly string[], lane: HydrationLane = this.hydrationLane): void {
    const candidates = new Set<string>();
    for (const key of keys) {
      const next = this.cachedVisibleMap.get(key);
      const current = this.renderedBlocks.get(key);
      if (!next || !current || current.signature !== next.signature) continue;
      if (this.runningHydrationKeys.get(key) === this.hydrationGeneration) continue;
      candidates.add(key);
    }
    if (!candidates.size) return;
    this.hydrationWork.removePendingKeys(candidates);
    const worldContext = { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) };
    for (const key of candidates) {
      const next = this.cachedVisibleMap.get(key);
      if (!next) continue;
      // Terrain failure is only a surface-representation failure. Let the
      // static classifier prove whether the provider visual can still batch.
      this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, projectionRevision: this.projectionRevisionForKey(key), key, block: next.block, signature: next.signature, role: next.role, worldContext, options: this.renderOptions, allowInstancing: true, surfaceFastPathEligible: false, surfaceVisibleEntries: this.cachedVisibleMap });
    }
    this.instrumentation.record('terrainAsyncFallbackKeys', candidates.size);
    this.updateHydrationOrder();
    this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs(), lane);
    this.scheduleHydrationPump();
  }

  private resolveTerrainTemplates(reusableKey: string, block: ProjectDocument['blocks'][number], worldContext: TerrainHydrationCandidate['worldContext'], provider: BlockVisualProvider): Promise<readonly SurfaceFaceTemplate[] | undefined> {
    const existing = this.pendingTerrainTemplates.get(reusableKey);
    if (existing) return existing;
    const pending = this.createProviderVisual(provider, block, worldContext).then((visual) => {
      if (!visual.object) return undefined;
      const templates = extractSurfaceFaceTemplates(visual.object);
      disposeObject(visual.object);
      return templates;
    });
    this.pendingTerrainTemplates.set(reusableKey, pending);
    void pending.then(() => { if (this.pendingTerrainTemplates.get(reusableKey) === pending) this.pendingTerrainTemplates.delete(reusableKey); }, () => { if (this.pendingTerrainTemplates.get(reusableKey) === pending) this.pendingTerrainTemplates.delete(reusableKey); });
    return pending;
  }

  private disposeTerrainTemplates(templates: readonly SurfaceFaceTemplate[]): void {
    for (const template of templates) { template.geometry.dispose(); template.material.dispose(); }
  }

  private visibleBlocks(project: ProjectDocument, options: ViewportRenderOptions, countScan = true): readonly VisibleBlockEntry[] {
    if (countScan) this.instrumentation.record('fullVisibleScans');
    return visibleBlockEntries(project, { ...canonicalRenderOptions(options), layerIndex: options.layerIndex ?? this.layerIndex }).map((block) => {
      return this.visibleEntry(block, options);
    });
  }

  private updateInteriorCulling(visible: readonly VisibleBlockEntry[], full: boolean, changed: ReadonlySet<string>): void {
    const entries = new Map(visible.map((entry) => [coordinateKey(entry.block.position), { block: entry.block, role: entry.role, occlusionClass: entry.occlusionClass }] as const));
    if (full) {
      for (const key of this.culledBlockKeys) this.instrumentation.record('interiorBlocksCulled', -1);
      this.culledBlockKeys.clear();
      for (const entry of visible) {
        this.instrumentation.record('interiorCullingChecks');
        this.setInteriorCulled(entries.get(coordinateKey(entry.block.position))!, hasConfirmedOpaqueNeighbors(entries.get(coordinateKey(entry.block.position))!, entries));
      }
      return;
    }
    for (const key of [...this.culledBlockKeys]) if (!entries.has(key)) {
      this.culledBlockKeys.delete(key);
      this.instrumentation.record('interiorBlocksCulled', -1);
    }
    const dirty = new Set<string>();
    for (const key of changed) {
      dirty.add(key);
      const position = entries.get(key)?.block.position ?? this.previousVisibleBlockPositions.get(key);
      if (!position) continue;
      for (const neighbor of coordinateNeighbors(position)) dirty.add(coordinateKey(neighbor));
    }
    for (const key of dirty) {
      const entry = entries.get(key);
      if (!entry) continue;
      this.instrumentation.record('interiorCullingChecks');
      this.setInteriorCulled(entry, hasConfirmedOpaqueNeighbors(entry, entries));
    }
  }

  private setInteriorCulled(entry: { readonly block: ProjectDocument['blocks'][number] }, culled: boolean): void {
    const key = coordinateKey(entry.block.position);
    const previous = this.culledBlockKeys.has(key);
    if (culled === previous) return;
    if (culled) { this.culledBlockKeys.add(key); this.instrumentation.record('interiorBlocksCulled'); }
    else { this.culledBlockKeys.delete(key); this.instrumentation.record('interiorBlocksCulled', -1); }
  }

  private visibleSelection(project: ProjectDocument | undefined, options: ViewportRenderOptions): { readonly selected?: VoxelCoordinate; readonly positions?: readonly VoxelCoordinate[]; readonly kind?: string; readonly count?: number; readonly bounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly box?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } } {
    if (!project) return { selected: options.selected, positions: options.selectedPositions, kind: options.selectionKind, count: options.selectionCount, bounds: options.selectionBounds, box: options.selectionBox };
    const cachedProjection = this.canUseCachedVisibleProjection(project, options);
    const visible = cachedProjection ? this.cachedVisibleEntries : this.visibleBlocks(project, options);
    const visibleKeys = cachedProjection ? this.cachedVisibleMap : new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    const isInProjection = (position: VoxelCoordinate): boolean => visibleKeys.has(coordinateKey(position)) && (!this.isolationPresentation.isActive() || this.isolatedKeys.has(coordinateKey(position)));
    const positions = (options.selectedPositions ?? []).filter(isInProjection);
    const selected = options.selected && isInProjection(options.selected) ? options.selected : undefined;
    const inBounds = (position: VoxelCoordinate, bounds: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }): boolean => position.x >= bounds.min.x && position.x <= bounds.max.x && position.y >= bounds.min.y && position.y <= bounds.max.y && position.z >= bounds.min.z && position.z <= bounds.max.z;
    const boundedVisible = options.selectionBounds ? visible.filter((entry) => inBounds(entry.block.position, options.selectionBounds!) && isInProjection(entry.block.position)).map((entry) => entry.block.position) : [];
    const bounds = options.selectionBounds ? boundsOfPositions(boundedVisible) : undefined;
    const box = options.selectionBox && visible.some((entry) => inBounds(entry.block.position, options.selectionBox!) && isInProjection(entry.block.position)) ? options.selectionBox : undefined;
    const count = options.selectionBounds ? boundedVisible.length : positions.length || (selected ? 1 : 0);
    return { selected, positions, kind: options.selectionKind, count, bounds, box };
  }

  private canUseCachedVisibleProjection(project: ProjectDocument, options: ViewportRenderOptions): boolean {
    if (this.cachedVisibleProject === project && this.cachedVisibleKey === renderFilterKey(options)) return true;
    const pending = this.pendingProjection;
    return pending?.project === project
      && pending.options.visibility === 'whole-structure'
      && this.committedProjection?.options.visibility === 'whole-structure';
  }

  private setHydrationBlockScope(entries: readonly VisibleBlockEntry[]): void {
    this.hydrationProgressTracker.setBlockScope(entries.map((entry) => coordinateKey(entry.block.position)));
    for (const entry of entries) {
      const key = coordinateKey(entry.block.position);
      this.hydrationProgressTracker.syncMissingBlockState(key, entry.block.kind === 'missing' ? (this.missingBlocksTerminal ? 'permanent' : 'provisional') : 'resolved');
    }
    this.hydrationProgressTracker.refresh();
  }

  private recordMissingAccountingInvariant(checkpoint: string): void {
    if (!this.runtimeDiagnosticsEnabled && !this.runtimeTrace?.isActive) return;
    const projectMissing = new Set((this.project?.blocks ?? []).filter((block) => block.kind === 'missing').map((block) => coordinateKey(block.position)));
    const staleKeys = this.hydrationProgressTracker.missingStateKeys().filter((key) => !projectMissing.has(key));
    if (staleKeys.length) this.runtimeTrace?.record('missing-accounting-anomaly', { checkpoint, staleKeys: staleKeys.length });
  }

  private adoptCommittedBlockOwnership(entries: readonly VisibleBlockEntry[]): void {
    const candidates = entries.map((entry) => {
      const key = coordinateKey(entry.block.position);
      const rendered = this.renderedBlocks.get(key);
      const committed = this.culledBlockKeys.has(key) || (!!rendered
        && rendered.signature === entry.signature
        && rendered.role === entry.role
        && !this.pendingHydrationSignatures.has(key)
        && !this.placeholderSignatures.has(key)
        && !this.placeholderIndices.has(key)
        && this.hasCommittedBlockOwnership(key, rendered));
      return { key, signature: entry.signature, committedSignature: committed ? entry.signature : undefined, visible: true, committed };
    });
    const adopted = adoptCommittedHydrationKeys(candidates);
    if (adopted.length) this.hydrationProgressTracker.adoptBlockKeys(this.hydrationGeneration, adopted);
  }

  private hasCommittedBlockOwnership(key: string, entry: RenderedBlockEntry): boolean {
    return entry.terrainChunkKey !== undefined
      || this.terrainRenderer.isRepresented(key)
      || entry.surfaceFaceMemberships !== undefined
      || this.surfaceFaceOwnership.has(key)
      || (entry.object !== undefined && entry.object !== entry.fallback)
      || entry.instanceBatchKey !== undefined
      || this.instanceOwnershipIndex.has(key)
      || entry.fallback?.userData['renderMode'] !== undefined
      || (entry.fluidChunkKey !== undefined && this.fluidCoordinator.isTerminal(key));
  }

  private setHydrationDecorationScope(ids: readonly string[]): void {
    this.hydrationProgressTracker.setDecorationScope(ids);
  }

  private adoptCommittedDecorationOwnership(entries: readonly PlacedDecoration[]): void {
    const adopted = entries
      .filter((decoration) => {
        const entry = this.renderedDecorations.get(decoration.instanceId);
        return entry?.signature === `${decorationSignature(decoration)}|${this.decorationRevision}`
          && !this.pendingDecorationSignatures.has(decoration.instanceId);
      })
      .map((decoration) => decoration.instanceId);
    if (adopted.length) this.hydrationProgressTracker.adoptDecorationIds(this.hydrationGeneration, adopted);
  }

  private hydrationLane: HydrationLane = 'structural';

  private beginHydrationProgress(_blocksWork: number, _decorationsWork: number, lane = this.hydrationLane): void {
    this.hydrationLane = lane;
    this.hydrationProgressTracker.setLane(lane);
    this.hydrationProgressTracker.begin(this.hydrationGeneration, lane);
  }

  private completeHydrationPart(token: number, kind: 'block' | 'decoration', key: string): void {
    this.hydrationProgressTracker.complete(token, kind, key);
  }

  private completeHydrationBatch(token: number, keys: readonly string[]): void {
    this.hydrationProgressTracker.completeBatch(token, 'block', keys);
  }

  private publishHydrationProgress(progress: ViewportHydrationProgress): void {
    // Kept as a narrow test seam; normal accounting lives in the tracker.
    this.hydrationProgressTracker.publish(progress as HydrationProgressSnapshot);
  }

  private resetHydrationProgress(): void {
    this.hydrationProgressTracker.reset(this.hydrationGeneration);
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

  private scheduleHydrationPump(delay: boolean | number = false): void {
    if (this.disposed || this.suspended) return;
    const run = () => { this.hydrationScheduled = false; this.hydrationTimer = undefined; this.processHydrationBatch(); };
    if (this.hydrationScheduler.isScheduled) return;
    this.hydrationScheduler.schedule(run, !delay ? undefined : typeof delay === 'number' ? delay : 0);
    this.hydrationScheduled = true;
  }

  private queuedBlockHydrationJobs(): number {
    return this.hydrationWork.queuedTotal();
  }
  private queuedDecorationHydrationJobs(): number { return this.decorationHydrationQueue.length - this.decorationHydrationQueueHead; }
  private compactHydrationQueues(): void { this.hydrationWork.compact(); if (this.decorationHydrationQueueHead > 0) { this.decorationHydrationQueue = this.decorationHydrationQueue.slice(this.decorationHydrationQueueHead); this.decorationHydrationQueueHead = 0; } }
  private compactConsumedHydrationQueues(): void { this.hydrationWork.compactConsumed(); if (this.decorationHydrationQueueHead === this.decorationHydrationQueue.length) { this.decorationHydrationQueue = []; this.decorationHydrationQueueHead = 0; } }

  private processHydrationBatch(): void {
    if (this.disposed || this.suspended) return;
    const traceActive = !!this.runtimeTrace?.isActive;
    const batchStarted = traceActive ? performance.now() : 0;
    const token = this.hydrationGeneration;
    const interactive = this.isCameraInteracting();
    const now = performance.now();
    if (this.hydrationBatchDeadline <= now || this.hydrationBatchBudget <= 0) {
      this.hydrationBatchDeadline = now + (interactive ? VIEWPORT_INTERACTIVE_HYDRATION_SYNC_BUDGET_MS : VIEWPORT_HYDRATION_SYNC_BUDGET_MS);
      this.hydrationBatchBudget = interactive ? VIEWPORT_INTERACTIVE_HYDRATION_MAX_JOBS_PER_BATCH : VIEWPORT_HYDRATION_BATCH_SIZE;
    }
    const deadline = this.hydrationBatchDeadline;
    const maxJobs = interactive ? VIEWPORT_INTERACTIVE_HYDRATION_MAX_JOBS_PER_BATCH : VIEWPORT_HYDRATION_MAX_JOBS_PER_BATCH;
    let started = 0;
    this.instrumentation.record('hydrationBatches');
    while (this.hydrationWork.canStart() && this.queuedBlockHydrationJobs() && started < maxJobs && performance.now() < deadline) {
      const deferralsBefore = this.hydrationWork.fairnessDeferrals();
      const job = this.hydrationWork.takeNext(token);
      if (!job) break;
      const deferralsAfter = this.hydrationWork.fairnessDeferrals();
      if (deferralsAfter > deferralsBefore) this.instrumentation.record('hydrationFairnessDeferrals', deferralsAfter - deferralsBefore);
      if (!job.providerRefresh) this.pendingHydrationSignatures.delete(job.key);
      started += 1;
      if (interactive) this.instrumentation.record('hydrationJobsStartedWhileCamera');
      this.hydrationBatchBudget -= 1;
      this.instrumentation.record(job.providerRefresh ? 'providerRefreshStarted' : 'regularHydrationStarted');
      if (job.providerRefresh) {
        const counts = this.hydrationWork.counts();
        if (counts.regularQueued > 0) this.instrumentation.record('maxProviderRefreshRunningWhileRegularPending', Math.max(0, counts.providerRefreshRunning - this.instrumentation.snapshot().maxProviderRefreshRunningWhileRegularPending));
      }
      if (!job.providerRefresh) {
        this.runningHydrationKeys.set(job.key, job.token);
        this.runningHydrationRevisions.set(job.key, job.projectionRevision);
        this.runningHydrationSignatures.set(job.key, job.signature);
      }
      this.hydrationRunningByGeneration.set(job.token, (this.hydrationRunningByGeneration.get(job.token) ?? 0) + 1);
      const complete = () => this.completeHydrationJob(job);
      try {
        if (job.providerRefresh) this.refreshBlockEntry(job, complete);
        else this.createBlockEntry(job.block, job.signature, job.role, job.worldContext, job.options, job.allowInstancing, job.surfaceFastPathEligible, job.surfaceVisibleEntries, complete);
      } catch (error: unknown) {
        // Cached/template insertion is synchronous and can fail before a
        // provider promise exists. Convert that failure into a final fallback
        // so one malformed visual cannot terminate the entire pump.
        this.rollbackPartialInstanceVisual(job.key);
        if (!job.providerRefresh) this.markHydrationFailure(job, error);
        complete();
      }
    }
    this.processDecorationBatch(token, deadline);
    const workRemaining = this.queuedBlockHydrationJobs() || this.queuedDecorationHydrationJobs();
    if (workRemaining && this.hydrationRunning === 0) {
      const budgetExhausted = this.hydrationBatchBudget <= 0 || performance.now() >= this.hydrationBatchDeadline;
      if (budgetExhausted) { this.hydrationBatchBudget = 0; this.hydrationBatchDeadline = 0; this.scheduleHydrationPump(true); }
      else this.scheduleHydrationPump(false);
    } else if (!workRemaining && this.hydrationRunning === 0) {
      this.hydrationBatchBudget = 0;
      this.hydrationBatchDeadline = 0;
    }
    this.compactConsumedHydrationQueues();
    if (traceActive) this.runtimeTrace?.recordDuration('processHydrationBatch', performance.now() - batchStarted);
  }

  private completeHydrationJob(job: BlockHydrationJob): void {
    const runningIsCurrent = !job.providerRefresh
      && this.runningHydrationKeys.get(job.key) === job.token
      && this.runningHydrationRevisions.get(job.key) === job.projectionRevision
      && this.runningHydrationSignatures.get(job.key) === job.signature;
    if (runningIsCurrent) {
      this.runningHydrationKeys.delete(job.key);
      this.runningHydrationRevisions.delete(job.key);
      this.runningHydrationSignatures.delete(job.key);
    }
    this.hydrationWork.complete(job);
    this.instrumentation.record(job.providerRefresh ? 'providerRefreshCompleted' : 'regularHydrationCompleted');
    if (job.providerRefresh && job.providerRefreshGeneration === this.providerRefreshGeneration && this.providerRefreshProgress) {
      this.providerRefreshProgress.completed = Math.min(this.providerRefreshProgress.total, this.providerRefreshProgress.completed + 1);
      const counts = this.hydrationWork.counts();
      if (!counts.providerRefreshQueued && !counts.providerRefreshRunning) {
        const durationMs = performance.now() - this.providerRefreshProgress.startedAt;
        this.runtimeTrace?.record('provider-refresh-end', { completed: this.providerRefreshProgress.completed, durationMs });
        this.providerRefreshProgress = undefined;
      }
      this.publishProviderRefreshProgress();
    }
    const generationRunning = Math.max(0, (this.hydrationRunningByGeneration.get(job.token) ?? 1) - 1);
    if (generationRunning) this.hydrationRunningByGeneration.set(job.token, generationRunning); else this.hydrationRunningByGeneration.delete(job.token);
    const currentVisible = this.cachedVisibleMap.get(job.key);
    const authoritative = !job.providerRefresh
      && job.projectionRevision === this.projectionRevisionForKey(job.key)
      && currentVisible?.signature === job.signature
      && currentVisible.role === job.role;
    if (!job.providerRefresh && !authoritative) {
      this.instrumentation.record('staleHydrationCompletionsIgnored');
    } else if (!job.providerRefresh && job.block.kind !== 'missing') {
      this.completeHydrationPart(job.token, 'block', job.key);
    }
    this.scheduleHydrationPump(this.hydrationBatchBudget > 0 && performance.now() < this.hydrationBatchDeadline ? false : true);
  }

  private markHydrationFailure(job: BlockHydrationJob, error: unknown): void {
    const entry = this.renderedBlocks.get(job.key);
    if (!entry) return;
    const fallback = this.ensureFallbackVisual(entry);
    fallback.userData['renderMode'] = 'fallback';
    fallback.userData['diagnostics'] = [{ code: 'GEOMETRY_BUILD_FAILED', message: error instanceof Error ? error.message : 'Visual construction failed' }];
    this.scheduleRender();
  }

  private rollbackPartialInstanceVisual(key: string): void {
    this.removeSurfaceFaceVisual(key, this.renderedBlocks.get(key));
    this.removeOrphanedInstanceMemberships(key, 'rollback');
  }

  private processDecorationBatch(token: number, deadline: number): void {
    let processed = 0;
    const interactive = this.isCameraInteracting();
    const maxJobs = interactive ? VIEWPORT_INTERACTIVE_HYDRATION_MAX_JOBS_PER_BATCH : VIEWPORT_HYDRATION_MAX_JOBS_PER_BATCH;
    while (processed < maxJobs && this.queuedDecorationHydrationJobs() && performance.now() < deadline) {
      const job = this.decorationHydrationQueue[this.decorationHydrationQueueHead++];
      if (job.token !== token || token !== this.hydrationGeneration) continue;
      if (interactive) this.instrumentation.record('hydrationJobsStartedWhileCamera');
      this.pendingDecorationSignatures.delete(job.id);
      this.instrumentation.record('decorationVisualCreations');
      const visual = createDecorationVisual(job.decoration, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual, false);
      visual.userData['decorationInstanceId'] = job.id; visual.userData['decoration'] = job.decoration;
      visual.traverse((child) => { child.userData['decorationInstanceId'] = job.id; child.userData['decoration'] = job.decoration; });
      this.decorationsGroup.add(visual);
      const entry = { id: job.id, decoration: job.decoration, signature: job.signature, object: visual };
      this.renderedDecorations.set(job.id, entry);
      this.hydrateDecorationItemPreview(entry);
      this.completeHydrationPart(job.token, 'decoration', job.id);
      processed += 1;
    }
    if (processed > 0) this.scheduleRender();
  }

  private cancelHydration(reason: HydrationCancellationReason = 'structure-sync-key-changed', context: Readonly<Record<string, unknown>> = {}): void {
    const previousGeneration = this.hydrationGeneration;
    this.hydrationGeneration += 1;
    this.runtimeTrace?.record('hydration-generation-start', {
      ...context,
      reason,
      previousGeneration,
      generation: this.hydrationGeneration,
      providerGeneration: this.providerGeneration,
      specialVisualRevision: this.specialVisualRevision,
      providerReady: !!this.visualProvider,
      projectId: this.project?.id,
      syncedProjectId: this.syncedProject?.id,
      queuedBlockHydrationJobs: this.queuedBlockHydrationJobs(),
      queuedDecorationHydrationJobs: this.queuedDecorationHydrationJobs(),
      hydrationRunning: this.hydrationRunning,
      pendingSignatureCount: this.pendingHydrationSignatures.size,
      placeholderSignatureCount: this.placeholderSignatures.size,
      placeholderVisualCount: this.placeholderIndices.size,
      renderedBlockCount: this.renderedBlocks.size,
      terrainHydrationPending: this.terrainHydrationPending,
      cameraInteractionInProgress: this.cameraGestureInProgress || this.pressedActions.size > 0,
    });
    if (this.cameraGestureInProgress || this.pressedActions.size > 0) this.instrumentation.record('cameraOnlyGenerationChanges');
    this.instrumentation.record('hydrationGenerations');
    if (this.queuedBlockHydrationJobs() || this.hydrationRunning) this.instrumentation.record('cancelledHydrations');
    this.hydrationWork.clearPending();
    this.pendingHydrationSignatures.clear();
    this.terrainHydrationPending = 0;
    this.runningHydrationKeys.clear();
    this.runningHydrationRevisions.clear();
    this.runningHydrationSignatures.clear();
    this.cancelDecorationHydration();
    this.hydrationBatchBudget = 0;
    this.hydrationBatchDeadline = 0;
    this.hydrationScheduler.cancel();
    this.hydrationTimer = undefined;
    this.hydrationScheduled = false;
    this.hydrationProgressTracker.clear();
    this.providerRefreshPlanner.cancel();
    this.providerRefreshProgress = undefined;
    this.providerRefreshPlanning = false;
    this.hydrationLane = 'structural';
    this.hydrationProgressTracker.setLane('structural');
    this.resetHydrationProgress();
  }

  private cancelDecorationHydration(): void {
    this.decorationHydrationQueue = [];
    this.decorationHydrationQueueHead = 0;
    this.pendingDecorationSignatures.clear();
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
    this.placeholderRenderer.ensure(key, block.position, role);
  }

  private ensurePlaceholderVisualsBulk(entries: readonly VisibleBlockEntry[]): void {
    this.placeholderRenderer.ensureBulk(entries.map((entry) => ({ key: coordinateKey(entry.block.position), position: entry.block.position, role: entry.role })));
  }

  /** Builds a changed provider visual off to the side and swaps it atomically. */
  private refreshBlockEntry(job: BlockHydrationJob, onComplete?: () => void): void {
    this.invalidateStaticModelDiagnostics();
    const entry = this.renderedBlocks.get(job.key);
    const provider = this.visualProvider;
    if (!entry || !provider) { onComplete?.(); return; }
    const generation = this.providerGeneration;
    const revision = ++entry.revision;
    const reusableKey = this.requestReusableVisualKey(provider, job.block, job.worldContext);
    const visualPromise = job.surfaceFastPathEligible && reusableKey
      ? this.resolveTerrainHydration(reusableKey, job.block, job.worldContext, provider)
      : this.createProviderVisual(provider, job.block, job.worldContext);
    void visualPromise.then((visual) => {
      const current = this.renderedBlocks.get(job.key);
      if (generation !== this.providerGeneration || provider !== this.visualProvider || current !== entry || entry.revision !== revision) {
        if (visual.object) disposeObject(visual.object);
        return;
      }
      if (visual.terrainTemplates && reusableKey) {
        this.terrainRenderer.cacheTemplates(reusableKey, visual.terrainTemplates);
        if (entry.terrainChunkKey !== undefined) {
          if (!this.addTerrainVisual(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal')) return;
          entry.provider = provider;
          entry.reusableVisualKey = reusableKey;
        } else {
          this.removeBlockEntry(job.key, entry);
          if (!this.addTerrainVisual(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal')) return;
          const replacement: RenderedBlockEntry = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider, reusableVisualKey: reusableKey, terrainChunkKey: chunkKey(job.block.position) };
          this.renderedBlocks.set(job.key, replacement);
        }
        this.recordProviderCacheStats();
        this.scheduleRender();
        return;
      }
      if (!visual.object) return;
      const object = visual.object;
      object.userData['realModel'] = true;
      object.userData['voxel'] = job.block.position;
      object.userData['renderRole'] = job.role;
      object.userData['renderMode'] = visual.mode;
      object.userData['renderTrace'] = visual.trace;
      object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
      applyBlockBrightnessToObject(object, this.blockBrightness);
      translateVisualToVoxel(object, job.block.position);
      object.traverse((child) => {
        child.userData['voxel'] = job.block.position;
        child.userData['renderRole'] = job.role;
        child.userData['realModel'] = true;
      });
      this.removeBlockEntry(job.key, entry);
      const replacement: RenderedBlockEntry = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider };
      const staticBatchingAllowed = job.role !== 'missing' && this.instanceRenderer.shouldAttempt(true, reusableKey);
      replacement.reusableVisualKey = reusableKey;
      replacement.staticModelAttempted = staticBatchingAllowed;
      replacement.staticModelFamily = visualFamily(object) ?? familyFromReusableKey(reusableKey);
      const instance = staticBatchingAllowed ? this.addInstanceVisual(object, job.block, job.key, reusableKey, 'provider-async', job.role) : undefined;
      if (instance) {
        replacement.instanceBatchKey = instance.batchKey;
        replacement.instanceIndex = instance.index;
        replacement.object = this.instanceBatches.get(instance.batchKey)!.parts[0];
        replacement.staticModelDecision = this.instanceRenderer.decisionFor(job.key);
        disposeObject(object);
      } else {
        if (job.role === 'reference') applyReferenceOpacityToObject(object, job.options.referenceOpacity ?? .28);
        replacement.staticModelDecision = this.instanceRenderer.decisionFor(job.key);
        replacement.object = object;
        this.blocksGroup.add(object);
      }
      this.renderedBlocks.set(job.key, replacement);
      this.recordProviderCacheStats();
      this.releaseUnusedRetiredProviders();
      this.scheduleRender();
    }).catch(() => {
      // Keep the old committed visual on a failed provider refresh.
    }).finally(() => onComplete?.());
  }

  private removePlaceholderVisual(key: string): void {
    this.placeholderRenderer.remove(key);
  }

  private clearPlaceholderVisuals(): void {
    this.placeholderRenderer.clear();
  }

  private createBlockEntry(block: ProjectDocument['blocks'][number], signature: string, role: RenderedBlockEntry['role'], worldContext: { getBlock(position: VoxelCoordinate): ProjectDocument['blocks'][number] | undefined }, options: ViewportRenderOptions, allowInstancing: boolean, surfaceFastPathEligible: boolean, surfaceVisibleEntries: ReadonlyMap<string, VisibleBlockEntry>, onComplete?: () => void): void {
    this.invalidateStaticModelDiagnostics();
    const key = coordinateKey(block.position);
    const existing = this.renderedBlocks.get(key);
    if (existing) this.removeBlockEntry(key, existing);
    else if (this.instanceOwnershipIndex.has(key)) this.removeOrphanedInstanceMemberships(key, 'reconcile');
    this.removePlaceholderVisual(key);
    const entry: RenderedBlockEntry = { key, block, signature, role, revision: 0, provider: this.visualProvider };
    this.renderedBlocks.set(entry.key, entry);
    const providerAvailable = !!this.visualProvider && block.kind !== 'missing';
    const provider = this.visualProvider;
    const reusableKey = providerAvailable ? this.requestReusableVisualKey(provider!, block, worldContext) : undefined;
    const staticBatchingAllowed = providerAvailable && role !== 'missing' && this.instanceRenderer.shouldAttempt(allowInstancing || surfaceFastPathEligible, reusableKey);
    entry.staticModelAttempted = staticBatchingAllowed;
    entry.staticModelFamily = familyFromReusableKey(reusableKey) ?? entry.staticModelFamily;
    const cachedTemplates = reusableKey ? this.instanceRenderer.templateFor(reusableKey) : undefined;
    const cachedTerrainTemplates = surfaceFastPathEligible && reusableKey ? this.terrainRenderer.templatesFor(reusableKey) : undefined;
    const cachedSurfaceTemplates = surfaceFastPathEligible && reusableKey ? this.surfaceTemplateCache.get(reusableKey) : undefined;
    if (providerAvailable && cachedTerrainTemplates) {
      if (this.addTerrainVisual(block, entry.key, cachedTerrainTemplates, role === 'reference' ? 'reference' : 'normal')) {
        entry.terrainChunkKey = chunkKey(block.position); entry.reusableVisualKey = reusableKey;
        onComplete?.(); this.scheduleRender(); return;
      }
    }
    if (providerAvailable && cachedSurfaceTemplates) {
      const memberships = this.addSurfaceFaceVisual(block, entry.key, cachedSurfaceTemplates, surfaceVisibleEntries);
      if (memberships) {
        entry.surfaceFaceMemberships = memberships;
        entry.surfaceExposedFaceCount = memberships.length;
        entry.surfaceNeighborFacesCulled = 6 - memberships.length;
        entry.object = memberships.length ? this.surfaceFaceBatches.get(memberships[0].batchKey)?.mesh : undefined;
        onComplete?.(); this.scheduleRender(); return;
      }
    }
    if (providerAvailable && cachedTemplates && !surfaceFastPathEligible && staticBatchingAllowed) {
      const instance = this.addInstanceVisualFromTemplates(cachedTemplates.templates, block, entry.key, 'cached-template', cachedTemplates, role === 'reference' ? 'reference' : 'normal');
      if (instance) {
        this.instrumentation.record('reusableTemplateCacheHits');
        this.instrumentation.record('cachedTemplateInsertions');
        entry.instanceBatchKey = instance.batchKey; entry.instanceIndex = instance.index; entry.object = this.instanceBatches.get(instance.batchKey)!.parts[0];
        entry.staticModelAttempted = true; entry.staticModelDecision = this.instanceRenderer.decisionFor(entry.key); entry.staticModelFamily = familyFromReusableKey(reusableKey) ?? entry.staticModelFamily;
        onComplete?.(); this.scheduleRender(); return;
      }
    }

    const fallback = this.ensureFallbackVisual(entry, options.referenceOpacity);
    if (providerAvailable) {
      const isReference = role === 'reference';
      const generation = this.providerGeneration; const revision = ++entry.revision;
      const visualPromise: Promise<TerrainHydrationResult> = surfaceFastPathEligible && reusableKey
        ? this.resolveTerrainHydration(reusableKey, block, worldContext, provider!)
        : this.createProviderVisual(provider!, block, worldContext);
      void visualPromise.then((visual) => {
        if (generation !== this.providerGeneration || this.renderedBlocks.get(entry.key) !== entry || entry.revision !== revision || fallback.parent !== this.blocksGroup) { if (visual.object) disposeObject(visual.object); return; }
        fallback.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics]; fallback.userData['resolvedSupport'] = visual.resolved.support; fallback.userData['renderMode'] = visual.mode; fallback.userData['renderTrace'] = visual.trace;
        if (surfaceFastPathEligible && visual.terrainTemplates && reusableKey) {
          this.terrainRenderer.cacheTemplates(reusableKey, visual.terrainTemplates);
          if (this.addTerrainVisual(block, entry.key, visual.terrainTemplates, role === 'reference' ? 'reference' : 'normal')) {
            entry.terrainChunkKey = chunkKey(block.position); entry.reusableVisualKey = reusableKey;
            this.blocksGroup.remove(fallback);
            this.recordProviderCacheStats();
            this.scheduleRender();
            return;
          }
        }
        if (!visual.object) return;
        const object = visual.object; object.userData['realModel'] = true; applyBlockBrightnessToObject(object, this.blockBrightness); translateVisualToVoxel(object, block.position);
        object.userData['voxel'] = block.position; object.userData['renderRole'] = role; object.userData['realModel'] = true; object.userData['renderMode'] = visual.mode; object.userData['renderTrace'] = visual.trace; object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
        object.traverse((child) => { child.userData['voxel'] = block.position; child.userData['renderRole'] = role; child.userData['realModel'] = true; });
        let surfaceMemberships: readonly SurfaceFaceMembership[] | undefined;
        let terrainCompiled = false;
        if (surfaceFastPathEligible && reusableKey) {
          const cachedTerrain = this.terrainRenderer.templatesFor(reusableKey);
          const templates = cachedTerrain ?? extractSurfaceFaceTemplates(object);
          if (templates) {
            if (!cachedTerrain) this.terrainRenderer.cacheTemplates(reusableKey, templates);
            terrainCompiled = this.addTerrainVisual(block, entry.key, templates, role === 'reference' ? 'reference' : 'normal');
            if (!terrainCompiled && !cachedTerrain) {
              const cachedSurface = this.surfaceTemplateCache.get(reusableKey);
              if (!cachedSurface) this.surfaceTemplateCache.set(reusableKey, templates);
              surfaceMemberships = this.addSurfaceFaceVisual(block, entry.key, cachedSurface ?? templates, surfaceVisibleEntries);
            }
          }
        }
        entry.reusableVisualKey = reusableKey; entry.staticModelAttempted = staticBatchingAllowed; entry.staticModelFamily = visualFamily(object) ?? entry.staticModelFamily;
        const instance = !terrainCompiled && surfaceMemberships === undefined && staticBatchingAllowed ? this.addInstanceVisual(object, block, entry.key, reusableKey, 'provider-async', role === 'reference' ? 'reference' : 'normal') : undefined;
        this.blocksGroup.remove(fallback);
        if (terrainCompiled) { entry.terrainChunkKey = chunkKey(block.position); entry.reusableVisualKey = reusableKey; disposeObject(object); }
        else if (surfaceMemberships !== undefined) { entry.surfaceFaceMemberships = surfaceMemberships; entry.surfaceExposedFaceCount = surfaceMemberships.length; entry.surfaceNeighborFacesCulled = 6 - surfaceMemberships.length; entry.object = surfaceMemberships.length ? this.surfaceFaceBatches.get(surfaceMemberships[0].batchKey)?.mesh : undefined; disposeObject(object); }
        else if (instance) { entry.instanceBatchKey = instance.batchKey; entry.instanceIndex = instance.index; entry.object = this.instanceBatches.get(instance.batchKey)!.parts[0]; entry.staticModelDecision = this.instanceRenderer.decisionFor(entry.key); disposeObject(object); }
        else { if (isReference) applyReferenceOpacityToObject(object, options.referenceOpacity ?? .28); entry.staticModelDecision = this.instanceRenderer.decisionFor(entry.key); this.blocksGroup.add(object); entry.object = object; }
        this.recordProviderCacheStats(); this.scheduleRender();
      }).catch((error: unknown) => { if (this.renderedBlocks.get(entry.key) !== entry || entry.revision !== revision) return; this.rollbackPartialInstanceVisual(entry.key); fallback.userData['renderMode'] = 'fallback'; fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }]; this.recordProviderCacheStats(); this.scheduleRender(); }).finally(() => onComplete?.());
    } else onComplete?.();
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
    const pending = this.pendingTerrainTemplates.get(reusableKey) ?? this.createProviderVisual(provider, block, worldContext).then((visual) => {
      if (!visual.object) return undefined;
      const templates = extractSurfaceFaceTemplates(visual.object);
      disposeObject(visual.object);
      return templates;
    });
    if (!this.pendingTerrainTemplates.has(reusableKey)) {
      this.pendingTerrainTemplates.set(reusableKey, pending);
      void pending.then(() => { if (this.pendingTerrainTemplates.get(reusableKey) === pending) this.pendingTerrainTemplates.delete(reusableKey); }, () => { if (this.pendingTerrainTemplates.get(reusableKey) === pending) this.pendingTerrainTemplates.delete(reusableKey); });
    }
    return pending.then((templates) => templates
      ? { object: undefined, terrainTemplates: templates, resolved: emptyResolvedModel(block), mode: 'real' as const, diagnostics: [], trace: { texturePaths: [], pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true } }
      : this.createProviderVisual(provider, block, worldContext));
  }

  private ensureFallbackVisual(entry: RenderedBlockEntry, referenceOpacity = .28): THREE.Mesh {
    if (entry.fallback) return entry.fallback;
    if (!this.fallbackGeometryCounted) { this.instrumentation.record('fallbackGeometryConstructions'); this.fallbackGeometryCounted = true; }
    if (!this.fallbackMaterialRoles.has(entry.role)) { this.instrumentation.record('fallbackMaterialCreations'); this.fallbackMaterialRoles.add(entry.role); }
    const isReference = entry.role === 'reference';
    const material = entry.role === 'missing' ? this.fallbackMaterials.missing : isReference ? this.fallbackMaterials.reference : this.fallbackMaterials.normal;
    material.transparent = isReference;
    material.opacity = isReference ? referenceOpacity : 1;
    const fallback = new THREE.Mesh(this.fallbackGeometry, material);
    fallback.position.set(entry.block.position.x + .5, entry.block.position.y + .5, entry.block.position.z + .5);
    fallback.userData['voxel'] = entry.block.position; fallback.userData['renderRole'] = entry.role;
    entry.fallback = fallback; entry.object = fallback;
    this.blocksGroup.add(fallback);
    this.instrumentation.record('fallbackMeshCreations');
    return fallback;
  }

  private addSurfaceFaceVisual(block: ProjectDocument['blocks'][number], key: string, templates: readonly SurfaceFaceTemplate[], visible: ReadonlyMap<string, VisibleBlockEntry>): readonly SurfaceFaceMembership[] | undefined {
    const visibleEntry = visible.get(key);
    if (!visibleEntry) return undefined;
    return this.surfaceRenderer.add(block, key, templates, new Set(exposedFaceDirections(visibleEntry, visible)));
  }

  private addTerrainVisual(block: ProjectDocument['blocks'][number], key: string, templates: readonly SurfaceFaceTemplate[], role: 'normal' | 'reference' = 'normal'): boolean {
    return this.terrainRenderer.upsertAndCommit({ key, block, templates, role });
  }

  private removeSurfaceFaceVisual(key: string, entry?: RenderedBlockEntry): void {
    this.surfaceRenderer.remove(key, entry);
  }

  private removeSurfaceFaceMembership(batchKey: string, requestedIndex: number, expectedKey: string): void {
    this.surfaceRenderer.removeMembership(batchKey, requestedIndex, expectedKey);
  }

  private clearSurfaceFaceResources(): void {
    this.surfaceRenderer.clear(this.renderedBlocks.values());
    this.terrainRenderer.clear();
  }

  private addInstanceVisual(object: THREE.Object3D, block: ProjectDocument['blocks'][number], key: string, reusableKey?: string, source: 'provider-async' | 'cached-template' = 'provider-async', role: 'normal' | 'reference' = 'normal'): { readonly batchKey: string; readonly index: number } | undefined {
    return this.instanceRenderer.tryAdd(object, block, key, reusableKey, source, role);
  }

  private addInstanceVisualFromTemplates(templates: readonly InstancePartTemplate[], block: ProjectDocument['blocks'][number], key: string, source: 'provider-async' | 'cached-template' = 'provider-async', compiled?: CompiledInstanceTemplates, role: 'normal' | 'reference' = 'normal'): { readonly batchKey: string; readonly index: number } | undefined {
    return this.instanceRenderer.addFromTemplates(templates, block, key, source, compiled, role);
  }

  private removeInstanceVisual(key: string, entry: RenderedBlockEntry): void {
    this.traceInstanceOwnership('before-remove', key, 'reconcile', entry);
    this.instanceRenderer.remove(key, entry, 'reconcile');
    entry.instanceBatchKey = undefined;
    entry.instanceIndex = undefined;
    this.traceInstanceOwnership('after-remove', key, 'reconcile');
  }

  /** Returns every physical logical-key membership, including stale ownership. */
  private instanceMemberships(key: string, scanAll = false): readonly { readonly batchKey: string; readonly index: number }[] {
    return this.instanceRenderer.memberships(key, scanAll);
  }

  private removeOrphanedInstanceMemberships(key: string, source: 'rollback' | 'reconcile', entry = this.renderedBlocks.get(key)): void {
    this.instanceRenderer.removeOrphaned(key, source, entry);
    if (entry) { entry.instanceBatchKey = undefined; entry.instanceIndex = undefined; }
  }

  private removeInstanceMembership(batchKey: string, requestedIndex: number, expectedKey: string): boolean {
    return this.instanceRenderer.removeMembership(batchKey, requestedIndex, expectedKey);
  }

  /** Repairs only stale/duplicate memberships; it never rebuilds valid batches. */
  private reconcileInstanceOwnership(): void {
    this.instanceRenderer.reconcile(this.renderedBlocks);
  }

  private removeBlockEntry(key: string, entry: RenderedBlockEntry): void {
    this.invalidateStaticModelDiagnostics();
    entry.revision += 1;
    if (entry.fluidChunkKey !== undefined) {
      if (this.renderedBlocks.get(key) === entry) this.renderedBlocks.delete(key);
      return;
    }
    if (entry.terrainChunkKey !== undefined || this.terrainRenderer.has(key)) this.terrainRenderer.remove(key);
    const hasSurfaceVisual = entry.surfaceFaceMemberships !== undefined || this.surfaceFaceOwnership.has(key);
    if (hasSurfaceVisual) this.removeSurfaceFaceVisual(key, entry);
    if (entry.instanceBatchKey || this.instanceOwnershipIndex.has(key) || this.runtimeDiagnosticsEnabled && this.instanceMemberships(key, true).length) this.removeInstanceVisual(key, entry);
    else if (!hasSurfaceVisual) {
      if (entry.object?.parent === this.blocksGroup) this.blocksGroup.remove(entry.object);
      if (entry.object && entry.object !== entry.fallback) disposeObject(entry.object);
      if (entry.fallback && entry.fallback !== entry.object) disposeObject(entry.fallback);
    }
    if (this.renderedBlocks.get(key) === entry) this.renderedBlocks.delete(key);
    this.traceInstanceOwnership('after-remove-entry', key, 'reconcile', entry);
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


  private clearPersistentVisuals(): void { for (const [key, entry] of this.renderedBlocks) this.removeBlockEntry(key, entry); this.fluidCoordinator.clear(); this.releaseUnusedRetiredProviders(); for (const [key, entry] of this.renderedDecorations) this.removeDecorationEntry(key, entry); this.clearPlaceholderVisuals(); this.clearReusableInstanceTemplates(); this.instanceRenderer.resetMetrics(); this.clearSurfaceFaceResources(); this.instanceOwnershipIndex.clear(); this.pendingHydrationSignatures.clear(); this.placeholderSignatures.clear(); this.pendingDecorationSignatures.clear(); this.projectionKeyRevisions.clear(); this.committedProjection = undefined; this.structureSyncKey = ''; this.decorationSyncKey = ''; this.syncedProject = undefined; this.syncedBlockCount = undefined; this.syncedBlocksReference = undefined; this.syncedDecorationProject = undefined; this.spatialIndex = undefined; this.spatialIndexProject = undefined; this.spatialIndexBlocksReference = undefined; this.cachedVisibleEntries = []; this.cachedVisibleMap.clear(); this.cachedVisibleIndices.clear(); this.cachedVisibleProject = undefined; this.cachedVisibleKey = ''; this.structuralSpecialVisualIds.clear(); this.ghostPlan = undefined; this.lastHoverVisualKey = ''; this.decorationGhostKey = ''; this.lastActiveGroupProject = undefined; this.lastActiveGroupId = undefined; this.lastActiveGroupPositions = undefined; this.lastIsolatedGroupId = undefined; this.lastIsolatedGroupPositions = undefined; this.groupHighlightPresenter.clearUsage(); }

  private reconcileDecorations(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean): void {
    if (!project) {
      for (const [id, entry] of this.renderedDecorations) this.removeDecorationEntry(id, entry);
      this.cancelDecorationHydration();
      this.setHydrationDecorationScope([]);
      return;
    }
    const visible = (project.decorations ?? []).filter((decoration) => isDecorationVisible(decoration, project.groups) && (options.layerY === undefined || decoration.anchor.y === options.layerY || options.visibility === 'whole-structure' || options.visibility === 'all-below' && decoration.anchor.y <= (options.layerY ?? decoration.anchor.y)));
    this.setHydrationDecorationScope(visible.map((decoration) => decoration.instanceId));
    this.adoptCommittedDecorationOwnership(visible);
    const map = new Map(visible.map((decoration) => [decoration.instanceId, decoration] as const));
    this.decorationHydrationQueue = this.decorationHydrationQueue.filter((job) => decorationSignature(map.get(job.id)) === decorationSignature(job.decoration));
    this.decorationHydrationQueueHead = 0;
    for (const [id, entry] of this.renderedDecorations) if (!map.has(id)) { this.removeDecorationEntry(id, entry); this.pendingDecorationSignatures.delete(id); this.instrumentation.record('decorationRemovals'); }
    for (const id of this.pendingDecorationSignatures.keys()) if (!map.has(id)) this.pendingDecorationSignatures.delete(id);
    for (const [id, decoration] of map) {
      const signature = `${decorationSignature(decoration)}|${this.decorationRevision}`; const current = this.renderedDecorations.get(id);
      const pendingSignature = this.pendingDecorationSignatures.get(id);
      if ((!full && current?.signature === signature) || (!current && pendingSignature === signature)) continue;
      if (current) { this.removeDecorationEntry(id, current); this.instrumentation.record('decorationUpdates'); }
      else if (pendingSignature === undefined) this.instrumentation.record('decorationAdds');
      else this.instrumentation.record('decorationUpdates');
      this.pendingDecorationSignatures.set(id, signature);
      this.decorationHydrationQueue.push({ token: this.hydrationGeneration, id, decoration, signature });
    }
    this.scheduleHydrationPump();
  }

  private removeDecorationEntry(id: string, entry: RenderedDecorationEntry): void { if (entry.object.parent === this.decorationsGroup) this.decorationsGroup.remove(entry.object); disposeObject(entry.object); this.renderedDecorations.delete(id); }

  private hydrateDecorationItemPreview(entry: RenderedDecorationEntry): void {
    const provider = this.decorationItemPreview;
    const item = entry.decoration.item;
    if (!provider || !item || entry.id !== this.renderOptions.selectedDecorationId) return;
    const sprite = entry.object.children.find((child) => child.userData['decorationItemId'] === item.id);
    if (!sprite) return;
    const generation = this.providerGeneration;
    void provider(item).then((url) => {
      if (!url || generation !== this.providerGeneration || this.renderedDecorations.get(entry.id) !== entry) return;
      if (sprite.userData['itemVisualPreview'] === url) return;
      if (applyDecorationItemPreview(sprite, url, this.decorationTextureCache)) this.scheduleRender();
    }).catch(() => undefined);
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
    if (!this.spatialIndex) return undefined;
    return this.raycastController.pick(this.raycaster.ray, project.size);
  }

  private performHit(clientX: number, clientY: number, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!this.renderer || !this.container || !project) return {};
    this.flushInstanceBatchBounds();
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
    attachment = block && hitPoint ? resolveAttachmentPlacement(active?.id, block, hitPoint, this.spatialIndex ?? project.blocks, this.definitionResolver) : undefined;
    if (attachment) {
      if (!target) target = attachment.target;
      faceNormal = { x: 0, y: attachment.snapType === 'chain-extension' ? 1 : -1, z: 0 };
    } else if (!target && block && faceNormal) target = targetFromBlockFace(block, faceNormal);
    const placementContext = faceNormal ? { faceNormal, hitPoint: hitPoint ? { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } : undefined, facing: isHorizontalDirection(facing) ? facing : undefined, yaw: cameraYaw(this.camera), stateOverride: attachment?.stateOverride } : undefined;
    const previewStarted = showGhost && typeof performance !== 'undefined' ? performance.now() : 0;
    const placement = resolvePlacementPreview({ requested: showGhost && !this.renderOptions.activeDecoration, project, active, target, context: placementContext, lookup: this.spatialIndex, provider: this.placementPlanProvider });
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
    const hoverVisualKey = `${target ? coordinateKey(target) : ''}|${previewStatus ?? ''}|${this.ghostModelKey}|${decorationPlan?.decoration ? stableValue(decorationPlan.decoration) : ''}`;
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
    this.cancelPendingProjection();
    this.cancelHydration('dispose');
    this.isolationPresentation.dispose();
    this.isolatedKeys.clear();
    const provider = this.visualProvider;
    this.cameraRenderPending = false;
    this.renderScheduler.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.clearSurfaceFaceResources();
    this.fluidCoordinator.dispose();
    for (const child of this.blocksGroup.children) disposeObject(child);
    this.blocksGroup.clear();
    this.instanceRenderer.clear();
    for (const child of this.decorationsGroup.children) disposeObject(child);
    this.decorationsGroup.clear();
    this.selectionPresenter.dispose();
    this.editingPlanePresenter.dispose();
    this.groupHighlightPresenter.dispose();
    this.decorationGhostPresenter.dispose();
    this.decorationSelectionPresenter.dispose();
    this.renderedBlocks.clear(); this.renderedDecorations.clear();
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
    provider?.release?.();
    this.providerLifecycle.clear();
    this.visualProvider = undefined;
    this.renderer = undefined;
    this.container = undefined;
  }

  diagnostics(): ViewportDiagnostics {
    return { initialized: !!this.renderer, disposed: this.disposed, canvasWidth: this.canvasSize.width, canvasHeight: this.canvasSize.height, gridExists: !!this.projectGrid, boundsExists: !!this.boundsBox, rendererExists: !!this.renderer, sceneExists: true, cameraExists: true, controlsExist: !!this.controls, themeApplied: this.themeApplied, resizeApplied: this.canvasSize.width > 0 && this.canvasSize.height > 0, renderMode: 'demand', renderCount: this.renderCount };
  }

  visibleSceneDiagnostics(): VisibleSceneDiagnostics {
    const expected = this.project ? this.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedKeys = [...new Set(expected.map((entry) => coordinateKey(entry.block.position)))];
    return collectVisibleSceneDiagnostics({ expectedKeys, renderedKeys: this.renderedBlocks.keys(), placeholderKeys: this.placeholderIndices.keys(), pendingKeys: this.pendingHydrationSignatures.keys() });
  }

  ownershipDiagnostics(): readonly ViewportVoxelOwnershipDiagnostic[] {
    const expected = this.project ? new Set(this.visibleBlocks(this.project, this.renderOptions).map((entry) => coordinateKey(entry.block.position))) : new Set<string>();
    const queued = new Set(this.hydrationWork.regularJobs().map((job) => job.key));
    return collectOwnershipDiagnostics({ expectedKeys: expected, renderedKeys: this.renderedBlocks.keys(), placeholderKeys: this.placeholderIndices.keys(), pendingSignatures: this.pendingHydrationSignatures, queuedKeys: queued, runningKeys: this.runningHydrationKeys });
  }

  private traceInstanceOwnership(phase: ViewportInstanceOwnershipEvent['phase'], key?: string, source?: ViewportInstanceOwnershipEvent['source'], entry?: RenderedBlockEntry): void {
    if (!this.runtimeDiagnosticsEnabled) return;
    const physicalMemberships = key ? this.instanceMemberships(key) : [];
    const previousEntry = entry && (entry.instanceBatchKey !== undefined || entry.instanceIndex !== undefined) ? { ...(entry.instanceBatchKey !== undefined ? { batchKey: entry.instanceBatchKey } : {}), ...(entry.instanceIndex !== undefined ? { index: entry.instanceIndex } : {}) } : undefined;
    const violations = key ? collectInstanceOwnershipViolationsForKey({ batches: this.instanceBatches.values(), ownershipIndex: this.instanceOwnershipIndex, renderedEntries: this.renderedBlocks, runtimeChecks: this.runtimeDiagnosticsEnabled }, key) : collectInstanceOwnershipViolations({ batches: this.instanceBatches.values(), ownershipIndex: this.instanceOwnershipIndex, renderedEntries: this.renderedBlocks, runtimeChecks: this.runtimeDiagnosticsEnabled });
    this.instanceOwnershipTrace.push({ phase, ...(key ? { key } : {}), ...(source ? { source } : {}), generation: this.hydrationGeneration, ...(previousEntry ? { previousEntry } : {}), physicalMemberships, violations });
    if (this.instanceOwnershipTrace.length > 256) this.instanceOwnershipTrace.shift();
  }

  rendererOwnershipDiagnostics(): ViewportOwnershipDiagnostics {
    const expected = this.project ? this.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedKeys = new Set(expected.map((entry) => coordinateKey(entry.block.position)));
    const staleKeys = new Set<string>();
    const addStale = (key: string): void => { if (!expectedKeys.has(key)) staleKeys.add(key); };
    for (const key of this.renderedBlocks.keys()) addStale(key);
    for (const key of this.placeholderIndices.keys()) addStale(key);
    for (const key of this.pendingHydrationSignatures.keys()) addStale(key);
    for (const key of this.placeholderSignatures.keys()) addStale(key);
    for (const job of this.hydrationWork.regularJobs()) addStale(job.key);
    for (const key of this.runningHydrationKeys.keys()) addStale(key);

    const batchInvariantViolations: string[] = [...collectInstanceOwnershipViolations({ batches: this.instanceBatches.values(), ownershipIndex: this.instanceOwnershipIndex, renderedEntries: this.renderedBlocks, runtimeChecks: this.runtimeDiagnosticsEnabled })];
    let instanceMemberCount = 0;
    for (const [batchKey, batch] of this.instanceBatches) {
      instanceMemberCount += batch.keys.length;
      for (const key of batch.keys) addStale(key);
      for (const part of batch.parts) {
        const voxels = part.userData['instanceVoxels'] as unknown;
        if (Array.isArray(voxels)) for (const voxel of voxels) if (voxel && typeof voxel === 'object' && typeof (voxel as VoxelCoordinate).x === 'number') addStale(coordinateKey(voxel as VoxelCoordinate));
      }
    }

    let placeholderVisualCount = 0;
    for (const batch of this.placeholderBatches.values()) {
      placeholderVisualCount += batch.keys.length;
      if (batch.keys.length !== batch.positions.length || batch.mesh.count !== batch.keys.length) batchInvariantViolations.push(`${batch.key}: placeholder length/count mismatch`);
      for (const key of batch.keys) addStale(key);
    }

    const outsideBlocksGroupOwners: string[] = [];
    const outsideMeshSample: ViewportVisibleMeshDiagnostic[] = [];
    const insideMeshSample: ViewportVisibleMeshDiagnostic[] = [];
    const suspiciousVisuals: ViewportSuspiciousVisualDiagnostic[] = [];
    let suspiciousVisualCount = 0;
    let visibleMeshCount = 0;
    const projectBlockCount = this.project?.blocks.length ?? 0;
    const isVisibleInScene = (object: THREE.Object3D): boolean => {
      for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
      return true;
    };
    const voxelFromObject = (object: THREE.Object3D): string | undefined => {
      const voxel = object.userData['voxel'] as VoxelCoordinate | undefined;
      return voxel && typeof voxel.x === 'number' && typeof voxel.y === 'number' && typeof voxel.z === 'number' ? coordinateKey(voxel) : undefined;
    };
    const isOwnedByBlocksGroup = (object: THREE.Object3D): boolean => {
      for (let current = object.parent; current; current = current.parent) if (current === this.blocksGroup) return true;
      return false;
    };
    const sceneRoot = (object: THREE.Object3D): THREE.Object3D => {
      let root = object;
      // Keep the canonical project children as diagnostic owners even though
      // they now sit below the dedicated canonical root.
      while (root.parent && root.parent !== this.scene && root.parent !== this.canonicalRoot) root = root.parent;
      return root;
    };
    const sceneOwner = (object: THREE.Object3D): string => {
      const root = sceneRoot(object);
      const known: readonly [THREE.Object3D | undefined, string][] = [
        [this.blocksGroup, 'blocksGroup'], [this.decorationsGroup, 'decorationsGroup'], [this.ghost, 'ghost'],
        [this.ghostModel, 'ghostModel'], [this.movePreviewGroup, 'movePreviewGroup'], [this.decorationGhostGroup, 'decorationGhostGroup'],
        [this.decorationSelectionGroup, 'decorationSelectionGroup'], [this.logicalSelectionGroup, 'logicalSelectionGroup'], [this.structureBlockGuideGroup, 'structureBlockGuide'],
        [this.projectGrid, 'projectGrid'], [this.ground, 'ground'], [this.editingPlane, 'editingPlane'], [this.boundsBox, 'boundsBox'],
        [this.selectionOutline, 'selectionOutline'], [this.selectionBox, 'selectionBox'], [this.isolationPresentation.root, 'groupIsolationPresentation'],
      ];
      if (root === this.blocksGroup) {
        if (object instanceof THREE.InstancedMesh && object.userData['placeholder'] === true) return 'placeholderBatches';
        if (object instanceof THREE.InstancedMesh && object.userData['instanceBatchKey'] !== undefined) return 'instanceBatches';
        const key = voxelFromObject(object);
        if (key && this.renderedBlocks.get(key)?.fallback === object) return 'fallback mesh';
      }
      return known.find(([candidate]) => candidate === root)?.[1] ?? (root.name || root.type);
    };
    const diagnosticValue = (value: unknown): unknown => {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      if (Array.isArray(value)) return value.slice(0, 8).map(diagnosticValue);
      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record['x'] === 'number' && typeof record['y'] === 'number' && typeof record['z'] === 'number') return { x: record['x'], y: record['y'], z: record['z'] };
        if (typeof record['id'] === 'string') return { id: record['id'], state: diagnosticValue(record['state']) };
        return `[${(value as object).constructor?.name ?? 'Object'}]`;
      }
      return String(value);
    };
    const materialDiagnostics = (material: THREE.Material): ViewportVisibleMeshDiagnostic['materials'][number] => {
      const textured = material as THREE.Material & { readonly map?: THREE.Texture; readonly opacity?: number };
      const texture = textured.map;
      const textureImage = texture?.image as { readonly src?: string; readonly currentSrc?: string; readonly name?: string } | undefined;
      return {
        uuid: material.uuid,
        type: material.type,
        visible: material.visible,
        opacity: textured.opacity ?? 1,
        ...(texture ? { texture: { uuid: texture.uuid, sourceUuid: texture.source.uuid, ...(textureImage?.currentSrc || textureImage?.src || textureImage?.name ? { sourceIdentity: textureImage.currentSrc || textureImage.src || textureImage.name } : {}) } } : {}),
      };
    };
    const directSceneChildren = this.scene.children.map((child) => ({ owner: sceneOwner(child), uuid: child.uuid, visible: child.visible, childCount: child.children.length }));
    const isDescendantOf = (object: THREE.Object3D, ancestor: THREE.Object3D | undefined): boolean => {
      for (let current: THREE.Object3D | null = object; current; current = current.parent) if (current === ancestor) return true;
      return false;
    };
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !isVisibleInScene(object)) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(materialDiagnostics);
      if (materials.every((material) => !material.visible || material.opacity <= 0)) return;
      if (object instanceof THREE.InstancedMesh && object.count === 0) return;
      visibleMeshCount += 1;
      const owner = sceneOwner(object);
      const ownedByBlocksGroup = isOwnedByBlocksGroup(object);
      const isIsolationPresentationMesh = owner === 'groupIsolationPresentation';
      if (!ownedByBlocksGroup && !isIsolationPresentationMesh) {
        outsideBlocksGroupOwners.push(`${owner}/${object.type}:${object.uuid}`);
        const key = voxelFromObject(object); if (key) addStale(key);
      }
      if (projectBlockCount === 0) {
        const intentionalPreview = (owner === 'ghostModel' || owner === 'ghost') && this.ghost.visible && !!this.ghostTarget && !!this.activeBlock
          || owner === 'movePreviewGroup' && !!this.renderOptions.groupMovePreview
          || owner === 'decorationGhostGroup' && !!this.renderOptions.activeDecoration;
        const knownBlockOwner = owner === 'blocksGroup' || owner === 'instanceBatches' || owner === 'placeholderBatches' || owner === 'fallback mesh';
        const knownNonBlockOwner = ['decorationsGroup', 'decorationSelectionGroup', 'structureBlockGuide', 'projectGrid', 'ground', 'editingPlane', 'boundsBox', 'selectionOutline', 'selectionBox', 'logicalSelectionGroup'].includes(owner);
        let reason: string | undefined;
        if (knownBlockOwner) reason = 'Block-renderer mesh remains while the project has zero blocks';
        else if ((owner === 'ghostModel' || owner === 'ghost') && !intentionalPreview) reason = 'Visible placement ghost has no active placement target';
        else if (owner === 'movePreviewGroup' && !intentionalPreview) reason = 'Group-move preview mesh remains without an active move preview';
        else if (owner === 'decorationGhostGroup' && !intentionalPreview) reason = 'Decoration preview mesh remains without an active decoration';
        else if (!knownNonBlockOwner && !intentionalPreview) reason = 'Visible mesh remains under a non-authoritative scene owner';
        if (reason) {
          suspiciousVisualCount += 1;
          if (suspiciousVisuals.length < 24) {
            object.updateWorldMatrix(true, false);
            const bounds = new THREE.Box3().setFromObject(object);
            suspiciousVisuals.push({ owner, uuid: object.uuid, reason, intentionalPreview: false, position: vectorValue(object.getWorldPosition(new THREE.Vector3())), worldBounds: { min: vectorValue(bounds.min), max: vectorValue(bounds.max) } });
          }
        }
      }
      const sample = ownedByBlocksGroup ? insideMeshSample : outsideMeshSample;
      if (sample.length >= 24) return;
      object.updateWorldMatrix(true, false);
      const parentPath: ViewportVisibleMeshDiagnostic['parentPath'][number][] = [];
      for (let current: THREE.Object3D | null = object; current; current = current.parent) {
        parentPath.push({ type: current.type, name: current.name, uuid: current.uuid, visible: current.visible });
        if (current === this.scene) break;
      }
      const directSceneRoot = sceneOwner(sceneRoot(object));
      const worldPosition = object.getWorldPosition(new THREE.Vector3());
      if (object instanceof THREE.InstancedMesh) object.computeBoundingBox();
      const worldBounds = new THREE.Box3().setFromObject(object);
      const instanceData = object instanceof THREE.InstancedMesh ? {
        count: object.count,
        ...(typeof object.userData['instanceBatchKey'] === 'string' ? { batchKey: object.userData['instanceBatchKey'] as string } : {}),
        instanceKeys: Array.isArray(object.userData['instanceKeys']) ? (object.userData['instanceKeys'] as unknown[]).slice(0, 6).map(String) : [],
        instanceVoxels: Array.isArray(object.userData['instanceVoxels']) ? (object.userData['instanceVoxels'] as unknown[]).slice(0, 6).flatMap((value) => value && typeof value === 'object' && typeof (value as VoxelCoordinate).x === 'number' ? [{ x: (value as VoxelCoordinate).x, y: (value as VoxelCoordinate).y, z: (value as VoxelCoordinate).z }] : []) : [],
        worldPositions: Array.from({ length: Math.min(object.count, 6) }, (_, index) => {
          const instanceMatrix = new THREE.Matrix4(); object.getMatrixAt(index, instanceMatrix);
          return vectorValue(new THREE.Vector3().setFromMatrixPosition(instanceMatrix).applyMatrix4(object.matrixWorld));
        }),
      } : undefined;
      sample.push({
        owner,
        directSceneRoot,
        objectType: object.type,
        uuid: object.uuid,
        visible: object.visible,
        parentPath: parentPath.reverse(),
        localPosition: vectorValue(object.position),
        worldPosition: vectorValue(worldPosition),
        worldBounds: { min: vectorValue(worldBounds.min), max: vectorValue(worldBounds.max) },
        matrixWorld: object.matrixWorld.toArray(),
        renderOrder: object.renderOrder,
        descendantsOf: {
          blocksGroup: isDescendantOf(object, this.blocksGroup), ghostModel: isDescendantOf(object, this.ghostModel), ghost: isDescendantOf(object, this.ghost),
          movePreviewGroup: isDescendantOf(object, this.movePreviewGroup), decorationGhostGroup: isDescendantOf(object, this.decorationGhostGroup),
          decorationSelectionGroup: isDescendantOf(object, this.decorationSelectionGroup), logicalSelectionGroup: isDescendantOf(object, this.logicalSelectionGroup),
        },
        geometry: { uuid: object.geometry.uuid, type: object.geometry.type },
        materials,
        userData: Object.fromEntries(Object.entries(object.userData).map(([key, value]) => [key, diagnosticValue(value)])),
        ...(object instanceof THREE.InstancedMesh ? { instanceCount: object.count, instances: instanceData } : {}),
      });
    });

    return {
      authoritativeVisibleBlockCount: expectedKeys.size,
      authoritativeProjectBlockCount: this.project?.blocks.length ?? 0,
      renderedBlockCount: this.renderedBlocks.size,
      placeholderVisualCount,
      instanceBatchCount: this.instanceBatches.size,
      instanceMemberCount,
      placeholderBatchCount: this.placeholderBatches.size,
      placeholderIndexCount: this.placeholderIndices.size,
      blocksGroupChildCount: this.blocksGroup.children.length,
      blockLikeSceneObjectsOutsideBlocksGroup: outsideBlocksGroupOwners.length,
      visibleMeshesOutsideBlocksGroup: outsideBlocksGroupOwners.length,
      staleVoxelKeys: [...staleKeys].sort(),
      batchInvariantViolations,
      outsideBlocksGroupOwners,
      visibleMeshCount,
      visibleMeshSample: [...outsideMeshSample, ...insideMeshSample].slice(0, 32),
      visibleMeshesOutsideBlocksGroupSample: outsideMeshSample,
      suspiciousVisualCount,
      suspiciousVisuals,
      directSceneChildren,
      previewState: {
        ghostVisible: this.ghost.visible,
        ghostModelPresent: !!this.ghostModel,
        ghostModelVisible: !!this.ghostModel?.visible,
        ghostModelKey: this.ghostModelKey,
        ghostGeneration: this.ghostGeneration,
        ...(this.ghostTarget ? { ghostTarget: { ...this.ghostTarget } } : {}),
        movePreviewChildren: this.movePreviewGroup.children.length,
        decorationGhostChildren: this.decorationGhostGroup.children.length,
        logicalSelectionChildren: this.logicalSelectionGroup.children.length,
        selectionOutlineVisible: this.selectionOutline.visible,
        reusableTemplateCount: this.instanceRenderer.templates().length,
      },
      hydrationState: {
        queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(),
        running: this.hydrationRunning,
        pendingSignatureCount: this.pendingHydrationSignatures.size,
        placeholderSignatureCount: this.placeholderSignatures.size,
        runningOwnershipCount: this.runningHydrationKeys.size,
      },
    };
  }

  private captureGhostSceneSnapshot(): ViewportGhostSceneSnapshot {
    return captureViewportGhostSceneSnapshot(this.rendererOwnershipDiagnostics(), this.activeBlock ? { id: this.activeBlock.id, state: { ...this.activeBlock.state } } : undefined, this.instanceOwnershipTrace);
  }

  rendererCounters(): RendererCounters {
    return this.instrumentation.snapshot();
  }

  isolationDiagnostics() {
    return this.isolationPresentation.diagnostics();
  }

  performanceEvidence(): ViewportPerformanceEvidence {
    const renderCost = collectSceneRenderCost({ scene: this.scene, blocksGroup: this.blocksGroup, decorationsGroup: this.decorationsGroup, instanceBatches: this.instanceBatches.values(), surfaceBatches: this.surfaceFaceBatches.values(), placeholderBatches: this.placeholderBatches.values(), renderedBlocks: this.renderedBlocks.values(), renderedDecorations: this.renderedDecorations.values() });
    return collectPerformanceEvidence({ counters: this.instrumentation.snapshot(), terrain: this.terrainRenderer.evidence(), renderCost, staticModelMetrics: this.instanceRenderer.metrics(), fluidDiagnostics: this.fluidCoordinator.diagnostics(), lastRendererMetrics: this.lastRendererMetrics, renderedBlocks: this.renderedBlocks.size, renderedDecorations: this.renderedDecorations.size, renderRegionSize: this.renderRegionPolicy.size, instanceBatchCount: this.instanceBatches.size, surfaceFaceBatchCount: this.surfaceFaceBatches.size, hydrationQueue: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(), hydrationRunning: this.hydrationRunning, interiorBlocksCulled: this.culledBlockKeys.size, frameDurationMs: this.frameDurationMs, renderCpuMs: this.renderCpuMs, spatialIndexLookups: this.spatialIndex?.lookups ?? 0, terrainAtlasMode: this.terrainAtlasMode });
  }

  hydrationProgress(): ViewportHydrationProgress { return this.hydrationProgressState; }

  /** Coarse finalization snapshot for the status/readiness coordinator. */
  finalizationProgress(): ViewportHydrationProgress { return this.withProviderRefreshProgress(this.hydrationProgressState); }

  /** Bounded watchdog-only ownership audit; never called from the frame loop. */
  finalizationAuditProgress(): ViewportHydrationProgress {
    this.recordMissingAccountingInvariant('finalization-audit');
    const progress = this.finalizationProgress();
    if (!this.project || this.cachedVisibleProject !== this.project) return progress;
    let finalReadyBlocks = 0;
    let provisionalMissingBlocks = 0;
    let permanentMissingBlocks = 0;
    for (const entry of this.cachedVisibleEntries) {
      const key = coordinateKey(entry.block.position);
      if (entry.block.kind === 'missing') {
        if (this.missingBlocksTerminal) permanentMissingBlocks += 1;
        else provisionalMissingBlocks += 1;
      } else if (this.culledBlockKeys.has(key) || (this.renderedBlocks.get(key) && this.hasCommittedBlockOwnership(key, this.renderedBlocks.get(key)!))) finalReadyBlocks += 1;
    }
    const expectedBlocks = this.cachedVisibleEntries.length;
    return { ...progress, finalization: { expectedBlocks, finalReadyBlocks, provisionalMissingBlocks, permanentMissingBlocks, pendingBlocks: Math.max(0, expectedBlocks - finalReadyBlocks - provisionalMissingBlocks - permanentMissingBlocks) } };
  }

  /** Watchdog repair is limited to adopting already committed ownership. */
  reconcileFinalizationAccounting(): void {
    if (!this.project || this.cachedVisibleProject !== this.project) return;
    this.adoptCommittedBlockOwnership(this.cachedVisibleEntries);
    this.hydrationProgressTracker.publish(this.hydrationProgressTracker.snapshot());
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
    const currentGenerationRunning = this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0;
    const workCounts = this.hydrationWork.counts();
    const visibleEntries = this.project ? this.visibleBlocks(this.project, this.renderOptions) : [];
    const expectedVisibleBlockCount = visibleEntries.length;
    const queuedKeys = new Set(this.hydrationWork.regularJobs().filter((job) => job.token === this.hydrationGeneration).map((job) => job.key));
    const orphanedHydrationSample: string[] = [];
    let orphanedHydrationCount = 0;
    if (this.visualProvider && this.project) {
      for (const entry of visibleEntries) {
        const key = coordinateKey(entry.block.position);
        if (this.culledBlockKeys.has(key)) continue;
        const rendered = this.renderedBlocks.get(key);
      const isFinal = !!rendered && (rendered.terrainChunkKey !== undefined || rendered.surfaceFaceMemberships !== undefined || rendered.object !== undefined && rendered.object !== rendered.fallback || rendered.instanceBatchKey !== undefined || rendered.fallback?.userData['renderMode'] !== undefined);
        if (entry.block.kind === 'missing' || isFinal || queuedKeys.has(key) || this.runningHydrationKeys.get(key) === this.hydrationGeneration) continue;
        if (this.pendingHydrationSignatures.has(key) || this.placeholderSignatures.has(key) || this.placeholderIndices.has(key) || !!rendered) {
          orphanedHydrationCount += 1;
          if (orphanedHydrationSample.length < 12) orphanedHydrationSample.push(key);
        }
      }
    }
    const runningByGeneration = Object.fromEntries([...this.hydrationRunningByGeneration.entries()].map(([generation, count]) => [String(generation), count]));
    return {
      generation: this.hydrationGeneration,
      queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(),
      running: this.hydrationRunning,
      globalRunning: this.hydrationRunning,
      currentGenerationRunning,
      staleRunning: Math.max(0, this.hydrationRunning - currentGenerationRunning),
      hydrationScheduled: this.hydrationScheduled,
      hydrationTimerActive: this.hydrationScheduler.timerActive,
      hydrationBatchBudget: this.hydrationBatchBudget,
      pendingSignatureCount: this.pendingHydrationSignatures.size,
      placeholderSignatureCount: this.placeholderSignatures.size,
      placeholderVisualCount: this.placeholderIndices.size,
      renderedBlockCount: this.renderedBlocks.size,
      expectedVisibleBlockCount,
      runningOwnershipCount: this.runningHydrationKeys.size,
      runningByGeneration,
      orphanedHydrationCount,
      orphanedHydrationSample,
      completed: this.hydrationProgressState.completed,
      total: this.hydrationProgressState.total,
      scheduled: this.hydrationScheduled || this.hydrationScheduler.timerActive,
      regularQueued: workCounts.regularQueued,
      providerRefreshQueued: workCounts.providerRefreshQueued,
      regularRunning: workCounts.regularRunning,
      providerRefreshRunning: workCounts.providerRefreshRunning,
      providerRefreshPlanning: this.providerRefreshPlanning,
      providerRefreshPlanningProcessed: this.providerRefreshPlanningDiagnostics.processed,
      providerRefreshPlanningTotal: this.providerRefreshPlanningDiagnostics.total,
      providerRefreshPlanningConsidered: this.providerRefreshPlanningDiagnostics.considered,
      providerRefreshPlanningQueued: this.providerRefreshPlanningDiagnostics.queued,
      providerRefreshPlanningMaxSliceMs: this.providerRefreshPlanningDiagnostics.maxSliceMs,
      providerRefreshPlanningYields: this.providerRefreshPlanningDiagnostics.yields,
      providerRefreshPlanningDurationMs: this.providerRefreshPlanningDiagnostics.durationMs,
    };
  }

  onHydrationProgress(listener: (progress: ViewportHydrationProgress) => void): () => void {
    return this.hydrationProgressTracker.onProgress((progress) => listener(this.withProviderRefreshProgress(progress)));
  }

  onProjectionActivity(listener: (state: ViewportProjectionState) => void): () => void {
    this.projectionActivityListeners.add(listener);
    listener(this.projectionActivity());
    return () => this.projectionActivityListeners.delete(listener);
  }

  projectionActivity(): ViewportProjectionState {
    return { activity: this.projectionActivityState, revision: this.projectionActivityRevision };
  }

  private withProviderRefreshProgress(progress: HydrationProgressSnapshot): ViewportHydrationProgress {
    const refresh = this.providerRefreshProgress;
    const baseFinalization = progress.finalization;
    if (!refresh && !this.providerRefreshPlanning) return { ...progress, providerRefreshPlanning: false, terrainPending: this.terrainHydrationPending };
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
      providerRefreshPlanning: this.providerRefreshPlanning,
      providerRefreshQueued: this.hydrationWork.queuedProviderRefresh(),
      providerRefreshRunning: this.hydrationWork.counts().providerRefreshRunning,
      terrainPending: this.terrainHydrationPending,
      finalization,
      ...(refresh ? { providerRefreshCompleted: refresh.completed, providerRefreshTotal: refresh.total } : {}),
    };
  }

  private publishProviderRefreshProgress(): void {
    this.hydrationProgressTracker.publish(this.hydrationProgressTracker.snapshot());
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
    this.flushInstanceBatchBounds();
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

  /** Chunk bounds are conservative and assigned once at batch creation. */
  private flushInstanceBatchBounds(): void { }

  private moveCamera(keys: ReadonlySet<MovementAction>, delta: number): void {
    if (!this.controls || !keys.size) return;
    this.markCameraInteraction();
    const cameraDistance = this.camera.position.distanceTo(this.controls.target);
    const horizontalSpeed = effectiveCameraMovementSpeed(this.controlConfiguration.cameraMoveSpeed, cameraDistance);
    const direction = cameraActionMovementDelta(keys, this.camera, horizontalSpeed, delta);
    if (!direction.lengthSq()) return;
    this.camera.position.add(direction);
    this.controls.target.add(direction);
    this.instrumentation.record('cameraMovementFrames');
    this.runtimeTrace?.record('movement-frame', { actions: [...keys], deltaSeconds: delta, configuredHorizontalSpeed: this.controlConfiguration.cameraMoveSpeed, configuredVerticalSpeed: this.controlConfiguration.verticalMoveSpeed, distance: cameraDistance, movementScale: cameraMovementScale(cameraDistance), effectiveHorizontalSpeed: horizontalSpeed, effectiveVerticalSpeed: horizontalSpeed });
    this.cameraMovementInProgress = true;
    try {
      this.controls.update();
    } finally {
      this.cameraMovementInProgress = false;
    }
    // Keyboard movement does not always produce an OrbitControls `change`
    // event, so invalidate the shared demand-render owner once per movement frame.
    this.instrumentation.record('cameraMovementRenderCalls');
    this.requestCameraRender();
  }
}

function cameraYaw(camera: THREE.Camera): number {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  return THREE.MathUtils.radToDeg(Math.atan2(-forward.x, forward.z));
}

function toTraceVector(value: THREE.Vector3): TraceVector3 { return { x: value.x, y: value.y, z: value.z }; }
function visualFamily(object: THREE.Object3D): string | undefined { let family: unknown; object.traverse((child) => { family ??= child.userData['specialVisualFamily']; }); return typeof family === 'string' ? family : undefined; }
function familyFromReusableKey(key: string | undefined): string | undefined { const prefix = 'special-template-v1|'; return key?.startsWith(prefix) ? key.slice(prefix.length).split('|', 1)[0] : undefined; }
function applyReferenceOpacityToObject(object: THREE.Object3D, opacity: number): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) { material.transparent = true; material.opacity = opacity; material.needsUpdate = true; }
  });
}


export const mergeInstanceTemplateParts = mergeInstanceTemplatePartsFromCache;
export const compileInstanceTemplates = compileInstanceTemplatesFromCache;
