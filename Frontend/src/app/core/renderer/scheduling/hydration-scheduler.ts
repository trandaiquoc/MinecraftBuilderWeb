export interface HydrationSchedulerOptions {
  readonly requestMicrotask?: (callback: () => void) => void;
  /** A real browser-yield boundary used between progressive hydration slices. */
  readonly requestYield?: (callback: () => void) => void;
  readonly requestTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface HydrationSchedulerMetrics {
  readonly scheduledRuns: number;
  readonly yieldCount: number;
  readonly maxConsecutiveRunsWithoutYield: number;
}

/** Generic queue/timer policy for progressive visual hydration. */
export class HydrationScheduler<T> {
  private queue: T[] = [];
  private head = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private scheduled = false;
  private generation = 0;
  private readonly requestYield: (callback: () => void) => void;
  private readonly requestTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  private scheduledRuns = 0;
  private yieldCount = 0;
  private consecutiveRunsWithoutYield = 0;
  private maxConsecutiveRunsWithoutYield = 0;
  private readonly yieldIsMicrotask: boolean;
  private readonly requestMicrotask: (callback: () => void) => void;
  private readonly hasExplicitYieldBoundary: boolean;
  private startedSinceCancel = false;
  private microtaskRunsSinceYield = 0;

  constructor(options: HydrationSchedulerOptions = {}) {
    this.requestTimer = options.requestTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.requestMicrotask = options.requestMicrotask ?? ((callback) => queueMicrotask(callback));
    this.hasExplicitYieldBoundary = !!options.requestYield;
    this.requestYield = options.requestYield ?? (options.requestMicrotask ?? ((callback) => this.requestTimer(callback, 0)));
    this.yieldIsMicrotask = !options.requestYield && !!options.requestMicrotask;
  }

  enqueue(items: readonly T[]): void {
    this.queue.push(...items);
  }

  dequeue(): T | undefined {
    if (this.head >= this.queue.length) return undefined;
    return this.queue[this.head++];
  }

  clearQueue(): void {
    this.queue = [];
    this.head = 0;
  }

  compact(): void {
    if (this.head === 0) return;
    if (this.head >= this.queue.length) this.clearQueue();
    else {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }
  }

  queued(): number {
    return this.queue.length - this.head;
  }

  schedule(run: () => void, delay?: number): boolean {
    if (this.scheduled) return false;
    this.scheduled = true;
    this.scheduledRuns += 1;
    const useMicrotaskBurst = delay === undefined && !this.yieldIsMicrotask && !this.hasExplicitYieldBoundary && this.microtaskRunsSinceYield < 3;
    const isYield = !this.yieldIsMicrotask && !useMicrotaskBurst && (delay === undefined || delay >= 0);
    if (isYield) {
      this.yieldCount += 1;
      this.consecutiveRunsWithoutYield = 0;
    } else {
      this.consecutiveRunsWithoutYield += 1;
      this.maxConsecutiveRunsWithoutYield = Math.max(this.maxConsecutiveRunsWithoutYield, this.consecutiveRunsWithoutYield);
    }
    const execute = () => {
      this.scheduled = false;
      this.timer = undefined;
      run();
    };
    if (delay === undefined) {
      this.startedSinceCancel = true;
      if (useMicrotaskBurst) {
        this.microtaskRunsSinceYield += 1;
        this.requestMicrotask(execute);
      } else {
        this.microtaskRunsSinceYield = 0;
        this.requestYield(execute);
      }
    }
    else this.timer = this.requestTimer(execute, delay);
    return true;
  }

  reschedule(run: () => void, delay: number): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    this.scheduled = false;
    this.schedule(run, delay);
  }

  cancel(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    this.scheduled = false;
    this.clearQueue();
    this.startedSinceCancel = false;
    this.microtaskRunsSinceYield = 0;
    this.generation += 1;
  }

  nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get isScheduled(): boolean {
    return this.scheduled;
  }

  get timerActive(): boolean {
    return this.timer !== undefined;
  }

  metrics(): HydrationSchedulerMetrics {
    return { scheduledRuns: this.scheduledRuns, yieldCount: this.yieldCount, maxConsecutiveRunsWithoutYield: this.maxConsecutiveRunsWithoutYield };
  }
}
