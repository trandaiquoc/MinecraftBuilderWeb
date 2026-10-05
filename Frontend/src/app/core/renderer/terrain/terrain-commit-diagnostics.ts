export interface TerrainCommitMetrics {
  readonly chunkKey: string;
  readonly priority: number;
  readonly recordsInChunk: number;
  representedKeys: number;
  readonly emittedKeys: number;
  readonly fullyOccludedKeys: number;
  readonly failedKeys: number;
  readonly meshBucketCount: number;
  readonly geometryVertices: number;
  readonly geometryIndices: number;
  ownershipRemoved: number;
  ownershipInserted: number;
  readonly hydrationCandidateKeys: number;
  hydrationCompletedKeys: number;
  hydrationPublishCount: number;
  readonly totalMs?: number;
}

export interface TerrainCommitDiagnosticsEvidence {
  readonly commits: number;
  readonly last?: TerrainCommitMetrics;
  readonly stages: Readonly<Record<string, { readonly count: number; readonly p50: number; readonly p95: number; readonly max: number }>>;
}

/** Small bounded accumulator for proving where a terrain commit spends time. */
export class TerrainCommitDiagnostics {
  private readonly samples = new Map<string, number[]>();
  private commitCount = 0;
  private last?: TerrainCommitMetrics;

  recordStage(stage: string, durationMs: number): void {
    const values = this.samples.get(stage) ?? [];
    values.push(Math.max(0, durationMs));
    if (values.length > 256) values.shift();
    this.samples.set(stage, values);
  }

  recordCommit(metrics: TerrainCommitMetrics): void { this.commitCount += 1; this.last = metrics; }

  evidence(): TerrainCommitDiagnosticsEvidence {
    return {
      commits: this.commitCount,
      ...(this.last ? { last: { ...this.last } } : {}),
      stages: Object.fromEntries([...this.samples.entries()].map(([stage, values]) => [stage, summary(values)])),
    };
  }
}

function summary(values: readonly number[]): { count: number; p50: number; p95: number; max: number } {
  if (!values.length) return { count: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * .5)], p95: sorted[Math.floor((sorted.length - 1) * .95)], max: sorted[sorted.length - 1] };
}
