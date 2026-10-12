export interface HydrationSchedulerOptions {
  readonly requestMicrotask?: (callback: () => void) => void;
  readonly requestTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Generic queue/timer policy for progressive visual hydration. */
export class HydrationScheduler<T> {
  private queue: T[] = [];
  private head = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private scheduled = false;
  private generation = 0;
  private readonly requestMicrotask: (callback: () => void) => void;
  private readonly requestTimer: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;

  constructor(options: HydrationSchedulerOptions = {}) {
    this.requestMicrotask = options.requestMicrotask ?? ((callback) => queueMicrotask(callback));
    this.requestTimer = options.requestTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
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
    const execute = () => {
      this.scheduled = false;
      this.timer = undefined;
      run();
    };
    if (delay === undefined) this.requestMicrotask(execute);
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
}
