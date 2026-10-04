import { describe, expect, it, vi } from 'vitest';
import { BoundedTraceBuffer, percentile, sanitizeTraceScenario, stableTraceJson, viewportTraceFilename, ViewportRuntimeTrace, type ViewportTraceSample } from './viewport-runtime-trace';

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
    const trace = new ViewportRuntimeTrace({ metadata: () => ({ projectBlocks: 12, minecraftVersion: '1.21.1' }), sample: () => sample() });
    trace.start('idle-build'); trace.mark('checkpoint');
    const document = trace.stop();
    expect(document?.schema).toBe('minecraftbuilder.viewport-trace.v1');
    expect(document?.timeline.map((event) => event.type)).toEqual(expect.arrayContaining(['trace-start', 'mark', 'trace-stop']));
    expect(document?.metadata['projectBlocks']).toBe(12);
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
});
