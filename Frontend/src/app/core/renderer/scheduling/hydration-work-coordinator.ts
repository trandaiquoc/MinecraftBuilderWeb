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
  private regularQueue: T[] = [];
  private providerRefreshQueue: T[] = [];
  private regularHead = 0;
  private providerRefreshHead = 0;
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

  enqueueRegular(job: T): void { this.regularQueue.push({ ...job, providerRefresh: false }); }

  enqueueProviderRefresh(job: T): boolean {
    if (this.providerRefreshKeys.has(job.key)) return false;
    this.providerRefreshKeys.add(job.key);
    this.providerRefreshQueue.push({ ...job, providerRefresh: true });
    return true;
  }

  /** Removes pending work while leaving in-flight provider ownership intact. */
  retainPending(predicate: (job: T) => boolean): void {
    this.regularQueue = this.regularQueue.slice(this.regularHead).filter(predicate);
    this.providerRefreshQueue = this.providerRefreshQueue.slice(this.providerRefreshHead).filter(predicate);
    this.regularHead = 0;
    this.providerRefreshHead = 0;
    for (const key of [...this.providerRefreshKeys]) {
      const pending = this.providerRefreshQueue.some((job) => job.key === key);
      if (!pending && !this.runningProviderRefreshKeys.has(key)) this.providerRefreshKeys.delete(key);
    }
  }

  removePendingKeys(keys: ReadonlySet<string>): void { this.retainPending((job) => !keys.has(job.key)); }

  /** Clears queued work; running jobs still complete and release their slots. */
  clearPending(): void {
    this.regularQueue = [];
    this.providerRefreshQueue = [];
    this.regularHead = 0;
    this.providerRefreshHead = 0;
    for (const key of [...this.providerRefreshKeys]) if (!this.runningProviderRefreshKeys.has(key)) this.providerRefreshKeys.delete(key);
  }

  compact(): void {
    if (this.regularHead > 0) { this.regularQueue = this.regularQueue.slice(this.regularHead); this.regularHead = 0; }
    if (this.providerRefreshHead > 0) { this.providerRefreshQueue = this.providerRefreshQueue.slice(this.providerRefreshHead); this.providerRefreshHead = 0; }
  }

  compactConsumed(): void {
    if (this.regularHead >= this.regularQueue.length) { this.regularQueue = []; this.regularHead = 0; }
    if (this.providerRefreshHead >= this.providerRefreshQueue.length) { this.providerRefreshQueue = []; this.providerRefreshHead = 0; }
  }

  regularJobs(): readonly T[] { return this.regularQueue.slice(this.regularHead); }

  replaceRegular(jobs: readonly T[]): void {
    this.regularQueue = jobs.map((job) => ({ ...job, providerRefresh: false }));
    this.regularHead = 0;
  }

  /** Takes one valid job and reserves its typed running slot. */
  takeNext(token: number): T | undefined {
    while (this.hasPending()) {
      const kind = this.nextKind();
      const job = kind === 'regular' ? this.regularQueue[this.regularHead++] : this.providerRefreshQueue[this.providerRefreshHead++];
      if (!job) continue;
      if (job.token !== token) {
        if (job.providerRefresh) this.providerRefreshKeys.delete(job.key);
        continue;
      }
      if (kind === 'regular') this.regularRunning += 1;
      else { this.providerRefreshRunning += 1; this.runningProviderRefreshKeys.add(job.key); }
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

  queuedRegular(): number { return this.regularQueue.length - this.regularHead; }
  queuedProviderRefresh(): number { return this.providerRefreshQueue.length - this.providerRefreshHead; }
  queuedTotal(): number { return this.queuedRegular() + this.queuedProviderRefresh(); }
  runningTotal(): number { return this.regularRunning + this.providerRefreshRunning; }
  canStart(): boolean { return this.runningTotal() < this.options.concurrency; }
  fairnessDeferrals(): number { return this.fairnessDeferralCount; }
  providerRefreshJobs(): readonly T[] { return this.providerRefreshQueue.slice(this.providerRefreshHead); }

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
