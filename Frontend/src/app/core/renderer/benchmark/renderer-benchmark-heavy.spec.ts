import { describe, expect, it } from 'vitest';
import { ThreeViewportEngine } from '../engine/three-viewport-engine';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { benchmarkBlock, rendererBenchmarkProject, rendererBenchmarkVisualProvider } from './renderer-benchmark-fixtures';

describe('explicit renderer benchmark', () => {
  it('measures medium and large incremental updates only when explicitly requested', async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['RENDERER_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    for (const size of ['medium', 'large'] as const) {
      const project = rendererBenchmarkProject(size);
      const diagnostics = new RendererDiagnostics();
      const engine = new ThreeViewportEngine(diagnostics);
      const provider = rendererBenchmarkVisualProvider(); engine.setVisualProvider(provider);
      const started = Date.now();
      engine.update(project, undefined);
      await settleRendererPromises();
      const initial = diagnostics.snapshot();
      const position = { x: project.size.x - 1, y: project.size.y - 1, z: project.size.z - 1 };
      const afterAdd = { ...project, blocks: [...project.blocks, benchmarkBlock(project.blocks.length + 1, position)] };
      engine.update(afterAdd, undefined);
      await settleRendererPromises();
      const afterAddCounters = diagnostics.snapshot();
      const edited = { ...afterAdd, blocks: afterAdd.blocks.map((block, index) => index === 1 ? { ...block, state: { ...block.state, shape: 'inner_left' } } : block) };
      engine.update(edited, undefined);
      await settleRendererPromises();
      const afterStateCounters = diagnostics.snapshot();
      engine.update(edited, undefined, { selected: position });
      const afterSelectionCounters = diagnostics.snapshot();
      const firstDecoration = edited.decorations?.[0];
      const afterDecoration = firstDecoration ? { ...edited, decorations: edited.decorations?.map((decoration, index) => index === 0 ? { ...decoration, anchor: { x: decoration.anchor.x + 1, y: decoration.anchor.y, z: decoration.anchor.z } } : decoration) } : edited;
      engine.update(afterDecoration, undefined);
      const counters = diagnostics.snapshot();
      expect(counters.fullSceneRebuilds).toBe(1);
      expect(afterAddCounters.blockAdds - initial.blockAdds).toBe(1);
      expect(afterStateCounters.blockVisualCreations - afterAddCounters.blockVisualCreations).toBeLessThanOrEqual(7);
      expect(afterSelectionCounters.blockVisualCreations).toBe(afterStateCounters.blockVisualCreations);
      expect(counters.decorationUpdates - afterSelectionCounters.decorationUpdates).toBe(firstDecoration ? 1 : 0);
      const beforeDispose = provider.resourceCounts?.(); provider.dispose(); const afterDispose = provider.resourceCounts?.();
      console.info(`[renderer benchmark] ${size} initial=${initial.blockVisualCreations} addDelta=${afterAddCounters.blockVisualCreations - initial.blockVisualCreations} stateDelta=${afterStateCounters.blockVisualCreations - afterAddCounters.blockVisualCreations} selectionDelta=${afterSelectionCounters.blockVisualCreations - afterStateCounters.blockVisualCreations} decorationDelta=${counters.decorationVisualCreations - afterSelectionCounters.decorationVisualCreations} modelCache=${counters.resolvedModelCacheHits}/${counters.resolvedModelCacheMisses} geometryCache=${counters.geometryCacheHits}/${counters.geometryCacheMisses} textureCache=${counters.textureCacheHits}/${counters.textureCacheMisses} resources=${JSON.stringify(beforeDispose)} disposed=${JSON.stringify(afterDispose)} fullRebuilds=${counters.fullSceneRebuilds} elapsedMs=${Date.now() - started}`);
      engine.dispose();
    }
  });

  it('records steady-state evidence for the 20k fixture when explicitly requested', { timeout: 15000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['RENDERER_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    const project = rendererBenchmarkProject('stress');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    const started = Date.now();
    engine.update(project, undefined);
    await settleRendererPromises(300);
    const evidence = engine.performanceEvidence();
    const counters = diagnostics.snapshot();
    expect(evidence.renderedBlocks).toBe(project.blocks.length);
    expect(counters.instancedMembers).toBeGreaterThan(0);
    expect(evidence.meshCount).toBeLessThan(project.blocks.length / 100);
    console.info(`[renderer benchmark] stress CPU/hydration blocks=${evidence.renderedBlocks} calls=${evidence.renderCalls} triangles=${evidence.triangles} geometries=${evidence.geometries} textures=${evidence.textures} object3d=${evidence.object3dCount} meshes=${evidence.meshCount} instances=${evidence.instanceMembers} instanceMeshes=${evidence.instanceMeshCount} providerObjects=${counters.providerObjectCreations} templateCreates=${counters.reusableTemplateCreations} templateHits=${counters.reusableTemplateCacheHits} boundsComputations=${counters.instancedBoundsComputations} queue=${evidence.hydrationQueue} running=${evidence.hydrationRunning} frameMs=${evidence.frameDurationMs.toFixed(2)} hydrationElapsedMs=${Date.now() - started}`);
    provider.dispose();
    engine.dispose();
  });
});

async function settleRendererPromises(rounds = 1): Promise<void> { for (let index = 0; index < rounds; index += 1) { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); } }
