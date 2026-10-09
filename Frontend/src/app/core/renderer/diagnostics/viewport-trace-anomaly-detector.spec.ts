import { describe, expect, it } from 'vitest';
import { detectViewportTraceAnomalies } from './viewport-trace-anomaly-detector';
import type { ViewportTraceSample } from './viewport-runtime-trace';

describe('viewport trace anomaly detection', () => {
  it('detects runtime regressions and movement drift without owning recorder state', () => {
    const before: ViewportTraceSample = {
      hydration: { completed: 8, generation: 1 }, generations: { providerGeneration: 2 },
      camera: { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, offset: { x: 0, y: 0, z: 5 }, distance: 5, direction: { x: 0, y: 0, z: -1 }, quaternion: [0, 0, 0, 1], up: { x: 0, y: 1, z: 0 }, fov: 45, aspect: 1 },
      counters: { actualSceneRenders: 1, cameraRenderRequests: 0 },
    };
    const after: ViewportTraceSample = {
      ...before, hydration: { completed: 3, generation: 2 }, generations: { providerGeneration: 3 },
      camera: { ...before.camera!, position: { x: 1, y: 0, z: 5 }, offset: { x: 1, y: 0, z: 5 }, direction: { x: .2, y: 0, z: -.98 } },
      counters: { actualSceneRenders: 5, cameraRenderRequests: 0 }, render: { frameDurationMs: 120 },
    };
    const result = detectViewportTraceAnomalies(before, after, 42, true, true);
    expect(result.map((entry) => entry.type)).toEqual([
      'progress-regression', 'generation-changed-during-camera-only', 'provider-generation-changed-during-camera-only',
      'duplicate-render-burst', 'camera-offset-drift-during-translation', 'camera-direction-drift-during-translation', 'frame-stall-over-100ms',
    ]);
    expect(result[0]).toMatchObject({ t: 42, evidence: { before: 8, after: 3 } });
  });

  it('does not report camera-only anomalies outside a camera-only window', () => {
    const sample: ViewportTraceSample = { counters: {}, camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, offset: { x: 0, y: 0, z: 0 }, distance: 0, direction: { x: 0, y: 0, z: 0 }, quaternion: [0, 0, 0, 1], up: { x: 0, y: 1, z: 0 }, fov: 45, aspect: 1 } };
    expect(detectViewportTraceAnomalies(sample, sample, 0, false, false)).toEqual([]);
  });
});
