import type { RendererCounters } from '../engine/renderer-diagnostics';

export interface TraceVector3 { readonly x: number; readonly y: number; readonly z: number; }

export interface ViewportTraceSample {
  readonly camera?: {
    readonly position: TraceVector3;
    readonly target: TraceVector3;
    readonly offset: TraceVector3;
    readonly distance: number;
    readonly direction: TraceVector3;
    readonly quaternion: readonly [number, number, number, number];
    readonly up: TraceVector3;
    readonly fov: number;
    readonly aspect: number;
  };
  readonly dpr?: Readonly<Record<string, unknown>>;
  readonly hydration?: Readonly<Record<string, unknown>>;
  readonly counters?: RendererCounters | Readonly<Record<string, number>>;
  readonly render?: Readonly<Record<string, unknown>>;
  readonly generations?: Readonly<Record<string, unknown>>;
  readonly terrain?: Readonly<Record<string, unknown>>;
  readonly build?: Readonly<Record<string, unknown>>;
}

export interface ViewportTraceMetadata { readonly [key: string]: unknown; }

export interface ViewportTraceHooks {
  readonly metadata: () => ViewportTraceMetadata;
  readonly sample: () => ViewportTraceSample;
}

export interface ViewportRuntimeTraceApi {
  start(scenario?: string): void;
  mark(label: string): void;
  stop(): ViewportTraceDocument | undefined;
  download(): void;
  stopAndDownload(): ViewportTraceDocument | undefined;
}

export interface ViewportTraceEvent {
  readonly t: number;
  readonly type: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ViewportTraceDocument {
  readonly schema: 'minecraftbuilder.viewport-trace.v1';
  readonly scenario: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly metadata: ViewportTraceMetadata;
  readonly timeline: readonly ViewportTraceEvent[];
  readonly samples: readonly (ViewportTraceSample & { readonly t: number; readonly reason: string })[];
  readonly longTasks: readonly { readonly t: number; readonly durationMs: number }[];
  readonly memory: readonly { readonly t: number; readonly usedJSHeapSize: number; readonly totalJSHeapSize: number; readonly jsHeapSizeLimit: number }[];
  readonly summary: ViewportTraceSummary;
  readonly droppedEventCount: number;
}

export interface ViewportTraceSummary {
  readonly durationMs: number;
  readonly hydration: { readonly startCompleted: number; readonly endCompleted: number; readonly deltaCompleted: number; readonly blocksPerSecond: number; readonly generationStart?: number; readonly generationEnd?: number; readonly progressRegressionCount: number };
  readonly camera: { readonly startDistance?: number; readonly endDistance?: number; readonly minDistance?: number; readonly maxDistance?: number; readonly maxOffsetDrift: number; readonly maxDirectionDriftDegrees: number; readonly maxQuaternionDriftDegrees: number; readonly effectiveMovementSpeedMin?: number; readonly effectiveMovementSpeedMax?: number };
  readonly render: { readonly actualSceneRendersDelta: number; readonly renderRequestsDelta: number; readonly coalescedDelta: number; readonly drawCallsMin?: number; readonly drawCallsMax?: number; readonly trianglesMin?: number; readonly trianglesMax?: number; readonly renderCpuP50?: number; readonly renderCpuP95?: number; readonly renderCpuMax?: number };
  readonly responsiveness: { readonly heartbeatSamples: number; readonly approximateFps: number; readonly frameIntervalP50?: number; readonly frameIntervalP95?: number; readonly frameIntervalP99?: number; readonly maxFrameInterval?: number; readonly framesOver16_7ms: number; readonly framesOver33ms: number; readonly framesOver50ms: number; readonly framesOver100ms: number; readonly framesOver250ms: number; readonly longTaskObserverSupported: boolean; readonly longTaskCount: number; readonly longTaskTotalMs: number; readonly longTaskMaxMs?: number; readonly longTaskP95Ms?: number };
  readonly build: Readonly<Record<string, unknown>>;
  readonly anomalies: readonly ViewportTraceAnomaly[];
}

export interface ViewportTraceAnomaly {
  readonly type: string;
  readonly t: number;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly stack?: string;
}

export class BoundedTraceBuffer<T> {
  private readonly values: T[] = [];
  private dropped = 0;
  constructor(readonly capacity: number) {}
  push(value: T): void { if (this.capacity <= 0) { this.dropped += 1; return; } if (this.values.length >= this.capacity) { this.values.shift(); this.dropped += 1; } this.values.push(value); }
  toArray(): readonly T[] { return [...this.values]; }
  get droppedCount(): number { return this.dropped; }
  get length(): number { return this.values.length; }
  clear(): void { this.values.length = 0; this.dropped = 0; }
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

export function sanitizeTraceScenario(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return normalized || 'trace';
}

export function viewportTraceFilename(scenario: string, date = new Date()): string {
  const iso = date.toISOString().replace(/[:.]/g, '-');
  return `minecraftbuilder-viewport-trace-${sanitizeTraceScenario(scenario)}-${iso}.json`;
}

export function stableTraceJson(value: unknown): string {
  return JSON.stringify(sortTraceValue(value), undefined, 2);
}

function sortTraceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortTraceValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sortTraceValue(entry)]));
}

export class ViewportRuntimeTrace {
  private readonly events = new BoundedTraceBuffer<ViewportTraceEvent>(2000);
  private readonly samples = new BoundedTraceBuffer<ViewportTraceSample & { readonly t: number; readonly reason: string }>(1000);
  private readonly longTasks = new BoundedTraceBuffer<{ readonly t: number; readonly durationMs: number }>(256);
  private readonly memory = new BoundedTraceBuffer<{ readonly t: number; readonly usedJSHeapSize: number; readonly totalJSHeapSize: number; readonly jsHeapSizeLimit: number }>(8);
  private readonly durationSamples = new Map<string, BoundedTraceBuffer<number>>();
  private readonly anomalies = new BoundedTraceBuffer<ViewportTraceAnomaly>(128);
  private readonly hooks: ViewportTraceHooks;
  private active = false;
  private scenario = 'trace';
  private startPerf = 0;
  private startedAt = '';
  private lastSample?: ViewportTraceSample;
  private lastSampleTime = 0;
  private interval?: ReturnType<typeof setInterval>;
  private heartbeatFrame?: number;
  private lastHeartbeat = 0;
  private observer?: PerformanceObserver;
  private longTaskObserverSupported = false;
  private firstGestureCaptured = false;
  private cameraOnlyActive = false;
  private readonly movementActions = new Set<string>();
  private firstGestureTimer?: ReturnType<typeof setTimeout>;
  private firstGestureEndTimer?: ReturnType<typeof setTimeout>;
  private document?: ViewportTraceDocument;

  constructor(hooks: ViewportTraceHooks) { this.hooks = hooks; }

  getApi(): ViewportRuntimeTraceApi {
    return { start: (scenario) => this.start(scenario), mark: (label) => this.mark(label), stop: () => this.stop(), download: () => this.download(), stopAndDownload: () => this.stopAndDownload() };
  }

  get isActive(): boolean { return this.active; }

  start(scenario = 'trace'): void {
    if (this.active) this.stop();
    this.active = true;
    this.document = undefined;
    this.scenario = sanitizeTraceScenario(scenario);
    this.startPerf = now();
    this.startedAt = new Date().toISOString();
    this.events.clear(); this.samples.clear(); this.longTasks.clear(); this.memory.clear(); this.anomalies.clear(); this.durationSamples.clear();
    this.lastSample = undefined; this.lastSampleTime = 0; this.firstGestureCaptured = false; this.cameraOnlyActive = false; this.longTaskObserverSupported = false; this.movementActions.clear();
    this.events.push({ t: 0, type: 'trace-start', payload: { scenario: this.scenario } });
    this.captureSample('start');
    this.captureMemory();
    this.interval = setInterval(() => this.captureSample('interval'), 50);
    this.startHeartbeat();
    this.observeLongTasks();
  }

  mark(label: string): void { if (!this.active) return; this.events.push({ t: this.elapsed(), type: 'mark', payload: { label: label.slice(0, 120) } }); this.captureSample(`mark:${label.slice(0, 40)}`); }

  record(type: string, payload?: Readonly<Record<string, unknown>>): void {
    if (!this.active) return;
    const t = this.elapsed();
    this.events.push({ t, type, ...(payload ? { payload } : {}) });
    if (type === 'controls-start' || type === 'movement-keydown' || type === 'movement-frame' || type === 'wheel') this.cameraOnlyActive = true;
    if (type === 'movement-keydown' && typeof payload?.['action'] === 'string') this.movementActions.add(payload['action']);
    if (type === 'movement-keyup' && typeof payload?.['action'] === 'string') this.movementActions.delete(payload['action']);
    if (type === 'controls-end' || type === 'movement-keyup' && !this.movementActions.size) this.cameraOnlyActive = false;
    this.captureSample(`event:${type}`);
    if (type === 'controls-start' && !this.firstGestureCaptured) {
      this.firstGestureCaptured = true;
      this.events.push({ t, type: 'first-gesture-before' });
      this.firstGestureTimer = setTimeout(() => { if (this.active) this.captureSample('first-gesture-100ms'); }, 100);
    }
    if (type === 'controls-end' && this.firstGestureCaptured) this.firstGestureEndTimer = setTimeout(() => { if (this.active) this.captureSample('first-gesture-250ms'); }, 250);
  }

  recordDuration(stage: string, durationMs: number): void {
    if (!this.active || !Number.isFinite(durationMs)) return;
    let buffer = this.durationSamples.get(stage);
    if (!buffer) { buffer = new BoundedTraceBuffer<number>(256); this.durationSamples.set(stage, buffer); }
    buffer.push(Math.max(0, durationMs));
  }

  captureSample(reason = 'manual'): void {
    if (!this.active) return;
    let sample: ViewportTraceSample;
    try { sample = this.hooks.sample(); } catch { return; }
    const t = this.elapsed();
    this.samples.push({ ...sample, t, reason });
    this.detectAnomalies(sample, t);
    this.lastSample = sample;
    this.lastSampleTime = t;
  }

  stop(): ViewportTraceDocument | undefined {
    if (!this.active && !this.document) return undefined;
    if (this.active) {
      this.captureSample('stop');
      this.captureMemory();
      this.active = false;
      if (this.interval !== undefined) clearInterval(this.interval);
      this.interval = undefined;
      if (this.heartbeatFrame !== undefined) cancelFrame(this.heartbeatFrame);
      this.heartbeatFrame = undefined;
      if (this.firstGestureTimer !== undefined) clearTimeout(this.firstGestureTimer);
      this.firstGestureTimer = undefined;
      if (this.firstGestureEndTimer !== undefined) clearTimeout(this.firstGestureEndTimer);
      this.firstGestureEndTimer = undefined;
      this.observer?.disconnect(); this.observer = undefined;
      const endedAt = new Date().toISOString();
      const durationMs = Math.max(0, now() - this.startPerf);
      this.events.push({ t: durationMs, type: 'trace-stop' });
      this.document = this.buildDocument(endedAt, durationMs);
    }
    return this.document;
  }

  download(): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return;
    const trace = this.document ?? this.stop();
    if (!trace) return;
    const blob = new Blob([stableTraceJson(trace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = viewportTraceFilename(trace.scenario, new Date(trace.startedAt)); anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  stopAndDownload(): ViewportTraceDocument | undefined { const trace = this.stop(); this.download(); return trace; }

  private elapsed(): number { return Math.max(0, now() - this.startPerf); }
  private startHeartbeat(): void {
    const beat = (timestamp: number) => {
      if (!this.active) return;
      if (this.lastHeartbeat > 0) this.recordHeartbeat(timestamp - this.lastHeartbeat);
      this.lastHeartbeat = timestamp;
      this.heartbeatFrame = requestFrame(beat);
    };
    this.lastHeartbeat = 0;
    this.heartbeatFrame = requestFrame(beat);
  }
  private recordHeartbeat(intervalMs: number): void {
    // Heartbeat intervals are represented as bounded synthetic samples so the
    // same deterministic summary path can consume them without a second hot loop.
    this.events.push({ t: this.elapsed(), type: 'heartbeat', payload: { intervalMs: Math.max(0, intervalMs) } });
  }
  private observeLongTasks(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    this.longTaskObserverSupported = true;
    try {
      this.observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) this.longTasks.push({ t: Math.max(0, entry.startTime - this.startPerf), durationMs: entry.duration }); });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch { this.observer = undefined; this.longTaskObserverSupported = false; }
  }
  private captureMemory(): void {
    const memory = (typeof performance !== 'undefined' ? (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory : undefined);
    if (memory) this.memory.push({ t: this.elapsed(), usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit });
  }
  private detectAnomalies(sample: ViewportTraceSample, t: number): void {
    const before = this.lastSample;
    if (!before) return;
    const hydrationBefore = numeric(before.hydration?.['completed']);
    const hydrationAfter = numeric(sample.hydration?.['completed']);
    if (hydrationBefore !== undefined && hydrationAfter !== undefined && hydrationAfter < hydrationBefore) this.anomaly('progress-regression', t, { before: hydrationBefore, after: hydrationAfter });
    const generationBefore = numeric(before.hydration?.['generation']);
    const generationAfter = numeric(sample.hydration?.['generation']);
    const cameraOnly = this.isCameraOnlyWindow();
    if (generationBefore !== undefined && generationAfter !== undefined && generationAfter !== generationBefore) this.anomaly(cameraOnly ? 'generation-changed-during-camera-only' : 'hydration-generation-change', t, { before: generationBefore, after: generationAfter });
    const providerBefore = numeric(before.generations?.['providerGeneration']);
    const providerAfter = numeric(sample.generations?.['providerGeneration']);
    if (providerBefore !== undefined && providerAfter !== undefined && providerAfter !== providerBefore) this.anomaly(cameraOnly ? 'provider-generation-changed-during-camera-only' : 'provider-generation-change', t, { before: providerBefore, after: providerAfter });
    const countersBefore = (before.counters ?? {}) as Readonly<Record<string, unknown>>;
    const countersAfter = (sample.counters ?? {}) as Readonly<Record<string, unknown>>;
    for (const [key, type] of [['structuralReconciles', 'full-reconcile-during-camera-only'], ['fullSceneRebuilds', 'full-scene-rebuild-during-camera-only'], ['terrainBulkBatches', 'terrain-bulk-rebuild-during-camera-only']] as const) {
      if (cameraOnly && numeric(countersAfter[key])! > numeric(countersBefore[key])!) this.anomaly(type, t, { delta: numeric(countersAfter[key])! - numeric(countersBefore[key])! });
    }
    const rendersDelta = (numeric(countersAfter['actualSceneRenders']) ?? 0) - (numeric(countersBefore['actualSceneRenders']) ?? 0);
    const requestsDelta = (numeric(countersAfter['cameraRenderRequests']) ?? 0) - (numeric(countersBefore['cameraRenderRequests']) ?? 0);
    if (rendersDelta > Math.max(3, requestsDelta + 1)) this.anomaly('duplicate-render-burst', t, { rendersDelta, requestsDelta });
    if (cameraOnly && this.movementActions.size > 0 && before.camera && sample.camera) {
      const offsetDrift = distance3(before.camera.offset, sample.camera.offset);
      const directionDrift = angleDegrees(before.camera.direction, sample.camera.direction);
      if (offsetDrift > 0.01) this.anomaly('camera-offset-drift-during-translation', t, { offsetDrift });
      if (directionDrift > 0.1) this.anomaly('camera-direction-drift-during-translation', t, { directionDriftDegrees: directionDrift });
    }
    const frameDuration = numeric(sample.render?.['frameDurationMs']);
    if (frameDuration !== undefined && frameDuration > 100) this.anomaly('frame-stall-over-100ms', t, { frameDurationMs: frameDuration });
  }
  private isCameraOnlyWindow(): boolean {
    return this.cameraOnlyActive;
  }
  private anomaly(type: string, t: number, evidence: Readonly<Record<string, unknown>>): void {
    if (this.anomalies.toArray().some((entry) => entry.type === type && t - entry.t < 100)) return;
    const includeStack = this.anomalies.length < 4;
    this.anomalies.push({ type, t, evidence, ...(includeStack ? { stack: new Error().stack } : {}) });
  }
  private buildDocument(endedAt: string, durationMs: number): ViewportTraceDocument {
    const samples = this.samples.toArray();
    const first = samples[0]; const last = samples.at(-1);
    const hydrationValues = samples.map((sample) => numeric(sample.hydration?.['completed'])).filter((value): value is number => value !== undefined);
    const distances = samples.map((sample) => sample.camera?.distance).filter((value): value is number => value !== undefined);
    const renderCpu = samples.map((sample) => numeric(sample.render?.['renderCpuMs'])).filter((value): value is number => value !== undefined);
    const draws = samples.map((sample) => numeric(sample.render?.['drawCalls'])).filter((value): value is number => value !== undefined);
    const triangles = samples.map((sample) => numeric(sample.render?.['triangles'])).filter((value): value is number => value !== undefined);
    const heartbeatIntervals = this.events.toArray().filter((event) => event.type === 'heartbeat').map((event) => numeric(event.payload?.['intervalMs']) ?? 0);
    const longTasks = this.longTasks.toArray().map((entry) => entry.durationMs);
    const countersFirst = (first?.counters ?? {}) as Readonly<Record<string, unknown>>; const countersLast = (last?.counters ?? {}) as Readonly<Record<string, unknown>>;
    const deltaCounter = (key: string): number => Math.max(0, (numeric(countersLast[key]) ?? 0) - (numeric(countersFirst[key]) ?? 0));
    const durationSummary: Record<string, unknown> = {};
    for (const [name, buffer] of this.durationSamples) { const values = buffer.toArray(); durationSummary[name] = { count: values.length, totalMs: values.reduce((sum, value) => sum + value, 0), p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), maxMs: Math.max(...values, 0), dropped: buffer.droppedCount }; }
    const effectiveSpeeds = samples.map((sample) => numeric(sample.build?.['effectiveMovementSpeed'])).filter((value): value is number => value !== undefined);
    const sampleGenerationStart = numeric(first?.hydration?.['generation']); const sampleGenerationEnd = numeric(last?.hydration?.['generation']);
    return {
      schema: 'minecraftbuilder.viewport-trace.v1', scenario: this.scenario, startedAt: this.startedAt, endedAt, durationMs,
      metadata: this.hooks.metadata(), timeline: this.events.toArray(), samples, longTasks: this.longTasks.toArray(), memory: this.memory.toArray(), droppedEventCount: this.events.droppedCount + this.samples.droppedCount,
      summary: {
        durationMs,
        hydration: { startCompleted: hydrationValues[0] ?? 0, endCompleted: hydrationValues.at(-1) ?? 0, deltaCompleted: (hydrationValues.at(-1) ?? 0) - (hydrationValues[0] ?? 0), blocksPerSecond: durationMs > 0 ? ((hydrationValues.at(-1) ?? 0) - (hydrationValues[0] ?? 0)) / (durationMs / 1000) : 0, generationStart: sampleGenerationStart, generationEnd: sampleGenerationEnd, progressRegressionCount: this.anomalies.toArray().filter((entry) => entry.type === 'progress-regression').length },
        camera: { startDistance: distances[0], endDistance: distances.at(-1), minDistance: distances.length ? Math.min(...distances) : undefined, maxDistance: distances.length ? Math.max(...distances) : undefined, maxOffsetDrift: this.maxVectorDrift(samples, 'offset'), maxDirectionDriftDegrees: this.maxAngularDrift(samples, 'direction'), maxQuaternionDriftDegrees: this.maxQuaternionDrift(samples), effectiveMovementSpeedMin: effectiveSpeeds.length ? Math.min(...effectiveSpeeds) : undefined, effectiveMovementSpeedMax: effectiveSpeeds.length ? Math.max(...effectiveSpeeds) : undefined },
        render: { actualSceneRendersDelta: deltaCounter('actualSceneRenders'), renderRequestsDelta: deltaCounter('cameraRenderRequests'), coalescedDelta: deltaCounter('cameraRenderRequestsCoalesced'), drawCallsMin: draws.length ? Math.min(...draws) : undefined, drawCallsMax: draws.length ? Math.max(...draws) : undefined, trianglesMin: triangles.length ? Math.min(...triangles) : undefined, trianglesMax: triangles.length ? Math.max(...triangles) : undefined, renderCpuP50: percentile(renderCpu, .5), renderCpuP95: percentile(renderCpu, .95), renderCpuMax: renderCpu.length ? Math.max(...renderCpu) : undefined },
        responsiveness: { heartbeatSamples: heartbeatIntervals.length, approximateFps: durationMs > 0 ? heartbeatIntervals.length / (durationMs / 1000) : 0, frameIntervalP50: percentile(heartbeatIntervals, .5), frameIntervalP95: percentile(heartbeatIntervals, .95), frameIntervalP99: percentile(heartbeatIntervals, .99), maxFrameInterval: heartbeatIntervals.length ? Math.max(...heartbeatIntervals) : undefined, framesOver16_7ms: heartbeatIntervals.filter((value) => value > 16.7).length, framesOver33ms: heartbeatIntervals.filter((value) => value > 33).length, framesOver50ms: heartbeatIntervals.filter((value) => value > 50).length, framesOver100ms: heartbeatIntervals.filter((value) => value > 100).length, framesOver250ms: heartbeatIntervals.filter((value) => value > 250).length, longTaskObserverSupported: this.longTaskObserverSupported, longTaskCount: longTasks.length, longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0), longTaskMaxMs: longTasks.length ? Math.max(...longTasks) : undefined, longTaskP95Ms: percentile(longTasks, .95) },
        build: { terrainChunkRebuildsDelta: deltaCounter('terrainChunkRebuilds'), terrainBlocksCompiledDelta: deltaCounter('terrainBlocksCompiled'), terrainFacesEmittedDelta: deltaCounter('terrainFacesEmitted'), terrainFacesCulledDelta: deltaCounter('terrainFacesCulled'), incrementalTerrainChunkRebuildsDelta: deltaCounter('incrementalTerrainChunkRebuilds'), terrainBulkBatchesDelta: deltaCounter('terrainBulkBatches'), hydrationBatchesDelta: deltaCounter('hydrationBatches'), fullReconcileFallbacksDelta: deltaCounter('fullReconcileFallbacks'), fullVisibleScansDelta: deltaCounter('fullVisibleScans'), occupancyFullRebuildsDelta: deltaCounter('occupancyFullRebuilds'), providerObjectCreationsDelta: deltaCounter('providerObjectCreations'), reusableTemplateCreationsDelta: deltaCounter('reusableTemplateCreations'), durationSamples: durationSummary },
        anomalies: this.anomalies.toArray(),
      },
    };
  }
  private maxVectorDrift(samples: readonly (ViewportTraceSample & { readonly t: number; readonly reason: string })[], key: 'offset'): number {
    let max = 0; for (let index = 1; index < samples.length; index++) { const before = samples[index - 1].camera?.[key]; const after = samples[index].camera?.[key]; if (before && after) max = Math.max(max, distance3(before, after)); } return max;
  }
  private maxAngularDrift(samples: readonly (ViewportTraceSample & { readonly t: number; readonly reason: string })[], key: 'direction'): number {
    let max = 0; for (let index = 1; index < samples.length; index++) { const before = samples[index - 1].camera?.[key]; const after = samples[index].camera?.[key]; if (before && after) max = Math.max(max, angleDegrees(before, after)); } return max;
  }
  private maxQuaternionDrift(samples: readonly (ViewportTraceSample & { readonly t: number; readonly reason: string })[]): number {
    let max = 0; for (let index = 1; index < samples.length; index++) { const before = samples[index - 1].camera?.quaternion; const after = samples[index].camera?.quaternion; if (before && after) max = Math.max(max, Math.acos(Math.min(1, Math.abs(before[0] * after[0] + before[1] * after[1] + before[2] * after[2] + before[3] * after[3]))) * 2 * 180 / Math.PI); } return max;
  }
}

function now(): number { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function requestFrame(callback: FrameRequestCallback): number { return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(() => callback(now()), 16) as unknown as number; }
function cancelFrame(frame: number): void { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); else clearTimeout(frame); }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function distance3(a: TraceVector3, b: TraceVector3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function angleDegrees(a: TraceVector3, b: TraceVector3): number { const al = Math.hypot(a.x, a.y, a.z); const bl = Math.hypot(b.x, b.y, b.z); if (!al || !bl) return 0; return Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (al * bl)))) * 180 / Math.PI; }
