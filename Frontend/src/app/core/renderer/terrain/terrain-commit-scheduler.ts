export interface TerrainCommitSchedulerEvidence {
  readonly terrainCommitQueueDepth: number;
  readonly terrainCommitCount: number;
  readonly terrainCommitCpuMs: { readonly count: number; readonly p50: number; readonly p95: number; readonly max: number };
  readonly terrainCommitFrames: number;
  readonly terrainCommitBudgetExceededFrames: number;
}

interface CommitJob { readonly run: () => void; readonly priority: number; }

/** Main-thread commit queue. Geometry ownership is changed one chunk at a time. */
export class TerrainCommitScheduler {
  private readonly queue: CommitJob[] = [];
  private readonly samples: number[] = [];
  private scheduled = false;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private count = 0;
  private frames = 0;
  private budgetExceededFrames = 0;

  constructor(private readonly interactiveBudgetMs = 2, private readonly idleBudgetMs = 5, private readonly shouldYield: () => boolean = () => false) {}

  enqueue(run: () => void, priority = 0): void {
    if (this.disposed) return;
    this.queue.push({ run, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.schedule();
  }

  evidence(): TerrainCommitSchedulerEvidence {
    return { terrainCommitQueueDepth: this.queue.length, terrainCommitCount: this.count, terrainCommitCpuMs: summary(this.samples), terrainCommitFrames: this.frames, terrainCommitBudgetExceededFrames: this.budgetExceededFrames };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.length = 0;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.scheduled = false;
  }

  private schedule(): void {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    const run = () => { this.scheduled = false; this.flush(); };
    // A timer is intentionally used instead of owning a render-loop RAF. It
    // yields to camera/input work and remains deterministic in test runners.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      run();
    }, this.shouldYield() ? 16 : 0);
  }

  private flush(): void {
    if (this.disposed || !this.queue.length) return;
    this.frames += 1;
    const started = now();
    const budget = this.shouldYield() || this.queue[0]?.priority ? this.interactiveBudgetMs : this.idleBudgetMs;
    while (this.queue.length && now() - started < budget) {
      const job = this.queue.shift()!;
      const jobStarted = now();
      job.run();
      this.samples.push(Math.max(0, now() - jobStarted));
      if (this.samples.length > 256) this.samples.shift();
      this.count += 1;
    }
    if (this.queue.length && now() - started >= budget) this.budgetExceededFrames += 1;
    if (this.queue.length) this.schedule();
  }
}

function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
function summary(values: readonly number[]): { count: number; p50: number; p95: number; max: number } {
  if (!values.length) return { count: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)], max: sorted.at(-1)! };
}
