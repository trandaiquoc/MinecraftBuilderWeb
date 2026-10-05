import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { FaceNormal, resolveAttachmentPlacement, projectGridBounds, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit, PlacementContext, PlacementStatus } from '../../editor/placement/placement';
import { blocksForLayers, YLayerVisibility } from '../../editor/viewport/y-layer';
import { isBlockVisibleForViewport, visibleBlockEntries } from '../../editor/viewport/visible-blocks';
import { cameraBoundsCenter, cameraDistanceForBounds, CameraBounds, CameraPreset, CameraState, CameraVector, projectCameraBounds, structureCameraBounds } from '../../editor/camera/camera';
import { isBlockVisible } from '../../editor/groups/group-membership';
import { isDecorationVisible, decorationHasGroup } from '../../editor/groups/decoration-membership';
import { GroupMovePreview } from '../../editor/groups/group.service';
import { ViewportThemePalette, viewportThemePalette } from './viewport-theme';
import { BlockVisualProvider, VisualCacheStats } from '../geometry/block-model-geometry';
import type { BlockVisualResult } from '../geometry/block-model-geometry';
import type { ResolvedBlockModel } from '../../blocks/resolver';
import type { ResolvedItemVisual } from '../geometry/block-model-geometry';
import type { NormalizedSpecialVisualDescriptor } from '../visuals/special-block-visuals';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedDecoration } from '../../decorations/decoration.types';
import { DecorationPlacementPlan, decorationAabb, facingFromNormal, planDecorationPlacement } from '../../decorations/placement/decoration-placement';
import { applyDecorationItemPreview, createDecorationVisual, DecorationTextureCache } from '../visuals/decoration-visuals';
import type { ItemStackData } from '../../items/item-stack.types';
import type { ActiveDecoration } from '../../decorations/decoration.service';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import { DEFAULT_MOUSE_BINDINGS, MouseAction, mouseActionForEvent } from '../../editor/input/mouse-bindings';
import { RendererDiagnostics, RendererCounters } from './renderer-diagnostics';
import { normalizeBlockBrightness, viewportLightingForBrightness, ViewportLighting } from './viewport-lighting';
import { applyBlockBrightnessToMaterial, applyBlockBrightnessToObject, applyStructureGuideBrightnessToObject, setBlockBrightnessBaseColor, STRUCTURE_GUIDE_BRIGHTNESS } from './block-brightness';
import { FaceLockedSelectionPlane, FreeSpaceSelectionPlane, freeSpaceSelectionPlane } from '../../editor/selection/selection';
import { structureBlockGuidePosition } from './structure-block-guide';
import { coordinateNeighbors, hasConfirmedOpaqueNeighbors } from '../visibility/interior-occlusion';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { exposedFaceDirections, SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { ProjectBlockSpatialIndex } from '../../domain/project-block-spatial-index';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import { ddaVoxelCandidates } from '../interaction/voxel-raycast';
import type { VoxelRaycastCandidate } from '../interaction/voxel-raycast';
import { compileInstanceTemplates as compileInstanceTemplatesFromCache, mergeInstanceTemplateParts as mergeInstanceTemplatePartsFromCache } from '../batching/instance-template-cache';
import type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
import { PlaceholderBatchRenderer } from '../batching/placeholder-batch-renderer';
import type { PlaceholderBatch } from '../batching/placeholder-batch-renderer';
import { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { InstanceBatch } from '../batching/instance-batch-renderer';
import { SurfaceFaceBatchRenderer } from '../batching/surface-face-batch-renderer';
import type { SurfaceFaceBatch, SurfaceFaceMembership, SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { collectStaticModelDiagnostics, type StaticModelDiagnosticSnapshot } from '../diagnostics/static-model-diagnostics';
import { RenderRegionPolicy } from '../batching/render-region-policy';
import { RenderScheduler } from '../scheduling/render-scheduler';
import { CameraInteractionController } from '../scheduling/camera-interaction-controller';
import { HydrationScheduler } from '../scheduling/hydration-scheduler';
import { HydrationWorkCoordinator } from '../scheduling/hydration-work-coordinator';
import { HydrationProgressTracker } from '../scheduling/hydration-progress-tracker';
import type { HydrationLane, HydrationProgressSnapshot, HydrationStatus } from '../scheduling/hydration-progress-tracker';
import { adoptCommittedHydrationKeys } from '../hydration/hydration-generation-adoption';
import { ProviderRefreshCoordinator } from '../provider/provider-refresh-coordinator';
import { resolvePlacementPreview } from '../interaction/viewport-hit-resolver';
import { ChunkSurfaceRenderer, type TerrainApplyResult, type TerrainBlockChange, type TerrainOwnershipEvidence, type TerrainSurfaceRecord } from '../terrain/chunk-surface-renderer';
import type { CompiledTerrainChunk } from '../terrain/chunk-surface-mesher';
import { isCompiledTerrainEntry } from '../terrain/terrain-classifier';
import { groupTerrainCandidates } from '../terrain/terrain-hydration-coordinator';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import type { TerrainAtlasMode } from '../terrain/atlas/terrain-texture-atlas';
import { runTerrainAtlasGpuProbe, runTerrainAtlasGpuProbeVariants, type TerrainAtlasGpuProbeBeforeVariant, type TerrainAtlasGpuProbeDraw, type TerrainAtlasGpuProbeResult, type TerrainAtlasGpuProbeVariantDraw, type TerrainAtlasGpuProbeVariantsResult } from '../terrain/atlas/terrain-atlas-gpu-probe';
import { nextCameraDistanceFromWheel, wheelMagnitude, type WheelZoomAction } from '../scheduling/camera-wheel-zoom';
import { cameraMovementScale, effectiveCameraMovementSpeed } from '../scheduling/camera-movement-speed';
import type { ViewportRuntimeTrace, ViewportTraceMetadata, ViewportTraceSample, TraceVector3 } from '../diagnostics/viewport-runtime-trace';
import { collectOwnershipDiagnostics, collectVisibleSceneDiagnostics } from '../diagnostics/renderer-diagnostics-collector';
import { collectSceneRenderCost } from '../diagnostics/scene-render-cost';
import { FluidChunkRenderer } from '../fluids/fluid-chunk-renderer';
import { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import { fluidChunkKey } from '../fluids/fluid-mesh-core';
import { planLocalRenderDelta } from '../mutations/local-render-delta';
import { applyLocalFluidDelta } from '../mutations/local-fluid-render-delta';
import type { FluidWorldLookup } from '../fluids/fluid-state';


export interface ViewportHit { readonly target?: VoxelCoordinate; readonly placement?: { readonly status: PlacementStatus; readonly plan?: PlacementPlan }; readonly block?: VoxelCoordinate; readonly faceNormal?: FaceNormal; readonly placementContext?: PlacementContext; readonly decoration?: PlacedDecoration; readonly decorationPlan?: DecorationPlacementPlan; readonly decorationDistance?: number; readonly blockDistance?: number; }
export type ViewportHoverListener = (hit: ViewportHit) => void;
type PlacementPlanProvider = (project: ProjectDocument, active: ActiveBlock, target: VoxelCoordinate, context: PlacementContext | undefined, lookup?: ReadonlyBlockLookup) => PlacementPlan | undefined;
type HydrationCancellationReason = 'structure-sync-key-changed' | 'project-identity-changed' | 'in-place-project-mutation' | 'dispose';
export interface ViewportRenderOptions { readonly layerY?: number; readonly visibility?: YLayerVisibility; readonly referenceOpacity?: number; readonly selected?: VoxelCoordinate; readonly selectedPositions?: readonly VoxelCoordinate[]; readonly selectionKind?: string; readonly selectionCount?: number; readonly selectionBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly selectedDecorationId?: string; readonly activeDecoration?: ActiveDecoration; readonly selectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly isolatedGroupId?: string; readonly isolatedGroupPositions?: readonly VoxelCoordinate[]; readonly activeGroupId?: string; readonly activeGroupPositions?: readonly VoxelCoordinate[]; readonly groupMovePreview?: GroupMovePreview; readonly showStructureBlockGuide?: boolean; readonly structureBlockGuideRevision?: number; readonly exposedFaceRendering?: boolean; }
export interface ViewportEngineOptions {
  readonly terrainAtlasMode?: TerrainAtlasMode;
  /** Narrow test seam for validating atomic terrain ownership commits. */
  readonly terrainShouldCommitChunk?: (chunkKey: string, compiled: CompiledTerrainChunk) => boolean;
}
export type ViewportHydrationStatus = HydrationStatus;
export type ViewportHydrationProgress = HydrationProgressSnapshot;
export interface ViewportPerformanceEvidence {
  readonly renderCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly renderedBlocks: number;
  readonly renderedDecorations: number;
  readonly object3dCount: number;
  readonly meshCount: number;
  readonly visibleMeshCount: number;
  readonly instanceMeshCount: number;
  readonly instanceMembers: number;
  readonly providerObjectCreations: number;
  readonly reusableTemplateCreations: number;
  readonly reusableTemplateCacheHits: number;
  readonly rawInstanceTemplateParts: number;
  readonly mergedInstanceTemplateParts: number;
  readonly templateMergeOperations: number;
  readonly templatePartsEliminated: number;
  readonly instancedBoundsComputations: number;
  readonly fallbackMeshCreations: number;
  readonly cachedTemplateInsertions: number;
  readonly cameraMovementFrames: number;
  readonly cameraMovementRenderCalls: number;
  readonly cameraChangeEventsDuringMovement: number;
  readonly cameraRenderRequestsSuppressed: number;
  readonly controlChangeEvents: number;
  readonly cameraRenderRequests: number;
  readonly cameraRendersExecuted: number;
  readonly cameraRenderRequestsCoalesced: number;
  readonly interactiveResolutionEntries: number;
  readonly staticResolutionRestores: number;
  readonly regularHydrationStarted: number;
  readonly regularHydrationCompleted: number;
  readonly providerRefreshStarted: number;
  readonly providerRefreshCompleted: number;
  readonly hydrationFairnessDeferrals: number;
  readonly maxProviderRefreshRunningWhileRegularPending: number;
  readonly hydrationPausesForCamera: number;
  readonly hydrationJobsStartedWhileCamera: number;
  readonly hydrationProgressRegressions: number;
  readonly cameraOnlyGenerationChanges: number;
  readonly blockSignatureComputations: number;
  readonly hoverRaycasts: number;
  readonly hoverRaycastsSuppressedDuringCamera: number;
  readonly hoverPointerMovesCoalesced: number;
  readonly interiorBlocksCulled: number;
  readonly hydrationQueue: number;
  readonly hydrationRunning: number;
  readonly frameDurationMs: number;
  readonly renderCpuMs: number;
  readonly drawCalls: number;
  readonly lines: number;
  readonly points: number;
  readonly instanceBatches: number;
  readonly instancedMeshCount: number;
  readonly nonInstancedMeshCount: number;
  readonly renderRegionSize: number;
  readonly renderRegionCount: number;
  readonly regionalInstanceBatchCount: number;
  readonly regionalInstanceMeshCount: number;
  readonly regionalSurfaceBatchCount: number;
  readonly instanceMaterialCount: number;
  readonly instanceGeometryCount: number;
  readonly staticModelCandidates: number;
  readonly staticModelBatchable: number;
  readonly staticModelBatchedMembers: number;
  readonly staticModelTemplateCacheHits: number;
  readonly staticModelTemplateCacheMisses: number;
  readonly providerObjectsAvoidedByStaticCache: number;
  readonly staticModelRejected: Readonly<Record<string, number>>;
  readonly staticModelBatchCount: number;
  readonly staticModelInstanceMeshCount: number;
  readonly fluidLogicalVoxels: number;
  readonly fluidChunks: number;
  readonly fluidChunkMeshes: number;
  readonly fluidStandaloneMeshes: number;
  readonly fluidFacesPotential: number;
  readonly fluidFacesCulled: number;
  readonly fluidFacesEmitted: number;
  readonly fluidMaterialBuckets: number;
  readonly standaloneBlockObjects: number;
  readonly standaloneBlockMeshes: number;
  readonly standaloneTransparentMeshes: number;
  readonly standaloneOpaqueMeshes: number;
  readonly placeholderBatches: number;
  readonly placeholderMeshes: number;
  readonly decorationObjects: number;
  readonly decorationMeshes: number;
  readonly transparentMeshCount: number;
  readonly opaqueMeshCount: number;
  readonly renderableBlocks: number;
  readonly surfaceFastPathBlocks: number;
  readonly exposedFaceInstances: number;
  readonly neighborFacesCulled: number;
  readonly surfaceFaceBatches: number;
  readonly surfaceFaceInstancedMeshes: number;
  readonly hoverPickMs: number;
  readonly hoverPickCount: number;
  readonly hoverPickMaxMs: number;
  readonly ddaPickCount: number;
  readonly ddaVisitedVoxels: number;
  readonly ddaFullCubeHits: number;
  readonly precisePickFallbacks: number;
  readonly placementPreviewMs: number;
  readonly placementPreviewCount: number;
  readonly placementPreviewMaxMs: number;
  readonly placementPreviewFullProjectScans: number;
  readonly duplicatePlacementValidations: number;
  readonly spatialIndexBuilds: number;
  readonly spatialIndexLookups: number;
  readonly ghostVisualRebuilds: number;
  readonly ghostVisualReuses: number;
  readonly structuralReconciles: number;
  readonly overlayOnlyUpdates: number;
  readonly projectBoundsRebuilds: number;
  readonly fullProjectScansDuringHover: number;
  readonly renderInvalidations: number;
  readonly renderInvalidationsCoalesced: number;
  readonly actualSceneRenders: number;
  readonly terrainChunks: number;
  readonly terrainChunkMeshes: number;
  readonly terrainDrawObjectCount: number;
  readonly terrainTriangleCount: number;
  readonly terrainChunkRebuilds: number;
  readonly terrainBlocksCompiled: number;
  readonly terrainFacesEmitted: number;
  readonly terrainFacesCulled: number;
  readonly terrainTemplateResolutions: number;
  readonly terrainTemplateCacheHits: number;
  readonly terrainLogicalBlocks: number;
  readonly terrainBulkBatches: number;
  readonly terrainAsyncAcceptedResults: number;
  readonly terrainAsyncStaleRevisionResults: number;
  readonly terrainAsyncStaleGenerationResults: number;
  readonly terrainAsyncStaleProviderResults: number;
  readonly terrainAsyncSupersededResults: number;
  readonly terrainAsyncRescheduledChunks: number;
  readonly terrainAsyncCommitPolicyRejected: number;
  readonly terrainAsyncAllUnrepresentedResults: number;
  readonly terrainAsyncPartialFailureResults: number;
  readonly terrainAsyncWorkerFailures: number;
  readonly terrainAsyncFallbackKeys: number;
  readonly terrainAsyncRejectedWithoutReplacement: number;
  readonly terrainAtlasMode: TerrainAtlasMode;
  readonly terrainAtlasPages: number;
  readonly terrainAtlasSprites: number;
  readonly terrainAtlasInsertions: number;
  readonly terrainAtlasCacheHits: number;
  readonly terrainAtlasCompatibleFaces: number;
  readonly terrainAtlasFallbackFaces: number;
  readonly terrainAtlasMaterials: number;
  readonly terrainAtlasChunkBuckets: number;
  readonly terrainWorker: Readonly<Record<string, unknown>>;
  readonly terrainCommit: Readonly<Record<string, unknown>>;
}
export interface ViewportDiagnostics { readonly initialized: boolean; readonly disposed: boolean; readonly canvasWidth: number; readonly canvasHeight: number; readonly gridExists: boolean; readonly boundsExists: boolean; readonly rendererExists: boolean; readonly sceneExists: true; readonly cameraExists: true; readonly controlsExist: boolean; readonly themeApplied: boolean; readonly resizeApplied: boolean; readonly renderMode: 'demand'; readonly renderCount: number; }
export interface ViewportHydrationDiagnostics {
  readonly generation: number;
  readonly queued: number;
  readonly running: number;
  readonly globalRunning: number;
  readonly currentGenerationRunning: number;
  readonly staleRunning: number;
  readonly hydrationScheduled: boolean;
  readonly hydrationTimerActive: boolean;
  readonly hydrationBatchBudget: number;
  readonly pendingSignatureCount: number;
  readonly placeholderSignatureCount: number;
  readonly placeholderVisualCount: number;
  readonly renderedBlockCount: number;
  readonly expectedVisibleBlockCount: number;
  readonly runningOwnershipCount: number;
  readonly runningByGeneration: Readonly<Record<string, number>>;
  readonly orphanedHydrationCount: number;
  readonly orphanedHydrationSample: readonly string[];
  readonly completed: number;
  readonly total: number;
  readonly scheduled: boolean;
  readonly regularQueued: number;
  readonly providerRefreshQueued: number;
  readonly regularRunning: number;
  readonly providerRefreshRunning: number;
}
export interface VisibleSceneDiagnostics {
  readonly expectedVisibleVoxelCount: number;
  readonly renderedVoxelCount: number;
  readonly placeholderVoxelCount: number;
  readonly pendingVoxelCount: number;
  readonly expectedVoxelKeys: readonly string[];
  readonly renderedVoxelKeys: readonly string[];
  readonly placeholderVoxelKeys: readonly string[];
  readonly pendingVoxelKeys: readonly string[];
  readonly representedVoxelKeys: readonly string[];
}
export interface ViewportVoxelOwnershipDiagnostic {
  readonly coordinateKey: string;
  readonly expectedVisible: boolean;
  readonly renderedEntry: boolean;
  readonly placeholderEntry: boolean;
  readonly pendingSignature?: string;
  readonly queuedJob: boolean;
  readonly runningGeneration?: number;
}

export interface ViewportOwnershipDiagnostics {
  readonly authoritativeProjectBlockCount: number;
  readonly authoritativeVisibleBlockCount: number;
  readonly renderedBlockCount: number;
  readonly placeholderVisualCount: number;
  readonly instanceBatchCount: number;
  readonly instanceMemberCount: number;
  readonly placeholderBatchCount: number;
  readonly placeholderIndexCount: number;
  readonly blocksGroupChildCount: number;
  readonly blockLikeSceneObjectsOutsideBlocksGroup: number;
  readonly visibleMeshesOutsideBlocksGroup: number;
  readonly staleVoxelKeys: readonly string[];
  readonly batchInvariantViolations: readonly string[];
  readonly outsideBlocksGroupOwners: readonly string[];
  readonly visibleMeshCount: number;
  readonly visibleMeshSample: readonly ViewportVisibleMeshDiagnostic[];
  readonly visibleMeshesOutsideBlocksGroupSample: readonly ViewportVisibleMeshDiagnostic[];
  readonly suspiciousVisualCount: number;
  readonly suspiciousVisuals: readonly ViewportSuspiciousVisualDiagnostic[];
  readonly directSceneChildren: readonly { readonly owner: string; readonly uuid: string; readonly visible: boolean; readonly childCount: number }[];
  readonly previewState: {
    readonly ghostVisible: boolean;
    readonly ghostModelPresent: boolean;
    readonly ghostModelVisible: boolean;
    readonly ghostModelKey: string;
    readonly ghostGeneration: number;
    readonly ghostTarget?: VoxelCoordinate;
    readonly movePreviewChildren: number;
    readonly decorationGhostChildren: number;
    readonly logicalSelectionChildren: number;
    readonly selectionOutlineVisible: boolean;
    readonly reusableTemplateCount: number;
  };
  readonly hydrationState: Pick<ViewportHydrationDiagnostics, 'queued' | 'running' | 'pendingSignatureCount' | 'placeholderSignatureCount' | 'runningOwnershipCount'>;
}

export interface ViewportVisibleMeshDiagnostic {
  readonly owner: string;
  readonly directSceneRoot: string;
  readonly objectType: string;
  readonly uuid: string;
  readonly visible: boolean;
  readonly parentPath: readonly { readonly type: string; readonly name: string; readonly uuid: string; readonly visible: boolean }[];
  readonly localPosition: CameraVector;
  readonly worldPosition: CameraVector;
  readonly worldBounds: { readonly min: CameraVector; readonly max: CameraVector };
  readonly matrixWorld: readonly number[];
  readonly renderOrder: number;
  readonly descendantsOf: {
    readonly blocksGroup: boolean;
    readonly ghostModel: boolean;
    readonly ghost: boolean;
    readonly movePreviewGroup: boolean;
    readonly decorationGhostGroup: boolean;
    readonly decorationSelectionGroup: boolean;
    readonly logicalSelectionGroup: boolean;
  };
  readonly geometry: { readonly uuid: string; readonly type: string };
  readonly materials: readonly { readonly uuid: string; readonly type: string; readonly visible: boolean; readonly opacity: number; readonly texture?: { readonly uuid: string; readonly sourceUuid: string; readonly sourceIdentity?: string } }[];
  readonly userData: Readonly<Record<string, unknown>>;
  readonly instanceCount?: number;
  readonly instances?: {
    readonly count: number;
    readonly batchKey?: string;
    readonly instanceKeys: readonly string[];
    readonly instanceVoxels: readonly VoxelCoordinate[];
    readonly worldPositions: readonly CameraVector[];
  };
}

export interface ViewportSuspiciousVisualDiagnostic {
  readonly owner: string;
  readonly uuid: string;
  readonly reason: string;
  readonly intentionalPreview: boolean;
  readonly position: CameraVector;
  readonly worldBounds: ViewportVisibleMeshDiagnostic['worldBounds'];
}

export interface ViewportGhostSceneSnapshot {
  readonly capturedAt: string;
  readonly authoritativeProjectBlockCount: number;
  readonly activeBlock?: { readonly id: string; readonly state: Readonly<Record<string, string>> };
  readonly ownership: Pick<ViewportOwnershipDiagnostics, 'authoritativeVisibleBlockCount' | 'renderedBlockCount' | 'placeholderVisualCount' | 'placeholderBatchCount' | 'placeholderIndexCount' | 'instanceBatchCount' | 'instanceMemberCount' | 'blocksGroupChildCount' | 'visibleMeshCount' | 'visibleMeshesOutsideBlocksGroup' | 'hydrationState'>;
  readonly visibleMeshes: readonly ViewportVisibleMeshDiagnostic[];
  readonly suspiciousVisualCount: number;
  readonly suspiciousVisuals: readonly ViewportSuspiciousVisualDiagnostic[];
  readonly directSceneChildren: ViewportOwnershipDiagnostics['directSceneChildren'];
  readonly instanceOwnershipTrace: readonly ViewportInstanceOwnershipEvent[];
  readonly previewState: ViewportOwnershipDiagnostics['previewState'];
}

export interface ViewportInstanceOwnershipEvent {
  readonly phase: 'before-insert' | 'after-insert' | 'before-remove' | 'after-remove' | 'after-remove-entry' | 'after-reconcile';
  readonly key?: string;
  readonly source?: 'cached-template' | 'provider-async' | 'rollback' | 'reconcile';
  readonly generation: number;
  readonly previousEntry?: { readonly batchKey?: string; readonly index?: number };
  readonly physicalMemberships: readonly { readonly batchKey: string; readonly index: number }[];
  readonly violations: readonly string[];
}

export interface ViewportEmptyTransitionDiagnostics {
  readonly firstEmpty: ViewportGhostSceneSnapshot | null;
  readonly secondEmpty: ViewportGhostSceneSnapshot | null;
  readonly differences: null | {
    readonly visibleMeshCountDelta: number;
    readonly renderedBlockCountDelta: number;
    readonly visibleMeshesAdded: readonly ViewportVisibleMeshDiagnostic[];
    readonly visibleMeshesRemoved: readonly ViewportVisibleMeshDiagnostic[];
    readonly suspiciousVisualsAdded: readonly ViewportSuspiciousVisualDiagnostic[];
    readonly suspiciousVisualsRemoved: readonly ViewportSuspiciousVisualDiagnostic[];
    readonly previewStateChanged: boolean;
  };
}

export interface ViewportRuntimeDiagnostics {
  readonly current: ViewportGhostSceneSnapshot;
  readonly emptyTransitions: ViewportEmptyTransitionDiagnostics;
}

export interface ViewportControlConfiguration {
  readonly orbitSensitivity: number;
  readonly panSensitivity: number;
  readonly zoomSensitivity: number;
  readonly cameraMoveSpeed: number;
  readonly verticalMoveSpeed: number;
}

interface RenderedBlockEntry {
  readonly key: string;
  readonly block: ProjectDocument['blocks'][number];
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
  readonly decoration: PlacedDecoration;
  readonly signature: string;
  readonly object: THREE.Object3D;
}

interface BlockHydrationJob {
  readonly token: number;
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
interface HoverRequest {
  readonly clientX: number;
  readonly clientY: number;
  readonly project: ProjectDocument | undefined;
  readonly active: ActiveBlock | undefined;
  readonly planeY: number | undefined;
  readonly showGhost: boolean;
  readonly listener: ViewportHoverListener;
}

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
  private readonly structureBlockGuideGroup = new THREE.Group();
  private readonly ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x4b9cff, transparent: true, opacity: 0.35 }));
  private readonly selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, depthWrite: false }));
  private readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
  private readonly movePreviewGroup = new THREE.Group();
  private readonly decorationGhostGroup = new THREE.Group();
  private readonly decorationSelectionGroup = new THREE.Group();
  private readonly logicalSelectionGroup = new THREE.Group();
  private readonly logicalSelectionGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
  private readonly logicalSelectionMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, depthWrite: false });
  private readonly groupHighlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12, 1.12, 1.12));
  private readonly groupHighlightMaterial = new THREE.LineBasicMaterial({ color: 0x58d8d0 });
  private structureBlockGuideKey = '';
  private structureBlockGuideGeneration = 0;
  private lastSelectionPositions?: readonly VoxelCoordinate[];
  private lastSelectionBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  private lastSelectionKind?: string;
  private lastSelectionCount = -1;
  private lastSelected?: VoxelCoordinate;
  private lastSelectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
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
  private readonly cameraInteraction = new CameraInteractionController({ idleGraceMs: VIEWPORT_CAMERA_IDLE_GRACE_MS });
  private readonly hydrationScheduler = new HydrationScheduler<never>();
  private ghostModel?: THREE.Group;
  private ghostModelKey = '';
  private ghostPlan?: PlacementPlan;
  private ghostTarget?: VoxelCoordinate;
  private lastHoverVisualKey = '';
  private decorationGhostKey = '';
  private readonly ghostBoundsCenter = new THREE.Vector3(.5, .5, .5);
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private ground?: THREE.Mesh;
  private editingPlane?: THREE.Mesh;
  private editingGrid?: THREE.LineSegments;
  private projectGrid?: THREE.LineSegments;
  private boundsBox?: THREE.Box3Helper;
  private container?: HTMLElement;
  private resizeObserver?: ResizeObserver;
  private project?: ProjectDocument;
  private spatialIndex?: ProjectBlockSpatialIndex;
  private spatialIndexProject?: ProjectDocument;
  private spatialIndexBlocksReference?: readonly ProjectDocument['blocks'][number][];
  private cachedVisibleEntries: VisibleBlockEntry[] = [];
  private cachedVisibleMap = new Map<string, VisibleBlockEntry>();
  private readonly cachedVisibleIndices = new Map<string, number>();
  private cachedVisibleKey = '';
  private cachedVisibleProject?: ProjectDocument;
  private structuralSpecialVisualIds = new Set<string>();
  private cachedBoundsKey = '';
  private observedSpatialIndexLookups = 0;
  private lastActiveGroupProject?: ProjectDocument;
  private lastActiveGroupId?: string;
  private lastActiveGroupPositions?: readonly VoxelCoordinate[];
  private lastIsolatedGroupId?: string;
  private lastIsolatedGroupPositions?: readonly VoxelCoordinate[];
  private activeBlock?: ActiveBlock;
  private showStructureBlockGuide = true;
  private renderOptions: ViewportRenderOptions = {};
  private hasCameraFrame = false;
  private readonly renderOnControlChange = () => {
    this.instrumentation.record('controlChangeEvents');
    this.runtimeTrace?.record('controls-change');
    this.markCameraInteraction();
    if (this.cameraMovementInProgress) {
      this.instrumentation.record('cameraChangeEventsDuringMovement');
      this.instrumentation.record('cameraRenderRequestsSuppressed');
      return;
    }
    this.requestCameraRender();
  };
  private cameraMovementInProgress = false;
  private cameraGestureInProgress = false;
  private readonly onControlStart = () => {
    this.runtimeTrace?.record('controls-start');
    this.cameraInteraction.beginGesture();
    this.cameraGestureInProgress = true;
    this.cancelPendingHover(true);
    this.ghost.visible = false;
    if (this.ghostModel) this.ghostModel.visible = false;
    this.clearDecorationGhost();
    this.requestCameraRender();
  };
  private readonly onControlEnd = () => { this.runtimeTrace?.record('controls-end'); this.cameraInteraction.endGesture(); this.cameraGestureInProgress = false; this.requestCameraRender(); };
  private cameraMoveFrame?: number;
  private get pressedActions(): Set<MovementAction> { return this.cameraInteraction.pressedActions as Set<MovementAction>; }
  private mouseBindings: Readonly<Record<MouseAction, string>> = DEFAULT_MOUSE_BINDINGS;
  private readonly onWindowBlur = () => { this.runtimeTrace?.record('blur'); this.clearInput(); };
  private readonly onVisibilityChange = () => { this.runtimeTrace?.record('visibilitychange', { hidden: document.hidden }); if (document.hidden) this.clearInput(); };
  private readonly onCanvasPointerDownCapture = (event: PointerEvent) => {
    const action = mouseActionForEvent(event, this.mouseBindings);
    if (!action || !this.controls) return;
    const key = event.button === 0 ? 'LEFT' : event.button === 1 ? 'MIDDLE' : event.button === 2 ? 'RIGHT' : undefined;
    if (!key) return;
    const mapped = this.controls.mouseButtons[key];
    if (action === 'orbit-camera' || action === 'pan-camera') {
      this.runtimeTrace?.record('pointer-camera-start', { button: event.button, action });
      if (mapped === undefined) { this.temporaryMouseButton = { key, previous: mapped }; this.controls.mouseButtons[key] = action === 'orbit-camera' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN; }
      return;
    }
    if (action !== 'primary-action' && action !== 'delete-target') return;
    if (mapped !== undefined) { event.preventDefault(); this.temporaryMouseButton = { key, previous: mapped }; delete this.controls.mouseButtons[key]; }
  };
  private readonly onCanvasPointerUpCapture = (event: PointerEvent) => { if (this.temporaryMouseButton) this.runtimeTrace?.record('pointer-camera-end', { button: event.button }); this.restoreTemporaryMouseButton(); };
  private readonly onCanvasWheelCapture = (event: WheelEvent) => {
    const action = mouseActionForEvent(event, this.mouseBindings);
    if (action !== 'zoom-in' && action !== 'zoom-out') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    event.preventDefault(); event.stopImmediatePropagation(); this.applyWheelZoom(action, event.deltaY, event.deltaMode);
  };
  private temporaryMouseButton?: { readonly key: 'LEFT' | 'MIDDLE' | 'RIGHT'; readonly previous: THREE.MOUSE | null | undefined };
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
  private ghostGeneration = 0;
  private disposed = false;
  private renderCount = 0;
  private canvasSize = { width: 0, height: 0 };
  private themeApplied = false;
  private controlConfiguration: ViewportControlConfiguration = { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 9 };
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
  private readonly projectBlockSignatureCache = new WeakMap<ProjectDocument, ReadonlyMap<string, string>>();
  private decorationSyncKey = '';
  private syncedDecorationProject?: ProjectDocument;
  private decorationRevision = 0;
  private get providerGeneration(): number { return this.providerLifecycle.generation; }
  private get hydrationProgressState(): ViewportHydrationProgress { return this.hydrationProgressTracker.snapshot(); }
  private providerStats?: VisualCacheStats;
  private hydrationGeneration = 0;
  private readonly pendingHydrationSignatures = new Map<string, string>();
  /** Ownership signatures for final fallback placeholders (no async job). */
  private readonly placeholderSignatures = new Map<string, string>();
  private readonly runningHydrationKeys = new Map<string, number>();
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
  private hoverFrame?: number;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private pendingHover?: HoverRequest;
  private fallbackGeometryCounted = false;
  private readonly fallbackMaterialRoles = new Set<string>();
  private runtimeDiagnosticsEnabled = false;
  private runtimeTrace?: ViewportRuntimeTrace;
  private runtimeObservedProjectBlockCount = 0;
  private readonly emptyTransitionSnapshots: ViewportGhostSceneSnapshot[] = [];
  private readonly instanceOwnershipTrace: ViewportInstanceOwnershipEvent[] = [];
  private readonly culledBlockKeys = new Set<string>();
  private readonly previousVisibleBlockPositions = new Map<string, VoxelCoordinate>();

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
    const selectionBoxMaterial = this.selectionBox.material as THREE.LineBasicMaterial;
    selectionBoxMaterial.depthTest = false;
    selectionBoxMaterial.depthWrite = false;
    this.selectionOutline.renderOrder = 2000;
    this.selectionBox.renderOrder = 2000;
    this.logicalSelectionGroup.renderOrder = 2000;
  }

  mount(container: HTMLElement): void {
    if (this.disposed) return;
    if (this.renderer) { this.resize(); return; }
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.updatePixelRatioTargets();
    this.renderer.setPixelRatio(this.staticPixelRatio);
    container.appendChild(this.renderer.domElement);
    this.applyTheme(this.palette);
    this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x394454, 1);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1); this.keyLight.position.set(6, 10, 7);
    this.scene.add(this.hemisphereLight, this.keyLight);
    this.applyBlockBrightness();
    this.scene.add(this.blocksGroup);
    this.scene.add(this.decorationsGroup);
    this.structureBlockGuideGroup.name = 'structureBlockGuide';
    this.scene.add(this.structureBlockGuideGroup);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.selectionOutline.visible = false;
    this.selectionOutline.renderOrder = 1001;
    this.scene.add(this.selectionOutline);
    this.selectionBox.visible = false;
    this.selectionBox.renderOrder = 1001;
    this.scene.add(this.selectionBox);
    this.scene.add(this.movePreviewGroup);
    this.scene.add(this.logicalSelectionGroup);
    this.scene.add(this.decorationGhostGroup);
    this.scene.add(this.decorationSelectionGroup);
    this.camera.position.set(12, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    delete this.controls.mouseButtons.LEFT;
    this.controls.enableZoom = false;
    this.controls.enablePan = true;
    this.applyControlConfiguration();
    this.applyMouseBindings();
    this.controls.addEventListener('change', this.renderOnControlChange);
    this.controls.addEventListener('start', this.onControlStart);
    this.controls.addEventListener('end', this.onControlEnd);
    this.renderer.domElement.addEventListener('pointerdown', this.onCanvasPointerDownCapture, true);
    this.renderer.domElement.addEventListener('pointerup', this.onCanvasPointerUpCapture, true);
    this.renderer.domElement.addEventListener('pointercancel', this.onCanvasPointerUpCapture, true);
    this.renderer.domElement.addEventListener('wheel', this.onCanvasWheelCapture, { capture: true, passive: false });
    document.addEventListener('focusin', this.onWindowBlur); window.addEventListener('blur', this.onWindowBlur); document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    if (this.project) this.resetCamera();
    else this.frameBounds(projectCameraBounds(VIEWPORT_BOOTSTRAP_SIZE));
    this.scheduleRender();
  }

  applyTheme(palette: ViewportThemePalette): void {
    this.palette = palette;
    this.themeApplied = true;
    this.scene.background = new THREE.Color(palette.background);
    (this.projectGrid?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.grid);
    (this.editingGrid?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.editingGrid);
    (this.boundsBox?.material as THREE.LineBasicMaterial | undefined)?.color.setHex(palette.bounds);
    (this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(palette.selection);
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(palette.selection);
    this.fallbackMaterials.normal.color.setHex(palette.block);
    this.fallbackMaterials.reference.color.setHex(palette.referenceBlock);
    this.fallbackMaterials.missing.color.setHex(palette.missingBlock);
    this.placeholderMaterials.normal.color.setHex(palette.block);
    this.placeholderMaterials.reference.color.setHex(palette.referenceBlock);
    this.placeholderMaterials.missing.color.setHex(palette.missingBlock);
    for (const material of Object.values(this.fallbackMaterials)) setBlockBrightnessBaseColor(material);
    for (const material of Object.values(this.placeholderMaterials)) setBlockBrightnessBaseColor(material);
    this.applyBlockBrightness();
    this.logicalSelectionGroup.traverse((object) => { if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(palette.selection); });
    this.scene.traverse((object) => { if (object.userData['groupHighlight'] && object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(object.userData['groupLocked'] ? palette.lockedGroup : palette.group); });
    this.movePreviewGroup.traverse((object) => { if (object instanceof THREE.Mesh) (object.material as THREE.MeshBasicMaterial).color.setHex(object.userData['previewInvalid'] ? palette.invalid : palette.valid); });
    const ghostStatus = this.ghost.userData['status'] as PlacementStatus | undefined;
    if (ghostStatus) (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(colorForStatus(this.palette, ghostStatus));
    this.scheduleRender();
  }

  setBlockBrightness(value: number): void {
    this.blockBrightness = normalizeBlockBrightness(value);
    this.applyBlockBrightness();
    if (this.renderer) this.scheduleRender();
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
    this.applyControlConfiguration();
  }

  setStructureBlockGuideVisible(visible: boolean): void {
    if (this.showStructureBlockGuide === visible) return;
    this.showStructureBlockGuide = visible;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  cameraKeyDown(action: MovementAction): void { if (this.disposed) return; this.runtimeTrace?.record('movement-keydown', { action }); this.cameraInteraction.press(action); this.markCameraInteraction(); this.startCameraMovement(); }
  cameraKeyUp(action: MovementAction): void { this.runtimeTrace?.record('movement-keyup', { action }); this.cameraInteraction.release(action); if (!this.pressedActions.size && this.cameraMoveFrame === undefined) this.requestCameraRender(); }

  setMouseBindings(bindings: Readonly<Record<MouseAction, string>>): void {
    this.mouseBindings = { ...bindings };
    this.applyMouseBindings();
  }

  private applyControlConfiguration(): void {
    if (!this.controls) return;
    this.controls.rotateSpeed = this.controlConfiguration.orbitSensitivity;
    this.controls.panSpeed = this.controlConfiguration.panSensitivity;
    this.controls.zoomSpeed = this.controlConfiguration.zoomSensitivity;
  }

  private applyMouseBindings(): void {
    if (!this.controls) return;
    delete this.controls.mouseButtons.LEFT;
    delete this.controls.mouseButtons.MIDDLE;
    delete this.controls.mouseButtons.RIGHT;
    const orbit = this.unmodifiedMouseButton('orbit-camera');
    const pan = this.unmodifiedMouseButton('pan-camera');
    if (orbit === 'LeftClick') this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    if (orbit === 'MiddleClick') this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    if (orbit === 'RightClick') this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    if (pan === 'LeftClick') this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    if (pan === 'MiddleClick') this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    if (pan === 'RightClick') this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  }

  private restoreTemporaryMouseButton(): void {
    if (!this.controls || !this.temporaryMouseButton) return;
    const { key, previous } = this.temporaryMouseButton;
    if (previous === undefined) delete this.controls.mouseButtons[key];
    else this.controls.mouseButtons[key] = previous;
    this.temporaryMouseButton = undefined;
  }

  private unmodifiedMouseButton(action: MouseAction): string | undefined {
    const binding = this.mouseBindings[action].split('|').find((value) => !value.includes('+'));
    return binding;
  }

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
    if (!this.renderer || !this.container) return;
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
    if (previousProvider && provider) this.queueProviderRefresh(previousProvider, provider);
    const hadVisibleCache = this.cachedVisibleProject === this.project;
    this.update(this.project, this.activeBlock, this.renderOptions);
    if (hadVisibleCache && !requiresStructureResync) this.resyncCurrentFluidProvider();
    if (!provider && previousFluidEntries.length) this.completeHydrationBatch(this.hydrationGeneration, previousFluidEntries.map((entry) => entry.key));
    this.releaseUnusedRetiredProviders();
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
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemResourceProvider(provider: ((itemId: string) => readonly string[]) | undefined): void {
    if (provider === this.decorationItemResources) return;
    this.decorationItemResources = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemVisualProvider(provider: ((itemId: string) => ResolvedItemVisual | undefined) | undefined): void {
    if (provider === this.decorationItemVisual) return;
    this.decorationItemVisual = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setDecorationItemPreviewProvider(provider: ((item: ItemStackData) => Promise<string | undefined>) | undefined): void {
    if (provider === this.decorationItemPreview) return;
    this.decorationItemPreview = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }
  setPaintingTextureResolver(provider: ((variantId: string) => string | undefined) | undefined): void {
    if (provider === this.paintingResource) return;
    this.paintingResource = provider;
    this.decorationRevision += 1;
    this.update(this.project, this.activeBlock, this.renderOptions);
  }

  setPlacementPlanProvider(provider: PlacementPlanProvider | undefined): void { this.placementPlanProvider = provider; }
  setBlockDefinitionResolver(resolver: ((blockId: string) => BlockDefinition | undefined) | undefined): void {
    if (this.definitionResolver === resolver) return;
    this.definitionResolver = resolver;
    this.structureBlockGuideKey = '';
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
    const worldContext = { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) };
    const visible = this.cachedVisibleProject === this.project && this.cachedVisibleKey === renderFilterKey(this.renderOptions)
      ? this.cachedVisibleMap
      : new Map(this.visibleBlocks(this.project, this.renderOptions).map((entry) => [coordinateKey(entry.block.position), entry] as const));
    for (const [key, entry] of this.renderedBlocks) {
      const visibleEntry = visible.get(key);
      if (!visibleEntry) continue;
      const oldKey = this.requestReusableVisualKey(entry.provider ?? previousProvider, entry.block, worldContext);
      const newKey = this.requestReusableVisualKey(nextProvider, entry.block, worldContext);
      // Undefined keys represent specials, fluids, fallbacks, and other
      // visuals whose dependencies cannot be proven reusable. Refresh those
      // entries, but never invalidate keyed terrain merely for a handoff.
      if (entry.fluidChunkKey !== undefined || this.fluidCoordinator.isClaimed(key)) continue;
      if (oldKey !== newKey || oldKey === undefined || newKey === undefined) {
        this.hydrationWork.enqueueProviderRefresh({
          token: this.hydrationGeneration,
          key,
          block: visibleEntry.block,
          signature: visibleEntry.signature,
          role: visibleEntry.role,
          worldContext,
          options: this.renderOptions,
          allowInstancing: false,
          surfaceFastPathEligible: this.renderOptions.exposedFaceRendering === true && visibleEntry.role === 'normal' && visibleEntry.occlusionClass === 'opaque-full-cube',
          surfaceVisibleEntries: visible,
          providerRefresh: true,
        });
      }
    }
    if (this.hydrationWork.queuedProviderRefresh()) this.scheduleHydrationPump();
  }

  private releaseUnusedRetiredProviders(): void {
    this.providerLifecycle.releaseUnused({
      referenced: (provider) => [...this.renderedBlocks.values()].some((entry) => entry.provider === provider) || this.fluidCoordinator.referencedProviders().has(provider),
      queued: (provider) => this.hydrationWork.providerRefreshJobs().some((job) => job.key && this.renderedBlocks.get(job.key)?.provider === provider),
    });
  }

  update(project: ProjectDocument | undefined, active: ActiveBlock | undefined, options: ViewportRenderOptions = {}, mutationHint?: ProjectMutationHint): void {
    const previousProject = this.project;
    const previousOptions = this.renderOptions;
    const previousSyncKey = this.structureSyncKey;
    const nextSyncKey = project ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${renderFilterKey(options)}` : 'empty';
    const incrementalMutation = !!project && !!previousProject && project !== previousProject && !!mutationHint && nextSyncKey === previousSyncKey && renderFilterKey(previousOptions) === renderFilterKey(options) && this.cachedVisibleProject === previousProject && this.spatialIndexProject === previousProject;
    this.project = project;
    this.activeBlock = active;
    this.renderOptions = options;
    const inPlaceBlockMutation = project === this.syncedProject && project !== undefined && (project.blocks !== this.syncedBlocksReference || project.blocks.length !== this.syncedBlockCount);
    this.ensureSpatialIndex(project, incrementalMutation ? false : inPlaceBlockMutation, incrementalMutation);
    this.syncSpecialVisualDescriptors();
    const syncKey = nextSyncKey;
    const blockInputChanged = project !== this.syncedProject || syncKey !== this.structureSyncKey;
    const decorationKey = project ? `${project.id}|${renderFilterKey(options)}|${this.decorationRevision}` : 'empty';
    const decorationInputChanged = project !== this.syncedDecorationProject || decorationKey !== this.decorationSyncKey;
    const full = syncKey !== this.structureSyncKey;
    if (blockInputChanged || inPlaceBlockMutation) {
      const projectIdentityChanged = project !== this.syncedProject;
      const incrementalProjectChange = projectIdentityChanged && !full && this.renderedBlocks.size === 0 && (this.queuedBlockHydrationJobs() > 0 || this.pendingHydrationSignatures.size > 0 || this.placeholderSignatures.size > 0);
      const equivalentProjectReplacement = projectIdentityChanged && !inPlaceBlockMutation && !full && !mutationHint && this.isEquivalentProjectReplacement(project, this.syncedProject);
      if (incrementalMutation && project && mutationHint) {
        this.applyIncrementalMutation(project, options, mutationHint);
      } else {
        if (full || !incrementalProjectChange && (inPlaceBlockMutation || projectIdentityChanged && !equivalentProjectReplacement)) {
          const reason: HydrationCancellationReason = inPlaceBlockMutation ? 'in-place-project-mutation' : full ? 'structure-sync-key-changed' : 'project-identity-changed';
          this.cancelHydration(reason, {
            projectIdentityChanged,
            equivalentProjectReplacement,
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
      this.structureSyncKey = syncKey;
      this.syncedProject = project;
      this.syncedBlockCount = project?.blocks.length;
      this.syncedBlocksReference = project?.blocks;
    }
    if (decorationInputChanged) {
      if (!blockInputChanged) this.cancelDecorationHydration();
      this.decorationSyncKey = decorationKey;
      this.syncedDecorationProject = project;
      this.reconcileDecorations(project, options, false);
      this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
    }
    if (!blockInputChanged && !inPlaceBlockMutation && !decorationInputChanged) this.instrumentation.record('overlayOnlyUpdates');
    this.setProjectBounds(project);
    this.updateStructureBlockGuide(project, options);
    this.setEditingPlane(options.layerY, project);
    const visualSelection = this.visibleSelection(project, options);
    this.updateSelection(visualSelection.selected, visualSelection.positions, visualSelection.kind, visualSelection.count, visualSelection.bounds, visualSelection.box);
    this.updateActiveGroup(project, options.activeGroupId, options.activeGroupPositions);
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
    if (project && this.controls && !this.hasCameraFrame) this.resetCamera();
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
    const terrain = this.terrainRenderer.evidence();
    const currentGenerationRunning = this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0;
    const workCounts = this.hydrationWork.counts();
    const hydration = this.hydrationProgressState;
    const renderRegions = new Set([...this.instanceBatches.values(), ...this.surfaceFaceBatches.values()].map((batch) => batch.regionKey).filter((key): key is string => !!key));
    const standaloneBlockObjects = [...this.renderedBlocks.values()].filter((entry) => !!entry.object && !entry.instanceBatchKey && !entry.surfaceFaceMemberships?.length && entry.terrainChunkKey === undefined).length;
    const staticModels = this.staticModelDiagnostics();
    return {
      camera: { position: toTraceVector(this.camera.position), target: toTraceVector(target), offset: toTraceVector(offset), distance: offset.length(), direction: toTraceVector(direction), quaternion: [this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w], up: toTraceVector(this.camera.up), fov: this.camera.fov, aspect: this.camera.aspect },
      dpr: { staticPixelRatio: this.staticPixelRatio, interactivePixelRatio: this.staticPixelRatio, appliedPixelRatio: this.renderer?.getPixelRatio() ?? this.staticPixelRatio, interactiveResolutionActive: false, canvasCss: { width: this.container?.getBoundingClientRect().width ?? 0, height: this.container?.getBoundingClientRect().height ?? 0 }, backingWidth: this.renderer?.domElement.width ?? 0, backingHeight: this.renderer?.domElement.height ?? 0, cameraAspect: this.camera.aspect },
      hydration: { ...hydration, queued: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(), running: this.hydrationRunning, regularQueued: workCounts.regularQueued, providerRefreshQueued: workCounts.providerRefreshQueued, regularRunning: workCounts.regularRunning, providerRefreshRunning: workCounts.providerRefreshRunning, currentGenerationRunning, staleRunning: Math.max(0, this.hydrationRunning - currentGenerationRunning), pendingSignatureCount: this.pendingHydrationSignatures.size, placeholderSignatureCount: this.placeholderSignatures.size, placeholderVisualCount: this.placeholderIndices.size, renderedBlockCount: this.renderedBlocks.size, expectedVisibleBlockCount: this.cachedVisibleEntries.length, terrainHydrationPending: this.terrainHydrationPending, hydrationScheduled: this.hydrationScheduled, hydrationTimerActive: this.hydrationScheduler.timerActive, currentBatchBudget: this.hydrationBatchBudget, isCameraInteracting: this.isCameraInteracting(), interactiveMode: false },
      counters,
      render: { ...this.lastRendererMetrics, renderCpuMs: this.renderCpuMs, frameDurationMs: this.frameDurationMs, cameraRenderPending: this.cameraRenderPending, renderSchedulerPending: this.renderScheduler.scheduled, object3dCount: this.scene.children.length, visibleMeshCount: this.blocksGroup.children.filter((child) => child.visible).length + this.decorationsGroup.children.filter((child) => child.visible).length, instanceBatchCount: this.instanceBatches.size, surfaceBatchCount: this.surfaceFaceBatches.size, terrainMeshCount: terrain.terrainChunkMeshes, standaloneMeshCount: standaloneBlockObjects, renderRegionCount: renderRegions.size },
      generations: { providerGeneration: this.providerGeneration, hydrationGeneration: this.hydrationGeneration, specialVisualRevision: this.specialVisualRevision },
      terrain: { ...terrain, terrainAtlas: { ...terrain.terrainAtlas } },
      staticModels: { ...staticModels },
      fluids: { ...this.fluidCoordinator.diagnostics() },
      build: { effectiveMovementSpeed: effectiveCameraMovementSpeed(this.controlConfiguration.cameraMoveSpeed, offset.length()), cameraMovementScale: cameraMovementScale(offset.length()), cameraMoveSpeed: this.controlConfiguration.cameraMoveSpeed, verticalMoveSpeed: this.controlConfiguration.verticalMoveSpeed },
    };
  }

  private staticModelDiagnostics(): StaticModelDiagnosticSnapshot {
    if (this.staticModelDiagnosticsCache) return this.staticModelDiagnosticsCache;
    const metrics = this.instanceRenderer.metrics();
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

  private reconcileStructure(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean): void {
    this.runtimeTrace?.record('reconcile', { full, projectBlocks: project?.blocks.length ?? 0 });
    this.instrumentation.record('structuralReconciles');
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
    const visible = this.visibleBlocks(project, options);
    this.setHydrationBlockScope(visible);
    this.adoptCommittedBlockOwnership(visible);
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
    const renderVisible = visible.filter((entry) => {
      if (this.fluidCoordinator.isClaimed(coordinateKey(entry.block.position))) return false;
      if (options.exposedFaceRendering === true && isCompiledTerrainEntry(entry)) return true;
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
    for (const key of this.runningHydrationKeys.keys()) if (!visibleMap.has(key)) this.runningHydrationKeys.delete(key);
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
      } else this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, key, block: next.block, signature: next.signature, role: next.role, worldContext, options, allowInstancing, surfaceFastPathEligible: options.exposedFaceRendering === true && next.role === 'normal' && next.occlusionClass === 'opaque-full-cube', surfaceVisibleEntries: allVisibleMap });
    }
    if (terrainCandidates.length) this.scheduleTerrainBatch(terrainCandidates, visible, terrainAffectedPositions, full);
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
    if (!provider || options.exposedFaceRendering !== true || next.role !== 'normal' || !isCompiledTerrainEntry(next)) return undefined;
    const reusableKey = this.requestReusableVisualKey(provider, next.block, worldContext);
    return reusableKey ? { key, next, reusableKey, worldContext, provider } : undefined;
  }

  private visibleEntry(block: ProjectDocument['blocks'][number], options: ViewportRenderOptions): VisibleBlockEntry {
    const role = block.kind === 'missing' ? 'missing' : options.layerY !== undefined && block.position.y !== options.layerY ? 'reference' : 'normal';
    this.instrumentation.record('blockSignatureComputations');
    return { block, role, signature: `${blockRenderSignature(block)}|${role}|${options.referenceOpacity ?? .28}`, occlusionClass: this.visualProvider?.occlusionClass?.(block) ?? 'unknown' };
  }

  /**
   * Project object replacement is common during restore/import. Compare the
   * renderer-relevant block content once for that explicit replacement so a
   * new object reference does not masquerade as a structural mutation.
   */
  private isEquivalentProjectReplacement(project: ProjectDocument | undefined, previous: ProjectDocument | undefined): boolean {
    if (!project || !previous || project.id !== previous.id || project.size.x !== previous.size.x || project.size.y !== previous.size.y || project.size.z !== previous.size.z) return false;
    const next = this.projectBlockSignatures(project);
    const prior = this.projectBlockSignatures(previous);
    if (next.size !== project.blocks.length || prior.size !== previous.blocks.length || next.size !== prior.size) return false;
    for (const [key, signature] of prior) if (next.get(key) !== signature) return false;
    return true;
  }

  private projectBlockSignatures(project: ProjectDocument): ReadonlyMap<string, string> {
    const cached = this.projectBlockSignatureCache.get(project);
    if (cached) return cached;
    const signatures = new Map<string, string>();
    for (const block of project.blocks) signatures.set(coordinateKey(block.position), blockRenderSignature(block));
    this.projectBlockSignatureCache.set(project, signatures);
    return signatures;
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

  private applyIncrementalMutation(project: ProjectDocument, options: ViewportRenderOptions, hint: ProjectMutationHint): void {
    this.runtimeTrace?.record('local-edit-start', { source: hint.source ?? 'unknown', changes: hint.changes.length });
    this.runtimeTrace?.record('incremental-reconcile', { changedVoxelCount: hint.changes.length, source: hint.source ?? 'unknown' });
    this.instrumentation.record('hintedProjectMutations');
    this.instrumentation.record('incrementalBlockReconciles');
    this.compactHydrationQueues();
    const delta = planLocalRenderDelta(hint);
    const changedKeys = new Set(delta.mutatedKeys);
    const affectedPositions = new Map(delta.affectedPositions);
    const hintedKeys = new Set(delta.hintedKeys);
    for (const change of hint.changes) {
      const beforeKey = change.before ? coordinateKey(change.before.position) : coordinateKey(change.position);
      const afterKey = change.after ? coordinateKey(change.after.position) : coordinateKey(change.position);
      if (change.before && !change.after) this.hydrationProgressTracker.removeBlockKey(beforeKey);
      if (change.after && !this.hydrationProgressTracker.hasBlockKey(afterKey)) this.hydrationProgressTracker.addBlockKey(afterKey);
      this.spatialIndex?.replace(change.before?.position, change.after);
      if (change.after) this.structuralSpecialVisualIds.add(change.after.id);
    }
    this.syncSpecialVisualDescriptors();
    this.instrumentation.record('incrementalChangedVoxels', affectedPositions.size);
    this.spatialIndexProject = project;
    this.spatialIndexBlocksReference = project.blocks;
    this.cachedVisibleProject = project;
    this.cachedVisibleKey = renderFilterKey(options);
    for (const [key, position] of affectedPositions) {
      const block = this.spatialIndex?.get(position);
      if (block && isBlockVisibleForViewport(block, project, options)) this.cacheVisibleEntry(key, this.visibleEntry(block, options));
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
      this.runningHydrationKeys.delete(key);
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
      const renderable = !!next && (options.exposedFaceRendering === true && isCompiledTerrainEntry(next) || !this.culledBlockKeys.has(key));
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
        const record: TerrainSurfaceRecord = { key, block: next!.block, templates: cachedTemplates };
        this.renderedBlocks.set(key, { key, block: next!.block, signature: next!.signature, role: next!.role, revision: 0, provider: this.visualProvider, reusableVisualKey: candidate.reusableKey });
        preparedTerrainRecords.set(key, record);
        preparedTerrainCandidates.set(key, candidate);
        terrainChanges.push({ key, position: next!.block.position, after: record, afterOpaque: true });
      } else if (candidate) {
        this.renderedBlocks.set(key, { key, block: next!.block, signature: next!.signature, role: next!.role, revision: 0 });
        terrainChanges.push({ key, position: next!.block.position, afterOpaque: false });
        terrainCandidates.push(candidate);
      } else {
        terrainChanges.push({ key, position: next!.block.position, afterOpaque: false });
        this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, key, block: next!.block, signature: next!.signature, role: next!.role, worldContext, options, allowInstancing: true, surfaceFastPathEligible: options.exposedFaceRendering === true && next!.role === 'normal' && next!.occlusionClass === 'opaque-full-cube', surfaceVisibleEntries: this.cachedVisibleMap });
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
    if (!terrainResult.pending) this.enqueueFailedTerrainCandidates([...preparedTerrainCandidates.entries()].filter(([key]) => !representedTerrainKeys.has(key)).map(([, candidate]) => candidate));
    if (terrainCandidates.length) this.scheduleTerrainBatch(terrainCandidates, [], [...affectedPositions.values()], false, true);
    this.updateHydrationOrder();
    this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs(), 'local');
    if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    // InstanceBatchRenderer updates swap-back ownership atomically for every
    // touched entry. Full ownership reconciliation remains on structural
    // rebuilds and diagnostics, not on the local edit hot path.
    this.traceInstanceOwnership('after-reconcile', undefined, 'reconcile');
    this.runtimeTrace?.record('local-edit-end', { mutatedKeys: changedKeys.size, dependencyKeys: delta.dependencyKeys.size, terrainChunks: terrainResult.rebuiltChunks.length, terrainPending: terrainResult.pending ?? false });
  }

  private commitTerrainRecords(records: Iterable<TerrainSurfaceRecord>, result: TerrainApplyResult): void {
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

  private scheduleTerrainBatch(candidates: readonly TerrainHydrationCandidate[], occupancyEntries: readonly VisibleBlockEntry[], affectedPositions: readonly VoxelCoordinate[], initial: boolean, local = false): void {
    const groups = groupTerrainCandidates(candidates);
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate] as const));
    const token = this.hydrationGeneration;
    const providerGeneration = this.providerGeneration;
    const resolved = [...groups.entries()].map(([reusableKey, group]) => {
      const cached = this.terrainRenderer.templatesFor(reusableKey);
      if (cached) return Promise.resolve({ reusableKey, group, templates: cached, owned: false });
      this.terrainHydrationPending += 1;
      return this.resolveTerrainTemplates(reusableKey, group[0].next.block, group[0].worldContext, group[0].provider)
        .then((templates) => ({ reusableKey, group, templates, owned: true }), () => ({ reusableKey, group, templates: undefined, owned: false }));
    });
    const pendingGroups = resolved.filter((_, index) => !this.terrainRenderer.templateCache.has([...groups.keys()][index])).length;
    if (pendingGroups) this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
    void Promise.all(resolved).then((results) => {
      if (token !== this.hydrationGeneration || providerGeneration !== this.providerGeneration || this.disposed) {
        for (const result of results) if (result.owned && result.templates && ![...this.terrainRenderer.templateCache.values()].some((templates) => templates === result.templates)) this.disposeTerrainTemplates(result.templates);
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
            usable.push({ key: candidate.key, block: candidate.next.block, templates: result.templates });
          }
        } else failed.push(...result.group);
      }
      const result = local
        ? this.terrainRenderer.applyBlockChanges(usable.map((record) => ({ key: record.key, position: record.block.position, after: record, afterOpaque: true })), true)
        : this.terrainRenderer.bulkUpsert(usable, initial ? occupancyEntries : undefined, affectedPositions, { initial });
      if (!result.pending) this.commitTerrainRecords(usable, result);
      const represented = new Set(result.representedKeys);
      for (const record of usable) if (!result.pending && !represented.has(record.key)) {
        const candidate = candidateByKey.get(record.key);
        if (candidate) failed.push(candidate);
      }
      this.enqueueFailedTerrainCandidates(failed);
      this.terrainHydrationPending = Math.max(0, this.terrainHydrationPending - pendingGroups);
      this.recordProviderCacheStats();
      this.scheduleRender();
      if (this.queuedBlockHydrationJobs()) this.scheduleHydrationPump();
    }).catch(() => {
      // Promise.all is intentionally normalized above; this is only a guard
      // for an unexpected coordinator failure.
      this.terrainHydrationPending = Math.max(0, this.terrainHydrationPending - pendingGroups);
      this.enqueueFailedTerrainKeys(candidates.map((candidate) => candidate.key));
    });
  }

  private enqueueFailedTerrainCandidates(candidates: readonly TerrainHydrationCandidate[]): void {
    this.enqueueFailedTerrainKeys(candidates.map((candidate) => candidate.key));
  }

  /** Reconstructs fallback work from current viewport state after an async terrain disposition. */
  private enqueueFailedTerrainKeys(keys: readonly string[]): void {
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
      this.hydrationWork.enqueueRegular({ token: this.hydrationGeneration, key, block: next.block, signature: next.signature, role: next.role, worldContext, options: this.renderOptions, allowInstancing: true, surfaceFastPathEligible: false, surfaceVisibleEntries: this.cachedVisibleMap });
    }
    this.instrumentation.record('terrainAsyncFallbackKeys', candidates.size);
    this.updateHydrationOrder();
    this.beginHydrationProgress(this.queuedBlockHydrationJobs() + (this.hydrationRunningByGeneration.get(this.hydrationGeneration) ?? 0) + this.terrainHydrationPending, this.queuedDecorationHydrationJobs());
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

  private visibleBlocks(project: ProjectDocument, options: ViewportRenderOptions): readonly VisibleBlockEntry[] {
    this.instrumentation.record('fullVisibleScans');
    return visibleBlockEntries(project, options).map((block) => {
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
    if (culled) {
      this.culledBlockKeys.add(key);
      this.instrumentation.record('interiorBlocksCulled');
      // An intentionally omitted interior voxel is still a terminal renderer
      // outcome. Credit it at the ownership transition rather than leaving it
      // in the structural hydration scope forever.
      this.completeHydrationPart(this.hydrationGeneration, 'block', key);
    } else {
      this.culledBlockKeys.delete(key);
      this.instrumentation.record('interiorBlocksCulled', -1);
      this.hydrationProgressTracker.invalidate('block', key);
    }
  }

  private visibleSelection(project: ProjectDocument | undefined, options: ViewportRenderOptions): { readonly selected?: VoxelCoordinate; readonly positions?: readonly VoxelCoordinate[]; readonly kind?: string; readonly count?: number; readonly bounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }; readonly box?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } } {
    if (!project) return { selected: options.selected, positions: options.selectedPositions, kind: options.selectionKind, count: options.selectionCount, bounds: options.selectionBounds, box: options.selectionBox };
    const visible = this.cachedVisibleProject === project && this.cachedVisibleKey === renderFilterKey(options) ? this.cachedVisibleEntries : this.visibleBlocks(project, options);
    const visibleKeys = this.cachedVisibleProject === project && this.cachedVisibleKey === renderFilterKey(options) ? this.cachedVisibleMap : new Map(visible.map((entry) => [coordinateKey(entry.block.position), entry] as const));
    const positions = (options.selectedPositions ?? []).filter((position) => visibleKeys.has(coordinateKey(position)));
    const selected = options.selected && visibleKeys.has(coordinateKey(options.selected)) ? options.selected : undefined;
    const inBounds = (position: VoxelCoordinate, bounds: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate }): boolean => position.x >= bounds.min.x && position.x <= bounds.max.x && position.y >= bounds.min.y && position.y <= bounds.max.y && position.z >= bounds.min.z && position.z <= bounds.max.z;
    const boundedVisible = options.selectionBounds ? visible.filter((entry) => inBounds(entry.block.position, options.selectionBounds!)).map((entry) => entry.block.position) : [];
    const bounds = options.selectionBounds ? boundsOfPositions(boundedVisible) : undefined;
    const box = options.selectionBox && visible.some((entry) => inBounds(entry.block.position, options.selectionBox!)) ? options.selectionBox : undefined;
    const count = options.selectionBounds ? boundedVisible.length : positions.length || (selected ? 1 : 0);
    return { selected, positions, kind: options.selectionKind, count, bounds, box };
  }

  private setHydrationBlockScope(entries: readonly VisibleBlockEntry[]): void {
    this.hydrationProgressTracker.setBlockScope(entries.map((entry) => coordinateKey(entry.block.position)));
  }

  private adoptCommittedBlockOwnership(entries: readonly VisibleBlockEntry[]): void {
    const candidates = entries.map((entry) => {
      const key = coordinateKey(entry.block.position);
      const rendered = this.renderedBlocks.get(key);
      const committed = !!rendered
        && rendered.signature === entry.signature
        && rendered.role === entry.role
        && !this.pendingHydrationSignatures.has(key)
        && !this.placeholderSignatures.has(key)
        && !this.placeholderIndices.has(key)
        && this.hasCommittedBlockOwnership(key, rendered);
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
    return this.cameraGestureInProgress || this.cameraInteraction.isActive() || this.pressedActions.size > 0 || performance.now() < this.cameraInteractingUntil;
  }

  private markCameraInteraction(): void {
    this.cameraInteractingUntil = this.cameraInteraction.mark();
    if (this.queuedBlockHydrationJobs() || this.queuedDecorationHydrationJobs()) this.scheduleHydrationPump();
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
    if (this.disposed) return;
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
      if (!job.providerRefresh) this.runningHydrationKeys.set(job.key, job.token);
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
    if (!job.providerRefresh && this.runningHydrationKeys.get(job.key) === job.token) this.runningHydrationKeys.delete(job.key);
    this.hydrationWork.complete(job);
    this.instrumentation.record(job.providerRefresh ? 'providerRefreshCompleted' : 'regularHydrationCompleted');
    const generationRunning = Math.max(0, (this.hydrationRunningByGeneration.get(job.token) ?? 1) - 1);
    if (generationRunning) this.hydrationRunningByGeneration.set(job.token, generationRunning); else this.hydrationRunningByGeneration.delete(job.token);
    if (!job.providerRefresh) this.completeHydrationPart(job.token, 'block', job.key);
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
    this.cancelDecorationHydration();
    this.hydrationBatchBudget = 0;
    this.hydrationBatchDeadline = 0;
    this.hydrationScheduler.cancel();
    this.hydrationTimer = undefined;
    this.hydrationScheduled = false;
    this.hydrationProgressTracker.clear();
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
    if (this.disposed) return;
    this.renderScheduler.request(() => this.renderFrame());
  }

  private renderFrame(): void {
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
          if (!this.addTerrainVisual(job.block, job.key, visual.terrainTemplates)) return;
          entry.provider = provider;
          entry.reusableVisualKey = reusableKey;
        } else {
          this.removeBlockEntry(job.key, entry);
          if (!this.addTerrainVisual(job.block, job.key, visual.terrainTemplates)) return;
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
        if (child instanceof THREE.Mesh && job.role === 'reference') {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) { material.transparent = true; material.opacity = job.options.referenceOpacity ?? .28; }
        }
      });
      this.removeBlockEntry(job.key, entry);
      const replacement: RenderedBlockEntry = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider };
      const staticBatchingAllowed = job.role === 'normal' && this.instanceRenderer.shouldAttempt(true, reusableKey);
      replacement.reusableVisualKey = reusableKey;
      replacement.staticModelAttempted = staticBatchingAllowed;
      replacement.staticModelFamily = visualFamily(object) ?? familyFromReusableKey(reusableKey);
      const instance = staticBatchingAllowed ? this.addInstanceVisual(object, job.block, job.key, reusableKey, 'provider-async') : undefined;
      if (instance) {
        replacement.instanceBatchKey = instance.batchKey;
        replacement.instanceIndex = instance.index;
        replacement.object = this.instanceBatches.get(instance.batchKey)!.parts[0];
        replacement.staticModelDecision = this.instanceRenderer.decisionFor(job.key);
        disposeObject(object);
      } else {
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
    const reusableKey = providerAvailable && role === 'normal' ? this.requestReusableVisualKey(provider!, block, worldContext) : undefined;
    const staticBatchingAllowed = providerAvailable && role === 'normal' && this.instanceRenderer.shouldAttempt(allowInstancing || surfaceFastPathEligible, reusableKey);
    entry.staticModelAttempted = staticBatchingAllowed;
    entry.staticModelFamily = familyFromReusableKey(reusableKey) ?? entry.staticModelFamily;
    const cachedTemplates = reusableKey ? this.instanceRenderer.templateFor(reusableKey) : undefined;
    const cachedTerrainTemplates = surfaceFastPathEligible && reusableKey ? this.terrainRenderer.templatesFor(reusableKey) : undefined;
    const cachedSurfaceTemplates = surfaceFastPathEligible && reusableKey ? this.surfaceTemplateCache.get(reusableKey) : undefined;
    if (providerAvailable && cachedTerrainTemplates) {
      if (this.addTerrainVisual(block, entry.key, cachedTerrainTemplates)) {
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
      const instance = this.addInstanceVisualFromTemplates(cachedTemplates.templates, block, entry.key, 'cached-template', cachedTemplates);
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
          if (this.addTerrainVisual(block, entry.key, visual.terrainTemplates)) {
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
        object.traverse((child) => { child.userData['voxel'] = block.position; child.userData['renderRole'] = role; child.userData['realModel'] = true; if (child instanceof THREE.Mesh && isReference) { const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const item of materials) { item.transparent = true; item.opacity = options.referenceOpacity ?? .28; } } });
        let surfaceMemberships: readonly SurfaceFaceMembership[] | undefined;
        let terrainCompiled = false;
        if (surfaceFastPathEligible && reusableKey) {
          const cachedTerrain = this.terrainRenderer.templatesFor(reusableKey);
          const templates = cachedTerrain ?? extractSurfaceFaceTemplates(object);
          if (templates) {
            if (!cachedTerrain) this.terrainRenderer.cacheTemplates(reusableKey, templates);
            terrainCompiled = this.addTerrainVisual(block, entry.key, templates);
            if (!terrainCompiled && !cachedTerrain) {
              const cachedSurface = this.surfaceTemplateCache.get(reusableKey);
              if (!cachedSurface) this.surfaceTemplateCache.set(reusableKey, templates);
              surfaceMemberships = this.addSurfaceFaceVisual(block, entry.key, cachedSurface ?? templates, surfaceVisibleEntries);
            }
          }
        }
        entry.reusableVisualKey = reusableKey; entry.staticModelAttempted = staticBatchingAllowed; entry.staticModelFamily = visualFamily(object) ?? entry.staticModelFamily;
        const instance = !terrainCompiled && surfaceMemberships === undefined && staticBatchingAllowed ? this.addInstanceVisual(object, block, entry.key, reusableKey, 'provider-async') : undefined;
        this.blocksGroup.remove(fallback);
        if (terrainCompiled) { entry.terrainChunkKey = chunkKey(block.position); entry.reusableVisualKey = reusableKey; disposeObject(object); }
        else if (surfaceMemberships !== undefined) { entry.surfaceFaceMemberships = surfaceMemberships; entry.surfaceExposedFaceCount = surfaceMemberships.length; entry.surfaceNeighborFacesCulled = 6 - surfaceMemberships.length; entry.object = surfaceMemberships.length ? this.surfaceFaceBatches.get(surfaceMemberships[0].batchKey)?.mesh : undefined; disposeObject(object); }
        else if (instance) { entry.instanceBatchKey = instance.batchKey; entry.instanceIndex = instance.index; entry.object = this.instanceBatches.get(instance.batchKey)!.parts[0]; entry.staticModelDecision = this.instanceRenderer.decisionFor(entry.key); disposeObject(object); }
        else { entry.staticModelDecision = this.instanceRenderer.decisionFor(entry.key); this.blocksGroup.add(object); entry.object = object; }
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

  private addTerrainVisual(block: ProjectDocument['blocks'][number], key: string, templates: readonly SurfaceFaceTemplate[]): boolean {
    return this.terrainRenderer.upsertAndCommit({ key, block, templates });
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

  private addInstanceVisual(object: THREE.Object3D, block: ProjectDocument['blocks'][number], key: string, reusableKey?: string, source: 'provider-async' | 'cached-template' = 'provider-async'): { readonly batchKey: string; readonly index: number } | undefined {
    return this.instanceRenderer.tryAdd(object, block, key, reusableKey, source);
  }

  private addInstanceVisualFromTemplates(templates: readonly InstancePartTemplate[], block: ProjectDocument['blocks'][number], key: string, source: 'provider-async' | 'cached-template' = 'provider-async', compiled?: CompiledInstanceTemplates): { readonly batchKey: string; readonly index: number } | undefined {
    return this.instanceRenderer.addFromTemplates(templates, block, key, source, compiled);
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


  private clearPersistentVisuals(): void { for (const [key, entry] of this.renderedBlocks) this.removeBlockEntry(key, entry); this.fluidCoordinator.clear(); this.releaseUnusedRetiredProviders(); for (const [key, entry] of this.renderedDecorations) this.removeDecorationEntry(key, entry); this.clearPlaceholderVisuals(); this.clearReusableInstanceTemplates(); this.instanceRenderer.resetMetrics(); this.clearSurfaceFaceResources(); this.instanceOwnershipIndex.clear(); this.pendingHydrationSignatures.clear(); this.placeholderSignatures.clear(); this.pendingDecorationSignatures.clear(); this.structureSyncKey = ''; this.decorationSyncKey = ''; this.syncedProject = undefined; this.syncedBlockCount = undefined; this.syncedBlocksReference = undefined; this.syncedDecorationProject = undefined; this.spatialIndex = undefined; this.spatialIndexProject = undefined; this.spatialIndexBlocksReference = undefined; this.cachedVisibleEntries = []; this.cachedVisibleMap.clear(); this.cachedVisibleIndices.clear(); this.cachedVisibleProject = undefined; this.cachedVisibleKey = ''; this.structuralSpecialVisualIds.clear(); this.ghostPlan = undefined; this.lastHoverVisualKey = ''; this.decorationGhostKey = ''; this.lastActiveGroupProject = undefined; this.lastActiveGroupId = undefined; this.lastActiveGroupPositions = undefined; this.lastIsolatedGroupId = undefined; this.lastIsolatedGroupPositions = undefined; }

  private reconcileDecorations(project: ProjectDocument | undefined, options: ViewportRenderOptions, full: boolean): void {
    if (!project) {
      for (const [id, entry] of this.renderedDecorations) this.removeDecorationEntry(id, entry);
      this.cancelDecorationHydration();
      this.setHydrationDecorationScope([]);
      return;
    }
    const visible = (project.decorations ?? []).filter((decoration) => isDecorationVisible(decoration, project.groups) && (!options.isolatedGroupId || decorationHasGroup(decoration, options.isolatedGroupId)) && (options.layerY === undefined || decoration.anchor.y === options.layerY || options.visibility === 'whole-structure' || options.visibility === 'all-below' && decoration.anchor.y <= (options.layerY ?? decoration.anchor.y)));
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
    for (const child of [...this.decorationSelectionGroup.children]) { disposeObject(child); this.decorationSelectionGroup.remove(child); }
    if (!selectedId) return;
    const entry = this.renderedDecorations.get(selectedId); if (!entry) return;
    const bounds = new THREE.Box3().setFromObject(entry.object);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.04, bounds.max.x - bounds.min.x + .05), Math.max(.04, bounds.max.y - bounds.min.y + .05), Math.max(.04, bounds.max.z - bounds.min.z + .05))), new THREE.LineBasicMaterial({ color: this.palette.selection, depthTest: false, depthWrite: false }));
    outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.userData['decorationInstanceId'] = selectedId; outline.renderOrder = 2001; this.decorationSelectionGroup.add(outline);
  }

  hit(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    return this.performHit(event.clientX, event.clientY, project, active, planeY, showGhost);
  }

  /** Coalesces hover work to one raycast per animation frame. Commit paths use hit() synchronously. */
  hover(event: PointerEvent, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY: number | undefined, showGhost: boolean, listener: ViewportHoverListener): void {
    if (this.cameraGestureInProgress) { this.instrumentation.record('hoverRaycastsSuppressedDuringCamera'); return; }
    if (this.pendingHover) this.instrumentation.record('hoverPointerMovesCoalesced');
    this.pendingHover = { clientX: event.clientX, clientY: event.clientY, project, active, planeY, showGhost, listener };
    if (this.hoverFrame !== undefined || this.hoverTimer !== undefined) return;
    const run = () => {
      this.hoverFrame = undefined; this.hoverTimer = undefined;
      const request = this.pendingHover; this.pendingHover = undefined;
      if (!request || this.cameraGestureInProgress) { if (request && this.cameraGestureInProgress) this.instrumentation.record('hoverRaycastsSuppressedDuringCamera'); return; }
      this.instrumentation.record('hoverRaycasts');
      request.listener(this.performHit(request.clientX, request.clientY, request.project, request.active, request.planeY, request.showGhost));
    };
    if (typeof requestAnimationFrame === 'function') this.hoverFrame = requestAnimationFrame(run);
    else this.hoverTimer = setTimeout(run, 0);
  }

  private cancelPendingHover(countAsSuppressed: boolean): void {
    if (this.hoverFrame !== undefined && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(this.hoverFrame); this.hoverFrame = undefined; }
    if (this.hoverTimer !== undefined) { clearTimeout(this.hoverTimer); this.hoverTimer = undefined; }
    if (countAsSuppressed && this.pendingHover) this.instrumentation.record('hoverRaycastsSuppressedDuringCamera');
    this.pendingHover = undefined;
  }

  private ddaPick(project: ProjectDocument): { readonly position: VoxelCoordinate; readonly normal: FaceNormal; readonly point: THREE.Vector3; readonly distance: number } | undefined {
    if (!this.spatialIndex) return undefined;
    this.instrumentation.record('ddaPickCount');
    const result = ddaVoxelCandidates(
      { origin: this.raycaster.ray.origin, direction: this.raycaster.ray.direction },
      project.size,
      (position) => {
        const key = coordinateKey(position);
        const entry = this.cachedVisibleMap.get(key);
        if (!entry || this.culledBlockKeys.has(key)) return 'skip';
        if (entry.role === 'normal' && entry.occlusionClass === 'opaque-full-cube') return 'hit';
        return 'fallback';
      },
    );
    if (!result) return undefined;
    this.instrumentation.record('ddaVisitedVoxels', result.visitedVoxels);
    if (result.candidates.length) {
      this.instrumentation.record('precisePickFallbacks');
      const precise = this.preciseCandidatePick(result.candidates);
      if (precise) return precise;
    }
    if (!result.fullCubeHit) return undefined;
    this.instrumentation.record('ddaFullCubeHits');
    return { position: result.fullCubeHit.position, normal: result.fullCubeHit.normal, point: new THREE.Vector3(result.fullCubeHit.point.x, result.fullCubeHit.point.y, result.fullCubeHit.point.z), distance: result.fullCubeHit.distance };
  }

  private preciseCandidatePick(candidates: readonly VoxelRaycastCandidate[]): { readonly position: VoxelCoordinate; readonly normal: FaceNormal; readonly point: THREE.Vector3; readonly distance: number } | undefined {
    for (const candidate of candidates) {
      const key = coordinateKey(candidate.position);
      const entry = this.renderedBlocks.get(key);
      const objects: THREE.Object3D[] = [];
      const add = (object: THREE.Object3D | undefined) => { if (object && !objects.some((existing) => existing.uuid === object.uuid)) objects.push(object); };
      // A committed block can be represented only by a pending placeholder.
      // Keep candidate geometry scoped to this voxel, without requiring a
      // final renderedBlocks entry before considering that representation.
      if (entry) {
        add(entry.fallback);
        add(entry.object);
        if (entry.fluidChunkKey !== undefined) for (const object of this.fluidCoordinator.objectsForVoxel(key)) add(object);
        for (const membership of entry.surfaceFaceMemberships ?? this.surfaceFaceOwnership.get(key) ?? []) add(this.surfaceFaceBatches.get(membership.batchKey)?.mesh);
        if (entry.instanceBatchKey) for (const part of this.instanceBatches.get(entry.instanceBatchKey)?.parts ?? []) add(part);
      } else {
        for (const membership of this.surfaceFaceOwnership.get(key) ?? []) add(this.surfaceFaceBatches.get(membership.batchKey)?.mesh);
      }
      const placeholder = this.placeholderIndices.get(key);
      if (placeholder) add(this.placeholderBatches.get(placeholder.batchKey)?.mesh);
      if (!objects.length) continue;
      const intersection = this.raycaster.intersectObjects(objects, true).find((hit) => {
        if (hit.object.userData['fluidChunk'] === true) { const fluidHit = this.fluidCoordinateFromHit(hit); return !!fluidHit && coordinateKey(fluidHit) === key; }
        const hitPosition = blockCoordinateFromHit(hit);
        return !hitPosition || coordinateKey(hitPosition) === key;
      });
      if (!intersection) continue;
      const normalVector = intersection.face?.normal.clone().transformDirection(intersection.object.matrixWorld).normalize() ?? new THREE.Vector3(candidate.normal.x, candidate.normal.y, candidate.normal.z);
      return { position: candidate.position, normal: { x: normalVector.x, y: normalVector.y, z: normalVector.z }, point: intersection.point, distance: intersection.distance };
    }
    return undefined;
  }

  private performHit(clientX: number, clientY: number, project: ProjectDocument | undefined, active: ActiveBlock | undefined, planeY?: number, showGhost = true): ViewportHit {
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!this.renderer || !this.container || !project) return {};
    this.flushInstanceBatchBounds();
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const decorationHit = this.raycaster.intersectObjects(this.decorationsGroup.children, true)[0];
    const ddaHit = planeY === undefined ? this.ddaPick(project) : undefined;
    const blockHit = planeY === undefined ? undefined : this.raycaster.intersectObjects(this.blocksGroup.children, true)[0];
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
      block = blockCoordinateFromHit(blockHit) ?? this.fluidCoordinateFromHit(blockHit);
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
      const hitVoxel = blockCoordinateFromHit(blockHit) ?? this.fluidCoordinateFromHit(blockHit);
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

  private fluidCoordinateFromHit(hit: THREE.Intersection): VoxelCoordinate | undefined {
    if (hit.object.userData['fluidChunk'] !== true) return undefined;
    const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).normalize() ?? new THREE.Vector3();
    const point = hit.point.clone().sub(normal.multiplyScalar(.002));
    const candidate = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
    return this.fluidCoordinator.hasVoxel(coordinateKey(candidate)) ? candidate : undefined;
  }

  /** Projects a pointer ray onto the face plane captured at the beginning of a 3D selection drag. */
  projectPointerToPlane(event: PointerEvent, plane: FaceLockedSelectionPlane): { readonly x: number; readonly y: number; readonly z: number } | undefined {
    if (!this.renderer || !this.container) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const component = direction[plane.axis];
    if (Math.abs(component) < 1e-8) return undefined;
    const distance = (plane.coordinate - origin[plane.axis]) / component;
    if (distance < 0) return undefined;
    const point = this.raycaster.ray.at(distance, new THREE.Vector3());
    return { x: point.x, y: point.y, z: point.z };
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
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const component = direction[axis];
    if (Math.abs(component) < 1e-8) return undefined;
    const distance = (coordinate - origin[axis]) / component;
    if (distance < 0) return undefined;
    const point = this.raycaster.ray.at(distance, new THREE.Vector3());
    return { x: point.x, y: point.y, z: point.z };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.decorationTextureCache?.dispose(); this.decorationTextureCache = undefined;
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.renderOnControlChange);
    this.controls?.removeEventListener('start', this.onControlStart);
    this.controls?.removeEventListener('end', this.onControlEnd);
    this.controls?.dispose();
    this.renderer?.domElement.removeEventListener('pointerdown', this.onCanvasPointerDownCapture, true);
    this.renderer?.domElement.removeEventListener('pointerup', this.onCanvasPointerUpCapture, true);
    this.renderer?.domElement.removeEventListener('pointercancel', this.onCanvasPointerUpCapture, true);
    this.renderer?.domElement.removeEventListener('wheel', this.onCanvasWheelCapture, true);
    if (typeof document !== 'undefined') { document.removeEventListener('focusin', this.onWindowBlur); document.removeEventListener('visibilitychange', this.onVisibilityChange); }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onWindowBlur);
    this.clearInput();
    this.cancelPendingHover(false);
    this.cancelHydration('dispose');
    const provider = this.visualProvider;
    this.cameraRenderPending = false;
    this.cameraInteraction.clear();
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
    for (const child of [...this.logicalSelectionGroup.children]) this.logicalSelectionGroup.remove(child);
    for (const child of [...this.decorationGhostGroup.children]) disposeObject(child); this.decorationGhostGroup.clear();
    for (const child of [...this.decorationSelectionGroup.children]) disposeObject(child); this.decorationSelectionGroup.clear();
    this.renderedBlocks.clear(); this.renderedDecorations.clear();
    this.clearStructureBlockGuide();
    this.structureBlockGuideGroup.clear();
    this.ghost.geometry.dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.ground?.geometry.dispose();
    (this.ground?.material as THREE.Material | undefined)?.dispose();
    this.editingPlane?.geometry.dispose();
    (this.editingPlane?.material as THREE.Material | undefined)?.dispose();
    this.projectGrid?.geometry.dispose();
    (this.projectGrid?.material as THREE.Material | undefined)?.dispose();
    this.editingGrid?.geometry.dispose();
    (this.editingGrid?.material as THREE.Material | undefined)?.dispose();
    this.boundsBox?.geometry.dispose();
    (this.boundsBox?.material as THREE.Material | undefined)?.dispose();
    this.selectionOutline.geometry.dispose();
    (this.selectionOutline.material as THREE.Material).dispose();
    this.logicalSelectionGeometry.dispose();
    this.logicalSelectionMaterial.dispose();
    this.groupHighlightGeometry.dispose();
    this.groupHighlightMaterial.dispose();
    this.selectionBox.geometry.dispose();
    (this.selectionBox.material as THREE.Material).dispose();
    if (this.ghostModel) disposeObject(this.ghostModel);
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

  private instanceOwnershipViolations(): readonly string[] {
    const violations: string[] = [];
    const memberships = new Map<string, { batchKey: string; index: number }[]>();
    for (const [batchKey, batch] of this.instanceBatches) {
      if (batch.keys.length !== batch.positions.length) violations.push(`${batchKey}: keys/positions length mismatch`);
      for (const [index, key] of batch.keys.entries()) {
        const list = memberships.get(key) ?? [];
        list.push({ batchKey, index });
        memberships.set(key, list);
        const position = batch.positions[index];
        if (this.runtimeDiagnosticsEnabled && (!position || coordinateKey(position) !== key)) violations.push(`${batchKey}: position mismatch at ${index} (${key})`);
        const entry = this.renderedBlocks.get(key);
        if (!entry || entry.instanceBatchKey !== batchKey || entry.instanceIndex !== index) violations.push(`${batchKey}: ownership mismatch at ${index} (${key})`);
      }
      for (const [partIndex, part] of batch.parts.entries()) {
        const keys = part.userData['instanceKeys'] as unknown;
        const voxels = part.userData['instanceVoxels'] as unknown;
        if (!Array.isArray(keys) || keys.length !== batch.keys.length) violations.push(`${batchKey}: part ${partIndex} keys length mismatch`);
        if (!Array.isArray(voxels) || voxels.length !== batch.keys.length) violations.push(`${batchKey}: part ${partIndex} voxels length mismatch`);
        if (part.count !== batch.keys.length) violations.push(`${batchKey}: part ${partIndex} count mismatch`);
        if (this.runtimeDiagnosticsEnabled && Array.isArray(keys)) for (let index = 0; index < batch.keys.length; index += 1) if (keys[index] !== batch.keys[index]) violations.push(`${batchKey}: part ${partIndex} key mismatch at ${index}`);
        if (this.runtimeDiagnosticsEnabled && Array.isArray(voxels)) for (let index = 0; index < batch.positions.length; index += 1) {
          const voxel = voxels[index] as VoxelCoordinate | undefined;
          if (!voxel || coordinateKey(voxel) !== coordinateKey(batch.positions[index])) violations.push(`${batchKey}: part ${partIndex} voxel mismatch at ${index}`);
        }
      }
    }
    for (const [key, list] of memberships) {
      if (list.length !== 1) violations.push(`${key}: physical membership count ${list.length}`);
      const indexed = this.instanceOwnershipIndex.get(key);
      if (!indexed || indexed.batchKey !== list[0].batchKey || indexed.index !== list[0].index) violations.push(`${key}: ownership index does not match physical membership`);
    }
    for (const [key, indexed] of this.instanceOwnershipIndex) {
      const list = memberships.get(key) ?? [];
      if (list.length !== 1 || list[0].batchKey !== indexed.batchKey || list[0].index !== indexed.index) violations.push(`${key}: indexed membership is stale`);
    }
    for (const [key, entry] of this.renderedBlocks) {
      if (!entry.instanceBatchKey) continue;
      const list = memberships.get(key) ?? [];
      if (list.length !== 1 || list[0].batchKey !== entry.instanceBatchKey || list[0].index !== entry.instanceIndex) violations.push(`${key}: rendered entry does not resolve to exactly one physical membership`);
    }
    return [...new Set(violations)];
  }

  private traceInstanceOwnership(phase: ViewportInstanceOwnershipEvent['phase'], key?: string, source?: ViewportInstanceOwnershipEvent['source'], entry?: RenderedBlockEntry): void {
    if (!this.runtimeDiagnosticsEnabled) return;
    const physicalMemberships = key ? this.instanceMemberships(key) : [];
    const previousEntry = entry && (entry.instanceBatchKey !== undefined || entry.instanceIndex !== undefined) ? { ...(entry.instanceBatchKey !== undefined ? { batchKey: entry.instanceBatchKey } : {}), ...(entry.instanceIndex !== undefined ? { index: entry.instanceIndex } : {}) } : undefined;
    const violations = key ? this.instanceOwnershipViolationsForKey(key) : this.instanceOwnershipViolations();
    this.instanceOwnershipTrace.push({ phase, ...(key ? { key } : {}), ...(source ? { source } : {}), generation: this.hydrationGeneration, ...(previousEntry ? { previousEntry } : {}), physicalMemberships, violations });
    if (this.instanceOwnershipTrace.length > 256) this.instanceOwnershipTrace.shift();
  }

  private instanceOwnershipViolationsForKey(key: string): readonly string[] {
    const violations: string[] = [];
    const indexed = this.instanceOwnershipIndex.get(key);
    const entry = this.renderedBlocks.get(key);
    if (!indexed) {
      if (entry?.instanceBatchKey !== undefined || entry?.instanceIndex !== undefined) violations.push(`${key}: rendered entry has no indexed physical membership`);
      return violations;
    }
    const batch = this.instanceBatches.get(indexed.batchKey);
    if (!batch || batch.keys[indexed.index] !== key) violations.push(`${key}: index does not point to requested physical member`);
    if (!entry || entry.instanceBatchKey !== indexed.batchKey || entry.instanceIndex !== indexed.index) violations.push(`${key}: rendered entry does not match indexed physical membership`);
    return violations;
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

    const batchInvariantViolations: string[] = [...this.instanceOwnershipViolations()];
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
      while (root.parent && root.parent !== this.scene) root = root.parent;
      return root;
    };
    const sceneOwner = (object: THREE.Object3D): string => {
      const root = sceneRoot(object);
      const known: readonly [THREE.Object3D | undefined, string][] = [
        [this.blocksGroup, 'blocksGroup'], [this.decorationsGroup, 'decorationsGroup'], [this.ghost, 'ghost'],
        [this.ghostModel, 'ghostModel'], [this.movePreviewGroup, 'movePreviewGroup'], [this.decorationGhostGroup, 'decorationGhostGroup'],
        [this.decorationSelectionGroup, 'decorationSelectionGroup'], [this.logicalSelectionGroup, 'logicalSelectionGroup'], [this.structureBlockGuideGroup, 'structureBlockGuide'],
        [this.projectGrid, 'projectGrid'], [this.ground, 'ground'], [this.editingPlane, 'editingPlane'], [this.boundsBox, 'boundsBox'],
        [this.selectionOutline, 'selectionOutline'], [this.selectionBox, 'selectionBox'],
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
      if (!ownedByBlocksGroup) {
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
    const diagnostics = this.rendererOwnershipDiagnostics();
    const activeBlock = this.activeBlock ? { id: this.activeBlock.id, state: { ...this.activeBlock.state } } : undefined;
    return {
      capturedAt: new Date().toISOString(),
      authoritativeProjectBlockCount: diagnostics.authoritativeProjectBlockCount,
      ...(activeBlock ? { activeBlock } : {}),
      ownership: {
        authoritativeVisibleBlockCount: diagnostics.authoritativeVisibleBlockCount,
        renderedBlockCount: diagnostics.renderedBlockCount,
        placeholderVisualCount: diagnostics.placeholderVisualCount,
        placeholderBatchCount: diagnostics.placeholderBatchCount,
        placeholderIndexCount: diagnostics.placeholderIndexCount,
        instanceBatchCount: diagnostics.instanceBatchCount,
        instanceMemberCount: diagnostics.instanceMemberCount,
        blocksGroupChildCount: diagnostics.blocksGroupChildCount,
        visibleMeshCount: diagnostics.visibleMeshCount,
        visibleMeshesOutsideBlocksGroup: diagnostics.visibleMeshesOutsideBlocksGroup,
        hydrationState: { ...diagnostics.hydrationState },
      },
      visibleMeshes: [...diagnostics.visibleMeshSample],
      suspiciousVisualCount: diagnostics.suspiciousVisualCount,
      suspiciousVisuals: [...diagnostics.suspiciousVisuals],
      directSceneChildren: diagnostics.directSceneChildren.map((child) => ({ ...child })),
      instanceOwnershipTrace: this.instanceOwnershipTrace.map((event) => ({ ...event, physicalMemberships: event.physicalMemberships.map((membership) => ({ ...membership })), violations: [...event.violations], ...(event.previousEntry ? { previousEntry: { ...event.previousEntry } } : {}) })),
      previewState: { ...diagnostics.previewState },
    };
  }

  rendererCounters(): RendererCounters {
    return this.instrumentation.snapshot();
  }

  performanceEvidence(): ViewportPerformanceEvidence {
    const counters = this.instrumentation.snapshot();
    const terrain = this.terrainRenderer.evidence();
    const renderCost = collectSceneRenderCost({ scene: this.scene, blocksGroup: this.blocksGroup, decorationsGroup: this.decorationsGroup, instanceBatches: this.instanceBatches.values(), surfaceBatches: this.surfaceFaceBatches.values(), placeholderBatches: this.placeholderBatches.values(), renderedBlocks: this.renderedBlocks.values(), renderedDecorations: this.renderedDecorations.values() });
    const staticModelMetrics = this.instanceRenderer.metrics();
    return {
      renderCalls: this.lastRendererMetrics.calls,
      triangles: this.lastRendererMetrics.triangles,
      geometries: this.lastRendererMetrics.geometries,
      textures: this.lastRendererMetrics.textures,
      renderedBlocks: this.renderedBlocks.size,
      renderedDecorations: this.renderedDecorations.size,
      object3dCount: renderCost.object3dCount,
      meshCount: renderCost.meshCount,
      visibleMeshCount: renderCost.visibleMeshCount,
      instanceMeshCount: counters.instancedMeshCount,
      instanceMembers: counters.instancedMembers,
      renderRegionSize: this.renderRegionPolicy.size,
      renderRegionCount: renderCost.regions,
      regionalInstanceBatchCount: renderCost.instance.batchCount,
      regionalInstanceMeshCount: renderCost.instance.meshCount,
      regionalSurfaceBatchCount: renderCost.surface.batchCount,
      instanceMaterialCount: renderCost.instance.materials,
      instanceGeometryCount: renderCost.instance.geometries,
      staticModelCandidates: staticModelMetrics.candidates,
      staticModelBatchable: staticModelMetrics.batchable,
      staticModelBatchedMembers: staticModelMetrics.batchedMembers,
      staticModelTemplateCacheHits: staticModelMetrics.templateCacheHits,
      staticModelTemplateCacheMisses: staticModelMetrics.templateCacheMisses,
      providerObjectsAvoidedByStaticCache: staticModelMetrics.providerObjectsAvoidedByStaticCache,
      staticModelRejected: staticModelMetrics.rejected,
      staticModelBatchCount: this.instanceBatches.size,
      staticModelInstanceMeshCount: renderCost.instance.meshCount,
      fluidLogicalVoxels: this.fluidCoordinator.diagnostics().fluidLogicalVoxels,
      fluidChunks: this.fluidCoordinator.diagnostics().fluidChunks,
      fluidChunkMeshes: this.fluidCoordinator.diagnostics().fluidChunkMeshes,
      fluidStandaloneMeshes: this.fluidCoordinator.diagnostics().fluidStandaloneMeshes,
      fluidFacesPotential: this.fluidCoordinator.diagnostics().fluidFacesPotential,
      fluidFacesCulled: this.fluidCoordinator.diagnostics().fluidFacesCulled,
      fluidFacesEmitted: this.fluidCoordinator.diagnostics().fluidFacesEmitted,
      fluidMaterialBuckets: this.fluidCoordinator.diagnostics().fluidMaterialBuckets,
      standaloneBlockObjects: renderCost.standaloneBlockObjects,
      standaloneBlockMeshes: renderCost.standaloneBlockMeshes,
      standaloneTransparentMeshes: renderCost.standaloneTransparentMeshes,
      standaloneOpaqueMeshes: renderCost.standaloneOpaqueMeshes,
      placeholderBatches: renderCost.placeholders.batchCount,
      placeholderMeshes: renderCost.placeholders.meshCount,
      decorationObjects: renderCost.decorationObjects,
      decorationMeshes: renderCost.decorationMeshes,
      transparentMeshCount: renderCost.transparentMeshCount,
      opaqueMeshCount: renderCost.opaqueMeshCount,
      providerObjectCreations: counters.providerObjectCreations,
      reusableTemplateCreations: counters.reusableTemplateCreations,
      reusableTemplateCacheHits: counters.reusableTemplateCacheHits,
      rawInstanceTemplateParts: counters.rawInstanceTemplateParts,
      mergedInstanceTemplateParts: counters.mergedInstanceTemplateParts,
      templateMergeOperations: counters.templateMergeOperations,
      templatePartsEliminated: counters.templatePartsEliminated,
      instancedBoundsComputations: counters.instancedBoundsComputations,
      fallbackMeshCreations: counters.fallbackMeshCreations,
      cachedTemplateInsertions: counters.cachedTemplateInsertions,
      cameraMovementFrames: counters.cameraMovementFrames,
      cameraMovementRenderCalls: counters.cameraMovementRenderCalls,
      cameraChangeEventsDuringMovement: counters.cameraChangeEventsDuringMovement,
      cameraRenderRequestsSuppressed: counters.cameraRenderRequestsSuppressed,
      controlChangeEvents: counters.controlChangeEvents,
      cameraRenderRequests: counters.cameraRenderRequests,
      cameraRendersExecuted: counters.cameraRendersExecuted,
      cameraRenderRequestsCoalesced: counters.cameraRenderRequestsCoalesced,
      interactiveResolutionEntries: counters.interactiveResolutionEntries,
      staticResolutionRestores: counters.staticResolutionRestores,
      regularHydrationStarted: counters.regularHydrationStarted,
      regularHydrationCompleted: counters.regularHydrationCompleted,
      providerRefreshStarted: counters.providerRefreshStarted,
      providerRefreshCompleted: counters.providerRefreshCompleted,
      hydrationFairnessDeferrals: counters.hydrationFairnessDeferrals,
      maxProviderRefreshRunningWhileRegularPending: counters.maxProviderRefreshRunningWhileRegularPending,
      hydrationPausesForCamera: counters.hydrationPausesForCamera,
      hydrationJobsStartedWhileCamera: counters.hydrationJobsStartedWhileCamera,
      hydrationProgressRegressions: counters.hydrationProgressRegressions,
      cameraOnlyGenerationChanges: counters.cameraOnlyGenerationChanges,
      blockSignatureComputations: counters.blockSignatureComputations,
      hoverRaycasts: counters.hoverRaycasts,
      hoverRaycastsSuppressedDuringCamera: counters.hoverRaycastsSuppressedDuringCamera,
      hoverPointerMovesCoalesced: counters.hoverPointerMovesCoalesced,
      hydrationQueue: this.queuedBlockHydrationJobs() + this.queuedDecorationHydrationJobs(),
      interiorBlocksCulled: this.culledBlockKeys.size,
      hydrationRunning: this.hydrationRunning,
      frameDurationMs: this.frameDurationMs,
      renderCpuMs: this.renderCpuMs,
      drawCalls: this.lastRendererMetrics.calls,
      lines: this.lastRendererMetrics.lines,
      points: this.lastRendererMetrics.points,
      instanceBatches: this.instanceBatches.size,
      instancedMeshCount: renderCost.instance.meshCount,
      nonInstancedMeshCount: Math.max(0, renderCost.meshCount - renderCost.instance.meshCount),
      renderableBlocks: this.renderedBlocks.size,
      surfaceFastPathBlocks: counters.surfaceFastPathBlocks,
      exposedFaceInstances: counters.exposedFaceInstances,
      neighborFacesCulled: counters.neighborFacesCulled,
      surfaceFaceBatches: this.surfaceFaceBatches.size,
      surfaceFaceInstancedMeshes: this.surfaceFaceBatches.size,
      hoverPickMs: counters.hoverPickMs,
      hoverPickCount: counters.hoverPickCount,
      hoverPickMaxMs: counters.hoverPickMaxMs,
      ddaPickCount: counters.ddaPickCount,
      ddaVisitedVoxels: counters.ddaVisitedVoxels,
      ddaFullCubeHits: counters.ddaFullCubeHits,
      precisePickFallbacks: counters.precisePickFallbacks,
      placementPreviewMs: counters.placementPreviewMs,
      placementPreviewCount: counters.placementPreviewCount,
      placementPreviewMaxMs: counters.placementPreviewMaxMs,
      placementPreviewFullProjectScans: counters.placementPreviewFullProjectScans,
      duplicatePlacementValidations: counters.duplicatePlacementValidations,
      spatialIndexBuilds: counters.spatialIndexBuilds,
      spatialIndexLookups: Math.max(counters.spatialIndexLookups, this.spatialIndex?.lookups ?? 0),
      ghostVisualRebuilds: counters.ghostVisualRebuilds,
      ghostVisualReuses: counters.ghostVisualReuses,
      structuralReconciles: counters.structuralReconciles,
      overlayOnlyUpdates: counters.overlayOnlyUpdates,
      projectBoundsRebuilds: counters.projectBoundsRebuilds,
      fullProjectScansDuringHover: counters.fullProjectScansDuringHover,
      renderInvalidations: counters.renderInvalidations,
      renderInvalidationsCoalesced: counters.renderInvalidationsCoalesced,
      actualSceneRenders: counters.actualSceneRenders,
      terrainChunks: terrain.terrainChunks,
      terrainChunkMeshes: terrain.terrainChunkMeshes,
      terrainDrawObjectCount: terrain.terrainChunkMeshes,
      terrainTriangleCount: renderCost.terrainTriangleCount,
      terrainChunkRebuilds: terrain.terrainChunkRebuilds,
      terrainBlocksCompiled: terrain.terrainBlocksCompiled,
      terrainFacesEmitted: terrain.terrainFacesEmitted,
      terrainFacesCulled: terrain.terrainFacesCulled,
      terrainTemplateResolutions: terrain.terrainTemplateResolutions,
      terrainTemplateCacheHits: terrain.terrainTemplateCacheHits,
      terrainLogicalBlocks: terrain.terrainLogicalBlocks,
      terrainBulkBatches: terrain.terrainBulkBatches,
      terrainAsyncAcceptedResults: counters.terrainAsyncAcceptedResults,
      terrainAsyncStaleRevisionResults: counters.terrainAsyncStaleRevisionResults,
      terrainAsyncStaleGenerationResults: counters.terrainAsyncStaleGenerationResults,
      terrainAsyncStaleProviderResults: counters.terrainAsyncStaleProviderResults,
      terrainAsyncSupersededResults: counters.terrainAsyncSupersededResults,
      terrainAsyncRescheduledChunks: counters.terrainAsyncRescheduledChunks,
      terrainAsyncCommitPolicyRejected: counters.terrainAsyncCommitPolicyRejected,
      terrainAsyncAllUnrepresentedResults: counters.terrainAsyncAllUnrepresentedResults,
      terrainAsyncPartialFailureResults: counters.terrainAsyncPartialFailureResults,
      terrainAsyncWorkerFailures: counters.terrainAsyncWorkerFailures,
      terrainAsyncFallbackKeys: counters.terrainAsyncFallbackKeys,
      terrainAsyncRejectedWithoutReplacement: counters.terrainAsyncRejectedWithoutReplacement,
      terrainAtlasMode: this.terrainAtlasMode,
      terrainAtlasPages: terrain.terrainAtlas.terrainAtlasPages,
      terrainAtlasSprites: terrain.terrainAtlas.terrainAtlasSprites,
      terrainAtlasInsertions: terrain.terrainAtlas.terrainAtlasInsertions,
      terrainAtlasCacheHits: terrain.terrainAtlas.terrainAtlasCacheHits,
      terrainAtlasCompatibleFaces: terrain.terrainAtlas.terrainAtlasCompatibleFaces,
      terrainAtlasFallbackFaces: terrain.terrainAtlas.terrainAtlasFallbackFaces,
      terrainAtlasMaterials: terrain.terrainAtlas.terrainAtlasMaterials,
      terrainAtlasChunkBuckets: terrain.terrainAtlas.terrainAtlasChunkBuckets,
      terrainWorker: { ...terrain.terrainWorker, terrainWorkerCpuMs: { ...terrain.terrainWorker.terrainWorkerCpuMs }, terrainWorkerRoundTripMs: { ...terrain.terrainWorker.terrainWorkerRoundTripMs } },
      terrainCommit: { ...terrain.terrainCommit, terrainCommitCpuMs: { ...terrain.terrainCommit.terrainCommitCpuMs } },
    };
  }

  hydrationProgress(): ViewportHydrationProgress { return this.hydrationProgressState; }

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
    };
  }

  onHydrationProgress(listener: (progress: ViewportHydrationProgress) => void): () => void {
    return this.hydrationProgressTracker.onProgress(listener);
  }

  private setEditingPlane(y: number | undefined, project: ProjectDocument | undefined): void {
    if (!project || y === undefined) {
      if (this.editingPlane) this.editingPlane.visible = false;
      if (this.editingGrid) this.editingGrid.visible = false;
      return;
    }
    if (!this.editingPlane) {
      this.editingPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      this.editingPlane.rotation.x = -Math.PI / 2;
      this.scene.add(this.editingPlane);
    }
    this.editingGrid?.geometry.dispose();
    (this.editingGrid?.material as THREE.Material | undefined)?.dispose();
    if (this.editingGrid) this.scene.remove(this.editingGrid);
    this.editingGrid = createBoundedGrid(project.size.x, project.size.z, this.palette.editingGrid);
    this.scene.add(this.editingGrid);
    this.editingPlane.geometry.dispose();
    this.editingPlane.geometry = new THREE.PlaneGeometry(project.size.x, project.size.z);
    this.editingPlane.position.set(project.size.x / 2, y + 0.002, project.size.z / 2);
    this.editingPlane.visible = true;
    this.editingGrid.position.y = y + 0.004;
    this.editingGrid.visible = true;
  }

  clearGhost(): void {
    const changed = this.ghost.visible || !!this.ghostModel?.visible;
    this.ghost.visible = false;
    if (this.ghostModel) this.ghostModel.visible = false;
    this.lastHoverVisualKey = '';
    if (changed) this.scheduleRender();
  }
  private clearDecorationGhost(): void {
    if (!this.decorationGhostGroup.children.length) return;
    for (const child of [...this.decorationGhostGroup.children]) { disposeObject(child); this.decorationGhostGroup.remove(child); }
    this.decorationGhostKey = '';
    this.scheduleRender();
  }
  private updateDecorationGhost(candidate: PlacedDecoration, status: DecorationPlacementPlan['status']): void {
    const key = `${stableValue(candidate)}|${status}`;
    if (key === this.decorationGhostKey) return;
    this.clearDecorationGhost();
    this.decorationGhostKey = key;
    const visual = createDecorationVisual(candidate, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual, false);
    visual.renderOrder = 2000;
    visual.traverse((object) => { object.renderOrder = 2000; if (object instanceof THREE.Mesh) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.transparent = true; material.opacity = .5; material.depthWrite = false; material.depthTest = false; } } });
    const bounds = new THREE.Box3().setFromObject(visual); const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds.max.x - bounds.min.x + .05, bounds.max.y - bounds.min.y + .05, bounds.max.z - bounds.min.z + .05)), new THREE.LineBasicMaterial({ color: status === 'valid' ? this.palette.valid : this.palette.invalid, depthTest: false, depthWrite: false })); outline.position.copy(bounds.getCenter(new THREE.Vector3())); outline.renderOrder = 2001; visual.add(outline); this.decorationGhostGroup.add(visual); this.scheduleRender();
  }
  clearInput(): void { this.cameraInteraction.clear(); if (this.cameraMoveFrame !== undefined) { cancelViewportFrame(this.cameraMoveFrame); this.cameraMoveFrame = undefined; } }
  /** Restores OrbitControls mappings when an editor gesture captured the parent host. */
  endEditorPointerGesture(): void { this.restoreTemporaryMouseButton(); }
  setGhostStatus(status: PlacementStatus): void {
    if (!this.ghost.visible) return;
    if (this.ghost.userData['status'] === status) return;
    const material = this.ghost.material as THREE.MeshBasicMaterial;
    material.color.setHex(colorForStatus(this.palette, status));
    this.ghost.userData['status'] = status;
    this.scheduleRender();
  }

  cameraState(): CameraState | undefined {
    if (!this.controls) return undefined;
    return { position: vectorValue(this.camera.position), target: vectorValue(this.controls.target), up: vectorValue(this.camera.up) };
  }

  restoreCamera(state: CameraState | undefined): void {
    if (!state || !this.controls) return;
    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.camera.up.set(state.up.x, state.up.y, state.up.z);
    this.controls.target.set(state.target.x, state.target.y, state.target.z);
    this.controls.update();
    this.hasCameraFrame = true;
    this.scheduleRender();
  }

  fitStructure(): void {
    const project = this.project;
    if (!project) return;
    const blocks = this.renderOptions.layerY === undefined || !this.renderOptions.visibility
      ? project.blocks
      : blocksForLayers(project.blocks, this.renderOptions.layerY, this.renderOptions.visibility);
    this.frameBounds(structureCameraBounds(blocks) ?? projectCameraBounds(project.size));
  }

  focusSelection(position: VoxelCoordinate | undefined): void {
    if (!position) return;
    this.focusBounds({ min: { x: position.x, y: position.y, z: position.z }, max: { x: position.x + 1, y: position.y + 1, z: position.z + 1 } });
  }

  focusBounds(bounds: CameraBounds | undefined): void {
    if (!bounds || !this.controls) return;
    const target = cameraBoundsCenter(bounds);
    const direction = this.camera.position.clone().sub(this.controls.target);
    const viewDirection = direction.lengthSq() ? direction.normalize() : perspectiveDirection();
    const distance = cameraDistanceForBounds(bounds, this.camera.fov, this.camera.aspect);
    this.setCamera(target, viewDirection, distance);
  }

  resetCamera(): void {
    if (!this.project) return;
    this.hasCameraFrame = true;
    this.frameBounds(projectCameraBounds(this.project.size));
  }

  setCameraPreset(preset: CameraPreset): void {
    if (!this.controls) return;
    const distance = Math.max(4, this.camera.position.distanceTo(this.controls.target));
    const direction = presetDirection(preset);
    this.setCamera(vectorValue(this.controls.target), direction, distance, preset === 'top' ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 });
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
    const positions = selectedPositions ?? [];
    const selectedCount = count ?? positions.length;
    const aggregate = kind === 'all' || selectedCount > DETAILED_SELECTION_OUTLINE_LIMIT ? aggregateBounds : undefined;
    (this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(this.palette.selection);
    this.logicalSelectionMaterial.color.setHex(this.palette.selection);
    (this.selectionBox.material as THREE.LineBasicMaterial).color.setHex(this.palette.selection);
    const unchanged = this.lastSelectionPositions === selectedPositions && this.lastSelectionBounds === aggregate && this.lastSelectionKind === kind && this.lastSelectionCount === selectedCount && sameVoxel(this.lastSelected, selected) && this.lastSelectionBox === box;
    if (unchanged) return;
    this.lastSelectionPositions = selectedPositions;
    this.lastSelectionBounds = aggregate;
    this.lastSelectionKind = kind;
    this.lastSelectionCount = selectedCount;
    this.lastSelected = selected;
    this.lastSelectionBox = box;
    for (const child of [...this.logicalSelectionGroup.children]) this.logicalSelectionGroup.remove(child);
    this.selectionOutline.visible = !!selected && !positions.length && !aggregate;
    if (selected) this.selectionOutline.position.set(selected.x + .5, selected.y + .5, selected.z + .5);
    const visualBox = aggregate ?? box;
    this.selectionBox.visible = !!visualBox;
    if (visualBox) this.selectionBox.box.set(new THREE.Vector3(visualBox.min.x, visualBox.min.y, visualBox.min.z), new THREE.Vector3(visualBox.max.x + 1, visualBox.max.y + 1, visualBox.max.z + 1));
    if (aggregate) return;
    for (const position of positions) { const outline = new THREE.LineSegments(this.logicalSelectionGeometry, this.logicalSelectionMaterial); outline.position.set(position.x + .5, position.y + .5, position.z + .5); outline.renderOrder = 2001; this.logicalSelectionGroup.add(outline); }
  }

  private updateActiveGroup(project: ProjectDocument | undefined, activeGroupId: string | undefined, positions: readonly VoxelCoordinate[] | undefined): void {
    if (project === this.lastActiveGroupProject && activeGroupId === this.lastActiveGroupId && positions === this.lastActiveGroupPositions && this.renderOptions.isolatedGroupId === this.lastIsolatedGroupId && this.renderOptions.isolatedGroupPositions === this.lastIsolatedGroupPositions) return;
    this.lastActiveGroupProject = project;
    this.lastActiveGroupId = activeGroupId;
    this.lastActiveGroupPositions = positions;
    this.lastIsolatedGroupId = this.renderOptions.isolatedGroupId;
    this.lastIsolatedGroupPositions = this.renderOptions.isolatedGroupPositions;
    for (const child of [...this.scene.children]) {
      if (child.userData['groupHighlight']) { child.traverse((object) => { if (object instanceof THREE.LineSegments && !object.userData['sharedGroupHighlight']) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.scene.remove(child); }
    }
    if (!project || !activeGroupId) return;
    const group = project.groups.find((entry) => entry.id === activeGroupId);
    const color = group?.locked ? this.palette.lockedGroup : this.palette.group;
    this.groupHighlightMaterial.color.setHex(color);
    const visiblePositions = positions ?? [];
    const aggregateGroup = visiblePositions.length > DETAILED_SELECTION_OUTLINE_LIMIT;
    if (aggregateGroup) {
      const bounds = boundsOfPositions(visiblePositions);
      if (bounds) {
        const aggregate = new THREE.LineSegments(this.groupHighlightGeometry, this.groupHighlightMaterial);
        aggregate.position.set((bounds.min.x + bounds.max.x + 1) / 2, (bounds.min.y + bounds.max.y + 1) / 2, (bounds.min.z + bounds.max.z + 1) / 2);
        aggregate.scale.set(bounds.max.x - bounds.min.x + 1, bounds.max.y - bounds.min.y + 1, bounds.max.z - bounds.min.z + 1);
        aggregate.userData['groupHighlight'] = true; aggregate.userData['sharedGroupHighlight'] = true; aggregate.renderOrder = 1000; this.scene.add(aggregate);
      }
    }
    const positionKeys = new Set(positions?.map((position) => `${position.x},${position.y},${position.z}`));
    const isolatedKeys = new Set(this.renderOptions.isolatedGroupPositions?.map((position) => `${position.x},${position.y},${position.z}`));
    for (const position of aggregateGroup ? [] : visiblePositions) {
      const key = `${position.x},${position.y},${position.z}`;
      if (!positionKeys.has(key) || !this.cachedVisibleMap.has(key) || (this.renderOptions.isolatedGroupId && !isolatedKeys.has(key))) continue;
      const block = this.spatialIndex?.get(position);
      if (!block || !isBlockVisible(block, project.groups)) continue;
      const outline = new THREE.LineSegments(this.groupHighlightGeometry, this.groupHighlightMaterial);
      outline.position.set(block.position.x + .5, block.position.y + .5, block.position.z + .5);
      outline.userData['groupHighlight'] = true;
      outline.userData['groupLocked'] = !!group?.locked;
      outline.renderOrder = 1000;
      this.scene.add(outline);
    }
    for (const decoration of (project.decorations ?? []).filter((entry) => decorationHasGroup(entry, activeGroupId) && isDecorationVisible(entry, project.groups) && (!this.renderOptions.isolatedGroupId || decorationHasGroup(entry, this.renderOptions.isolatedGroupId)))) {
      const bounds = decorationAabb(decoration);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.04, bounds.max.x - bounds.min.x + .08), Math.max(.04, bounds.max.y - bounds.min.y + .08), Math.max(.04, bounds.max.z - bounds.min.z + .08))), new THREE.LineBasicMaterial({ color }));
      outline.position.set((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2);
      outline.userData['groupHighlight'] = true;
      outline.userData['groupLocked'] = !!group?.locked;
      outline.renderOrder = 1000;
      this.scene.add(outline);
    }
  }

  private updateStructureBlockGuide(project: ProjectDocument | undefined, options: ViewportRenderOptions): void {
    const enabled = this.showStructureBlockGuide;
    const definition = this.definitionResolver?.('minecraft:structure_block');
    const key = project && enabled && this.visualProvider && definition
      ? `${project.id}|${project.size.x},${project.size.y},${project.size.z}|${this.providerGeneration}|${options.structureBlockGuideRevision ?? 0}|${definition.sourceId ?? ''}`
      : `${project?.id ?? 'none'}|${enabled ? 'waiting' : 'hidden'}|${this.providerGeneration}`;
    if (key === this.structureBlockGuideKey) return;
    this.structureBlockGuideKey = key;
    this.clearStructureBlockGuide();
    if (!project || !enabled || !this.visualProvider || !definition) return;

    const generation = this.structureBlockGuideGeneration;
    const provider = this.visualProvider;
    const guidePosition = structureBlockGuidePosition(projectGridBounds(project.size).min);
    const guideBlock: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:structure_block',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: { ...definition.defaultState, mode: 'save' },
    };
    void provider.create(guideBlock).then((visual) => {
      if (generation !== this.structureBlockGuideGeneration || key !== this.structureBlockGuideKey || this.visualProvider !== provider || !visual.object || visual.mode === 'fallback') {
        if (visual.object) disposeObject(visual.object);
        return;
      }
      const guide = new THREE.Group();
      guide.name = 'structureBlockGuide';
      guide.userData['structureBlockGuide'] = true;
      const object = visual.object;
      object.userData['structureBlockGuide'] = true;
      applyStructureGuideBrightnessToObject(object, STRUCTURE_GUIDE_BRIGHTNESS);
      const bounds = new THREE.Box3().setFromObject(object);
      if (!Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.x)) {
        disposeObject(object);
        return;
      }
      guide.add(object);
      guide.position.set(guidePosition.x, guidePosition.y, guidePosition.z);
      this.structureBlockGuideGroup.add(guide);
      this.scheduleRender();
    }).catch(() => { /* Missing or invalid assets leave the helper absent by design. */ });
  }

  private clearStructureBlockGuide(): void {
    this.structureBlockGuideGeneration += 1;
    for (const child of [...this.structureBlockGuideGroup.children]) {
      child.traverse((object) => {
        if (object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        }
      });
      disposeObject(child);
      this.structureBlockGuideGroup.remove(child);
    }
  }

  private updateMovePreview(project: ProjectDocument | undefined, preview: GroupMovePreview | undefined): void {
    for (const child of [...this.movePreviewGroup.children]) { child.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); this.movePreviewGroup.remove(child); }
    if (!project || !preview || !preview.offset.x && !preview.offset.y && !preview.offset.z) return;
    const color = preview.valid ? this.palette.valid : this.palette.invalid;
    const movingKeys = new Set(preview.positions.map((position) => `${position.x},${position.y},${position.z}`));
    for (const position of preview.positions) {
      if (!movingKeys.has(`${position.x},${position.y},${position.z}`)) continue;
      const block = this.spatialIndex?.get(position);
      if (!block) continue;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .42, wireframe: true, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.set(block.position.x + preview.offset.x + .5, block.position.y + preview.offset.y + .5, block.position.z + preview.offset.z + .5);
      mesh.renderOrder = 1002;
      mesh.userData['previewInvalid'] = !preview.valid;
      this.movePreviewGroup.add(mesh);
    }
    const movingDecorationIds = new Set(preview.decorationIds);
    for (const decoration of (project.decorations ?? []).filter((entry) => movingDecorationIds.has(entry.instanceId))) {
      const visual = createDecorationVisual(decoration, this.decorationTextureUrl, this.decorationTextureCache, this.paintingResource, this.decorationItemResources, this.decorationItemVisual, false);
      visual.position.set(preview.offset.x, preview.offset.y, preview.offset.z);
      visual.renderOrder = 1002;
      visual.traverse((object) => {
        object.renderOrder = 1002;
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.transparent = true;
            material.opacity = .42;
            material.depthTest = false;
            material.depthWrite = false;
            if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial) material.color.set(color);
          }
        }
      });
      visual.userData['previewInvalid'] = !preview.valid;
      this.movePreviewGroup.add(visual);
    }
  }

  private updateGhost(target: VoxelCoordinate | undefined, project: ProjectDocument | undefined, active: ActiveBlock | undefined, status: PlacementStatus = 'invalid', plan?: PlacementPlan): void {
    this.ghostTarget = target;
    if (!target || !project || !active) { this.ghost.visible = false; if (this.ghostModel) this.ghostModel.visible = false; return; }
    this.ghost.visible = true;
    this.positionGhostOutline(target);
    const material = this.ghost.material as THREE.MeshBasicMaterial;
    material.color.setHex(colorForStatus(this.palette, status));
    material.depthTest = false;
    material.depthWrite = false;
    material.wireframe = true;
    this.ghost.renderOrder = 1000;
    this.ghost.userData['activeBlock'] = { id: active.id, state: { ...active.state }, status, blocks: plan?.blocks.map((block) => ({ id: block.id, position: block.position, state: block.state })) };
    this.ghost.userData['status'] = status;
    if (this.ghostModel) { this.ghostModel.position.set(target.x, target.y, target.z); this.ghostModel.visible = true; }
  }

  private updateGhostModel(active: ActiveBlock | undefined, plan?: PlacementPlan): void {
    const request = plan?.request.position ?? { x: 0, y: 0, z: 0 };
    const relativeBlocks = plan?.blocks.map((block) => `${block.id}@${block.position.x - request.x},${block.position.y - request.y},${block.position.z - request.z}|${JSON.stringify(block.state)}`).join(';') ?? '';
    const key = active ? `${this.providerGeneration}|${active.id}|${JSON.stringify(active.state)}|${relativeBlocks}` : '';
    if (key === this.ghostModelKey) { if (active) this.instrumentation.record('ghostVisualReuses'); return; }
    if (this.ghostModelKey && active) this.instrumentation.record('ghostVisualRebuilds');
    this.ghostModelKey = key; const generation = ++this.ghostGeneration;
    if (this.ghostModel) { this.scene.remove(this.ghostModel); disposeObject(this.ghostModel); this.ghostModel = undefined; }
    this.setGhostOutlineBounds();
    const provider = this.visualProvider;
    const providerGeneration = this.providerGeneration;
    if (!active || !provider) return;
    const blocks = plan?.blocks.length ? plan.blocks : active ? [{ kind: 'resolved' as const, id: active.id, namespace: active.id.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state: active.state }] : [];
    const worldContext = this.spatialIndex ? { getBlock: (position: VoxelCoordinate) => this.spatialIndex?.get(position) } : undefined;
    void Promise.all(blocks.map(async (block) => ({ block, visual: await provider.create({ ...block, position: { x: 0, y: 0, z: 0 } }, worldContext) }))).then((results) => {
      if (generation !== this.ghostGeneration || providerGeneration !== this.providerGeneration || provider !== this.visualProvider || !results.length) {
        for (const { visual } of results) if (visual.object) disposeObject(visual.object);
        return;
      }
      const root = new THREE.Group();
      for (const { block, visual } of results) {
        if (!visual.object) continue;
        visual.object.position.set(visual.object.position.x + block.position.x - (plan?.request.position.x ?? 0), visual.object.position.y + block.position.y - (plan?.request.position.y ?? 0), visual.object.position.z + block.position.z - (plan?.request.position.z ?? 0));
        root.add(visual.object);
      }
      if (!root.children.length) return;
      this.ghostModel = root; this.ghostModel.visible = false; this.ghostModel.renderOrder = 999;
      this.ghostModel.traverse((child) => { if (child instanceof THREE.Mesh) { const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { material.transparent = true; material.opacity = .52; material.depthWrite = false; } } });
      this.scene.add(this.ghostModel);
      const bounds = new THREE.Box3().setFromObject(this.ghostModel); this.setGhostOutlineBounds(bounds);
      if (this.ghostTarget) { this.ghostModel.position.set(this.ghostTarget.x, this.ghostTarget.y, this.ghostTarget.z); this.ghostModel.visible = this.ghost.visible; this.positionGhostOutline(this.ghostTarget); }
      this.scheduleRender();
    }).catch((error: unknown) => {
      if (generation !== this.ghostGeneration || providerGeneration !== this.providerGeneration || provider !== this.visualProvider) return;
      this.ghost.userData['renderMode'] = 'fallback'; this.ghost.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown ghost visual provider error' }]; this.scheduleRender();
    });
  }

  private setGhostOutlineBounds(bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))): void {
    const size = bounds.getSize(new THREE.Vector3()); bounds.getCenter(this.ghostBoundsCenter);
    this.ghost.geometry.dispose(); this.ghost.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  }

  private positionGhostOutline(target: VoxelCoordinate): void {
    this.ghost.position.set(target.x + this.ghostBoundsCenter.x, target.y + this.ghostBoundsCenter.y, target.z + this.ghostBoundsCenter.z);
  }

  private frameBounds(bounds: ReturnType<typeof projectCameraBounds>): void {
    const target = cameraBoundsCenter(bounds);
    const distance = cameraDistanceForBounds(bounds, this.camera.fov, this.camera.aspect);
    this.setCamera(target, perspectiveDirection(), distance);
  }

  private setCamera(target: CameraVector, direction: THREE.Vector3, distance: number, up: CameraVector = { x: 0, y: 1, z: 0 }): void {
    if (!this.controls) return;
    this.camera.up.set(up.x, up.y, up.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.camera.position.set(target.x, target.y, target.z).addScaledVector(direction, distance);
    this.controls.update();
    this.scheduleRender();
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

  private startCameraMovement(): void {
    if (this.cameraMoveFrame !== undefined) return;
    let previous = performance.now();
    const step = (now: number) => {
      this.cameraMoveFrame = undefined;
      const rawDeltaMs = now - previous;
      const delta = Math.min(rawDeltaMs / 1000, .1);
      previous = now;
      this.moveCamera(this.pressedActions, delta);
      if (this.pressedActions.size) this.cameraMoveFrame = requestViewportFrame(step);
    };
    this.cameraMoveFrame = requestViewportFrame(step);
  }
  private moveCamera(keys: ReadonlySet<MovementAction>, delta: number): void {
    if (!this.controls || !keys.size) return;
    this.markCameraInteraction();
    const cameraDistance = this.camera.position.distanceTo(this.controls.target);
    const horizontalSpeed = effectiveCameraMovementSpeed(this.controlConfiguration.cameraMoveSpeed, cameraDistance);
    const direction = cameraActionMovementDelta(keys, this.camera, horizontalSpeed, this.controlConfiguration.verticalMoveSpeed, delta);
    if (!direction.lengthSq()) return;
    this.camera.position.add(direction);
    this.controls.target.add(direction);
    this.instrumentation.record('cameraMovementFrames');
    this.runtimeTrace?.record('movement-frame', { actions: [...keys], deltaSeconds: delta, configuredHorizontalSpeed: this.controlConfiguration.cameraMoveSpeed, configuredVerticalSpeed: this.controlConfiguration.verticalMoveSpeed, distance: cameraDistance, movementScale: cameraMovementScale(cameraDistance), effectiveHorizontalSpeed: horizontalSpeed });
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

function requestViewportFrame(callback: FrameRequestCallback): number {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(() => callback(performance.now()), 0) as unknown as number;
}

function toTraceVector(value: THREE.Vector3): TraceVector3 { return { x: value.x, y: value.y, z: value.z }; }
function visualFamily(object: THREE.Object3D): string | undefined { let family: unknown; object.traverse((child) => { family ??= child.userData['specialVisualFamily']; }); return typeof family === 'string' ? family : undefined; }
function familyFromReusableKey(key: string | undefined): string | undefined { const prefix = 'special-template-v1|'; return key?.startsWith(prefix) ? key.slice(prefix.length).split('|', 1)[0] : undefined; }

function cancelViewportFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else clearTimeout(frame as unknown as ReturnType<typeof setTimeout>);
}

function vectorValue(vector: THREE.Vector3): CameraVector { return { x: vector.x, y: vector.y, z: vector.z }; }
function perspectiveDirection(): THREE.Vector3 { return new THREE.Vector3(1, .75, 1).normalize(); }
function presetDirection(preset: CameraPreset): THREE.Vector3 {
  switch (preset) {
    case 'top': return new THREE.Vector3(0, 1, 0);
    case 'front': return new THREE.Vector3(0, 0, 1);
    case 'back': return new THREE.Vector3(0, 0, -1);
    case 'left': return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(1, 0, 0);
    case 'perspective': return perspectiveDirection();
  }
}

function createBoundedGrid(sizeX: number, sizeZ: number, color: number): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  for (let x = 0; x <= sizeX; x++) points.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 0, sizeZ));
  for (let z = 0; z <= sizeZ; z++) points.push(new THREE.Vector3(0, 0, z), new THREE.Vector3(sizeX, 0, z));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .72 }));
}

const DETAILED_SELECTION_OUTLINE_LIMIT = 256;
function sameVoxel(left: VoxelCoordinate | undefined, right: VoxelCoordinate | undefined): boolean { return left?.x === right?.x && left?.y === right?.y && left?.z === right?.z; }
function boundsOfPositions(positions: readonly VoxelCoordinate[]): { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined {
  if (!positions.length) return undefined;
  let minX = positions[0].x; let minY = positions[0].y; let minZ = positions[0].z; let maxX = minX; let maxY = minY; let maxZ = minZ;
  for (let index = 1; index < positions.length; index += 1) { const position = positions[index]; minX = Math.min(minX, position.x); minY = Math.min(minY, position.y); minZ = Math.min(minZ, position.z); maxX = Math.max(maxX, position.x); maxY = Math.max(maxY, position.y); maxZ = Math.max(maxZ, position.z); }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function colorForStatus(palette: ViewportThemePalette, status: PlacementStatus): number {
  switch (status) {
    case 'valid': return palette.valid;
    case 'warning': return palette.warning;
    case 'unknown': return palette.unknown;
    default: return palette.invalid;
  }
}
function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function blockRenderSignature(block: ProjectDocument['blocks'][number]): string {
  const state = Object.entries(block.state).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join(',');
  const entity = block.blockEntityData === undefined ? '' : `|entity=${stableValue(block.blockEntityData)}`;
  return `${block.kind}|${block.id}|${block.namespace}|${block.position.x},${block.position.y},${block.position.z}|${state}${entity}`;
}
function decorationSignature(decoration: PlacedDecoration | undefined): string {
  return decoration === undefined ? '' : stableValue(decoration);
}
function compareEmptySnapshots(firstEmpty: ViewportGhostSceneSnapshot, secondEmpty: ViewportGhostSceneSnapshot): NonNullable<ViewportEmptyTransitionDiagnostics['differences']> {
  const key = (visual: ViewportSuspiciousVisualDiagnostic): string => `${visual.owner}|${visual.uuid}|${stableValue(visual.position)}|${stableValue(visual.worldBounds)}`;
  const meshKey = (mesh: ViewportVisibleMeshDiagnostic): string => `${mesh.owner}|${mesh.uuid}|${stableValue(mesh.worldPosition)}|${stableValue(mesh.worldBounds)}`;
  const firstMeshes = new Map(firstEmpty.visibleMeshes.map((mesh) => [meshKey(mesh), mesh]));
  const secondMeshes = new Map(secondEmpty.visibleMeshes.map((mesh) => [meshKey(mesh), mesh]));
  const firstVisuals = new Map(firstEmpty.suspiciousVisuals.map((visual) => [key(visual), visual]));
  const secondVisuals = new Map(secondEmpty.suspiciousVisuals.map((visual) => [key(visual), visual]));
  return {
    visibleMeshCountDelta: secondEmpty.ownership.visibleMeshCount - firstEmpty.ownership.visibleMeshCount,
    renderedBlockCountDelta: secondEmpty.ownership.renderedBlockCount - firstEmpty.ownership.renderedBlockCount,
    visibleMeshesAdded: [...secondMeshes].filter(([meshKeyValue]) => !firstMeshes.has(meshKeyValue)).map(([, mesh]) => mesh),
    visibleMeshesRemoved: [...firstMeshes].filter(([meshKeyValue]) => !secondMeshes.has(meshKeyValue)).map(([, mesh]) => mesh),
    suspiciousVisualsAdded: [...secondVisuals].filter(([visualKey]) => !firstVisuals.has(visualKey)).map(([, visual]) => visual),
    suspiciousVisualsRemoved: [...firstVisuals].filter(([visualKey]) => !secondVisuals.has(visualKey)).map(([, visual]) => visual),
    previewStateChanged: stableValue({ previewState: firstEmpty.previewState, activeBlock: firstEmpty.activeBlock }) !== stableValue({ previewState: secondEmpty.previewState, activeBlock: secondEmpty.activeBlock }),
  };
}
function renderFilterKey(options: ViewportRenderOptions): string {
  return stableValue({ layerY: options.layerY, visibility: options.visibility, referenceOpacity: options.referenceOpacity, isolatedGroupId: options.isolatedGroupId, isolatedGroupPositions: options.isolatedGroupPositions, exposedFaceRendering: options.exposedFaceRendering === true });
}
function isHorizontalDirection(value: string | undefined): value is 'north' | 'east' | 'south' | 'west' { return value === 'north' || value === 'east' || value === 'south' || value === 'west'; }
export function cameraMovementDirection(keys: ReadonlySet<string>, camera: THREE.Camera): THREE.Vector3 {
  const forward = camera.getWorldDirection(new THREE.Vector3()); forward.y = 0; if (forward.lengthSq() === 0) return new THREE.Vector3(); forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize(); const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward); if (keys.has('KeyS')) direction.sub(forward); if (keys.has('KeyD')) direction.add(right); if (keys.has('KeyA')) direction.sub(right); if (keys.has('Space')) direction.y += 1; if (keys.has('ShiftLeft') || keys.has('ShiftRight')) direction.y -= 1;
  return direction;
}
function cameraActionMovementDelta(actions: ReadonlySet<MovementAction>, camera: THREE.Camera, horizontalSpeed: number, verticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const direction = new THREE.Vector3();
  const horizontal = new Set<string>();
  if (actions.has('move-forward')) horizontal.add('KeyW'); if (actions.has('move-backward')) horizontal.add('KeyS'); if (actions.has('move-left')) horizontal.add('KeyA'); if (actions.has('move-right')) horizontal.add('KeyD');
  const horizontalDirection = cameraMovementDirection(horizontal, camera);
  if (horizontalDirection.lengthSq()) direction.add(horizontalDirection.normalize().multiplyScalar(deltaSeconds * horizontalSpeed));
  if (actions.has('move-up')) direction.y += deltaSeconds * verticalSpeed;
  if (actions.has('move-down')) direction.y -= deltaSeconds * verticalSpeed;
  return direction;
}

function emptyResolvedModel(block: ProjectDocument['blocks'][number]): ResolvedBlockModel {
  return {
    blockId: block.id,
    state: block.state,
    parts: [],
    support: 'full',
    diagnostics: [],
    trace: { blockstateResource: '', matchedVariantKeys: [], selectedModelIds: [], modelResources: [], parentResources: [], elementCount: 0, faceCount: 0, textureResources: [] },
  };
}
export function cameraMovementDelta(keys: ReadonlySet<string>, camera: THREE.Camera, horizontalSpeed: number, verticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const horizontalKeys = new Set([...keys].filter((key) => key === 'KeyW' || key === 'KeyA' || key === 'KeyS' || key === 'KeyD'));
  const direction = cameraMovementDirection(horizontalKeys, camera);
  if (direction.lengthSq()) direction.normalize().multiplyScalar(deltaSeconds * horizontalSpeed);
  const verticalDirection = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
  direction.y += verticalDirection * deltaSeconds * verticalSpeed;
  return direction;
}
export function blockCoordinateFromHit(hit: THREE.Intersection): VoxelCoordinate | undefined {
  const direct = hit.object.userData['voxel'] as VoxelCoordinate | undefined;
  if (direct) return direct;
  const instanceId = hit.instanceId;
  if (instanceId === undefined) return undefined;
  return (hit.object.userData['instanceVoxels'] as VoxelCoordinate[] | undefined)?.[instanceId];
}

export function surfaceFaceDirectionFromHit(hit: THREE.Intersection): SurfaceFaceDirection | undefined {
  if (hit.instanceId === undefined || hit.object.userData['surfaceFaceBatch'] !== true) return undefined;
  return (hit.object.userData['instanceFaceDirections'] as SurfaceFaceDirection[] | undefined)?.[hit.instanceId];
}

export function surfaceFaceNormal(direction: SurfaceFaceDirection): THREE.Vector3 {
  switch (direction) {
    case 'north': return new THREE.Vector3(0, 0, -1);
    case 'south': return new THREE.Vector3(0, 0, 1);
    case 'east': return new THREE.Vector3(1, 0, 0);
    case 'west': return new THREE.Vector3(-1, 0, 0);
    case 'up': return new THREE.Vector3(0, 1, 0);
    case 'down': return new THREE.Vector3(0, -1, 0);
  }
}

function extractSurfaceFaceTemplates(object: THREE.Object3D): readonly SurfaceFaceTemplate[] | undefined {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const templates = new Map<SurfaceFaceDirection, SurfaceFaceTemplate>();
  let valid = true;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !valid) return;
    const face = child.userData['face'];
    const cullface = child.userData['cullface'];
    const direction = (typeof cullface === 'string' ? cullface : face) as SurfaceFaceDirection;
    if (!['north', 'south', 'east', 'west', 'up', 'down'].includes(direction) || typeof face === 'string' && typeof cullface === 'string' && face !== cullface || templates.has(direction)) { valid = false; return; }
    if (Array.isArray(child.material) || child.material.transparent || child.material.depthWrite === false || child.morphTargetInfluences || child.type === 'SkinnedMesh') { valid = false; return; }
    const matrix = rootInverse.clone().multiply(child.matrixWorld);
    const geometry = child.geometry.clone().applyMatrix4(matrix);
    const canonicalTransform = canonicalizeSurfaceFaceGeometry(geometry, direction);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData['surfaceOwnedGeometry'] = true;
    templates.set(direction, { geometry, material: child.material.clone(), direction, matrix: canonicalTransform.clone().invert() });
  });
  if (!valid || templates.size !== 6) {
    for (const template of templates.values()) { template.geometry.dispose(); template.material.dispose(); }
    return undefined;
  }
  return (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((direction) => templates.get(direction)!);
}

function canonicalizeSurfaceFaceGeometry(geometry: THREE.BufferGeometry, direction: SurfaceFaceDirection): THREE.Matrix4 {
  const transform = new THREE.Matrix4();
  switch (direction) {
    case 'north': transform.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1); break;
    case 'south': transform.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 1); break;
    case 'east': transform.set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1); break;
    case 'west': transform.set(0, 0, -1, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1); break;
    case 'up': transform.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, 0, 1); break;
    case 'down': transform.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1); break;
  }
  geometry.applyMatrix4(transform);
  return transform;
}

export const mergeInstanceTemplateParts = mergeInstanceTemplatePartsFromCache;
export const compileInstanceTemplates = compileInstanceTemplatesFromCache;
function unitVoxelEnvelope(): THREE.Box3 { return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)); }
function stableChunkBounds(chunk: string, envelope: THREE.Box3): THREE.Box3 {
  const [chunkX, chunkY, chunkZ] = chunk.split(',').map(Number);
  const origin = new THREE.Vector3(chunkX * VIEWPORT_INSTANCE_CHUNK_SIZE, chunkY * VIEWPORT_INSTANCE_CHUNK_SIZE, chunkZ * VIEWPORT_INSTANCE_CHUNK_SIZE);
  return new THREE.Box3(
    origin.clone().add(envelope.min),
    origin.clone().add(new THREE.Vector3(VIEWPORT_INSTANCE_CHUNK_SIZE - 1, VIEWPORT_INSTANCE_CHUNK_SIZE - 1, VIEWPORT_INSTANCE_CHUNK_SIZE - 1)).add(envelope.max),
  );
}
function chunkKey(position: VoxelCoordinate): string { return `${Math.floor(position.x / VIEWPORT_INSTANCE_CHUNK_SIZE)},${Math.floor(position.y / VIEWPORT_INSTANCE_CHUNK_SIZE)},${Math.floor(position.z / VIEWPORT_INSTANCE_CHUNK_SIZE)}`; }
function disposeObject(object: THREE.Object3D): void { (object.userData['ownedDecorationTextureCache'] as { dispose?: () => void } | undefined)?.dispose?.(); object.traverse((child) => { if (child instanceof THREE.Mesh) { if (!child.geometry.userData['providerOwnedGeometry'] && !child.geometry.userData['sharedFallbackGeometry'] && !child.geometry.userData['sharedPlaceholderGeometry']) child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; for (const material of materials) { if (material.userData['sharedFallbackMaterial'] || material.userData['sharedPlaceholderMaterial']) continue; if (material.map?.userData['ownedBedAtlasTexture'] || material.map?.userData['ownedSignTexture']) material.map.dispose(); material.dispose(); } } }); }
