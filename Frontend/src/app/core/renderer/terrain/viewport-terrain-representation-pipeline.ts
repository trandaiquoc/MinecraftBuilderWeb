export interface TerrainApplyResultLike {
  readonly representedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly pending?: boolean;
  readonly changedKeys?: readonly string[];
  readonly hydrationCandidateKeys?: readonly string[];
}

export interface TerrainBatchLifecycle<P> {
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
}

export interface TerrainBatchTemplates<C extends { readonly key: string; readonly reusableKey: string }, T> {
  readonly cachedTemplates: (key: string) => T | undefined;
  readonly cacheTemplates: (key: string, templates: T) => void;
  readonly resolveTemplates: (candidate: C) => Promise<T | undefined>;
  readonly disposeTemplates: (templates: T) => void;
}

export interface TerrainBatchApplication<C extends { readonly key: string }, R, P, A extends TerrainApplyResultLike, T> {
  readonly currentSignature: (key: string) => string | undefined;
  readonly candidateSignature: (candidate: C) => string;
  readonly toRecord: (candidate: C, templates: T) => R;
  readonly apply: (records: readonly R[], context: { readonly initial: boolean; readonly local: boolean; readonly affectedPositions: readonly P[] }) => A;
}

export interface TerrainBatchCallbacks<C, R, A extends TerrainApplyResultLike> {
  readonly onCommit: (records: readonly R[], result: A, projectionRevision: number) => void;
  readonly onStale: (candidates: readonly C[], lane: string) => void;
  readonly onFailed: (candidates: readonly C[], lane: string) => void;
  readonly onFinished?: () => void;
}

/** Owns terrain template grouping, stale guards, renderer application, and fallback handoff. */
export class ViewportTerrainRepresentationPipeline<T> {
  private readonly pendingByKey = new Map<string, Promise<T | undefined>>();
  private pendingGroups = 0;

  resolve(key: string, create: () => Promise<T | undefined>): Promise<T | undefined> {
    const existing = this.pendingByKey.get(key);
    if (existing) return existing;
    let pending: Promise<T | undefined>;
    try { pending = create(); }
    catch (error: unknown) { pending = Promise.reject(error); }
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
    candidates: readonly C[],
    lifecycle: TerrainBatchLifecycle<P>,
    templates: TerrainBatchTemplates<C, T>,
    application: TerrainBatchApplication<C, R, P, A, T>,
    callbacks: TerrainBatchCallbacks<C, R, A>,
  ): void {
    const groups = new Map<string, C[]>();
    for (const candidate of candidates) (groups.get(candidate.reusableKey) ?? (groups.set(candidate.reusableKey, []), groups.get(candidate.reusableKey)!)).push(candidate);
    const pendingGroups = [...groups.keys()].filter((key) => !templates.cachedTemplates(key)).length;
    this.beginGroups(pendingGroups);
    const resolutions = [...groups.entries()].map(([reusableKey, group]) => {
      const cached = templates.cachedTemplates(reusableKey);
      if (cached) return Promise.resolve({ reusableKey, group, templates: cached, owned: false });
      return this.resolve(reusableKey, () => templates.resolveTemplates(group[0])).then(
        (templates) => ({ reusableKey, group, templates, owned: true }),
        () => ({ reusableKey, group, templates: undefined, owned: false }),
      );
    });
    void Promise.all(resolutions).then((results) => {
      const stale = lifecycle.generation !== lifecycle.currentGeneration()
        || lifecycle.providerGeneration !== lifecycle.currentProviderGeneration()
        || lifecycle.isDisposed()
        || candidates.some((candidate) => lifecycle.projectionRevisionFor(candidate.key) !== lifecycle.candidateProjectionRevisions.get(candidate.key));
      if (stale) {
        for (const result of results) if (result.owned && result.templates && !templates.cachedTemplates(result.reusableKey)) templates.disposeTemplates(result.templates);
        this.finishGroups(pendingGroups);
        callbacks.onStale(candidates, lifecycle.lane);
        callbacks.onFinished?.();
        return;
      }
      const records: R[] = [];
      const failed: C[] = [];
      for (const result of results) {
        if (!result.templates) { failed.push(...result.group); continue; }
        templates.cacheTemplates(result.reusableKey, result.templates);
        for (const candidate of result.group) if (application.currentSignature(candidate.key) === application.candidateSignature(candidate)) records.push(application.toRecord(candidate, result.templates));
      }
      const applied = application.apply(records, { initial: lifecycle.initial, local: lifecycle.local, affectedPositions: lifecycle.affectedPositions });
      if (!applied.pending) callbacks.onCommit(records, applied, lifecycle.projectionRevision);
      const represented = new Set(applied.representedKeys);
      for (const record of records) {
        const key = (record as R & { readonly key: string }).key;
        if (!applied.pending && !represented.has(key)) {
          const candidate = candidates.find((item) => item.key === key);
          if (candidate) failed.push(candidate);
        }
      }
      this.finishGroups(pendingGroups);
      if (failed.length) callbacks.onFailed(failed, lifecycle.lane);
      callbacks.onFinished?.();
    }).catch(() => {
      this.finishGroups(pendingGroups);
      callbacks.onFailed(candidates, lifecycle.lane);
      callbacks.onFinished?.();
    });
  }
}
