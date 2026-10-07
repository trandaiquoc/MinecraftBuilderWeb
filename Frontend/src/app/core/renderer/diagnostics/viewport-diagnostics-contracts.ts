import type { CameraVector } from '../../editor/camera/camera';
import type { TerrainAtlasMode } from '../terrain/atlas/terrain-texture-atlas';
import type { VoxelCoordinate } from '../../domain/project.types';

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
  readonly terrainCandidateOwnershipTotal: number;
  readonly terrainCandidateFanoutTotal: number;
  readonly maxHydrationCandidatesPerChunk: number;
  readonly maxRecordsPerChunk: number;
  readonly terrainCommitCandidateChecks: number;
  readonly terrainCommitRepresentedLookupChecks: number;
  readonly terrainPendingHydrationCandidates: number;
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
  readonly generation: number; readonly queued: number; readonly running: number; readonly globalRunning: number; readonly currentGenerationRunning: number; readonly staleRunning: number; readonly hydrationScheduled: boolean; readonly hydrationTimerActive: boolean; readonly hydrationBatchBudget: number; readonly pendingSignatureCount: number; readonly placeholderSignatureCount: number; readonly placeholderVisualCount: number; readonly renderedBlockCount: number; readonly expectedVisibleBlockCount: number; readonly runningOwnershipCount: number; readonly runningByGeneration: Readonly<Record<string, number>>; readonly orphanedHydrationCount: number; readonly orphanedHydrationSample: readonly string[]; readonly completed: number; readonly total: number; readonly scheduled: boolean; readonly regularQueued: number; readonly providerRefreshQueued: number; readonly regularRunning: number; readonly providerRefreshRunning: number; readonly providerRefreshPlanning: boolean; readonly providerRefreshPlanningProcessed: number; readonly providerRefreshPlanningTotal: number; readonly providerRefreshPlanningConsidered: number; readonly providerRefreshPlanningQueued: number; readonly providerRefreshPlanningMaxSliceMs: number; readonly providerRefreshPlanningYields: number; readonly providerRefreshPlanningDurationMs: number;
}
export interface VisibleSceneDiagnostics { readonly expectedVisibleVoxelCount: number; readonly renderedVoxelCount: number; readonly placeholderVoxelCount: number; readonly pendingVoxelCount: number; readonly expectedVoxelKeys: readonly string[]; readonly renderedVoxelKeys: readonly string[]; readonly placeholderVoxelKeys: readonly string[]; readonly pendingVoxelKeys: readonly string[]; readonly representedVoxelKeys: readonly string[]; }
export interface ViewportVoxelOwnershipDiagnostic { readonly coordinateKey: string; readonly expectedVisible: boolean; readonly renderedEntry: boolean; readonly placeholderEntry: boolean; readonly pendingSignature?: string; readonly queuedJob: boolean; readonly runningGeneration?: number; }
export interface ViewportVisibleMeshDiagnostic {
  readonly owner: string; readonly directSceneRoot: string; readonly objectType: string; readonly uuid: string; readonly visible: boolean;
  readonly parentPath: readonly { readonly type: string; readonly name: string; readonly uuid: string; readonly visible: boolean }[];
  readonly localPosition: CameraVector; readonly worldPosition: CameraVector; readonly worldBounds: { readonly min: CameraVector; readonly max: CameraVector }; readonly matrixWorld: readonly number[]; readonly renderOrder: number;
  readonly descendantsOf: { readonly blocksGroup: boolean; readonly ghostModel: boolean; readonly ghost: boolean; readonly movePreviewGroup: boolean; readonly decorationGhostGroup: boolean; readonly decorationSelectionGroup: boolean; readonly logicalSelectionGroup: boolean };
  readonly geometry: { readonly uuid: string; readonly type: string };
  readonly materials: readonly { readonly uuid: string; readonly type: string; readonly visible: boolean; readonly opacity: number; readonly texture?: { readonly uuid: string; readonly sourceUuid: string; readonly sourceIdentity?: string } }[];
  readonly userData: Readonly<Record<string, unknown>>; readonly instanceCount?: number;
  readonly instances?: { readonly count: number; readonly batchKey?: string; readonly instanceKeys: readonly string[]; readonly instanceVoxels: readonly VoxelCoordinate[]; readonly worldPositions: readonly CameraVector[] };
}
export interface ViewportSuspiciousVisualDiagnostic { readonly owner: string; readonly uuid: string; readonly reason: string; readonly intentionalPreview: boolean; readonly position: CameraVector; readonly worldBounds: ViewportVisibleMeshDiagnostic['worldBounds']; }
export interface ViewportInstanceOwnershipEvent {
  readonly phase: 'before-insert' | 'after-insert' | 'before-remove' | 'after-remove' | 'after-remove-entry' | 'after-reconcile'; readonly key?: string; readonly source?: 'cached-template' | 'provider-async' | 'rollback' | 'reconcile'; readonly generation: number; readonly previousEntry?: { readonly batchKey?: string; readonly index?: number }; readonly physicalMemberships: readonly { readonly batchKey: string; readonly index: number }[]; readonly violations: readonly string[];
}
export interface ViewportOwnershipDiagnostics {
  readonly authoritativeProjectBlockCount: number; readonly authoritativeVisibleBlockCount: number; readonly renderedBlockCount: number; readonly placeholderVisualCount: number; readonly instanceBatchCount: number; readonly instanceMemberCount: number; readonly placeholderBatchCount: number; readonly placeholderIndexCount: number; readonly blocksGroupChildCount: number; readonly blockLikeSceneObjectsOutsideBlocksGroup: number; readonly visibleMeshesOutsideBlocksGroup: number; readonly staleVoxelKeys: readonly string[]; readonly batchInvariantViolations: readonly string[]; readonly outsideBlocksGroupOwners: readonly string[]; readonly visibleMeshCount: number; readonly visibleMeshSample: readonly ViewportVisibleMeshDiagnostic[]; readonly visibleMeshesOutsideBlocksGroupSample: readonly ViewportVisibleMeshDiagnostic[]; readonly suspiciousVisualCount: number; readonly suspiciousVisuals: readonly ViewportSuspiciousVisualDiagnostic[]; readonly directSceneChildren: readonly { readonly owner: string; readonly uuid: string; readonly visible: boolean; readonly childCount: number }[];
  readonly previewState: { readonly ghostVisible: boolean; readonly ghostModelPresent: boolean; readonly ghostModelVisible: boolean; readonly ghostModelKey: string; readonly ghostGeneration: number; readonly ghostTarget?: VoxelCoordinate; readonly movePreviewChildren: number; readonly decorationGhostChildren: number; readonly logicalSelectionChildren: number; readonly selectionOutlineVisible: boolean; readonly reusableTemplateCount: number };
  readonly hydrationState: Pick<ViewportHydrationDiagnostics, 'queued' | 'running' | 'pendingSignatureCount' | 'placeholderSignatureCount' | 'runningOwnershipCount'>;
}
export interface ViewportGhostSceneSnapshot {
  readonly capturedAt: string; readonly authoritativeProjectBlockCount: number; readonly activeBlock?: { readonly id: string; readonly state: Readonly<Record<string, string>> };
  readonly ownership: Pick<ViewportOwnershipDiagnostics, 'authoritativeVisibleBlockCount' | 'renderedBlockCount' | 'placeholderVisualCount' | 'placeholderBatchCount' | 'placeholderIndexCount' | 'instanceBatchCount' | 'instanceMemberCount' | 'blocksGroupChildCount' | 'visibleMeshCount' | 'visibleMeshesOutsideBlocksGroup' | 'hydrationState'>;
  readonly visibleMeshes: readonly ViewportVisibleMeshDiagnostic[]; readonly suspiciousVisualCount: number; readonly suspiciousVisuals: readonly ViewportSuspiciousVisualDiagnostic[]; readonly directSceneChildren: ViewportOwnershipDiagnostics['directSceneChildren']; readonly instanceOwnershipTrace: readonly ViewportInstanceOwnershipEvent[]; readonly previewState: ViewportOwnershipDiagnostics['previewState'];
}
export interface ViewportEmptyTransitionDiagnostics {
  readonly firstEmpty: ViewportGhostSceneSnapshot | null; readonly secondEmpty: ViewportGhostSceneSnapshot | null;
  readonly differences: null | { readonly visibleMeshCountDelta: number; readonly renderedBlockCountDelta: number; readonly visibleMeshesAdded: readonly ViewportVisibleMeshDiagnostic[]; readonly visibleMeshesRemoved: readonly ViewportVisibleMeshDiagnostic[]; readonly suspiciousVisualsAdded: readonly ViewportSuspiciousVisualDiagnostic[]; readonly suspiciousVisualsRemoved: readonly ViewportSuspiciousVisualDiagnostic[]; readonly previewStateChanged: boolean };
}
export interface ViewportRuntimeDiagnostics { readonly current: ViewportGhostSceneSnapshot; readonly emptyTransitions: ViewportEmptyTransitionDiagnostics; }
export interface ViewportControlConfiguration { readonly orbitSensitivity: number; readonly panSensitivity: number; readonly zoomSensitivity: number; readonly cameraMoveSpeed: number; readonly verticalMoveSpeed: number; }
export type ViewportProjectionActivity = 'idle' | 'applying' | 'settling';
export interface ViewportProjectionState { readonly activity: ViewportProjectionActivity; readonly revision: number; }
