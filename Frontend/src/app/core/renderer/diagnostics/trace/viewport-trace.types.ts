import type { RendererCounters } from '../../engine/renderer-diagnostics';
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
  readonly observedDurationMs: number;
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
