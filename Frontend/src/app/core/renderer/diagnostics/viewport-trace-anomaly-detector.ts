import type { ViewportTraceSample, ViewportTraceAnomaly } from './viewport-runtime-trace';

export function detectViewportTraceAnomalies(
  before: ViewportTraceSample | undefined,
  sample: ViewportTraceSample,
  t: number,
  cameraOnly: boolean,
  movementActive: boolean,
): readonly ViewportTraceAnomaly[] {
  if (!before) return [];
  const anomalies: ViewportTraceAnomaly[] = [];
  const hydrationBefore = numeric(before.hydration?.['completed']);
  const hydrationAfter = numeric(sample.hydration?.['completed']);
  if (hydrationBefore !== undefined && hydrationAfter !== undefined && hydrationAfter < hydrationBefore) anomalies.push({ type: 'progress-regression', t, evidence: { before: hydrationBefore, after: hydrationAfter } });
  const generationBefore = numeric(before.hydration?.['generation']);
  const generationAfter = numeric(sample.hydration?.['generation']);
  if (generationBefore !== undefined && generationAfter !== undefined && generationAfter !== generationBefore) anomalies.push({ type: cameraOnly ? 'generation-changed-during-camera-only' : 'hydration-generation-change', t, evidence: { before: generationBefore, after: generationAfter } });
  const providerBefore = numeric(before.generations?.['providerGeneration']);
  const providerAfter = numeric(sample.generations?.['providerGeneration']);
  if (providerBefore !== undefined && providerAfter !== undefined && providerAfter !== providerBefore) anomalies.push({ type: cameraOnly ? 'provider-generation-changed-during-camera-only' : 'provider-generation-change', t, evidence: { before: providerBefore, after: providerAfter } });
  const countersBefore = (before.counters ?? {}) as Readonly<Record<string, unknown>>;
  const countersAfter = (sample.counters ?? {}) as Readonly<Record<string, unknown>>;
  for (const [key, type] of [['structuralReconciles', 'full-reconcile-during-camera-only'], ['fullSceneRebuilds', 'full-scene-rebuild-during-camera-only'], ['terrainBulkBatches', 'terrain-bulk-rebuild-during-camera-only']] as const) {
    if (cameraOnly && numeric(countersAfter[key])! > numeric(countersBefore[key])!) anomalies.push({ type, t, evidence: { delta: numeric(countersAfter[key])! - numeric(countersBefore[key])! } });
  }
  const rendersDelta = (numeric(countersAfter['actualSceneRenders']) ?? 0) - (numeric(countersBefore['actualSceneRenders']) ?? 0);
  const requestsDelta = (numeric(countersAfter['cameraRenderRequests']) ?? 0) - (numeric(countersBefore['cameraRenderRequests']) ?? 0);
  if (rendersDelta > Math.max(3, requestsDelta + 1)) anomalies.push({ type: 'duplicate-render-burst', t, evidence: { rendersDelta, requestsDelta } });
  if (cameraOnly && movementActive && before.camera && sample.camera) {
    const offsetDrift = distance3(before.camera.offset, sample.camera.offset);
    const directionDrift = angleDegrees(before.camera.direction, sample.camera.direction);
    if (offsetDrift > 0.01) anomalies.push({ type: 'camera-offset-drift-during-translation', t, evidence: { offsetDrift } });
    if (directionDrift > 0.1) anomalies.push({ type: 'camera-direction-drift-during-translation', t, evidence: { directionDriftDegrees: directionDrift } });
  }
  const frameDuration = numeric(sample.render?.['frameDurationMs']);
  if (frameDuration !== undefined && frameDuration > 100) anomalies.push({ type: 'frame-stall-over-100ms', t, evidence: { frameDurationMs: frameDuration } });
  return anomalies;
}

function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function distance3(a: { readonly x: number; readonly y: number; readonly z: number }, b: { readonly x: number; readonly y: number; readonly z: number }): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function angleDegrees(a: { readonly x: number; readonly y: number; readonly z: number }, b: { readonly x: number; readonly y: number; readonly z: number }): number { const al = Math.hypot(a.x, a.y, a.z); const bl = Math.hypot(b.x, b.y, b.z); if (!al || !bl) return 0; return Math.acos(Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y + a.z * b.z) / (al * bl)))) * 180 / Math.PI; }
