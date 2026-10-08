export interface TerrainApplyResultLike {
  readonly representedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly pending?: boolean;
  readonly changedKeys?: readonly string[];
  readonly hydrationCandidateKeys?: readonly string[];
}

export interface TerrainRepresentationBatchOptions<C extends { readonly key: string; readonly reusableKey: string }, R, T, A extends TerrainApplyResultLike, P> {
  readonly candidates: readonly C[];
  readonly affectedPositions: readonly P[];
  readonly initial: boolean;
  readonly local: boolean;
  readonly lane: string;
  readonly generation: number;
  readonly providerGeneration: number;
  readonly currentGeneration: () => number;
  readonly currentProviderGeneration: () => number;
  readonly isDisposed: () => boolean;
  readonly projectionRevision: number;
  readonly candidateProjectionRevisions: ReadonlyMap<string, number>;
  readonly projectionRevisionFor: (key: string) => number;
  readonly currentSignature: (key: string) => string | undefined;
  readonly candidateSignature: (candidate: C) => string;
  readonly cachedTemplates: (key: string) => T | undefined;
  readonly cacheTemplates: (key: string, templates: T) => void;
  readonly resolveTemplates: (candidate: C) => Promise<T | undefined>;
  readonly toRecord: (candidate: C, templates: T) => R;
  readonly apply: (records: readonly R[], context: { readonly initial: boolean; readonly local: boolean; readonly affectedPositions: readonly P[] }) => A;
  readonly onCommit: (records: readonly R[], result: A, projectionRevision: number) => void;
  readonly onStale: (candidates: readonly C[], lane: string) => void;
  readonly onFailed: (candidates: readonly C[], lane: string) => void;
  readonly disposeTemplates: (templates: T) => void;
  readonly onFinished?: () => void;
}

/** Owns terrain template grouping, stale guards, renderer application, and fallback handoff. */
export class ViewportTerrainRepresentationPipeline<T> {
  private readonly pendingByKey = new Map<string, Promise<T | undefined>>();
  private pendingGroups = 0;

  resolve(key: string, create: () => Promise<T | undefined>): Promise<T | undefined> {
    const existing = this.pendingByKey.get(key);
    if (existing) return existing;
    const pending = create();
    this.pendingByKey.set(key, pending);
    const clear = (): void => { if (this.pendingByKey.get(key) === pending) this.pendingByKey.delete(key); };
    void pending.then(clear, clear);
    return pending;
  }

  clearPending(): void { this.pendingByKey.clear(); }
  get pendingCount(): number { return this.pendingByKey.size; }

  beginGroups(count: number): void { this.pendingGroups += Math.max(0, count); }
  finishGroups(count: number): void { this.pendingGroups = Math.max(0, this.pendingGroups - Math.max(0, count)); }
  resetGroups(): void { this.pendingGroups = 0; }
  get pendingGroupCount(): number { return this.pendingGroups; }
  dispose(): void { this.clearPending(); this.resetGroups(); }

  scheduleBatch<C extends { readonly key: string; readonly reusableKey: string }, R, P, A extends TerrainApplyResultLike>(
    options: TerrainRepresentationBatchOptions<C, R, T, A, P>,
  ): void {
    const groups = new Map<string, C[]>();
    for (const candidate of options.candidates) (groups.get(candidate.reusableKey) ?? (groups.set(candidate.reusableKey, []), groups.get(candidate.reusableKey)!)).push(candidate);
    const pendingGroups = [...groups.keys()].filter((key) => !options.cachedTemplates(key)).length;
    this.beginGroups(pendingGroups);
    const resolutions = [...groups.entries()].map(([reusableKey, group]) => {
      const cached = options.cachedTemplates(reusableKey);
      if (cached) return Promise.resolve({ reusableKey, group, templates: cached, owned: false });
      return this.resolve(reusableKey, () => options.resolveTemplates(group[0])).then(
        (templates) => ({ reusableKey, group, templates, owned: true }),
        () => ({ reusableKey, group, templates: undefined, owned: false }),
      );
    });
    void Promise.all(resolutions).then((results) => {
      const stale = options.generation !== options.currentGeneration()
        || options.providerGeneration !== options.currentProviderGeneration()
        || options.isDisposed()
        || [...options.candidates].some((candidate) => options.projectionRevisionFor(candidate.key) !== options.candidateProjectionRevisions.get(candidate.key));
      if (stale) {
        for (const result of results) if (result.owned && result.templates && !options.cachedTemplates(result.reusableKey)) options.disposeTemplates(result.templates);
        this.finishGroups(pendingGroups);
        options.onStale(options.candidates, options.lane);
        options.onFinished?.();
        return;
      }
      const records: R[] = [];
      const failed: C[] = [];
      for (const result of results) {
        if (!result.templates) { failed.push(...result.group); continue; }
        options.cacheTemplates(result.reusableKey, result.templates);
        for (const candidate of result.group) if (options.currentSignature(candidate.key) === options.candidateSignature(candidate)) records.push(options.toRecord(candidate, result.templates));
      }
      const applied = options.apply(records, { initial: options.initial, local: options.local, affectedPositions: options.affectedPositions });
      if (!applied.pending) options.onCommit(records, applied, options.projectionRevision);
      const represented = new Set(applied.representedKeys);
      for (const record of records) {
        const key = (record as R & { readonly key: string }).key;
        if (!applied.pending && !represented.has(key)) {
          const candidate = options.candidates.find((item) => item.key === key);
          if (candidate) failed.push(candidate);
        }
      }
      this.finishGroups(pendingGroups);
      if (failed.length) options.onFailed(failed, options.lane);
      options.onFinished?.();
    }).catch(() => {
      this.finishGroups(pendingGroups);
      options.onFailed(options.candidates, options.lane);
      options.onFinished?.();
    });
  }
}
