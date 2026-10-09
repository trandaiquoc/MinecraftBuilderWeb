export type HydrationWorkKind = 'regular' | 'provider-refresh';

export interface HydrationWorkItem {
  readonly key: string;
  readonly token: number;
  readonly providerRefresh?: boolean;
}

export interface HydrationWorkCounts {
  readonly regularQueued: number;
  readonly providerRefreshQueued: number;
  readonly regularRunning: number;
  readonly providerRefreshRunning: number;
  readonly totalRunning: number;
}

interface QueuedWork<T> {
  readonly job: T;
  pending: boolean;
}

export interface HydrationWorkCoordinatorOptions {
  readonly concurrency: number;
  readonly regularReservedCapacity: number;
  readonly providerRefreshCapacity: number;
}

const DEFAULT_OPTIONS: HydrationWorkCoordinatorOptions = {
  concurrency: 6,
  regularReservedCapacity: 4,
  providerRefreshCapacity: 2,
};

/**
 * Owns regular/provider-refresh queue arbitration without knowing anything
 * about Three.js, projects, or visual creation. Regular hydration receives a
 * deterministic four-to-two share while both queues have work; idle capacity
 * is reused immediately when either queue is empty.
 */
export class HydrationWorkCoordinator<T extends HydrationWorkItem> {
  private regularQueue: QueuedWork<T>[] = [];
  private providerRefreshQueue: QueuedWork<T>[] = [];
  private regularHead = 0;
  private providerRefreshHead = 0;
  private regularQueuedCount = 0;
  private providerRefreshQueuedCount = 0;
  private readonly queuedByKey = new Map<string, Set<QueuedWork<T>>>();
  private readonly providerRefreshKeys = new Set<string>();
  private readonly runningProviderRefreshKeys = new Set<string>();
  private regularRunning = 0;
  private providerRefreshRunning = 0;
  private fairnessCursor = 0;
  private fairnessDeferralCount = 0;
  private readonly options: HydrationWorkCoordinatorOptions;
  private readonly fairnessPattern: readonly HydrationWorkKind[] = ['regular', 'regular', 'provider-refresh', 'regular', 'regular', 'provider-refresh'];

  constructor(options: Partial<HydrationWorkCoordinatorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  enqueueRegular(job: T): void { this.addQueued(this.regularQueue, { ...job, providerRefresh: false }, 'regular'); }

  enqueueProviderRefresh(job: T): boolean {
    if (this.providerRefreshKeys.has(job.key)) return false;
    this.providerRefreshKeys.add(job.key);
    this.addQueued(this.providerRefreshQueue, { ...job, providerRefresh: true }, 'provider-refresh');
    return true;
  }

  /** Removes pending work while leaving in-flight provider ownership intact. */
  retainPending(predicate: (job: T) => boolean): void {
    for (let index = this.regularHead; index < this.regularQueue.length; index += 1) {
      const queued = this.regularQueue[index];
      if (queued.pending && !predicate(queued.job)) this.removeQueued(queued, 'regular');
    }
    for (let index = this.providerRefreshHead; index < this.providerRefreshQueue.length; index += 1) {
      const queued = this.providerRefreshQueue[index];
      if (queued.pending && !predicate(queued.job)) this.removeQueued(queued, 'provider-refresh');
    }
    this.compact();
  }

  removePendingKeys(keys: ReadonlySet<string>): void {
    for (const key of keys) {
      const entries = this.queuedByKey.get(key);
      if (!entries) continue;
      for (const queued of entries) this.removeQueued(queued, queued.job.providerRefresh ? 'provider-refresh' : 'regular');
    }
  }

  /** Clears queued work; running jobs still complete and release their slots. */
  clearPending(): void {
    this.clearQueue(this.regularQueue, 'regular');
    this.clearQueue(this.providerRefreshQueue, 'provider-refresh');
  }

  /** Drops only provider-refresh work; regular hydration remains untouched. */
  clearPendingProviderRefresh(): void {
    this.clearQueue(this.providerRefreshQueue, 'provider-refresh');
  }

  compact(): void {
    if (this.regularHead > 0) { this.regularQueue = this.regularQueue.slice(this.regularHead); this.regularHead = 0; }
    if (this.providerRefreshHead > 0) { this.providerRefreshQueue = this.providerRefreshQueue.slice(this.providerRefreshHead); this.providerRefreshHead = 0; }
  }

  compactConsumed(): void {
    if (this.regularHead >= this.regularQueue.length) { this.regularQueue = []; this.regularHead = 0; }
    if (this.providerRefreshHead >= this.providerRefreshQueue.length) { this.providerRefreshQueue = []; this.providerRefreshHead = 0; }
  }

  regularJobs(): readonly T[] { return this.regularQueue.slice(this.regularHead).filter((queued) => queued.pending).map((queued) => queued.job); }

  replaceRegular(jobs: readonly T[]): void {
    this.clearQueue(this.regularQueue, 'regular');
    this.regularHead = 0;
    for (const job of jobs) this.addQueued(this.regularQueue, { ...job, providerRefresh: false }, 'regular');
  }

  /** Takes one valid job and reserves its typed running slot. */
  takeNext(token: number): T | undefined {
    while (this.hasPending()) {
      const kind = this.nextKind();
      const queued = kind === 'regular' ? this.regularQueue[this.regularHead++] : this.providerRefreshQueue[this.providerRefreshHead++];
      if (!queued?.pending) continue;
      const job = queued.job;
      this.removeQueued(queued, kind);
      if (job.token !== token) {
        if (job.providerRefresh) this.providerRefreshKeys.delete(job.key);
        continue;
      }
      if (kind === 'regular') this.regularRunning += 1;
      else { this.providerRefreshRunning += 1; this.providerRefreshKeys.add(job.key); this.runningProviderRefreshKeys.add(job.key); }
      return job;
    }
    return undefined;
  }

  complete(job: T): void {
    if (job.providerRefresh) {
      this.providerRefreshRunning = Math.max(0, this.providerRefreshRunning - 1);
      this.runningProviderRefreshKeys.delete(job.key);
      this.providerRefreshKeys.delete(job.key);
    } else this.regularRunning = Math.max(0, this.regularRunning - 1);
  }

  queuedRegular(): number { return this.regularQueuedCount; }
  queuedProviderRefresh(): number { return this.providerRefreshQueuedCount; }
  queuedTotal(): number { return this.queuedRegular() + this.queuedProviderRefresh(); }
  runningTotal(): number { return this.regularRunning + this.providerRefreshRunning; }
  canStart(): boolean { return this.runningTotal() < this.options.concurrency; }
  fairnessDeferrals(): number { return this.fairnessDeferralCount; }
  counts(): HydrationWorkCounts {
    return {
      regularQueued: this.queuedRegular(),
      providerRefreshQueued: this.queuedProviderRefresh(),
      regularRunning: this.regularRunning,
      providerRefreshRunning: this.providerRefreshRunning,
      totalRunning: this.runningTotal(),
    };
  }

  private hasPending(): boolean { return this.queuedTotal() > 0; }

  private addQueued(queue: QueuedWork<T>[], job: T, kind: HydrationWorkKind): void {
    const queued = { job, pending: true };
    queue.push(queued);
    const entries = this.queuedByKey.get(job.key) ?? new Set<QueuedWork<T>>();
    entries.add(queued);
    this.queuedByKey.set(job.key, entries);
    if (kind === 'regular') this.regularQueuedCount += 1;
    else this.providerRefreshQueuedCount += 1;
  }

  private removeQueued(queued: QueuedWork<T>, kind: HydrationWorkKind): void {
    if (!queued.pending) return;
    queued.pending = false;
    if (kind === 'regular') this.regularQueuedCount -= 1;
    else this.providerRefreshQueuedCount -= 1;
    const key = queued.job.key;
    const entries = this.queuedByKey.get(key);
    entries?.delete(queued);
    if (!entries?.size) this.queuedByKey.delete(key);
    if (kind === 'provider-refresh' && !this.runningProviderRefreshKeys.has(key)) this.providerRefreshKeys.delete(key);
  }

  private clearQueue(queue: QueuedWork<T>[], kind: HydrationWorkKind): void {
    for (const queued of queue) this.removeQueued(queued, kind);
    queue.length = 0;
    if (kind === 'regular') { this.regularHead = 0; this.regularQueuedCount = 0; }
    else { this.providerRefreshHead = 0; this.providerRefreshQueuedCount = 0; }
  }

  private nextKind(): HydrationWorkKind {
    const regularPending = this.queuedRegular() > 0;
    const providerPending = this.queuedProviderRefresh() > 0;
    if (!providerPending) return 'regular';
    if (!regularPending) return 'provider-refresh';

    const preferred = this.fairnessPattern[this.fairnessCursor++ % this.fairnessPattern.length];
    if (this.canStartKind(preferred)) return preferred;
    const alternate: HydrationWorkKind = preferred === 'regular' ? 'provider-refresh' : 'regular';
    if (this.canStartKind(alternate)) { this.fairnessDeferralCount += 1; return alternate; }
    return preferred;
  }

  private canStartKind(kind: HydrationWorkKind): boolean {
    if (kind === 'regular') return this.queuedRegular() > 0;
    if (!this.queuedProviderRefresh()) return false;
    const reserved = Math.min(this.options.regularReservedCapacity, this.options.concurrency);
    const refreshCapacity = this.queuedRegular() > 0
      ? Math.min(this.options.providerRefreshCapacity, this.options.concurrency - reserved)
      : this.options.concurrency;
    return this.providerRefreshRunning < refreshCapacity;
  }
}
