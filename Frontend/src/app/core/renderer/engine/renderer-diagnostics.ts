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
  readonly resolvedModelCacheHits: number;
  readonly resolvedModelCacheMisses: number;
  readonly geometryCacheHits: number;
  readonly geometryCacheMisses: number;
  readonly textureCacheHits: number;
  readonly textureCacheMisses: number;
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
  resolvedModelCacheHits: 0,
  resolvedModelCacheMisses: 0,
  geometryCacheHits: 0,
  geometryCacheMisses: 0,
  textureCacheHits: 0,
  textureCacheMisses: 0,
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
