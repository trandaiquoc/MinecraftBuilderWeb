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

interface TraceStatisticsSample {
  readonly counters?: object;
  readonly hydration?: Readonly<Record<string, unknown>>;
  readonly build?: Readonly<Record<string, unknown>>;
  readonly render?: Readonly<Record<string, unknown>>;
  readonly camera?: {
    readonly distance: number;
    readonly offset: { readonly x: number; readonly y: number; readonly z: number };
    readonly direction: { readonly x: number; readonly y: number; readonly z: number };
    readonly quaternion: readonly [number, number, number, number];
  };
}

/** Owns mutable per-run metric aggregation; recording cadence and buffers stay with the recorder. */
export class ViewportTraceStatistics {
  readonly durationAggregates = new Map<string, TraceNumericAccumulator>();
  readonly heartbeatIntervals = new BoundedTraceBuffer<number>(512);
  readonly heartbeatAggregate = new TraceNumericAccumulator();
  heartbeatOver16_7 = 0;
  heartbeatOver33 = 0;
  heartbeatOver50 = 0;
  heartbeatOver100 = 0;
  heartbeatOver250 = 0;
  readonly longTaskAggregate = new TraceNumericAccumulator();
  hydrationAggregate = emptyHydrationAggregate();
  cameraAggregate = emptyCameraAggregate();
  renderAggregate = emptyRenderAggregate();
  readonly lightSampleAggregate = new TraceNumericAccumulator();
  readonly heavyCheckpointAggregate = new TraceNumericAccumulator();
  firstCounters?: Readonly<Record<string, unknown>>;
  lastCounters?: Readonly<Record<string, unknown>>;

  reset(): void {
    this.durationAggregates.clear(); this.heartbeatIntervals.clear(); this.heartbeatAggregate.reset();
    this.heartbeatOver16_7 = 0; this.heartbeatOver33 = 0; this.heartbeatOver50 = 0; this.heartbeatOver100 = 0; this.heartbeatOver250 = 0;
    this.longTaskAggregate.reset(); this.hydrationAggregate = emptyHydrationAggregate(); this.cameraAggregate = emptyCameraAggregate();
    this.renderAggregate = emptyRenderAggregate(); this.lightSampleAggregate.reset(); this.heavyCheckpointAggregate.reset();
    this.firstCounters = undefined; this.lastCounters = undefined;
  }

  recordHydrationProgress(previous: { readonly completed?: number } | undefined, next: { readonly completed?: number; readonly generation?: unknown }): boolean {
    let regressed = false;
    if (next.completed !== undefined) {
      if (this.hydrationAggregate.startCompleted === undefined) this.hydrationAggregate.startCompleted = next.completed;
      if (previous?.completed !== undefined && next.completed < previous.completed) { this.hydrationAggregate.regressions += 1; regressed = true; }
      if (this.hydrationAggregate.latestCompleted === undefined || next.completed >= this.hydrationAggregate.latestCompleted) this.hydrationAggregate.latestCompleted = next.completed;
    }
    const generation = numeric(next.generation);
    this.hydrationAggregate.generationStart ??= generation;
    this.hydrationAggregate.generationEnd = generation;
    return regressed;
  }

  recordSample(sample: TraceStatisticsSample, previous: TraceStatisticsSample | undefined, hydrationProgressObserved: boolean): void {
    const counters = { ...((sample.counters ?? {}) as Readonly<Record<string, unknown>>) };
    this.firstCounters ??= counters; this.lastCounters = counters;
    const hydrationCompleted = numeric(sample.hydration?.['completed']);
    if (hydrationCompleted !== undefined) {
      if (this.hydrationAggregate.startCompleted === undefined) this.hydrationAggregate.startCompleted = hydrationCompleted;
      if (this.hydrationAggregate.latestCompleted === undefined || hydrationCompleted >= this.hydrationAggregate.latestCompleted) this.hydrationAggregate.latestCompleted = hydrationCompleted;
      else if (!hydrationProgressObserved) this.hydrationAggregate.regressions += 1;
    }
    const generation = numeric(sample.hydration?.['generation']); this.hydrationAggregate.generationStart ??= generation; this.hydrationAggregate.generationEnd = generation;
    if (sample.camera) {
      const distance = sample.camera.distance; this.cameraAggregate.startDistance ??= distance; this.cameraAggregate.endDistance = distance; this.cameraAggregate.minDistance = Math.min(this.cameraAggregate.minDistance, distance); this.cameraAggregate.maxDistance = Math.max(this.cameraAggregate.maxDistance, distance);
      if (previous?.camera) { this.cameraAggregate.maxOffsetDrift = Math.max(this.cameraAggregate.maxOffsetDrift, distance3(previous.camera.offset, sample.camera.offset)); this.cameraAggregate.maxDirectionDriftDegrees = Math.max(this.cameraAggregate.maxDirectionDriftDegrees, angleDegrees(previous.camera.direction, sample.camera.direction)); this.cameraAggregate.maxQuaternionDriftDegrees = Math.max(this.cameraAggregate.maxQuaternionDriftDegrees, quaternionAngle(previous.camera.quaternion, sample.camera.quaternion)); }
    }
    const effective = numeric(sample.build?.['effectiveMovementSpeed']); if (effective !== undefined) { this.cameraAggregate.effectiveMin = Math.min(this.cameraAggregate.effectiveMin, effective); this.cameraAggregate.effectiveMax = Math.max(this.cameraAggregate.effectiveMax, effective); }
    const renderCpu = numeric(sample.render?.['renderCpuMs']); if (renderCpu !== undefined) this.renderAggregate.renderCpu.add(renderCpu);
    const draws = numeric(sample.render?.['drawCalls']); if (draws !== undefined) this.renderAggregate.draws.add(draws);
    const triangles = numeric(sample.render?.['triangles']); if (triangles !== undefined) this.renderAggregate.triangles.add(triangles);
  }

  recordDuration(stage: string, durationMs: number): void {
    let aggregate = this.durationAggregates.get(stage);
    if (!aggregate) { aggregate = new TraceNumericAccumulator(); this.durationAggregates.set(stage, aggregate); }
    aggregate.add(Math.max(0, durationMs));
  }

  recordSampleDuration(kind: 'light' | 'heavy', durationMs: number): void {
    (kind === 'heavy' ? this.heavyCheckpointAggregate : this.lightSampleAggregate).add(durationMs);
  }

  recordHeartbeat(intervalMs: number): void {
    const value = Math.max(0, intervalMs); this.heartbeatAggregate.add(value); this.heartbeatIntervals.push(value);
    if (value > 16.7) this.heartbeatOver16_7 += 1; if (value > 33) this.heartbeatOver33 += 1; if (value > 50) this.heartbeatOver50 += 1; if (value > 100) this.heartbeatOver100 += 1; if (value > 250) this.heartbeatOver250 += 1;
  }
}

function emptyHydrationAggregate() { return { startCompleted: undefined as number | undefined, latestCompleted: undefined as number | undefined, generationStart: undefined as number | undefined, generationEnd: undefined as number | undefined, regressions: 0 }; }
function emptyCameraAggregate() { return { startDistance: undefined as number | undefined, endDistance: undefined as number | undefined, minDistance: Number.POSITIVE_INFINITY, maxDistance: Number.NEGATIVE_INFINITY, maxOffsetDrift: 0, maxDirectionDriftDegrees: 0, maxQuaternionDriftDegrees: 0, effectiveMin: Number.POSITIVE_INFINITY, effectiveMax: Number.NEGATIVE_INFINITY }; }
function emptyRenderAggregate() { return { renderCpu: new TraceNumericAccumulator(), draws: new TraceNumericAccumulator(), triangles: new TraceNumericAccumulator() }; }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function distance3(a: { readonly x: number; readonly y: number; readonly z: number }, b: { readonly x: number; readonly y: number; readonly z: number }): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function angleDegrees(a: { readonly x: number; readonly y: number; readonly z: number }, b: { readonly x: number; readonly y: number; readonly z: number }): number { const al = Math.hypot(a.x, a.y, a.z); const bl = Math.hypot(b.x, b.y, b.z); if (!al || !bl) return 0; return Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (al * bl)))) * 180 / Math.PI; }
function quaternionAngle(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): number { return Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 2 * 180 / Math.PI; }

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
