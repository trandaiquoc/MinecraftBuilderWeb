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
      await settleHydration(200, engine);
      const initial = diagnostics.snapshot();
      const position = { x: project.size.x - 1, y: project.size.y - 1, z: project.size.z - 1 };
      const afterAdd = { ...project, blocks: [...project.blocks, benchmarkBlock(project.blocks.length + 1, position)] };
      engine.update(afterAdd, undefined);
      await settleHydration(200, engine);
      const afterAddCounters = diagnostics.snapshot();
      const edited = { ...afterAdd, blocks: afterAdd.blocks.map((block, index) => index === 1 ? { ...block, state: { ...block.state, shape: 'inner_left' } } : block) };
      engine.update(edited, undefined);
      await settleHydration(200, engine);
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
      console.info(`[renderer benchmark] ${size} initial=${initial.blockVisualCreations} addDelta=${afterAddCounters.blockVisualCreations - initial.blockVisualCreations} stateDelta=${afterStateCounters.blockVisualCreations - afterAddCounters.blockVisualCreations} selectionDelta=${afterSelectionCounters.blockVisualCreations - afterStateCounters.blockVisualCreations} decorationDelta=${counters.decorationVisualCreations - afterSelectionCounters.decorationVisualCreations} modelCache=${counters.resolvedModelCacheHits}/${counters.resolvedModelCacheMisses} geometryCache=${counters.geometryCacheHits}/${counters.geometryCacheMisses} textureCache=${counters.textureCacheHits}/${counters.textureCacheMisses} fallbackMeshes=${counters.fallbackMeshCreations} cachedInsertions=${counters.cachedTemplateInsertions} cameraFrames=${counters.cameraMovementFrames} suppressedCameraRenders=${counters.cameraRenderRequestsSuppressed} resources=${JSON.stringify(beforeDispose)} disposed=${JSON.stringify(afterDispose)} fullRebuilds=${counters.fullSceneRebuilds} elapsedMs=${Date.now() - started}`);
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
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleRendererPromises(300);
    const evidence = engine.performanceEvidence();
    const counters = diagnostics.snapshot();
    expect(evidence.renderedBlocks).toBe(project.blocks.length);
    expect(evidence.terrainLogicalBlocks).toBeGreaterThan(0);
    expect(evidence.terrainChunkMeshes).toBeLessThan(project.blocks.length / 50);
    expect(evidence.terrainFacesEmitted).toBeGreaterThan(0);
    expect(counters.instancedMembers).toBeGreaterThan(0);
    expect(evidence.meshCount).toBeLessThan(project.blocks.length / 100);
    const staticModels = engine.runtimeTraceSample().staticModels ?? {};
    console.info(`[renderer benchmark] stress CPU/hydration blocks=${evidence.renderedBlocks} renderable=${evidence.renderableBlocks} terrainBlocks=${evidence.terrainLogicalBlocks} terrainChunks=${evidence.terrainChunks} terrainMeshes=${evidence.terrainChunkMeshes} terrainFaces=${evidence.terrainFacesEmitted} culled=${evidence.interiorBlocksCulled} regions=${evidence.renderRegionCount} regionSize=${evidence.renderRegionSize} surfaceFastPath=${evidence.surfaceFastPathBlocks} exposedFaces=${evidence.exposedFaceInstances} neighborFacesCulled=${evidence.neighborFacesCulled} surfaceBatches=${evidence.surfaceFaceBatches} surfaceMeshes=${evidence.surfaceFaceInstancedMeshes} calls=${evidence.renderCalls} triangles=${evidence.triangles} geometries=${evidence.geometries} textures=${evidence.textures} object3d=${evidence.object3dCount} meshes=${evidence.meshCount} visibleMeshes=${evidence.visibleMeshCount} instances=${evidence.instanceMembers} instanceBatches=${evidence.instanceBatches} regionalInstanceBatches=${evidence.regionalInstanceBatchCount} regionalInstanceMeshes=${evidence.regionalInstanceMeshCount} regionalSurfaceBatches=${evidence.regionalSurfaceBatchCount} instanceMaterials=${evidence.instanceMaterialCount} instanceGeometries=${evidence.instanceGeometryCount} staticCandidates=${evidence.staticModelCandidates} staticBatchable=${evidence.staticModelBatchable} staticBatchedMembers=${evidence.staticModelBatchedMembers} staticCache=${evidence.staticModelTemplateCacheHits}/${evidence.staticModelTemplateCacheMisses} providerAvoided=${evidence.providerObjectsAvoidedByStaticCache} staticRejected=${JSON.stringify(evidence.staticModelRejected)} staticModels=${JSON.stringify(staticModels)} standaloneObjects=${evidence.standaloneBlockObjects} standaloneMeshes=${evidence.standaloneBlockMeshes} transparentMeshes=${evidence.transparentMeshCount} opaqueMeshes=${evidence.opaqueMeshCount} providerObjects=${counters.providerObjectCreations} templateCreates=${counters.reusableTemplateCreations} templateHits=${counters.reusableTemplateCacheHits} cachedInsertions=${counters.cachedTemplateInsertions} rawTemplateParts=${counters.rawInstanceTemplateParts} mergedTemplateParts=${counters.mergedInstanceTemplateParts} templatePartsEliminated=${counters.templatePartsEliminated} mergeOperations=${counters.templateMergeOperations} fallbackMeshes=${counters.fallbackMeshCreations} boundsComputations=${counters.instancedBoundsComputations} cameraFrames=${counters.cameraMovementFrames} suppressedCameraRenders=${counters.cameraRenderRequestsSuppressed} queue=${evidence.hydrationQueue} running=${evidence.hydrationRunning} frameMs=${evidence.frameDurationMs.toFixed(2)} hydrationElapsedMs=${Date.now() - started}`);
    provider.dispose();
    engine.dispose();
  });

  it('records far-view representation evidence for the opt-in 110k fixture', { timeout: 120000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['RENDERER_BENCHMARK_110K'] === '1';
    if (!benchmarkEnabled) return;
    const project = rendererBenchmarkProject('mega');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    engine.update(project, undefined, { exposedFaceRendering: true });
    // Keep the opt-in probe bounded: this is a representation-cost fixture,
    // not a hydration throughput assertion.
    await settleHydration(600, engine);
    const evidence = engine.performanceEvidence();
    expect(evidence.renderedBlocks).toBeGreaterThan(40_000);
    expect(evidence.terrainLogicalBlocks).toBeGreaterThan(0);
    expect(evidence.renderRegionSize).toBe(32);
    const staticModels = engine.runtimeTraceSample().staticModels ?? {};
    console.info(`[renderer benchmark] mega logical=${evidence.terrainLogicalBlocks} terrainMeshes=${evidence.terrainChunkMeshes} terrainTriangles=${evidence.terrainTriangleCount} regions=${evidence.renderRegionCount} instanceMembers=${evidence.instanceMembers} instanceBatches=${evidence.regionalInstanceBatchCount} surfaceBatches=${evidence.regionalSurfaceBatchCount} staticCandidates=${evidence.staticModelCandidates} staticBatchable=${evidence.staticModelBatchable} staticBatchedMembers=${evidence.staticModelBatchedMembers} staticCache=${evidence.staticModelTemplateCacheHits}/${evidence.staticModelTemplateCacheMisses} providerAvoided=${evidence.providerObjectsAvoidedByStaticCache} staticRejected=${JSON.stringify(evidence.staticModelRejected)} staticModels=${JSON.stringify(staticModels)} standaloneMeshes=${evidence.standaloneBlockMeshes} objects=${evidence.object3dCount} meshes=${evidence.meshCount} calls=${evidence.renderCalls} triangles=${evidence.triangles} hydration=${evidence.hydrationQueue}/${evidence.hydrationRunning}`);
    provider.dispose();
    engine.dispose();
  });
});

async function settleRendererPromises(rounds = 1): Promise<void> { for (let index = 0; index < rounds; index += 1) { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); } }
async function settleHydration(rounds: number, engine: ThreeViewportEngine): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await settleRendererPromises();
    if (engine.hydrationDiagnostics().queued === 0 && engine.hydrationDiagnostics().running === 0) return;
  }
}
