export interface TraceDurationSummary {
  readonly observedCount: number;
  readonly storedSampleCount: number;
  readonly droppedSampleCount: number;
  readonly totalMs: number;
  readonly minMs?: number;
  readonly maxMs?: number;
  readonly p50Ms?: number;
  readonly p95Ms?: number;
}

export class BoundedTraceBuffer<T> {
  private readonly values: T[] = [];
  private start = 0;
  private dropped = 0;
  constructor(readonly capacity: number) {}
  push(value: T): void {
    if (this.capacity <= 0) { this.dropped += 1; return; }
    if (this.values.length < this.capacity) this.values.push(value);
    else { this.values[this.start] = value; this.start = (this.start + 1) % this.capacity; this.dropped += 1; }
  }
  toArray(): readonly T[] {
    if (this.values.length <= 1 || this.start === 0) return [...this.values];
    return Array.from({ length: this.values.length }, (_, index) => this.values[(this.start + index) % this.values.length]);
  }
  get droppedCount(): number { return this.dropped; }
  get length(): number { return this.values.length; }
  clear(): void { this.values.length = 0; this.start = 0; this.dropped = 0; }
}

export class TraceNumericAccumulator {
  readonly samples = new BoundedTraceBuffer<number>(256);
  observedCount = 0;
  total = 0;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;

  add(value: number): void {
    if (!Number.isFinite(value)) return;
    this.observedCount += 1;
    this.total += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    this.samples.push(value);
  }

  summary(): TraceDurationSummary {
    const values = this.samples.toArray();
    return {
      observedCount: this.observedCount,
      storedSampleCount: values.length,
      droppedSampleCount: this.samples.droppedCount,
      totalMs: this.total,
      minMs: Number.isFinite(this.min) ? this.min : undefined,
      maxMs: Number.isFinite(this.max) ? this.max : undefined,
      p50Ms: percentile(values, .5),
      p95Ms: percentile(values, .95),
    };
  }

  reset(): void {
    this.observedCount = 0;
    this.total = 0;
    this.min = Number.POSITIVE_INFINITY;
    this.max = Number.NEGATIVE_INFINITY;
    this.samples.clear();
  }
}

export function percentile(values: readonly number[], percentileValue: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const p = Math.min(1, Math.max(0, percentileValue));
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
