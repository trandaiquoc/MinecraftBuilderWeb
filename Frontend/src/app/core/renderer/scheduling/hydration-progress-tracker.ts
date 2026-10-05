export type HydrationStatus = 'idle' | 'hydrating' | 'complete';
export type HydrationLane = 'initial' | 'local' | 'provider';

export interface HydrationProgressSnapshot {
  readonly generation: number;
  readonly status: HydrationStatus;
  readonly completed: number;
  readonly total: number;
  readonly blocksCompleted: number;
  readonly blocksTotal: number;
  readonly decorationsCompleted: number;
  readonly decorationsTotal: number;
  readonly percent: number;
  /** Structural hydration is the only lane shown by the global loading UI. */
  readonly lane?: HydrationLane;
}

type ProgressPart = 'block' | 'decoration';

const idleProgress = (generation: number): HydrationProgressSnapshot => ({
  generation,
  status: 'idle',
  completed: 0,
  total: 0,
  blocksCompleted: 0,
  blocksTotal: 0,
  decorationsCompleted: 0,
  decorationsTotal: 0,
  percent: 0,
  lane: 'initial',
});

/** Owns logical hydration accounting; scheduling and rendering stay elsewhere. */
export class HydrationProgressTracker {
  private readonly blockScope = new Set<string>();
  private readonly completedBlocks = new Set<string>();
  private readonly decorationScope = new Set<string>();
  private readonly completedDecorations = new Set<string>();
  private readonly listeners = new Set<(progress: HydrationProgressSnapshot) => void>();
  private progress: HydrationProgressSnapshot = idleProgress(0);
  private lane: HydrationLane = 'initial';

  constructor(
    private readonly onRegression?: () => void,
    private readonly onPublish?: (progress: HydrationProgressSnapshot) => void,
    private readonly canComplete: () => boolean = () => true,
  ) {}

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
  }

  setLane(lane: HydrationLane): void { this.lane = lane; }

  /** Adopt renderer-owned representations into a fresh generation. */
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

  addBlockKey(key: string): void {
    this.blockScope.add(key);
    this.completedBlocks.delete(key);
  }

  removeBlockKey(key: string): void {
    this.blockScope.delete(key);
    this.completedBlocks.delete(key);
  }

  hasBlockKey(key: string): boolean { return this.blockScope.has(key); }

  isBlockComplete(key: string): boolean { return this.completedBlocks.has(key); }

  setDecorationScope(ids: readonly string[]): void {
    const next = new Set(ids);
    for (const id of this.completedDecorations) if (!next.has(id)) this.completedDecorations.delete(id);
    this.decorationScope.clear();
    for (const id of next) this.decorationScope.add(id);
  }

  begin(generation: number): void {
    const blocksTotal = this.blockScope.size;
    const decorationsTotal = this.decorationScope.size;
    const total = blocksTotal + decorationsTotal;
    if (!total) {
      this.publish(idleProgress(generation));
      return;
    }
    const blocksCompleted = this.completedBlocks.size;
    const decorationsCompleted = this.completedDecorations.size;
    const completed = blocksCompleted + decorationsCompleted;
    if (completed >= total) {
      this.publish({ generation, status: this.canComplete() ? 'complete' : 'hydrating', completed: total, total, blocksCompleted: blocksTotal, blocksTotal, decorationsCompleted: decorationsTotal, decorationsTotal, percent: this.canComplete() ? 100 : 99.999, lane: this.lane });
      return;
    }
    this.publish({ generation, status: 'hydrating', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: completed / total * 100, lane: this.lane });
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
    if (completed >= total) {
      const complete = this.canComplete();
      this.publish({ generation, status: complete ? 'complete' : 'hydrating', completed: total, total, blocksCompleted: blocksTotal, blocksTotal, decorationsCompleted: decorationsTotal, decorationsTotal, percent: complete ? 100 : 99.999, lane: this.lane });
      return;
    }
    this.publish({ generation, status: 'hydrating', completed, total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: total ? completed / total * 100 : 0, lane: this.lane });
  }

  private publishCurrent(generation: number): void {
    const blocksTotal = this.blockScope.size;
    const decorationsTotal = this.decorationScope.size;
    const total = blocksTotal + decorationsTotal;
    const blocksCompleted = this.completedBlocks.size;
    const decorationsCompleted = this.completedDecorations.size;
    const completed = blocksCompleted + decorationsCompleted;
    if (!total) { this.publish(idleProgress(generation)); return; }
    const complete = completed >= total && this.canComplete();
    this.publish({ generation, status: complete ? 'complete' : 'hydrating', completed: Math.min(completed, total), total, blocksCompleted, blocksTotal, decorationsCompleted, decorationsTotal, percent: complete ? 100 : completed >= total ? 99.999 : completed / total * 100, lane: this.lane });
  }

  reset(generation: number): void {
    this.completedBlocks.clear();
    this.completedDecorations.clear();
    this.publish({ ...idleProgress(generation), lane: this.lane });
  }

  invalidate(kind: ProgressPart, key: string): void {
    (kind === 'block' ? this.completedBlocks : this.completedDecorations).delete(key);
  }

  clear(): void {
    this.blockScope.clear();
    this.completedBlocks.clear();
    this.decorationScope.clear();
    this.completedDecorations.clear();
  }

  publish(next: HydrationProgressSnapshot): void {
    const current = this.progress;
    if (sameProgress(current, next)) return;
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

function sameProgress(left: HydrationProgressSnapshot, right: HydrationProgressSnapshot): boolean {
  return left.generation === right.generation
    && left.status === right.status
    && left.completed === right.completed
    && left.total === right.total
    && left.blocksCompleted === right.blocksCompleted
    && left.blocksTotal === right.blocksTotal
    && left.decorationsCompleted === right.decorationsCompleted
    && left.decorationsTotal === right.decorationsTotal
    && left.percent === right.percent
    && left.lane === right.lane;
}
