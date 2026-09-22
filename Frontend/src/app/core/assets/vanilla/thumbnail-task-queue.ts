export type ThumbnailTaskPriority = 'visible' | 'prefetch';

interface ThumbnailTask {
  readonly key: string;
  readonly priority: ThumbnailTaskPriority;
  readonly order: number;
  readonly run: () => Promise<void>;
}

/** Small, deduplicating queue for expensive browser thumbnail work. */
export class ThumbnailTaskQueue {
  private readonly pending = new Map<string, ThumbnailTask>();
  private readonly running = new Set<string>();
  private sequence = 0;

  constructor(readonly concurrency = 4) {}

  enqueue(key: string, priority: ThumbnailTaskPriority, run: () => Promise<void>): void {
    if (this.running.has(key)) return;
    const existing = this.pending.get(key);
    if (existing) {
      if (priority === 'visible' && existing.priority !== 'visible') this.pending.set(key, { ...existing, priority, run });
      return;
    }
    this.pending.set(key, { key, priority, order: this.sequence++, run });
    this.pump();
  }

  invalidate(): void { this.pending.clear(); }

  activeCount(): number { return this.running.size; }
  pendingCount(): number { return this.pending.size; }

  private pump(): void {
    while (this.running.size < this.concurrency && this.pending.size) {
      const task = [...this.pending.values()].sort((a, b) => Number(b.priority === 'visible') - Number(a.priority === 'visible') || a.order - b.order)[0];
      if (!task) return;
      this.pending.delete(task.key);
      this.running.add(task.key);
      void task.run().catch(() => undefined).finally(() => {
        this.running.delete(task.key);
        this.pump();
      });
    }
  }
}
