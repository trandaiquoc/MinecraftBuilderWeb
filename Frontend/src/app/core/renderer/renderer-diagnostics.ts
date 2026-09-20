export interface RendererCounters {
  readonly fullSceneRebuilds: number;
  readonly blockVisualCreations: number;
  readonly decorationVisualCreations: number;
  readonly geometryConstructions: number;
  readonly materialCreations: number;
  readonly modelResolutions: number;
}

const EMPTY_COUNTERS: RendererCounters = {
  fullSceneRebuilds: 0,
  blockVisualCreations: 0,
  decorationVisualCreations: 0,
  geometryConstructions: 0,
  materialCreations: 0,
  modelResolutions: 0,
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
