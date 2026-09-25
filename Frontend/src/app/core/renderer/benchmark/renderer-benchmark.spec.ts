import { describe, expect, it } from 'vitest';
import { ThreeViewportEngine } from '../engine/three-viewport-engine';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { rendererBenchmarkProject, rendererBenchmarkVisualProvider } from './renderer-benchmark-fixtures';

describe('renderer incremental baseline', () => {
  it('keeps the normal benchmark test small and deterministic', () => {
    expect(rendererBenchmarkProject('small').blocks).toHaveLength(256);
    expect(rendererBenchmarkProject('medium').blocks).toHaveLength(2048);
    expect(rendererBenchmarkProject('large').blocks).toHaveLength(8192);
  });

  it('updates a single structural entry without rebuilding unchanged entries', () => {
    const project = rendererBenchmarkProject('small');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    engine.update(project, undefined);
    const initial = diagnostics.snapshot();
    const added = { kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 15, y: 15, z: 15 }, state: {} };
    engine.update({ ...project, blocks: [...project.blocks, added] }, undefined);
    const after = diagnostics.snapshot();
    expect(initial.fullSceneRebuilds).toBe(1);
    expect(after.fullSceneRebuilds).toBe(1);
    expect(after.blockAdds).toBe(project.blocks.length + 1);
    expect(after.blockVisualCreations).toBe(project.blocks.length + 1);
    engine.update({ ...project, blocks: [...project.blocks, added] }, undefined, { selected: added.position });
    expect(diagnostics.snapshot().fullSceneRebuilds).toBe(1);
    engine.dispose();
  });

  it('keeps decoration selection as an overlay and reconciles one changed instance', () => {
    const project = rendererBenchmarkProject('small');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    engine.update(project, undefined);
    const initialDecorations = diagnostics.snapshot().decorationVisualCreations;
    engine.update(project, undefined, { selectedDecorationId: project.decorations?.[0]?.instanceId });
    expect(diagnostics.snapshot().fullSceneRebuilds).toBe(1);
    expect(diagnostics.snapshot().decorationVisualCreations).toBe(initialDecorations);
    const decoration = project.decorations?.[0];
    if (!decoration) throw new Error('benchmark fixture must contain a decoration');
    engine.update({ ...project, decorations: [{ ...decoration, anchor: { x: 3, y: 1, z: 0 } }] }, undefined, { selectedDecorationId: decoration.instanceId });
    expect(diagnostics.snapshot().decorationUpdates).toBe(1);
    expect(diagnostics.snapshot().fullSceneRebuilds).toBe(1);
    engine.dispose();
  });

  it('reuses safe visual templates for the 20k stress scene instead of constructing one object per block', async () => {
    const project = rendererBenchmarkProject('stress');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    engine.update(project, undefined);
    await settleHydration();
    const counters = diagnostics.snapshot();
    // The fixture intentionally includes a transparent visual and a multipart
    // fence that remain non-instanced; opaque cube/stair members still batch.
    expect(counters.instancedMembers).toBeGreaterThan(project.blocks.length / 3);
    expect(counters.instancedMembers).toBeLessThan(project.blocks.length);
    expect(counters.reusableTemplateCreations).toBeGreaterThan(0);
    expect(counters.reusableTemplateCacheHits).toBeGreaterThan(project.blocks.length / 3);
    expect(counters.providerObjectCreations).toBeLessThan(project.blocks.length);
    expect(counters.instancedMeshCount).toBeLessThan(project.blocks.length / 50);
    engine.dispose();
    provider.dispose();
  }, 20_000);
});

async function settleHydration(): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}
