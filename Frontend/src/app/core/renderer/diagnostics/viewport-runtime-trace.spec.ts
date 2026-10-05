import { describe, expect, it, vi } from 'vitest';
import { BoundedTraceBuffer, percentile, sanitizeTraceScenario, stableTraceJson, viewportTraceFilename, ViewportRuntimeTrace, type TraceDurationSummary, type ViewportTraceSample } from './viewport-runtime-trace';

function sample(overrides: Partial<ViewportTraceSample> = {}): ViewportTraceSample {
  return {
    camera: { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, offset: { x: 0, y: 0, z: 5 }, distance: 5, direction: { x: 0, y: 0, z: -1 }, quaternion: [0, 0, 0, 1], up: { x: 0, y: 1, z: 0 }, fov: 45, aspect: 1 },
    hydration: { completed: 0, generation: 1 }, counters: { actualSceneRenders: 0, cameraRenderRequests: 0, cameraRenderRequestsCoalesced: 0, structuralReconciles: 0, fullSceneRebuilds: 0, terrainBulkBatches: 0 },
    render: { frameDurationMs: 16, renderCpuMs: 1, drawCalls: 2, triangles: 12 },
    generations: { providerGeneration: 1 },
    ...overrides,
  };
}

describe('ViewportRuntimeTrace', () => {
  it('keeps bounded buffers and reports dropped values', () => {
    const buffer = new BoundedTraceBuffer<number>(2);
    buffer.push(1); buffer.push(2); buffer.push(3);
    expect(buffer.toArray()).toEqual([2, 3]);
    expect(buffer.droppedCount).toBe(1);
  });

  it('calculates interpolated percentiles and safe filenames', () => {
    expect(percentile([1, 2, 3, 4], .5)).toBe(2.5);
    expect(sanitizeTraceScenario(' rmb first / test ')).toBe('rmb-first-test');
    expect(viewportTraceFilename('rmb first', new Date('2026-10-04T01:02:03.004Z'))).toBe('minecraftbuilder-viewport-trace-rmb-first-2026-10-04T01-02-03-004Z.json');
  });

  it('records lifecycle, marks, summary and stable JSON', () => {
    const trace = new ViewportRuntimeTrace({ metadata: () => ({ projectBlocks: 12, minecraftVersion: '1.21.1' }), sample: () => sample({ staticModels: { standaloneLogical: 4, standaloneReasonCounts: { transparent: 2 } } }) });
    trace.start('idle-build'); trace.mark('checkpoint');
    const document = trace.stop();
    expect(document?.schema).toBe('minecraftbuilder.viewport-trace.v1');
    expect(document?.timeline.map((event) => event.type)).toEqual(expect.arrayContaining(['trace-start', 'mark', 'trace-stop']));
    expect(document?.metadata['projectBlocks']).toBe(12);
    expect(document?.samples.at(-1)?.staticModels?.['standaloneLogical']).toBe(4);
    expect(document?.summary.staticModels['standaloneLogical']).toBe(4);
    expect(stableTraceJson(document)).toContain('idle-build');
  });

  it('detects progress, generation and camera drift during a camera gesture', () => {
    let current = sample();
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => current });
    trace.start('rmb-first');
    trace.record('controls-start');
    trace.record('movement-keydown', { action: 'forward' });
    current = sample({ camera: { ...current.camera!, offset: { x: 1, y: 0, z: 5 }, position: { x: 1, y: 0, z: 5 }, direction: { x: .2, y: 0, z: -.98 } }, hydration: { completed: -1, generation: 2 }, generations: { providerGeneration: 2 } });
    trace.captureSample('changed');
    const document = trace.stop();
    const types = document?.summary.anomalies.map((entry) => entry.type) ?? [];
    expect(types).toEqual(expect.arrayContaining(['progress-regression', 'generation-changed-during-camera-only', 'provider-generation-changed-during-camera-only', 'camera-offset-drift-during-translation', 'camera-direction-drift-during-translation']));
  });

  it('does not fail when PerformanceObserver is unavailable', () => {
    const original = globalThis.PerformanceObserver;
    vi.stubGlobal('PerformanceObserver', undefined);
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => sample() });
    expect(trace.stop()).toBeUndefined();
    trace.start('unsupported');
    expect(trace.stop()?.summary.responsiveness.longTaskObserverSupported).toBe(false);
    if (original) vi.stubGlobal('PerformanceObserver', original); else vi.unstubAllGlobals();
  });

  it('retains critical marks while hydration progress floods the recorder', () => {
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => sample() });
    trace.start('all-in-one-final');
    trace.mark('rmb-first');
    for (let completed = 0; completed < 100_000; completed += 1) {
      trace.record('hydration-progress', { status: completed === 99_999 ? 'complete' : 'hydrating', generation: 1, completed, total: 100_000, percent: completed / 1_000 });
    }
    trace.mark('rmb-second');
    trace.mark('mmb');
    trace.mark('wasd-far');
    trace.mark('wasd-near');
    trace.mark('wheel');
    const document = trace.stop();
    const marks = document?.timeline.filter((event) => event.type === 'mark').map((event) => event.payload?.['label']);
    expect(marks).toEqual(['rmb-first', 'rmb-second', 'mmb', 'wasd-far', 'wasd-near', 'wheel']);
    expect(document?.summary.hydration.endCompleted).toBe(99_999);
    expect(document?.summary.recorder['throttledHydrationEvents']).toBeGreaterThan(99_000);
  });

  it('keeps noisy hydration and render timelines bounded while summaries remain current', () => {
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => sample() });
    trace.start('bounded');
    for (let completed = 0; completed < 10_000; completed += 1) {
      trace.record('hydration-progress', { status: 'hydrating', generation: 3, completed, total: 10_000, percent: completed / 100 });
      trace.record('render-frame', { frame: completed });
      trace.record('render-request', { request: completed });
    }
    const document = trace.stop();
    expect(document?.timeline.length).toBeLessThan(2_100);
    expect(document?.summary.hydration.endCompleted).toBe(9_999);
    expect(document?.summary.recorder['renderFrameCount']).toBe(10_000);
    expect(document?.summary.recorder['renderRequestCount']).toBe(10_000);
    expect(document?.summary.recorder['throttledRenderEvents']).toBeGreaterThan(19_000);
  });

  it('aggregates heartbeat intervals without retaining an unbounded timeline', () => {
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => sample() });
    trace.start('heartbeat');
    for (let index = 0; index < 10_000; index += 1) trace.recordHeartbeat(20);
    const document = trace.stop();
    expect(document?.summary.responsiveness.heartbeatSamples).toBe(10_000);
    expect(document?.summary.responsiveness.frameIntervalP50).toBe(20);
    expect(document?.summary.responsiveness.frameIntervalP95).toBe(20);
    expect(document?.summary.recorder['heartbeatStoredSampleCount']).toBe(512);
    expect(document?.summary.recorder['heartbeatDroppedSampleCount']).toBe(9_488);
  });

  it('reports observed duration counts separately from bounded percentile samples', () => {
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => sample() });
    trace.start('durations');
    for (let index = 0; index < 10_000; index += 1) trace.recordDuration('provider.create', index % 17);
    const document = trace.stop();
    const durations = document?.summary.build['durationSamples'] as Record<string, TraceDurationSummary> | undefined;
    expect(durations?.['provider.create'].observedCount).toBe(10_000);
    expect(durations?.['provider.create'].storedSampleCount).toBe(256);
    expect(durations?.['provider.create'].droppedSampleCount).toBe(9_744);
    expect(durations?.['provider.create'].totalMs).toBe(79_974);
    expect(durations?.['provider.create'].maxMs).toBe(16);
  });

  it('keeps marked segment boundaries and first gesture evidence', () => {
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => sample() });
    trace.start('segments');
    trace.record('controls-start');
    trace.mark('rmb-first');
    for (let index = 0; index < 2_000; index += 1) trace.record('hydration-progress', { status: 'hydrating', generation: 1, completed: index, total: 2_000 });
    trace.mark('rmb-second');
    trace.mark('wasd-far');
    trace.mark('wheel');
    const document = trace.stop();
    expect(document?.summary.segments).toEqual(expect.objectContaining({ 'rmb-first': expect.any(Object), 'rmb-second': expect.any(Object), 'wasd-far': expect.any(Object), wheel: expect.any(Object) }));
    expect(document?.timeline.map((event) => event.type)).toEqual(expect.arrayContaining(['controls-start', 'first-gesture-before']));
  });

  it('keeps regressions and generation evidence as critical timeline events', () => {
    let current = sample({ hydration: { completed: 10, generation: 1 } });
    const trace = new ViewportRuntimeTrace({ metadata: () => ({}), sample: () => current });
    trace.start('anomalies');
    trace.record('hydration-progress', { status: 'hydrating', generation: 1, completed: 10, total: 20 });
    trace.record('hydration-progress', { status: 'hydrating', generation: 2, completed: 1, total: 20 });
    current = sample({ hydration: { completed: 1, generation: 2 }, generations: { providerGeneration: 2 } });
    trace.captureSample('generation-change');
    const document = trace.stop();
    expect(document?.timeline.map((event) => event.type)).toEqual(expect.arrayContaining(['anomaly:progress-regression', 'anomaly:hydration-generation-change']));
    expect(document?.summary.hydration.progressRegressionCount).toBeGreaterThan(0);
  });
});
