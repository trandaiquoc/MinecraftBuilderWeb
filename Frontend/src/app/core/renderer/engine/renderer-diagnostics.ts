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
  readonly instancedBatchCreations: number;
  readonly instancedBlockAdds: number;
  readonly instancedBlockRemovals: number;
  readonly instancedMeshCount: number;
  readonly instancedMembers: number;
  readonly instancedBoundsComputations: number;
  readonly reusableTemplateCreations: number;
  readonly reusableTemplateCacheHits: number;
  readonly fallbackMeshCreations: number;
  readonly cachedTemplateInsertions: number;
  readonly cameraMovementFrames: number;
  readonly cameraMovementRenderCalls: number;
  readonly cameraChangeEventsDuringMovement: number;
  readonly cameraRenderRequestsSuppressed: number;
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
  instancedBatchCreations: 0,
  instancedBlockAdds: 0,
  instancedBlockRemovals: 0,
  instancedMeshCount: 0,
  instancedMembers: 0,
  instancedBoundsComputations: 0,
  reusableTemplateCreations: 0,
  reusableTemplateCacheHits: 0,
  fallbackMeshCreations: 0,
  cachedTemplateInsertions: 0,
  cameraMovementFrames: 0,
  cameraMovementRenderCalls: 0,
  cameraChangeEventsDuringMovement: 0,
  cameraRenderRequestsSuppressed: 0,
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
