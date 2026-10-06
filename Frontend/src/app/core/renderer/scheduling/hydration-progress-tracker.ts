export type HydrationStatus = 'idle' | 'hydrating' | 'complete';
export type HydrationLane = 'structural' | 'local' | 'content';

export interface HydrationProgressSnapshot {
  readonly generation: number;
  readonly lane?: HydrationLane;
  readonly status: HydrationStatus;
  readonly completed: number;
  readonly total: number;
  readonly blocksCompleted: number;
  readonly blocksTotal: number;
  readonly decorationsCompleted: number;
  readonly decorationsTotal: number;
  readonly percent: number;
  readonly finalization?: HydrationFinalizationSnapshot;
}

export interface HydrationFinalizationSnapshot {
  readonly expectedBlocks: number;
  readonly finalReadyBlocks: number;
  readonly provisionalMissingBlocks: number;
  readonly permanentMissingBlocks: number;
  readonly pendingBlocks: number;
}

type ProgressPart = 'block' | 'decoration';

const idleProgress = (generation: number, lane: HydrationLane = 'structural'): HydrationProgressSnapshot => ({
  generation,
  lane,
  status: 'idle',
  completed: 0,
  total: 0,
  blocksCompleted: 0,
  blocksTotal: 0,
  decorationsCompleted: 0,
  decorationsTotal: 0,
  percent: 0,
});

/** Owns logical hydration accounting; scheduling and rendering stay elsewhere. */
export class HydrationProgressTracker {
  private readonly blockScope = new Set<string>();
  private readonly completedBlocks = new Set<string>();
  private readonly decorationScope = new Set<string>();
  private readonly completedDecorations = new Set<string>();
  private readonly provisionalMissingBlocks = new Set<string>();
  private readonly permanentMissingBlocks = new Set<string>();
  private readonly listeners = new Set<(progress: HydrationProgressSnapshot) => void>();
  private progress: HydrationProgressSnapshot = idleProgress(0);
  private lane: HydrationLane = 'structural';

  constructor(private readonly onRegression?: () => void, private readonly onPublish?: (progress: HydrationProgressSnapshot) => void) {}

  snapshot(): HydrationProgressSnapshot { return this.progress; }

  onProgress(listener: (progress: HydrationProgressSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => this.listeners.delete(listener);
  }

  setBlockScope(keys: readonly string[]): void {
    const next = new Set(keys);
    for (const key of this.completedBlocks) if (!next.has(key)) this.completedBlocks.delete(key);
    this.blockScope.clear();
    for (const key of next) this.blockScope.add(key);
    for (const key of this.provisionalMissingBlocks) if (!next.has(key)) this.provisionalMissingBlocks.delete(key);
    for (const key of this.permanentMissingBlocks) if (!next.has(key)) this.permanentMissingBlocks.delete(key);
  }

  addBlockKey(key: string): void {
    this.blockScope.add(key);
    this.completedBlocks.delete(key);
    this.provisionalMissingBlocks.delete(key);
    this.permanentMissingBlocks.delete(key);
  }

  removeBlockKey(key: string): void {
    this.blockScope.delete(key);
    this.completedBlocks.delete(key);
    this.provisionalMissingBlocks.delete(key);
    this.permanentMissingBlocks.delete(key);
  }

  setMissingBlockState(key: string, state: 'provisional' | 'permanent' | 'pending'): void {
    this.syncMissingBlockState(key, state);
    this.publishCurrent(this.progress.generation);
  }

  /** Updates Missing ownership without publishing once per item in a batch. */
  syncMissingBlockState(key: string, state: 'resolved' | 'provisional' | 'permanent' | 'pending'): void {
    if (!this.blockScope.has(key)) return;
    if (state !== 'resolved') this.completedBlocks.delete(key);
    this.provisionalMissingBlocks.delete(key);
    this.permanentMissingBlocks.delete(key);
    if (state === 'provisional') this.provisionalMissingBlocks.add(key);
    if (state === 'permanent') this.permanentMissingBlocks.add(key);
  }

  clearMissingBlockState(key: string): void {
    this.syncMissingBlockState(key, 'resolved');
  }

  refresh(): void { this.publishCurrent(this.progress.generation); }

  missingStateKeys(): readonly string[] { return [...this.provisionalMissingBlocks, ...this.permanentMissingBlocks]; }

  hasBlockKey(key: string): boolean { return this.blockScope.has(key); }

  isBlockComplete(key: string): boolean { return this.completedBlocks.has(key); }

  /** Adopt only representations already proven committed by the renderer. */
  adoptBlockKeys(generation: number, keys: readonly string[]): void {
    if (this.progress.generation !== generation) return;
    for (const key of keys) if (this.blockScope.has(key)) this.completedBlocks.add(key);
    this.publishCurrent(generation);
  }

  adoptDecorationIds(generation: number, ids: readonly string[]): void {
    if (this.progress.generation !== generation) return;
    for (const id of ids) if (this.decorationScope.has(id)) this.completedDecorations.add(id);
    this.publishCurrent(generation);
  }

  private publishCurrent(generation: number): void {
    const blocksTotal = this.blockScope.size;
    const decorationsTotal = this.decorationScope.size;
    const total = blocksTotal + decorationsTotal;
    if (!total) {
      this.publish(idleProgress(generation, this.lane));
      return;
    }
    const blocksCompleted = this.completedBlocks.size;
    const decorationsCompleted = this.completedDecorations.size;
    const completed = blocksCompleted + decorationsCompleted;
    const finalization = this.finalization(blocksTotal, blocksCompleted);
    if (completed + this.permanentMissingBlocks.size >= total) {
      this.publish({ generation, lane: this.lane, status: 'complete', completed, total, blocksCompleted, blocksTotal, decorationsCompleted: decorationsCompleted, decorationsTotal, percent: total ? completed / total * 100 : 0, finalization });
      return;
    }
    this.publish({ generation, lane: this.lane, status: 'hydrating', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: total ? completed / total * 100 : 0, finalization });
  }

  setDecorationScope(ids: readonly string[]): void {
    const next = new Set(ids);
    for (const id of this.completedDecorations) if (!next.has(id)) this.completedDecorations.delete(id);
    this.decorationScope.clear();
    for (const id of next) this.decorationScope.add(id);
  }

  setLane(lane: HydrationLane): void { this.lane = lane; }

  begin(generation: number, lane = this.lane): void {
    this.lane = lane;
    const blocksTotal = this.blockScope.size;
    const decorationsTotal = this.decorationScope.size;
    const total = blocksTotal + decorationsTotal;
    if (!total) {
      this.publish(idleProgress(generation, lane));
      return;
    }
    const blocksCompleted = this.completedBlocks.size;
    const decorationsCompleted = this.completedDecorations.size;
    const completed = blocksCompleted + decorationsCompleted;
    const finalization = this.finalization(blocksTotal, blocksCompleted);
    if (completed + this.permanentMissingBlocks.size >= total) {
      this.publish({ generation, lane, status: 'complete', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: total ? completed / total * 100 : 0, finalization });
      return;
    }
    this.publish({ generation, lane, status: 'hydrating', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: completed / total * 100, finalization });
  }

  complete(generation: number, kind: ProgressPart, key: string): void {
    this.completeKeys(generation, kind, [key]);
  }

  completeBatch(generation: number, kind: ProgressPart, keys: readonly string[]): void {
    this.completeKeys(generation, kind, keys);
  }

  private completeKeys(generation: number, kind: ProgressPart, keys: readonly string[]): void {
    if (this.progress.generation !== generation) return;
    const scope = kind === 'block' ? this.blockScope : this.decorationScope;
    const completedSet = kind === 'block' ? this.completedBlocks : this.completedDecorations;
    for (const key of keys) if (scope.has(key)) completedSet.add(key);
    const blocksTotal = this.blockScope.size;
    const decorationsTotal = this.decorationScope.size;
    const total = blocksTotal + decorationsTotal;
    const blocksCompleted = this.completedBlocks.size;
    const decorationsCompleted = this.completedDecorations.size;
    const completed = blocksCompleted + decorationsCompleted;
    const finalization = this.finalization(blocksTotal, blocksCompleted);
    if (completed + this.permanentMissingBlocks.size >= total) {
      this.publish({ generation, lane: this.lane, status: 'complete', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: total ? completed / total * 100 : 0, finalization });
      return;
    }
    this.publish({ generation, lane: this.lane, status: 'hydrating', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: total ? completed / total * 100 : 0, finalization });
  }

  reset(generation: number): void {
    this.completedBlocks.clear();
    this.completedDecorations.clear();
    this.publish(idleProgress(generation, this.lane));
  }

  invalidate(kind: ProgressPart, key: string): void {
    (kind === 'block' ? this.completedBlocks : this.completedDecorations).delete(key);
  }

  clear(): void {
    this.blockScope.clear();
    this.completedBlocks.clear();
    this.decorationScope.clear();
    this.completedDecorations.clear();
    this.provisionalMissingBlocks.clear();
    this.permanentMissingBlocks.clear();
  }

  private finalization(expectedBlocks: number, finalReadyBlocks: number): HydrationFinalizationSnapshot {
    return {
      expectedBlocks,
      finalReadyBlocks,
      provisionalMissingBlocks: this.provisionalMissingBlocks.size,
      permanentMissingBlocks: this.permanentMissingBlocks.size,
      pendingBlocks: Math.max(0, expectedBlocks - finalReadyBlocks - this.provisionalMissingBlocks.size - this.permanentMissingBlocks.size),
    };
  }

  publish(next: HydrationProgressSnapshot): void {
    if (next.lane !== undefined) this.lane = next.lane;
    else next = { ...next, lane: this.lane };
    const current = this.progress;
    const sameScope = current.generation === next.generation && current.total > 0 && (next.total === current.total || next.total === 0);
    if (sameScope && (next.completed < current.completed || next.total === 0 || next.blocksCompleted < current.blocksCompleted || next.decorationsCompleted < current.decorationsCompleted)) {
      this.onRegression?.();
      next = { ...current, status: current.status === 'complete' ? 'complete' : 'hydrating' };
    }
    this.progress = next;
    this.onPublish?.(next);
    for (const listener of this.listeners) listener(next);
  }
}
