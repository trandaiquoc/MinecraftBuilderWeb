import type { RendererCounters } from '../engine/renderer-diagnostics';
import { BoundedTraceBuffer, ViewportTraceStatistics } from './viewport-trace-statistics';
import { downloadViewportTrace, sanitizeTraceScenario } from './viewport-trace-export';
import { detectViewportTraceAnomalies } from './viewport-trace-anomaly-detector';
import { buildViewportTraceDocument } from './viewport-trace-report';
import type { TraceDurationSummary } from './viewport-trace-statistics';

export interface TraceVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

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

export interface ViewportTraceMetadata {
  readonly [key: string]: unknown;
}

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
  readonly samples: readonly (ViewportTraceSample & {
    readonly t: number;
    readonly reason: string;
  })[];
  readonly checkpoints: readonly ViewportTraceCheckpoint[];
  readonly longTasks: readonly { readonly t: number; readonly durationMs: number }[];
  readonly memory: readonly {
    readonly t: number;
    readonly usedJSHeapSize: number;
    readonly totalJSHeapSize: number;
    readonly jsHeapSizeLimit: number;
  }[];
  readonly summary: ViewportTraceSummary;
  readonly droppedEventCount: number;
}

export interface ViewportTraceSummary {
  readonly durationMs: number;
  readonly observedDurationMs: number;
  readonly recorderDurationMs: number;
  readonly hydration: {
    readonly startCompleted: number;
    readonly endCompleted: number;
    readonly deltaCompleted: number;
    readonly blocksPerSecond: number;
    readonly generationStart?: number;
    readonly generationEnd?: number;
    readonly progressRegressionCount: number;
  };
  readonly camera: {
    readonly startDistance?: number;
    readonly endDistance?: number;
    readonly minDistance?: number;
    readonly maxDistance?: number;
    readonly maxOffsetDrift: number;
    readonly maxDirectionDriftDegrees: number;
    readonly maxQuaternionDriftDegrees: number;
    readonly effectiveMovementSpeedMin?: number;
    readonly effectiveMovementSpeedMax?: number;
  };
  readonly render: {
    readonly actualSceneRendersDelta: number;
    readonly renderRequestsDelta: number;
    readonly coalescedDelta: number;
    readonly drawCallsMin?: number;
    readonly drawCallsMax?: number;
    readonly trianglesMin?: number;
    readonly trianglesMax?: number;
    readonly renderCpuP50?: number;
    readonly renderCpuP95?: number;
    readonly renderCpuMax?: number;
  };
  readonly responsiveness: {
    readonly heartbeatSamples: number;
    readonly approximateFps: number;
    readonly frameIntervalP50?: number;
    readonly frameIntervalP95?: number;
    readonly frameIntervalP99?: number;
    readonly maxFrameInterval?: number;
    readonly framesOver16_7ms: number;
    readonly framesOver33ms: number;
    readonly framesOver50ms: number;
    readonly framesOver100ms: number;
    readonly framesOver250ms: number;
    readonly longTaskObserverSupported: boolean;
    readonly longTaskCount: number;
    readonly longTaskTotalMs: number;
    readonly longTaskMaxMs?: number;
    readonly longTaskP95Ms?: number;
  };
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
  if (
    type === 'trace-start' ||
    type === 'trace-stop' ||
    type === 'mark' ||
    type === 'controls-start' ||
    type === 'controls-end' ||
    type === 'pointer-camera-start' ||
    type === 'pointer-camera-end' ||
    type === 'movement-keydown' ||
    type === 'movement-keyup' ||
    type === 'wheel' ||
    type === 'provider-generation' ||
    type === 'hydration-generation-start' ||
    type === 'visibilitychange' ||
    type === 'blur' ||
    type === 'local-edit-start' ||
    type === 'local-edit-end' ||
    type === 'fluid-delta-start' ||
    type === 'fluid-delta-end' ||
    type === 'terrain-commit-hydration' ||
    type.endsWith('-anomaly') ||
    type.includes('generation-change') ||
    type.includes('regression') ||
    type.includes('during-camera-only') ||
    type.includes('during-camera-segment')
  )
    return 'critical';
  if (
    type === 'hydration-progress' ||
    type === 'controls-change' ||
    type === 'render-frame' ||
    type === 'render-request' ||
    type === 'heartbeat' ||
    type === 'movement-frame'
  )
    return 'noisy';
  return 'normal';
}

export class ViewportRuntimeTrace {
  private readonly criticalEvents = new BoundedTraceBuffer<ViewportTraceEvent>(512);
  private readonly normalEvents = new BoundedTraceBuffer<ViewportTraceEvent>(1000);
  private readonly noisyEvents = new BoundedTraceBuffer<ViewportTraceEvent>(1500);
  private readonly retainedMarks: ViewportTraceEvent[] = [];
  private readonly samples = new BoundedTraceBuffer<
    ViewportTraceSample & { readonly t: number; readonly reason: string }
  >(1000);
  private readonly checkpoints = new BoundedTraceBuffer<ViewportTraceCheckpoint>(32);
  private readonly longTasks = new BoundedTraceBuffer<{
    readonly t: number;
    readonly durationMs: number;
  }>(256);
  private readonly memory = new BoundedTraceBuffer<{
    readonly t: number;
    readonly usedJSHeapSize: number;
    readonly totalJSHeapSize: number;
    readonly jsHeapSizeLimit: number;
  }>(8);
  private readonly statistics = new ViewportTraceStatistics();
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
  private lastHydrationTimeline?: {
    status?: unknown;
    generation?: unknown;
    completed?: number;
    total?: number;
    percent?: number;
  };
  private lastHydrationProgress?: {
    status?: unknown;
    generation?: unknown;
    completed?: number;
    total?: number;
    percent?: number;
  };
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
  private readonly markedSegments: {
    readonly label: string;
    readonly t: number;
    readonly sample?: ViewportTraceSample & { readonly t: number; readonly reason: string };
  }[] = [];

  constructor(hooks: ViewportTraceHooks) {
    this.hooks = hooks;
  }

  getApi(): ViewportRuntimeTraceApi {
    return {
      start: (scenario) => this.start(scenario),
      mark: (label) => this.mark(label),
      checkpoint: (label) => this.checkpoint(label),
      stop: () => this.stop(),
      download: () => this.download(),
      stopAndDownload: () => this.stopAndDownload(),
    };
  }

  get isActive(): boolean {
    return this.active;
  }

  start(scenario = 'trace'): void {
    if (this.active) this.stop();
    this.active = true;
    this.document = undefined;
    this.scenario = sanitizeTraceScenario(scenario);
    this.startPerf = now();
    this.startedAt = new Date().toISOString();
    this.criticalEvents.clear();
    this.normalEvents.clear();
    this.noisyEvents.clear();
    this.retainedMarks.length = 0;
    this.samples.clear();
    this.checkpoints.clear();
    this.longTasks.clear();
    this.memory.clear();
    this.anomalies.clear();
    this.statistics.reset();
    this.markedSegments.length = 0;
    this.lastSample = undefined;
    this.lastSampleTime = 0;
    this.firstGestureCaptured = false;
    this.cameraOnlyActive = false;
    this.longTaskObserverSupported = false;
    this.movementActions.clear();
    this.lastHydrationTimelineAt = Number.NEGATIVE_INFINITY;
    this.lastHydrationTimeline = undefined;
    this.lastHydrationProgress = undefined;
    this.lastControlsTimelineAt = Number.NEGATIVE_INFINITY;
    this.lastRenderTimelineAt = Number.NEGATIVE_INFINITY;
    this.lastMovementTimelineAt = Number.NEGATIVE_INFINITY;
    this.throttledHydrationEvents = 0;
    this.throttledControlsChangeEvents = 0;
    this.throttledRenderEvents = 0;
    this.traceRecordCount = 0;
    this.captureSampleCount = 0;
    this.controlsChangeCount = 0;
    this.renderRequestCount = 0;
    this.renderFrameCount = 0;
    this.movementFrameCount = 0;
    this.hydrationProgressObserved = false;
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
    const captured = this.captureSample(
      `checkpoint:${normalized.slice(0, 40)}`,
      this.hooks.checkpoint ?? this.hooks.sample,
      'heavy',
    );
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
    if (type === 'controls-change' && t - this.lastControlsTimelineAt < 100) {
      this.throttledControlsChangeEvents += 1;
      return;
    }
    if (type === 'controls-change') this.lastControlsTimelineAt = t;
    if (
      (type === 'render-frame' || type === 'render-request') &&
      t - this.lastRenderTimelineAt < 100
    ) {
      this.throttledRenderEvents += 1;
      return;
    }
    if (type === 'render-frame' || type === 'render-request') this.lastRenderTimelineAt = t;
    if (type === 'movement-frame' && t - this.lastMovementTimelineAt < 100) {
      this.throttledRenderEvents += 1;
      return;
    }
    if (type === 'movement-frame') this.lastMovementTimelineAt = t;
    this.pushEvent(type, payload, priority, t);
    if (
      type === 'controls-start' ||
      type === 'movement-keydown' ||
      type === 'movement-frame' ||
      type === 'wheel'
    )
      this.cameraOnlyActive = true;
    if (type === 'movement-keydown' && typeof payload?.['action'] === 'string')
      this.movementActions.add(payload['action']);
    if (type === 'movement-keyup' && typeof payload?.['action'] === 'string')
      this.movementActions.delete(payload['action']);
    if (type === 'controls-end' || (type === 'movement-keyup' && !this.movementActions.size))
      this.cameraOnlyActive = false;
    if (
      priority === 'critical' ||
      type === 'controls-start' ||
      type === 'controls-end' ||
      type === 'movement-keydown' ||
      type === 'movement-keyup' ||
      type === 'wheel'
    )
      this.captureSample(`event:${type}`);
    if (type === 'controls-start' && !this.firstGestureCaptured) {
      this.firstGestureCaptured = true;
      this.pushEvent('first-gesture-before', undefined, 'critical', t);
      this.firstGestureTimer = setTimeout(() => {
        if (this.active) this.captureSample('first-gesture-100ms');
      }, 100);
    }
    if (type === 'controls-end' && this.firstGestureCaptured)
      this.firstGestureEndTimer = setTimeout(() => {
        if (this.active) this.captureSample('first-gesture-250ms');
      }, 250);
  }

  recordDuration(stage: string, durationMs: number): void {
    if (!this.active || !Number.isFinite(durationMs)) return;
    this.statistics.recordDuration(stage, durationMs);
  }

  private pushEvent(
    type: string,
    payload: Readonly<Record<string, unknown>> | undefined,
    priority = eventPriority(type),
    timestamp = this.elapsed(),
  ): void {
    const event: ViewportTraceEvent = {
      t: timestamp,
      type,
      priority,
      ...(payload ? { payload } : {}),
    };
    if (type === 'mark') this.retainedMarks.push(event);
    else if (priority === 'critical') this.criticalEvents.push(event);
    else if (priority === 'normal') this.normalEvents.push(event);
    else this.noisyEvents.push(event);
  }

  private recordHydrationProgress(
    payload: Readonly<Record<string, unknown>> | undefined,
    timestamp: number,
  ): void {
    const next = {
      status: payload?.['status'],
      generation: payload?.['generation'],
      completed: numeric(payload?.['completed']),
      total: numeric(payload?.['total']),
      percent: numeric(payload?.['percent']),
    };
    const previous = this.lastHydrationTimeline;
    const previousProgress = this.lastHydrationProgress;
    this.lastHydrationProgress = next;
    this.hydrationProgressObserved = true;
    if (next.completed !== undefined) {
      if (this.statistics.recordHydrationProgress(previousProgress, next)) {
        this.anomaly('progress-regression', timestamp, {
          before: previousProgress?.completed,
          after: next.completed,
        });
      }
    }
    if (next.completed === undefined)
      this.statistics.recordHydrationProgress(previousProgress, next);
    const progressRegressed =
      previousProgress?.completed !== undefined &&
      next.completed !== undefined &&
      next.completed < previousProgress.completed;
    const generationChanged =
      previous?.generation !== undefined &&
      next.generation !== undefined &&
      previous.generation !== next.generation;
    const immediate =
      !previous ||
      previous.status !== next.status ||
      generationChanged ||
      previous.total !== next.total ||
      progressRegressed ||
      next.status === 'complete' ||
      (previous.percent !== undefined &&
        next.percent !== undefined &&
        next.percent - previous.percent >= 5);
    if (!immediate && timestamp - this.lastHydrationTimelineAt < 150) {
      this.throttledHydrationEvents += 1;
      return;
    }
    this.lastHydrationTimelineAt = timestamp;
    this.lastHydrationTimeline = next;
    this.pushEvent(
      'hydration-progress',
      payload,
      generationChanged || progressRegressed ? 'critical' : immediate ? 'normal' : 'noisy',
      timestamp,
    );
    if (immediate) this.captureSample('hydration-progress');
  }

  captureSample(
    reason = 'manual',
    sampler: () => ViewportTraceSample = this.hooks.sample,
    sampleKind: 'light' | 'heavy' = 'light',
  ): (ViewportTraceSample & { readonly t: number; readonly reason: string }) | undefined {
    if (!this.active) return undefined;
    this.captureSampleCount += 1;
    let sample: ViewportTraceSample;
    const started = now();
    try {
      sample = sampler();
    } catch {
      return undefined;
    }
    const traceSampleMs = Math.max(0, now() - started);
    this.statistics.recordSampleDuration(sampleKind, traceSampleMs);
    const t = this.elapsed();
    const captured = { ...sample, traceSampleMs, t, reason };
    this.samples.push(captured);
    this.statistics.recordSample(sample, this.lastSample, this.hydrationProgressObserved);
    for (const anomaly of detectViewportTraceAnomalies(
      this.lastSample,
      sample,
      t,
      this.cameraOnlyActive,
      this.movementActions.size > 0,
    ))
      this.anomaly(anomaly.type, anomaly.t, anomaly.evidence);
    this.lastSample = sample;
    this.lastSampleTime = t;
    return captured;
  }

  stop(): ViewportTraceDocument | undefined {
    if (!this.active && !this.document) return undefined;
    if (this.active) {
      const finalSample = this.captureSample('final');
      if (finalSample)
        this.markedSegments.push({ label: 'FINAL', t: finalSample.t, sample: finalSample });
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
      this.observer?.disconnect();
      this.observer = undefined;
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

  stopAndDownload(): ViewportTraceDocument | undefined {
    const trace = this.stop();
    this.download();
    return trace;
  }

  private elapsed(): number {
    return Math.max(0, now() - this.startPerf);
  }
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
    this.statistics.recordHeartbeat(intervalMs);
  }
  private observeLongTasks(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    this.longTaskObserverSupported = true;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            t: Math.max(0, entry.startTime - this.startPerf),
            durationMs: entry.duration,
          });
          this.statistics.longTaskAggregate.add(entry.duration);
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this.observer = undefined;
      this.longTaskObserverSupported = false;
    }
  }
  private captureMemory(): void {
    const memory =
      typeof performance !== 'undefined'
        ? (
            performance as Performance & {
              memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
            }
          ).memory
        : undefined;
    if (memory)
      this.memory.push({
        t: this.elapsed(),
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      });
  }
  private anomaly(type: string, t: number, evidence: Readonly<Record<string, unknown>>): void {
    if (this.anomalies.toArray().some((entry) => entry.type === type && t - entry.t < 100)) return;
    const includeStack = this.anomalies.length < 4;
    this.anomalies.push({
      type,
      t,
      evidence,
      ...(includeStack ? { stack: new Error().stack } : {}),
    });
    this.pushEvent(`anomaly:${type}`, evidence, 'critical', t);
  }
  private buildDocument(
    endedAt: string,
    durationMs: number,
    recorderDurationMs = durationMs,
  ): ViewportTraceDocument {
    return buildViewportTraceDocument({
      scenario: this.scenario,
      startedAt: this.startedAt,
      endedAt,
      durationMs,
      recorderDurationMs,
      metadata: this.hooks.metadata(),
      criticalEvents: this.criticalEvents.toArray(),
      normalEvents: this.normalEvents.toArray(),
      noisyEvents: this.noisyEvents.toArray(),
      retainedMarks: this.retainedMarks,
      samples: this.samples.toArray(),
      checkpoints: this.checkpoints.toArray(),
      longTasks: this.longTasks.toArray(),
      memory: this.memory.toArray(),
      anomalies: this.anomalies.toArray(),
      markedSegments: this.markedSegments,
      statistics: this.statistics.snapshot(),
      droppedEventCount:
        this.criticalEvents.droppedCount +
        this.normalEvents.droppedCount +
        this.noisyEvents.droppedCount,
      droppedSampleCount: this.samples.droppedCount,
      counters: {
        traceRecordCount: this.traceRecordCount,
        captureSampleCount: this.captureSampleCount,
        throttledHydrationEvents: this.throttledHydrationEvents,
        throttledControlsChangeEvents: this.throttledControlsChangeEvents,
        throttledRenderEvents: this.throttledRenderEvents,
        controlsChangeCount: this.controlsChangeCount,
        renderRequestCount: this.renderRequestCount,
        renderFrameCount: this.renderFrameCount,
        movementFrameCount: this.movementFrameCount,
        longTaskObserverSupported: this.longTaskObserverSupported,
        checkpointDroppedCount: this.checkpoints.droppedCount,
        rawEventsDroppedByPriority: {
          critical: this.criticalEvents.droppedCount,
          normal: this.normalEvents.droppedCount,
          noisy: this.noisyEvents.droppedCount,
        },
      },
    });
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
function requestFrame(callback: FrameRequestCallback): number {
  return typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : (setTimeout(() => callback(now()), 16) as unknown as number);
}
function cancelFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else clearTimeout(frame);
}
function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
