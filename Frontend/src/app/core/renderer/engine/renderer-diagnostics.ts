export interface RendererCounters {
  readonly fullSceneRebuilds: number;
  readonly blockAdds: number;
  readonly blockUpdates: number;
  readonly blockRemovals: number;
  readonly decorationAdds: number;
  readonly decorationUpdates: number;
  readonly decorationRemovals: number;
  readonly blockVisualCreations: number;
  readonly decorationVisualCreations: number;
  readonly fallbackGeometryConstructions: number;
  readonly fallbackMaterialCreations: number;
  readonly modelResolutions: number;
  readonly providerObjectCreations: number;
  readonly resolvedModelCacheHits: number;
  readonly resolvedModelCacheMisses: number;
  readonly geometryCacheHits: number;
  readonly geometryCacheMisses: number;
  readonly textureCacheHits: number;
  readonly textureCacheMisses: number;
  readonly hydrationGenerations: number;
  readonly cancelledHydrations: number;
  readonly hydrationBatches: number;
  readonly maxPendingVisualJobs: number;
  readonly coalescedRenderRequests: number;
  readonly renderInvalidations: number;
  readonly renderInvalidationsCoalesced: number;
  readonly actualSceneRenders: number;
  readonly instancedBatchCreations: number;
  readonly instancedBlockAdds: number;
  readonly instancedBlockRemovals: number;
  readonly instancedMeshCount: number;
  readonly instancedMembers: number;
  readonly instancedBoundsComputations: number;
  readonly reusableTemplateCreations: number;
  readonly reusableTemplateCacheHits: number;
  readonly rawInstanceTemplateParts: number;
  readonly mergedInstanceTemplateParts: number;
  readonly templateMergeOperations: number;
  readonly templatePartsEliminated: number;
  readonly surfaceFastPathBlocks: number;
  readonly exposedFaceInstances: number;
  readonly neighborFacesCulled: number;
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
  readonly interiorCullingChecks: number;
  readonly interiorBlocksCulled: number;
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
  readonly terrainChunkRebuilds: number;
  readonly terrainBlocksCompiled: number;
  readonly terrainFacesEmitted: number;
  readonly terrainFacesCulled: number;
  readonly terrainTemplateResolutions: number;
  readonly terrainTemplateCacheHits: number;
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
  readonly hintedProjectMutations: number;
  readonly incrementalBlockReconciles: number;
  readonly incrementalChangedVoxels: number;
  readonly incrementalChunkInvalidations: number;
  readonly incrementalTerrainChunkRebuilds: number;
  readonly yLayerProjectionRequests: number;
  readonly yLayerProjectionCommits: number;
  readonly yLayerProjectionRequestsCoalesced: number;
  readonly yLayerProjectionChangedLayers: number;
  readonly yLayerProjectionChangedBlocks: number;
  readonly yLayerProjectionAddedVisible: number;
  readonly yLayerProjectionRemovedVisible: number;
  readonly yLayerProjectionRoleChanged: number;
  readonly yLayerProjectionFluidBlocksVisited: number;
  readonly yLayerProjectionCommitMs: number;
  readonly yLayerProjectionMaxCommitMs: number;
  readonly yLayerProjectionSlices: number;
  readonly yLayerProjectionYields: number;
  readonly yLayerProjectionCancellations: number;
  readonly yLayerProjectionMaxSliceMs: number;
  readonly yLayerPresentationTransitions: number;
  readonly yLayerPresentationFallbacks: number;
  readonly yLayerProjectionVoxelVisits: number;
  readonly yLayerBatchVisibilityUpdates: number;
  readonly yLayerBatchRoleUpdates: number;
  readonly renderBatchRoleUpdates: number;
  readonly instanceMatrixWrites: number;
  readonly yLayerRepresentationJobsQueued: number;
  readonly yLayerRepresentationJobsStarted: number;
  readonly yLayerRepresentationJobsCompleted: number;
  readonly yLayerRepresentationJobsSkipped: number;
  readonly yLayerRepresentationPrewarmCompleted: number;
  readonly staleHydrationCompletionsIgnored: number;
  readonly fullReconcileFallbacks: number;
  readonly fullVisibleScans: number;
  readonly occupancyFullRebuilds: number;
  readonly occupancyDeltaUpdates: number;
}

const EMPTY_COUNTERS: RendererCounters = {
  fullSceneRebuilds: 0,
  blockAdds: 0,
  blockUpdates: 0,
  blockRemovals: 0,
  decorationAdds: 0,
  decorationUpdates: 0,
  decorationRemovals: 0,
  blockVisualCreations: 0,
  decorationVisualCreations: 0,
  fallbackGeometryConstructions: 0,
  fallbackMaterialCreations: 0,
  modelResolutions: 0,
  providerObjectCreations: 0,
  resolvedModelCacheHits: 0,
  resolvedModelCacheMisses: 0,
  geometryCacheHits: 0,
  geometryCacheMisses: 0,
  textureCacheHits: 0,
  textureCacheMisses: 0,
  hydrationGenerations: 0,
  cancelledHydrations: 0,
  hydrationBatches: 0,
  maxPendingVisualJobs: 0,
  coalescedRenderRequests: 0,
  renderInvalidations: 0,
  renderInvalidationsCoalesced: 0,
  actualSceneRenders: 0,
  instancedBatchCreations: 0,
  instancedBlockAdds: 0,
  instancedBlockRemovals: 0,
  instancedMeshCount: 0,
  instancedMembers: 0,
  instancedBoundsComputations: 0,
  reusableTemplateCreations: 0,
  reusableTemplateCacheHits: 0,
  rawInstanceTemplateParts: 0,
  mergedInstanceTemplateParts: 0,
  templateMergeOperations: 0,
  templatePartsEliminated: 0,
  surfaceFastPathBlocks: 0,
  exposedFaceInstances: 0,
  neighborFacesCulled: 0,
  fallbackMeshCreations: 0,
  cachedTemplateInsertions: 0,
  cameraMovementFrames: 0,
  cameraMovementRenderCalls: 0,
  cameraChangeEventsDuringMovement: 0,
  cameraRenderRequestsSuppressed: 0,
  controlChangeEvents: 0,
  cameraRenderRequests: 0,
  cameraRendersExecuted: 0,
  cameraRenderRequestsCoalesced: 0,
  interactiveResolutionEntries: 0,
  staticResolutionRestores: 0,
  regularHydrationStarted: 0,
  regularHydrationCompleted: 0,
  providerRefreshStarted: 0,
  providerRefreshCompleted: 0,
  hydrationFairnessDeferrals: 0,
  maxProviderRefreshRunningWhileRegularPending: 0,
  hydrationPausesForCamera: 0,
  hydrationJobsStartedWhileCamera: 0,
  hydrationProgressRegressions: 0,
  cameraOnlyGenerationChanges: 0,
  blockSignatureComputations: 0,
  hoverRaycasts: 0,
  hoverRaycastsSuppressedDuringCamera: 0,
  hoverPointerMovesCoalesced: 0,
  interiorCullingChecks: 0,
  interiorBlocksCulled: 0,
  hoverPickMs: 0,
  hoverPickCount: 0,
  hoverPickMaxMs: 0,
  ddaPickCount: 0,
  ddaVisitedVoxels: 0,
  ddaFullCubeHits: 0,
  precisePickFallbacks: 0,
  placementPreviewMs: 0,
  placementPreviewCount: 0,
  placementPreviewMaxMs: 0,
  placementPreviewFullProjectScans: 0,
  duplicatePlacementValidations: 0,
  spatialIndexBuilds: 0,
  spatialIndexLookups: 0,
  ghostVisualRebuilds: 0,
  ghostVisualReuses: 0,
  structuralReconciles: 0,
  overlayOnlyUpdates: 0,
  projectBoundsRebuilds: 0,
  fullProjectScansDuringHover: 0,
  terrainChunkRebuilds: 0,
  terrainBlocksCompiled: 0,
  terrainFacesEmitted: 0,
  terrainFacesCulled: 0,
  terrainTemplateResolutions: 0,
  terrainTemplateCacheHits: 0,
  terrainBulkBatches: 0,
  terrainAsyncAcceptedResults: 0,
  terrainAsyncStaleRevisionResults: 0,
  terrainAsyncStaleGenerationResults: 0,
  terrainAsyncStaleProviderResults: 0,
  terrainAsyncSupersededResults: 0,
  terrainAsyncRescheduledChunks: 0,
  terrainAsyncCommitPolicyRejected: 0,
  terrainAsyncAllUnrepresentedResults: 0,
  terrainAsyncPartialFailureResults: 0,
  terrainAsyncWorkerFailures: 0,
  terrainAsyncFallbackKeys: 0,
  terrainAsyncRejectedWithoutReplacement: 0,
  hintedProjectMutations: 0,
  incrementalBlockReconciles: 0,
  incrementalChangedVoxels: 0,
  incrementalChunkInvalidations: 0,
  incrementalTerrainChunkRebuilds: 0,
  yLayerProjectionRequests: 0,
  yLayerProjectionCommits: 0,
  yLayerProjectionRequestsCoalesced: 0,
  yLayerProjectionChangedLayers: 0,
  yLayerProjectionChangedBlocks: 0,
  yLayerProjectionAddedVisible: 0,
  yLayerProjectionRemovedVisible: 0,
  yLayerProjectionRoleChanged: 0,
  yLayerProjectionFluidBlocksVisited: 0,
  yLayerProjectionCommitMs: 0,
  yLayerProjectionMaxCommitMs: 0,
  yLayerProjectionSlices: 0,
  yLayerProjectionYields: 0,
  yLayerProjectionCancellations: 0,
  yLayerProjectionMaxSliceMs: 0,
  yLayerPresentationTransitions: 0,
  yLayerPresentationFallbacks: 0,
  yLayerProjectionVoxelVisits: 0,
  yLayerBatchVisibilityUpdates: 0,
  yLayerBatchRoleUpdates: 0,
  renderBatchRoleUpdates: 0,
  instanceMatrixWrites: 0,
  yLayerRepresentationJobsQueued: 0,
  yLayerRepresentationJobsStarted: 0,
  yLayerRepresentationJobsCompleted: 0,
  yLayerRepresentationJobsSkipped: 0,
  yLayerRepresentationPrewarmCompleted: 0,
  staleHydrationCompletionsIgnored: 0,
  fullReconcileFallbacks: 0,
  fullVisibleScans: 0,
  occupancyFullRebuilds: 0,
  occupancyDeltaUpdates: 0,
};

/** Small opt-in counters for renderer tests and local baseline measurements. */
export class RendererDiagnostics {
  private counters = { ...EMPTY_COUNTERS };

  reset(): void {
    this.counters = { ...EMPTY_COUNTERS };
  }

  snapshot(): RendererCounters {
    return { ...this.counters };
  }

  record<K extends keyof RendererCounters>(counter: K, amount = 1): void {
    this.counters[counter] += amount;
  }

  recordMax<K extends keyof RendererCounters>(counter: K, value: number): void {
    this.counters[counter] = Math.max(this.counters[counter], value);
  }
}
