import { percentile } from './viewport-trace-statistics';
import type {
  TraceVector3,
  ViewportTraceAnomaly,
  ViewportTraceCheckpoint,
  ViewportTraceDocument,
  ViewportTraceEvent,
  ViewportTraceEventPriority,
  ViewportTraceMetadata,
  ViewportTraceSample,
} from './viewport-runtime-trace';

type TimedSample = ViewportTraceSample & { readonly t: number; readonly reason: string };
type StatisticsSnapshot = ReturnType<
  import('./viewport-trace-statistics').ViewportTraceStatistics['snapshot']
>;

export interface ViewportTraceReportInput {
  readonly scenario: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly recorderDurationMs: number;
  readonly metadata: ViewportTraceMetadata;
  readonly criticalEvents: readonly ViewportTraceEvent[];
  readonly normalEvents: readonly ViewportTraceEvent[];
  readonly noisyEvents: readonly ViewportTraceEvent[];
  readonly retainedMarks: readonly ViewportTraceEvent[];
  readonly samples: readonly TimedSample[];
  readonly checkpoints: readonly ViewportTraceCheckpoint[];
  readonly longTasks: readonly { readonly t: number; readonly durationMs: number }[];
  readonly memory: readonly {
    readonly t: number;
    readonly usedJSHeapSize: number;
    readonly totalJSHeapSize: number;
    readonly jsHeapSizeLimit: number;
  }[];
  readonly anomalies: readonly ViewportTraceAnomaly[];
  readonly markedSegments: readonly {
    readonly label: string;
    readonly t: number;
    readonly sample?: TimedSample;
  }[];
  readonly statistics: StatisticsSnapshot;
  readonly counters: {
    readonly traceRecordCount: number;
    readonly captureSampleCount: number;
    readonly throttledHydrationEvents: number;
    readonly throttledControlsChangeEvents: number;
    readonly throttledRenderEvents: number;
    readonly controlsChangeCount: number;
    readonly renderRequestCount: number;
    readonly renderFrameCount: number;
    readonly movementFrameCount: number;
    readonly longTaskObserverSupported: boolean;
    readonly checkpointDroppedCount: number;
    readonly rawEventsDroppedByPriority: Readonly<Record<string, number>>;
  };
  readonly droppedEventCount: number;
  readonly droppedSampleCount: number;
}

/** Builds the immutable export view; recording buffers and their lifecycle remain with the recorder. */
export function buildViewportTraceDocument(input: ViewportTraceReportInput): ViewportTraceDocument {
  const { statistics, durationMs } = input;
  const hydration = statistics.hydration;
  const camera = statistics.camera;
  const renderStats = statistics.render;
  const heartbeat = statistics.heartbeat;
  const longTaskStats = statistics.longTasks;
  const samples = input.samples;
  const first = samples[0];
  const last = samples.at(-1);
  const hydrationValues = samples
    .map((sample) => numeric(sample.hydration?.['completed']))
    .filter((value): value is number => value !== undefined);
  const distances = samples
    .map((sample) => sample.camera?.distance)
    .filter((value): value is number => value !== undefined);
  const renderCpu = samples
    .map((sample) => numeric(sample.render?.['renderCpuMs']))
    .filter((value): value is number => value !== undefined);
  const draws = samples
    .map((sample) => numeric(sample.render?.['drawCalls']))
    .filter((value): value is number => value !== undefined);
  const triangles = samples
    .map((sample) => numeric(sample.render?.['triangles']))
    .filter((value): value is number => value !== undefined);
  const heartbeatIntervals = statistics.heartbeatIntervals;
  const countersFirst =
    statistics.firstCounters ?? ((first?.counters ?? {}) as Readonly<Record<string, unknown>>);
  const countersLast =
    statistics.lastCounters ?? ((last?.counters ?? {}) as Readonly<Record<string, unknown>>);
  const deltaCounter = (key: string): number =>
    Math.max(0, (numeric(countersLast[key]) ?? 0) - (numeric(countersFirst[key]) ?? 0));
  const durationSummary: Record<string, unknown> = {};
  Object.assign(durationSummary, statistics.durationSummaries);
  const timeline = [
    ...input.criticalEvents,
    ...input.normalEvents,
    ...input.noisyEvents,
    ...input.retainedMarks,
  ].sort((a, b) => a.t - b.t || priorityOrder(a.priority) - priorityOrder(b.priority));
  const effectiveSpeeds = samples
    .map((sample) => numeric(sample.build?.['effectiveMovementSpeed']))
    .filter((value): value is number => value !== undefined);
  const sampleGenerationStart = numeric(first?.hydration?.['generation']);
  const sampleGenerationEnd = numeric(last?.hydration?.['generation']);
  const observedDurationMs = durationMs;

  return {
    schema: 'minecraftbuilder.viewport-trace.v1',
    scenario: input.scenario,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs,
    observedDurationMs,
    recorderDurationMs: input.recorderDurationMs,
    metadata: input.metadata,
    timeline,
    samples,
    checkpoints: input.checkpoints,
    longTasks: input.longTasks,
    memory: input.memory,
    droppedEventCount: input.droppedEventCount,
    summary: {
      durationMs,
      observedDurationMs,
      recorderDurationMs: input.recorderDurationMs,
      hydration: {
        startCompleted: hydration.startCompleted ?? hydrationValues[0] ?? 0,
        endCompleted: hydration.latestCompleted ?? hydrationValues.at(-1) ?? 0,
        deltaCompleted:
          (hydration.latestCompleted ?? hydrationValues.at(-1) ?? 0) -
          (hydration.startCompleted ?? hydrationValues[0] ?? 0),
        blocksPerSecond:
          durationMs > 0
            ? ((hydration.latestCompleted ?? hydrationValues.at(-1) ?? 0) -
                (hydration.startCompleted ?? hydrationValues[0] ?? 0)) /
              (durationMs / 1000)
            : 0,
        generationStart: hydration.generationStart ?? sampleGenerationStart,
        generationEnd: hydration.generationEnd ?? sampleGenerationEnd,
        progressRegressionCount:
          hydration.regressions ||
          input.anomalies.filter((entry) => entry.type === 'progress-regression').length,
      },
      camera: {
        startDistance: camera.startDistance ?? distances[0],
        endDistance: camera.endDistance ?? distances.at(-1),
        minDistance: Number.isFinite(camera.minDistance) ? camera.minDistance : undefined,
        maxDistance: Number.isFinite(camera.maxDistance) ? camera.maxDistance : undefined,
        maxOffsetDrift: camera.maxOffsetDrift || maxVectorDrift(samples, 'offset'),
        maxDirectionDriftDegrees:
          camera.maxDirectionDriftDegrees || maxAngularDrift(samples, 'direction'),
        maxQuaternionDriftDegrees: camera.maxQuaternionDriftDegrees || maxQuaternionDrift(samples),
        effectiveMovementSpeedMin: Number.isFinite(camera.effectiveMin)
          ? camera.effectiveMin
          : effectiveSpeeds.length
            ? Math.min(...effectiveSpeeds)
            : undefined,
        effectiveMovementSpeedMax: Number.isFinite(camera.effectiveMax)
          ? camera.effectiveMax
          : effectiveSpeeds.length
            ? Math.max(...effectiveSpeeds)
            : undefined,
      },
      render: {
        actualSceneRendersDelta: deltaCounter('actualSceneRenders'),
        renderRequestsDelta: deltaCounter('cameraRenderRequests'),
        coalescedDelta: deltaCounter('cameraRenderRequestsCoalesced'),
        drawCallsMin: renderStats.draws.observedCount
          ? renderStats.draws.min
          : draws.length
            ? Math.min(...draws)
            : undefined,
        drawCallsMax: renderStats.draws.observedCount
          ? renderStats.draws.max
          : draws.length
            ? Math.max(...draws)
            : undefined,
        trianglesMin: renderStats.triangles.observedCount
          ? renderStats.triangles.min
          : triangles.length
            ? Math.min(...triangles)
            : undefined,
        trianglesMax: renderStats.triangles.observedCount
          ? renderStats.triangles.max
          : triangles.length
            ? Math.max(...triangles)
            : undefined,
        renderCpuP50: renderStats.renderCpu.summary.p50Ms ?? percentile(renderCpu, 0.5),
        renderCpuP95: renderStats.renderCpu.summary.p95Ms ?? percentile(renderCpu, 0.95),
        renderCpuMax:
          renderStats.renderCpu.max !== Number.NEGATIVE_INFINITY
            ? renderStats.renderCpu.max
            : renderCpu.length
              ? Math.max(...renderCpu)
              : undefined,
      },
      responsiveness: {
        heartbeatSamples: heartbeat.observedCount,
        approximateFps: durationMs > 0 ? heartbeat.observedCount / (durationMs / 1000) : 0,
        frameIntervalP50: heartbeat.summary.p50Ms,
        frameIntervalP95: heartbeat.summary.p95Ms,
        frameIntervalP99: percentile(heartbeatIntervals, 0.99),
        maxFrameInterval: Number.isFinite(heartbeat.max) ? heartbeat.max : undefined,
        framesOver16_7ms: heartbeat.over16_7,
        framesOver33ms: heartbeat.over33,
        framesOver50ms: heartbeat.over50,
        framesOver100ms: heartbeat.over100,
        framesOver250ms: heartbeat.over250,
        longTaskObserverSupported: input.counters.longTaskObserverSupported,
        longTaskCount: longTaskStats.observedCount,
        longTaskTotalMs: longTaskStats.total,
        longTaskMaxMs: Number.isFinite(longTaskStats.max) ? longTaskStats.max : undefined,
        longTaskP95Ms: longTaskStats.summary.p95Ms,
      },
      build: {
        terrainChunkRebuildsDelta: deltaCounter('terrainChunkRebuilds'),
        terrainBlocksCompiledDelta: deltaCounter('terrainBlocksCompiled'),
        terrainFacesEmittedDelta: deltaCounter('terrainFacesEmitted'),
        terrainFacesCulledDelta: deltaCounter('terrainFacesCulled'),
        incrementalTerrainChunkRebuildsDelta: deltaCounter('incrementalTerrainChunkRebuilds'),
        terrainBulkBatchesDelta: deltaCounter('terrainBulkBatches'),
        hydrationBatchesDelta: deltaCounter('hydrationBatches'),
        fullReconcileFallbacksDelta: deltaCounter('fullReconcileFallbacks'),
        fullVisibleScansDelta: deltaCounter('fullVisibleScans'),
        occupancyFullRebuildsDelta: deltaCounter('occupancyFullRebuilds'),
        providerObjectCreationsDelta: deltaCounter('providerObjectCreations'),
        reusableTemplateCreationsDelta: deltaCounter('reusableTemplateCreations'),
        durationSamples: durationSummary,
      },
      staticModels: last?.staticModels ? { ...last.staticModels } : {},
      fluids: last?.fluids ? { ...last.fluids } : {},
      anomalies: input.anomalies,
      segments: segmentSummaries(input.markedSegments, samples, durationMs),
      recorder: {
        traceRecordCount: input.counters.traceRecordCount,
        captureSampleCount: input.counters.captureSampleCount,
        checkpointCount: input.checkpoints.length,
        checkpointDroppedCount: input.counters.checkpointDroppedCount,
        throttledHydrationEvents: input.counters.throttledHydrationEvents,
        throttledControlsChangeEvents: input.counters.throttledControlsChangeEvents,
        throttledRenderEvents: input.counters.throttledRenderEvents,
        controlsChangeCount: input.counters.controlsChangeCount,
        renderRequestCount: input.counters.renderRequestCount,
        renderFrameCount: input.counters.renderFrameCount,
        movementFrameCount: input.counters.movementFrameCount,
        heartbeatStoredSampleCount: statistics.heartbeatStoredSampleCount,
        heartbeatDroppedSampleCount: statistics.heartbeatDroppedSampleCount,
        rawEventsStoredByPriority: {
          critical: input.criticalEvents.length,
          normal: input.normalEvents.length,
          noisy: input.noisyEvents.length,
          retainedMarks: input.retainedMarks.length,
        },
        rawEventsDroppedByPriority: input.counters.rawEventsDroppedByPriority,
        droppedSampleCount: input.droppedSampleCount,
      },
      traceSampleMs: statistics.lightSample,
      lightSampleMs: statistics.lightSample,
      heavyCheckpointMs: statistics.heavyCheckpoint,
    },
  };
}

function segmentSummaries(
  markedSegments: ViewportTraceReportInput['markedSegments'],
  samples: readonly TimedSample[],
  durationMs: number,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const result: Record<string, Readonly<Record<string, unknown>>> = {};
  const markers = [...markedSegments, { label: '__end', t: durationMs }];
  for (let index = 0; index < markers.length - 1; index++) {
    const marker = markers[index];
    const next = markers[index + 1];
    const range = samples.filter((sample) => sample.t >= marker.t && sample.t <= next.t);
    const first = marker.sample ?? range[0];
    const last = next.sample ?? range.at(-1);
    const completed = range
      .map((sample) => numeric(sample.hydration?.['completed']))
      .filter((value): value is number => value !== undefined);
    const beforeCounters = numericCounters(
      first?.counters as Readonly<Record<string, unknown>> | undefined,
    );
    const afterCounters = numericCounters(
      last?.counters as Readonly<Record<string, unknown>> | undefined,
    );
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
      cameraOffsetDrift:
        first?.camera && last?.camera ? distance3(first.camera.offset, last.camera.offset) : 0,
    };
  }
  return result;
}

function maxVectorDrift(samples: readonly TimedSample[], key: 'offset'): number {
  let max = 0;
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1].camera?.[key];
    const after = samples[index].camera?.[key];
    if (before && after) max = Math.max(max, distance3(before, after));
  }
  return max;
}
function maxAngularDrift(samples: readonly TimedSample[], key: 'direction'): number {
  let max = 0;
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1].camera?.[key];
    const after = samples[index].camera?.[key];
    if (before && after) max = Math.max(max, angleDegrees(before, after));
  }
  return max;
}
function maxQuaternionDrift(samples: readonly TimedSample[]): number {
  let max = 0;
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1].camera?.quaternion;
    const after = samples[index].camera?.quaternion;
    if (before && after) max = Math.max(max, quaternionAngle(before, after));
  }
  return max;
}
function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function priorityOrder(priority: ViewportTraceEventPriority | undefined): number {
  return priority === 'critical' ? 0 : priority === 'normal' ? 1 : 2;
}
function numericCounters(
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, number>> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const number = numeric(entry);
      return number === undefined ? [] : [[key, number]];
    }),
  );
}
function counterDeltaMap(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries(
    [...keys]
      .filter((key) => !GAUGE_COUNTER_KEYS.has(key))
      .sort()
      .map((key) => [key, Math.max(0, (after[key] ?? 0) - (before[key] ?? 0))]),
  );
}
const GAUGE_COUNTER_KEYS = new Set([
  'instancedMeshCount',
  'instancedMembers',
  'interiorBlocksCulled',
  'surfaceFastPathBlocks',
  'exposedFaceInstances',
  'neighborFacesCulled',
]);
function gaugeDeltaMap(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...GAUGE_COUNTER_KEYS]
      .filter((key) => key in before || key in after)
      .map((key) => [key, (after[key] ?? 0) - (before[key] ?? 0)]),
  );
}
function distance3(a: TraceVector3, b: TraceVector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function angleDegrees(a: TraceVector3, b: TraceVector3): number {
  const al = Math.hypot(a.x, a.y, a.z);
  const bl = Math.hypot(b.x, b.y, b.z);
  if (!al || !bl) return 0;
  return (
    (Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (al * bl)))) * 180) /
    Math.PI
  );
}
function quaternionAngle(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  return (
    (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) *
      2 *
      180) /
    Math.PI
  );
}
