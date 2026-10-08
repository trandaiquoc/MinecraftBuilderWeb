import type { RendererCounters } from '../engine/renderer-diagnostics';
import { BoundedTraceBuffer, percentile, TraceNumericAccumulator, type TraceDurationSummary } from './viewport-trace-statistics';
import { downloadViewportTrace, sanitizeTraceScenario } from './viewport-trace-export';

export interface TraceVector3 { readonly x: number; readonly y: number; readonly z: number; }

export interface ViewportTraceSample {
  readonly traceSampleMs?: number;
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
  readonly staticModels?: Readonly<Record<string, unknown>>;
  readonly fluids?: Readonly<Record<string, unknown>>;
}

export interface ViewportTraceMetadata { readonly [key: string]: unknown; }

export interface ViewportTraceHooks {
  readonly metadata: () => ViewportTraceMetadata;
  readonly sample: () => ViewportTraceSample;
  readonly checkpoint?: () => ViewportTraceSample;
  /** Test seam for verifying that observation sources stop before FINAL collection. */
  readonly onObservationStop?: () => void;
}

export interface ViewportRuntimeTraceApi {
  start(scenario?: string): void;
  mark(label: string): void;
  checkpoint(label: string): void;
  stop(): ViewportTraceDocument | undefined;
  download(): void;
  stopAndDownload(): ViewportTraceDocument | undefined;
}

export interface ViewportTraceEvent {
  readonly t: number;
  readonly type: string;
  readonly priority?: ViewportTraceEventPriority;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export type ViewportTraceEventPriority = 'critical' | 'normal' | 'noisy';

export interface ViewportTraceDocument {
  readonly schema: 'minecraftbuilder.viewport-trace.v1';
  readonly scenario: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  /** Duration of the observed workload, excluding final heavy collection. */
  readonly observedDurationMs: number;
  /** Recorder wall time, including final heavy collection. */
  readonly recorderDurationMs: number;
  readonly metadata: ViewportTraceMetadata;
  readonly timeline: readonly ViewportTraceEvent[];
  readonly samples: readonly (ViewportTraceSample & { readonly t: number; readonly reason: string })[];
  readonly checkpoints: readonly ViewportTraceCheckpoint[];
  readonly longTasks: readonly { readonly t: number; readonly durationMs: number }[];
  readonly memory: readonly { readonly t: number; readonly usedJSHeapSize: number; readonly totalJSHeapSize: number; readonly jsHeapSizeLimit: number }[];
  readonly summary: ViewportTraceSummary;
  readonly droppedEventCount: number;
}

export interface ViewportTraceSummary {
  readonly durationMs: number;
  readonly observedDurationMs: number;
  readonly recorderDurationMs: number;
  readonly hydration: { readonly startCompleted: number; readonly endCompleted: number; readonly deltaCompleted: number; readonly blocksPerSecond: number; readonly generationStart?: number; readonly generationEnd?: number; readonly progressRegressionCount: number };
  readonly camera: { readonly startDistance?: number; readonly endDistance?: number; readonly minDistance?: number; readonly maxDistance?: number; readonly maxOffsetDrift: number; readonly maxDirectionDriftDegrees: number; readonly maxQuaternionDriftDegrees: number; readonly effectiveMovementSpeedMin?: number; readonly effectiveMovementSpeedMax?: number };
  readonly render: { readonly actualSceneRendersDelta: number; readonly renderRequestsDelta: number; readonly coalescedDelta: number; readonly drawCallsMin?: number; readonly drawCallsMax?: number; readonly trianglesMin?: number; readonly trianglesMax?: number; readonly renderCpuP50?: number; readonly renderCpuP95?: number; readonly renderCpuMax?: number };
  readonly responsiveness: { readonly heartbeatSamples: number; readonly approximateFps: number; readonly frameIntervalP50?: number; readonly frameIntervalP95?: number; readonly frameIntervalP99?: number; readonly maxFrameInterval?: number; readonly framesOver16_7ms: number; readonly framesOver33ms: number; readonly framesOver50ms: number; readonly framesOver100ms: number; readonly framesOver250ms: number; readonly longTaskObserverSupported: boolean; readonly longTaskCount: number; readonly longTaskTotalMs: number; readonly longTaskMaxMs?: number; readonly longTaskP95Ms?: number };
  readonly build: Readonly<Record<string, unknown>>;
  readonly staticModels: Readonly<Record<string, unknown>>;
  readonly fluids: Readonly<Record<string, unknown>>;
  readonly anomalies: readonly ViewportTraceAnomaly[];
  readonly segments: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly recorder: Readonly<Record<string, unknown>>;
  /** Backwards-compatible alias for the light-only sample timing aggregate. */
  readonly traceSampleMs: TraceDurationSummary;
  readonly lightSampleMs: TraceDurationSummary;
  readonly heavyCheckpointMs: TraceDurationSummary;
}

export interface ViewportTraceCheckpoint {
  readonly label: string;
  readonly t: number;
  readonly sample: ViewportTraceSample & { readonly t: number; readonly reason: string };
}

export interface ViewportTraceAnomaly {
  readonly type: string;
  readonly t: number;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly stack?: string;
}

function eventPriority(type: string): ViewportTraceEventPriority {
  if (type === 'trace-start' || type === 'trace-stop' || type === 'mark' || type === 'controls-start' || type === 'controls-end' || type === 'pointer-camera-start' || type === 'pointer-camera-end' || type === 'movement-keydown' || type === 'movement-keyup' || type === 'wheel' || type === 'provider-generation' || type === 'hydration-generation-start' || type === 'visibilitychange' || type === 'blur' || type === 'local-edit-start' || type === 'local-edit-end' || type === 'fluid-delta-start' || type === 'fluid-delta-end' || type === 'terrain-commit-hydration' || type.endsWith('-anomaly') || type.includes('generation-change') || type.includes('regression') || type.includes('during-camera-only') || type.includes('during-camera-segment')) return 'critical';
  if (type === 'hydration-progress' || type === 'controls-change' || type === 'render-frame' || type === 'render-request' || type === 'heartbeat' || type === 'movement-frame') return 'noisy';
  return 'normal';
}

export class ViewportRuntimeTrace {
  private readonly criticalEvents = new BoundedTraceBuffer<ViewportTraceEvent>(512);
  private readonly normalEvents = new BoundedTraceBuffer<ViewportTraceEvent>(1000);
  private readonly noisyEvents = new BoundedTraceBuffer<ViewportTraceEvent>(1500);
  private readonly retainedMarks: ViewportTraceEvent[] = [];
  private readonly samples = new BoundedTraceBuffer<ViewportTraceSample & { readonly t: number; readonly reason: string }>(1000);
  private readonly checkpoints = new BoundedTraceBuffer<ViewportTraceCheckpoint>(32);
  private readonly longTasks = new BoundedTraceBuffer<{ readonly t: number; readonly durationMs: number }>(256);
  private readonly memory = new BoundedTraceBuffer<{ readonly t: number; readonly usedJSHeapSize: number; readonly totalJSHeapSize: number; readonly jsHeapSizeLimit: number }>(8);
  private readonly durationAggregates = new Map<string, TraceNumericAccumulator>();
  private readonly heartbeatIntervals = new BoundedTraceBuffer<number>(512);
  private readonly heartbeatAggregate = new TraceNumericAccumulator();
  private heartbeatOver16_7 = 0;
  private heartbeatOver33 = 0;
  private heartbeatOver50 = 0;
  private heartbeatOver100 = 0;
  private heartbeatOver250 = 0;
  private readonly longTaskAggregate = new TraceNumericAccumulator();
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
  private lastHydrationTimelineAt = Number.NEGATIVE_INFINITY;
  private lastHydrationTimeline?: { status?: unknown; generation?: unknown; completed?: number; total?: number; percent?: number };
  private lastHydrationProgress?: { status?: unknown; generation?: unknown; completed?: number; total?: number; percent?: number };
  private lastControlsTimelineAt = Number.NEGATIVE_INFINITY;
  private lastRenderTimelineAt = Number.NEGATIVE_INFINITY;
  private lastMovementTimelineAt = Number.NEGATIVE_INFINITY;
  private throttledHydrationEvents = 0;
  private throttledControlsChangeEvents = 0;
  private throttledRenderEvents = 0;
  private controlsChangeCount = 0;
  private renderRequestCount = 0;
  private renderFrameCount = 0;
  private movementFrameCount = 0;
  private hydrationProgressObserved = false;
  private traceRecordCount = 0;
  private captureSampleCount = 0;
  private readonly markedSegments: { readonly label: string; readonly t: number; readonly sample?: ViewportTraceSample & { readonly t: number; readonly reason: string } }[] = [];
  private firstCounters?: Readonly<Record<string, unknown>>;
  private lastCounters?: Readonly<Record<string, unknown>>;
  private hydrationAggregate = { startCompleted: undefined as number | undefined, latestCompleted: undefined as number | undefined, generationStart: undefined as number | undefined, generationEnd: undefined as number | undefined, regressions: 0 };
  private cameraAggregate = { startDistance: undefined as number | undefined, endDistance: undefined as number | undefined, minDistance: Number.POSITIVE_INFINITY, maxDistance: Number.NEGATIVE_INFINITY, maxOffsetDrift: 0, maxDirectionDriftDegrees: 0, maxQuaternionDriftDegrees: 0, effectiveMin: Number.POSITIVE_INFINITY, effectiveMax: Number.NEGATIVE_INFINITY };
  private renderAggregate = { renderCpu: new TraceNumericAccumulator(), draws: new TraceNumericAccumulator(), triangles: new TraceNumericAccumulator() };
  private readonly lightSampleAggregate = new TraceNumericAccumulator();
  private readonly heavyCheckpointAggregate = new TraceNumericAccumulator();

  constructor(hooks: ViewportTraceHooks) { this.hooks = hooks; }

  getApi(): ViewportRuntimeTraceApi {
    return { start: (scenario) => this.start(scenario), mark: (label) => this.mark(label), checkpoint: (label) => this.checkpoint(label), stop: () => this.stop(), download: () => this.download(), stopAndDownload: () => this.stopAndDownload() };
  }

  get isActive(): boolean { return this.active; }

  start(scenario = 'trace'): void {
    if (this.active) this.stop();
    this.active = true;
    this.document = undefined;
    this.scenario = sanitizeTraceScenario(scenario);
    this.startPerf = now();
    this.startedAt = new Date().toISOString();
    this.criticalEvents.clear(); this.normalEvents.clear(); this.noisyEvents.clear(); this.retainedMarks.length = 0; this.samples.clear(); this.checkpoints.clear(); this.longTasks.clear(); this.memory.clear(); this.anomalies.clear(); this.durationAggregates.clear(); this.heartbeatIntervals.clear(); this.markedSegments.length = 0;
    this.lastSample = undefined; this.lastSampleTime = 0; this.firstGestureCaptured = false; this.cameraOnlyActive = false; this.longTaskObserverSupported = false; this.movementActions.clear(); this.lightSampleAggregate.reset(); this.heavyCheckpointAggregate.reset();
    this.lastHydrationTimelineAt = Number.NEGATIVE_INFINITY; this.lastHydrationTimeline = undefined; this.lastHydrationProgress = undefined; this.lastControlsTimelineAt = Number.NEGATIVE_INFINITY; this.lastRenderTimelineAt = Number.NEGATIVE_INFINITY; this.lastMovementTimelineAt = Number.NEGATIVE_INFINITY;
    this.throttledHydrationEvents = 0; this.throttledControlsChangeEvents = 0; this.throttledRenderEvents = 0; this.traceRecordCount = 0; this.captureSampleCount = 0; this.controlsChangeCount = 0; this.renderRequestCount = 0; this.renderFrameCount = 0; this.movementFrameCount = 0; this.hydrationProgressObserved = false; this.firstCounters = undefined; this.lastCounters = undefined; this.hydrationAggregate = { startCompleted: undefined, latestCompleted: undefined, generationStart: undefined, generationEnd: undefined, regressions: 0 }; this.cameraAggregate = { startDistance: undefined, endDistance: undefined, minDistance: Number.POSITIVE_INFINITY, maxDistance: Number.NEGATIVE_INFINITY, maxOffsetDrift: 0, maxDirectionDriftDegrees: 0, maxQuaternionDriftDegrees: 0, effectiveMin: Number.POSITIVE_INFINITY, effectiveMax: Number.NEGATIVE_INFINITY }; this.renderAggregate = { renderCpu: new TraceNumericAccumulator(), draws: new TraceNumericAccumulator(), triangles: new TraceNumericAccumulator() }; this.heartbeatAggregate.reset(); this.heartbeatOver16_7 = 0; this.heartbeatOver33 = 0; this.heartbeatOver50 = 0; this.heartbeatOver100 = 0; this.heartbeatOver250 = 0; this.longTaskAggregate.reset();
    this.pushEvent('trace-start', { scenario: this.scenario }, 'critical', 0);
    this.captureSample('start');
    this.captureMemory();
    this.interval = setInterval(() => this.captureSample('interval'), 50);
    this.startHeartbeat();
    this.observeLongTasks();
  }

  mark(label: string): void {
    if (!this.active) return;
    const normalized = label.slice(0, 120);
    const t = this.elapsed();
    this.pushEvent('mark', { label: normalized }, 'critical', t);
    const captured = this.captureSample(`mark:${normalized.slice(0, 40)}`);
    this.markedSegments.push({ label: normalized, t, ...(captured ? { sample: captured } : {}) });
  }

  /** Captures a deliberately explicit rich diagnostic snapshot. */
  checkpoint(label: string): void {
    if (!this.active) return;
    const normalized = label.slice(0, 120);
    const captured = this.captureSample(`checkpoint:${normalized.slice(0, 40)}`, this.hooks.checkpoint ?? this.hooks.sample, 'heavy');
    if (captured) this.checkpoints.push({ label: normalized, t: captured.t, sample: captured });
  }

  record(type: string, payload?: Readonly<Record<string, unknown>>): void {
    if (!this.active) return;
    this.traceRecordCount += 1;
    const t = this.elapsed();
    const priority = eventPriority(type);
    if (type === 'controls-change') this.controlsChangeCount += 1;
    if (type === 'render-request') this.renderRequestCount += 1;
    if (type === 'render-frame') this.renderFrameCount += 1;
    if (type === 'movement-frame') this.movementFrameCount += 1;
    if (type === 'hydration-progress') {
      this.recordHydrationProgress(payload, t);
      return;
    }
    if (type === 'controls-change' && t - this.lastControlsTimelineAt < 100) { this.throttledControlsChangeEvents += 1; return; }
    if (type === 'controls-change') this.lastControlsTimelineAt = t;
    if ((type === 'render-frame' || type === 'render-request') && t - this.lastRenderTimelineAt < 100) { this.throttledRenderEvents += 1; return; }
    if (type === 'render-frame' || type === 'render-request') this.lastRenderTimelineAt = t;
    if (type === 'movement-frame' && t - this.lastMovementTimelineAt < 100) { this.throttledRenderEvents += 1; return; }
    if (type === 'movement-frame') this.lastMovementTimelineAt = t;
    this.pushEvent(type, payload, priority, t);
    if (type === 'controls-start' || type === 'movement-keydown' || type === 'movement-frame' || type === 'wheel') this.cameraOnlyActive = true;
    if (type === 'movement-keydown' && typeof payload?.['action'] === 'string') this.movementActions.add(payload['action']);
    if (type === 'movement-keyup' && typeof payload?.['action'] === 'string') this.movementActions.delete(payload['action']);
    if (type === 'controls-end' || type === 'movement-keyup' && !this.movementActions.size) this.cameraOnlyActive = false;
    if (priority === 'critical' || type === 'controls-start' || type === 'controls-end' || type === 'movement-keydown' || type === 'movement-keyup' || type === 'wheel') this.captureSample(`event:${type}`);
    if (type === 'controls-start' && !this.firstGestureCaptured) {
      this.firstGestureCaptured = true;
      this.pushEvent('first-gesture-before', undefined, 'critical', t);
      this.firstGestureTimer = setTimeout(() => { if (this.active) this.captureSample('first-gesture-100ms'); }, 100);
    }
    if (type === 'controls-end' && this.firstGestureCaptured) this.firstGestureEndTimer = setTimeout(() => { if (this.active) this.captureSample('first-gesture-250ms'); }, 250);
  }

  recordDuration(stage: string, durationMs: number): void {
    if (!this.active || !Number.isFinite(durationMs)) return;
    let aggregate = this.durationAggregates.get(stage);
    if (!aggregate) { aggregate = new TraceNumericAccumulator(); this.durationAggregates.set(stage, aggregate); }
    aggregate.add(Math.max(0, durationMs));
  }

  private pushEvent(type: string, payload: Readonly<Record<string, unknown>> | undefined, priority = eventPriority(type), timestamp = this.elapsed()): void {
    const event: ViewportTraceEvent = { t: timestamp, type, priority, ...(payload ? { payload } : {}) };
    if (type === 'mark') this.retainedMarks.push(event);
    else if (priority === 'critical') this.criticalEvents.push(event);
    else if (priority === 'normal') this.normalEvents.push(event);
    else this.noisyEvents.push(event);
  }

  private recordHydrationProgress(payload: Readonly<Record<string, unknown>> | undefined, timestamp: number): void {
    const next = { status: payload?.['status'], generation: payload?.['generation'], completed: numeric(payload?.['completed']), total: numeric(payload?.['total']), percent: numeric(payload?.['percent']) };
    const previous = this.lastHydrationTimeline;
    const previousProgress = this.lastHydrationProgress;
    this.lastHydrationProgress = next;
    this.hydrationProgressObserved = true;
    if (next.completed !== undefined) {
      if (this.hydrationAggregate.startCompleted === undefined) this.hydrationAggregate.startCompleted = next.completed;
      if (previousProgress?.completed !== undefined && next.completed < previousProgress.completed) {
        this.hydrationAggregate.regressions += 1;
        this.anomaly('progress-regression', timestamp, { before: previousProgress.completed, after: next.completed });
      }
      if (this.hydrationAggregate.latestCompleted === undefined || next.completed >= this.hydrationAggregate.latestCompleted) this.hydrationAggregate.latestCompleted = next.completed;
    }
    const generation = numeric(next.generation);
    this.hydrationAggregate.generationStart ??= generation;
    this.hydrationAggregate.generationEnd = generation;
    const progressRegressed = previousProgress?.completed !== undefined && next.completed !== undefined && next.completed < previousProgress.completed;
    const generationChanged = previous?.generation !== undefined && next.generation !== undefined && previous.generation !== next.generation;
    const immediate = !previous || previous.status !== next.status || generationChanged || previous.total !== next.total || progressRegressed || next.status === 'complete' || previous.percent !== undefined && next.percent !== undefined && next.percent - previous.percent >= 5;
    if (!immediate && timestamp - this.lastHydrationTimelineAt < 150) { this.throttledHydrationEvents += 1; return; }
    this.lastHydrationTimelineAt = timestamp; this.lastHydrationTimeline = next;
    this.pushEvent('hydration-progress', payload, generationChanged || progressRegressed ? 'critical' : immediate ? 'normal' : 'noisy', timestamp);
    if (immediate) this.captureSample('hydration-progress');
  }

  private updateAggregates(sample: ViewportTraceSample): void {
    const counters = { ...((sample.counters ?? {}) as Readonly<Record<string, unknown>>) };
    this.firstCounters ??= counters;
    this.lastCounters = counters;
    const hydrationCompleted = numeric(sample.hydration?.['completed']);
    if (hydrationCompleted !== undefined) {
      if (this.hydrationAggregate.startCompleted === undefined) this.hydrationAggregate.startCompleted = hydrationCompleted;
      if (this.hydrationAggregate.latestCompleted === undefined || hydrationCompleted >= this.hydrationAggregate.latestCompleted) this.hydrationAggregate.latestCompleted = hydrationCompleted;
      else if (!this.hydrationProgressObserved) this.hydrationAggregate.regressions += 1;
    }
    const generation = numeric(sample.hydration?.['generation']); this.hydrationAggregate.generationStart ??= generation; this.hydrationAggregate.generationEnd = generation;
    if (sample.camera) {
      const distance = sample.camera.distance; this.cameraAggregate.startDistance ??= distance; this.cameraAggregate.endDistance = distance; this.cameraAggregate.minDistance = Math.min(this.cameraAggregate.minDistance, distance); this.cameraAggregate.maxDistance = Math.max(this.cameraAggregate.maxDistance, distance);
      if (this.lastSample?.camera) { this.cameraAggregate.maxOffsetDrift = Math.max(this.cameraAggregate.maxOffsetDrift, distance3(this.lastSample.camera.offset, sample.camera.offset)); this.cameraAggregate.maxDirectionDriftDegrees = Math.max(this.cameraAggregate.maxDirectionDriftDegrees, angleDegrees(this.lastSample.camera.direction, sample.camera.direction)); this.cameraAggregate.maxQuaternionDriftDegrees = Math.max(this.cameraAggregate.maxQuaternionDriftDegrees, quaternionAngle(this.lastSample.camera.quaternion, sample.camera.quaternion)); }
    }
    const effective = numeric(sample.build?.['effectiveMovementSpeed']); if (effective !== undefined) { this.cameraAggregate.effectiveMin = Math.min(this.cameraAggregate.effectiveMin, effective); this.cameraAggregate.effectiveMax = Math.max(this.cameraAggregate.effectiveMax, effective); }
    const renderCpu = numeric(sample.render?.['renderCpuMs']); if (renderCpu !== undefined) this.renderAggregate.renderCpu.add(renderCpu);
    const draws = numeric(sample.render?.['drawCalls']); if (draws !== undefined) this.renderAggregate.draws.add(draws);
    const triangles = numeric(sample.render?.['triangles']); if (triangles !== undefined) this.renderAggregate.triangles.add(triangles);
  }

  captureSample(reason = 'manual', sampler: () => ViewportTraceSample = this.hooks.sample, sampleKind: 'light' | 'heavy' = 'light'): (ViewportTraceSample & { readonly t: number; readonly reason: string }) | undefined {
    if (!this.active) return undefined;
    this.captureSampleCount += 1;
    let sample: ViewportTraceSample;
    const started = now();
    try { sample = sampler(); } catch { return undefined; }
    const traceSampleMs = Math.max(0, now() - started);
    (sampleKind === 'heavy' ? this.heavyCheckpointAggregate : this.lightSampleAggregate).add(traceSampleMs);
    const t = this.elapsed();
    const captured = { ...sample, traceSampleMs, t, reason };
    this.samples.push(captured);
    this.updateAggregates(sample);
    this.detectAnomalies(sample, t);
    this.lastSample = sample;
    this.lastSampleTime = t;
    return captured;
  }

  stop(): ViewportTraceDocument | undefined {
    if (!this.active && !this.document) return undefined;
    if (this.active) {
      const finalSample = this.captureSample('final');
      if (finalSample) this.markedSegments.push({ label: 'FINAL', t: finalSample.t, sample: finalSample });
      const observedDurationMs = this.elapsed();
      this.captureMemory();
      if (this.interval !== undefined) clearInterval(this.interval);
      this.interval = undefined;
      if (this.heartbeatFrame !== undefined) cancelFrame(this.heartbeatFrame);
      this.heartbeatFrame = undefined;
      if (this.firstGestureTimer !== undefined) clearTimeout(this.firstGestureTimer);
      this.firstGestureTimer = undefined;
      if (this.firstGestureEndTimer !== undefined) clearTimeout(this.firstGestureEndTimer);
      this.firstGestureEndTimer = undefined;
      this.observer?.disconnect(); this.observer = undefined;
      this.pushEvent('observation-stop', undefined, 'critical', observedDurationMs);
      this.hooks.onObservationStop?.();
      this.checkpoint('FINAL');
      const recorderDurationMs = this.elapsed();
      this.active = false;
      const endedAt = new Date().toISOString();
      this.pushEvent('trace-stop', undefined, 'critical', observedDurationMs);
      this.document = this.buildDocument(endedAt, observedDurationMs, recorderDurationMs);
    }
    return this.document;
  }

  download(): void {
    const trace = this.document ?? this.stop();
    if (!trace) return;
    downloadViewportTrace(trace);
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
  /** Records one heartbeat interval for diagnostics tests and the internal rAF sampler. */
  recordHeartbeat(intervalMs: number): void {
    const value = Math.max(0, intervalMs); this.heartbeatAggregate.add(value); this.heartbeatIntervals.push(value); if (value > 16.7) this.heartbeatOver16_7 += 1; if (value > 33) this.heartbeatOver33 += 1; if (value > 50) this.heartbeatOver50 += 1; if (value > 100) this.heartbeatOver100 += 1; if (value > 250) this.heartbeatOver250 += 1;
  }
  private observeLongTasks(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    this.longTaskObserverSupported = true;
    try {
      this.observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) { this.longTasks.push({ t: Math.max(0, entry.startTime - this.startPerf), durationMs: entry.duration }); this.longTaskAggregate.add(entry.duration); } });
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
    this.pushEvent(`anomaly:${type}`, evidence, 'critical', t);
  }
  private buildDocument(endedAt: string, durationMs: number, recorderDurationMs = durationMs): ViewportTraceDocument {
    const samples = this.samples.toArray();
    const first = samples[0]; const last = samples.at(-1);
    const hydrationValues = samples.map((sample) => numeric(sample.hydration?.['completed'])).filter((value): value is number => value !== undefined);
    const distances = samples.map((sample) => sample.camera?.distance).filter((value): value is number => value !== undefined);
    const renderCpu = samples.map((sample) => numeric(sample.render?.['renderCpuMs'])).filter((value): value is number => value !== undefined);
    const draws = samples.map((sample) => numeric(sample.render?.['drawCalls'])).filter((value): value is number => value !== undefined);
    const triangles = samples.map((sample) => numeric(sample.render?.['triangles'])).filter((value): value is number => value !== undefined);
    const heartbeatIntervals = this.heartbeatIntervals.toArray();
    const longTasks = this.longTasks.toArray().map((entry) => entry.durationMs);
    const countersFirst = this.firstCounters ?? ((first?.counters ?? {}) as Readonly<Record<string, unknown>>); const countersLast = this.lastCounters ?? ((last?.counters ?? {}) as Readonly<Record<string, unknown>>);
    const deltaCounter = (key: string): number => Math.max(0, (numeric(countersLast[key]) ?? 0) - (numeric(countersFirst[key]) ?? 0));
    const durationSummary: Record<string, unknown> = {};
    for (const [name, aggregate] of this.durationAggregates) durationSummary[name] = aggregate.summary();
    const timeline = [...this.criticalEvents.toArray(), ...this.normalEvents.toArray(), ...this.noisyEvents.toArray(), ...this.retainedMarks].sort((a, b) => a.t - b.t || priorityOrder(a.priority) - priorityOrder(b.priority));
    const effectiveSpeeds = samples.map((sample) => numeric(sample.build?.['effectiveMovementSpeed'])).filter((value): value is number => value !== undefined);
    const sampleGenerationStart = numeric(first?.hydration?.['generation']); const sampleGenerationEnd = numeric(last?.hydration?.['generation']);
    return {
      schema: 'minecraftbuilder.viewport-trace.v1', scenario: this.scenario, startedAt: this.startedAt, endedAt, durationMs, observedDurationMs: durationMs, recorderDurationMs,
      metadata: this.hooks.metadata(), timeline, samples, checkpoints: this.checkpoints.toArray(), longTasks: this.longTasks.toArray(), memory: this.memory.toArray(), droppedEventCount: this.criticalEvents.droppedCount + this.normalEvents.droppedCount + this.noisyEvents.droppedCount,
      summary: {
        durationMs, observedDurationMs: durationMs, recorderDurationMs,
        hydration: { startCompleted: this.hydrationAggregate.startCompleted ?? hydrationValues[0] ?? 0, endCompleted: this.hydrationAggregate.latestCompleted ?? hydrationValues.at(-1) ?? 0, deltaCompleted: (this.hydrationAggregate.latestCompleted ?? hydrationValues.at(-1) ?? 0) - (this.hydrationAggregate.startCompleted ?? hydrationValues[0] ?? 0), blocksPerSecond: durationMs > 0 ? ((this.hydrationAggregate.latestCompleted ?? hydrationValues.at(-1) ?? 0) - (this.hydrationAggregate.startCompleted ?? hydrationValues[0] ?? 0)) / (durationMs / 1000) : 0, generationStart: this.hydrationAggregate.generationStart ?? sampleGenerationStart, generationEnd: this.hydrationAggregate.generationEnd ?? sampleGenerationEnd, progressRegressionCount: this.hydrationAggregate.regressions || this.anomalies.toArray().filter((entry) => entry.type === 'progress-regression').length },
        camera: { startDistance: this.cameraAggregate.startDistance ?? distances[0], endDistance: this.cameraAggregate.endDistance ?? distances.at(-1), minDistance: Number.isFinite(this.cameraAggregate.minDistance) ? this.cameraAggregate.minDistance : undefined, maxDistance: Number.isFinite(this.cameraAggregate.maxDistance) ? this.cameraAggregate.maxDistance : undefined, maxOffsetDrift: this.cameraAggregate.maxOffsetDrift || this.maxVectorDrift(samples, 'offset'), maxDirectionDriftDegrees: this.cameraAggregate.maxDirectionDriftDegrees || this.maxAngularDrift(samples, 'direction'), maxQuaternionDriftDegrees: this.cameraAggregate.maxQuaternionDriftDegrees || this.maxQuaternionDrift(samples), effectiveMovementSpeedMin: Number.isFinite(this.cameraAggregate.effectiveMin) ? this.cameraAggregate.effectiveMin : effectiveSpeeds.length ? Math.min(...effectiveSpeeds) : undefined, effectiveMovementSpeedMax: Number.isFinite(this.cameraAggregate.effectiveMax) ? this.cameraAggregate.effectiveMax : effectiveSpeeds.length ? Math.max(...effectiveSpeeds) : undefined },
        render: { actualSceneRendersDelta: deltaCounter('actualSceneRenders'), renderRequestsDelta: deltaCounter('cameraRenderRequests'), coalescedDelta: deltaCounter('cameraRenderRequestsCoalesced'), drawCallsMin: this.renderAggregate.draws.observedCount ? this.renderAggregate.draws.min : draws.length ? Math.min(...draws) : undefined, drawCallsMax: this.renderAggregate.draws.observedCount ? this.renderAggregate.draws.max : draws.length ? Math.max(...draws) : undefined, trianglesMin: this.renderAggregate.triangles.observedCount ? this.renderAggregate.triangles.min : triangles.length ? Math.min(...triangles) : undefined, trianglesMax: this.renderAggregate.triangles.observedCount ? this.renderAggregate.triangles.max : triangles.length ? Math.max(...triangles) : undefined, renderCpuP50: this.renderAggregate.renderCpu.summary().p50Ms ?? percentile(renderCpu, .5), renderCpuP95: this.renderAggregate.renderCpu.summary().p95Ms ?? percentile(renderCpu, .95), renderCpuMax: this.renderAggregate.renderCpu.max !== Number.NEGATIVE_INFINITY ? this.renderAggregate.renderCpu.max : renderCpu.length ? Math.max(...renderCpu) : undefined },
        responsiveness: { heartbeatSamples: this.heartbeatAggregate.observedCount, approximateFps: durationMs > 0 ? this.heartbeatAggregate.observedCount / (durationMs / 1000) : 0, frameIntervalP50: this.heartbeatAggregate.summary().p50Ms, frameIntervalP95: this.heartbeatAggregate.summary().p95Ms, frameIntervalP99: percentile(heartbeatIntervals, .99), maxFrameInterval: Number.isFinite(this.heartbeatAggregate.max) ? this.heartbeatAggregate.max : undefined, framesOver16_7ms: this.heartbeatOver16_7, framesOver33ms: this.heartbeatOver33, framesOver50ms: this.heartbeatOver50, framesOver100ms: this.heartbeatOver100, framesOver250ms: this.heartbeatOver250, longTaskObserverSupported: this.longTaskObserverSupported, longTaskCount: this.longTaskAggregate.observedCount, longTaskTotalMs: this.longTaskAggregate.total, longTaskMaxMs: Number.isFinite(this.longTaskAggregate.max) ? this.longTaskAggregate.max : undefined, longTaskP95Ms: this.longTaskAggregate.summary().p95Ms },
        build: { terrainChunkRebuildsDelta: deltaCounter('terrainChunkRebuilds'), terrainBlocksCompiledDelta: deltaCounter('terrainBlocksCompiled'), terrainFacesEmittedDelta: deltaCounter('terrainFacesEmitted'), terrainFacesCulledDelta: deltaCounter('terrainFacesCulled'), incrementalTerrainChunkRebuildsDelta: deltaCounter('incrementalTerrainChunkRebuilds'), terrainBulkBatchesDelta: deltaCounter('terrainBulkBatches'), hydrationBatchesDelta: deltaCounter('hydrationBatches'), fullReconcileFallbacksDelta: deltaCounter('fullReconcileFallbacks'), fullVisibleScansDelta: deltaCounter('fullVisibleScans'), occupancyFullRebuildsDelta: deltaCounter('occupancyFullRebuilds'), providerObjectCreationsDelta: deltaCounter('providerObjectCreations'), reusableTemplateCreationsDelta: deltaCounter('reusableTemplateCreations'), durationSamples: durationSummary },
        staticModels: last?.staticModels ? { ...last.staticModels } : {},
        fluids: last?.fluids ? { ...last.fluids } : {},
        anomalies: this.anomalies.toArray(),
        segments: this.segmentSummaries(samples, durationMs),
        recorder: { traceRecordCount: this.traceRecordCount, captureSampleCount: this.captureSampleCount, checkpointCount: this.checkpoints.length, checkpointDroppedCount: this.checkpoints.droppedCount, throttledHydrationEvents: this.throttledHydrationEvents, throttledControlsChangeEvents: this.throttledControlsChangeEvents, throttledRenderEvents: this.throttledRenderEvents, controlsChangeCount: this.controlsChangeCount, renderRequestCount: this.renderRequestCount, renderFrameCount: this.renderFrameCount, movementFrameCount: this.movementFrameCount, heartbeatStoredSampleCount: this.heartbeatIntervals.length, heartbeatDroppedSampleCount: this.heartbeatIntervals.droppedCount, rawEventsStoredByPriority: { critical: this.criticalEvents.length, normal: this.normalEvents.length, noisy: this.noisyEvents.length, retainedMarks: this.retainedMarks.length }, rawEventsDroppedByPriority: { critical: this.criticalEvents.droppedCount, normal: this.normalEvents.droppedCount, noisy: this.noisyEvents.droppedCount }, droppedSampleCount: this.samples.droppedCount },
        traceSampleMs: this.lightSampleAggregate.summary(),
        lightSampleMs: this.lightSampleAggregate.summary(),
        heavyCheckpointMs: this.heavyCheckpointAggregate.summary(),
      },
    };
  }
  private segmentSummaries(samples: readonly (ViewportTraceSample & { readonly t: number; readonly reason: string })[], durationMs: number): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
    const result: Record<string, Readonly<Record<string, unknown>>> = {};
    const markers = [...this.markedSegments, { label: '__end', t: durationMs }];
    for (let index = 0; index < markers.length - 1; index++) {
      const marker = markers[index]; const next = markers[index + 1];
      const range = samples.filter((sample) => sample.t >= marker.t && sample.t <= next.t);
      const first = marker.sample ?? range[0]; const last = next.sample ?? range.at(-1);
      const completed = range.map((sample) => numeric(sample.hydration?.['completed'])).filter((value): value is number => value !== undefined);
      const beforeCounters = numericCounters(first?.counters as Readonly<Record<string, unknown>> | undefined);
      const afterCounters = numericCounters(last?.counters as Readonly<Record<string, unknown>> | undefined);
      const counterDeltas = counterDeltaMap(beforeCounters, afterCounters);
      result[marker.label] = {
        label: marker.label,
        startMs: marker.t,
        durationMs: Math.max(0, next.t - marker.t),
        before: beforeCounters,
        after: afterCounters,
        counterDeltas,
        gaugeDeltas: gaugeDeltaMap(beforeCounters, afterCounters),
        hydrationCompletedDelta: (completed.at(-1) ?? 0) - (completed[0] ?? 0),
        generationStart: numeric(first?.hydration?.['generation']),
        generationEnd: numeric(last?.hydration?.['generation']),
        terrainChunkRebuildsDelta: counterDeltas['terrainChunkRebuilds'] ?? 0,
        terrainBulkBatchesDelta: counterDeltas['terrainBulkBatches'] ?? 0,
        structuralReconcilesDelta: counterDeltas['structuralReconciles'] ?? 0,
        fullSceneRebuildsDelta: counterDeltas['fullSceneRebuilds'] ?? 0,
        providerGenerationStart: numeric(first?.generations?.['providerGeneration']),
        providerGenerationEnd: numeric(last?.generations?.['providerGeneration']),
        renderCountDelta: counterDeltas['actualSceneRenders'] ?? 0,
        cameraStartDistance: first?.camera?.distance,
        cameraEndDistance: last?.camera?.distance,
        cameraOffsetDrift: first?.camera && last?.camera ? distance3(first.camera.offset, last.camera.offset) : 0,
      };
    }
    return result;
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
function priorityOrder(priority: ViewportTraceEventPriority | undefined): number { return priority === 'critical' ? 0 : priority === 'normal' ? 1 : 2; }
function numericCounters(value: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, number>> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => { const number = numeric(entry); return number === undefined ? [] : [[key, number]]; }));
}
function counterDeltaMap(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries([...keys].filter((key) => !GAUGE_COUNTER_KEYS.has(key)).sort().map((key) => [key, Math.max(0, (after[key] ?? 0) - (before[key] ?? 0))]));
}
const GAUGE_COUNTER_KEYS = new Set([
  'instancedMeshCount',
  'instancedMembers',
  'interiorBlocksCulled',
  'surfaceFastPathBlocks',
  'exposedFaceInstances',
  'neighborFacesCulled',
]);
function gaugeDeltaMap(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries([...GAUGE_COUNTER_KEYS].filter((key) => key in before || key in after).map((key) => [key, (after[key] ?? 0) - (before[key] ?? 0)]));
}
function distance3(a: TraceVector3, b: TraceVector3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function angleDegrees(a: TraceVector3, b: TraceVector3): number { const al = Math.hypot(a.x, a.y, a.z); const bl = Math.hypot(b.x, b.y, b.z); if (!al || !bl) return 0; return Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (al * bl)))) * 180 / Math.PI; }
function quaternionAngle(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): number { return Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 2 * 180 / Math.PI; }
