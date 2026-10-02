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
  readonly hydrationPausesForCamera: number;
  readonly hydrationJobsStartedWhileCamera: number;
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
  hydrationPausesForCamera: 0,
  hydrationJobsStartedWhileCamera: 0,
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
}
