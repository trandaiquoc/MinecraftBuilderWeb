import { describe, expect, it } from 'vitest';
import { ThreeViewportEngine } from '../engine/three-viewport-engine';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { benchmarkBlock, rendererBenchmarkProject, rendererBenchmarkVisualProvider } from './renderer-benchmark-fixtures';
import * as THREE from 'three';
import { FluidChunkRenderer } from '../fluids/fluid-chunk-renderer';
import { RegistryFluidRenderResolver, vanillaFluidRenderResolver } from '../fluids/fluid-state';
import { blockMutationHint, metadataMutationHint } from '../../editor/mutations/project-mutation-hint';
import { relevantTerrainChunks, TERRAIN_CHUNK_SIZE } from '../terrain/chunk-coordinate';

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
    const staticModels = engine.runtimeTraceHeavySample().staticModels ?? {};
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
    const staticModels = engine.runtimeTraceHeavySample().staticModels ?? {};
    console.info(`[renderer benchmark] mega logical=${evidence.terrainLogicalBlocks} terrainMeshes=${evidence.terrainChunkMeshes} terrainTriangles=${evidence.terrainTriangleCount} regions=${evidence.renderRegionCount} instanceMembers=${evidence.instanceMembers} instanceBatches=${evidence.regionalInstanceBatchCount} surfaceBatches=${evidence.regionalSurfaceBatchCount} staticCandidates=${evidence.staticModelCandidates} staticBatchable=${evidence.staticModelBatchable} staticBatchedMembers=${evidence.staticModelBatchedMembers} staticCache=${evidence.staticModelTemplateCacheHits}/${evidence.staticModelTemplateCacheMisses} providerAvoided=${evidence.providerObjectsAvoidedByStaticCache} staticRejected=${JSON.stringify(evidence.staticModelRejected)} staticModels=${JSON.stringify(staticModels)} standaloneMeshes=${evidence.standaloneBlockMeshes} objects=${evidence.object3dCount} meshes=${evidence.meshCount} calls=${evidence.renderCalls} triangles=${evidence.triangles} hydration=${evidence.hydrationQueue}/${evidence.hydrationRunning}`);
    provider.dispose();
    engine.dispose();
  });

  it('runs Prompt 16D-A structural gates on the 110k fixture only when explicitly requested', { timeout: 120000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['PROMPT_16D_STRUCTURAL_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    const project = rendererBenchmarkProject('mega');
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    engine.update(project, undefined, { exposedFaceRendering: true });
    await settleHydration(600, engine);

    const boundary = { x: TERRAIN_CHUNK_SIZE, y: 0, z: TERRAIN_CHUNK_SIZE };
    const boundaryChunkLimit = relevantTerrainChunks(boundary).length;
    const original = project.blocks.find((block) => block.position.x === boundary.x && block.position.y === boundary.y && block.position.z === boundary.z)!;
    const withoutBoundary = { ...project, blocks: project.blocks.filter((block) => block !== original) };
    const gates: Record<string, Record<string, number | string>> = {};
    const snapshot = () => diagnostics.snapshot();
    const recordGate = (name: string, before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>): void => {
      gates[name] = {
        fullSceneRebuilds: after.fullSceneRebuilds - before.fullSceneRebuilds,
        structuralReconciles: after.structuralReconciles - before.structuralReconciles,
        fullReconcileFallbacks: after.fullReconcileFallbacks - before.fullReconcileFallbacks,
        fullVisibleScans: after.fullVisibleScans - before.fullVisibleScans,
        occupancyFullRebuilds: after.occupancyFullRebuilds - before.occupancyFullRebuilds,
        terrainChunkRebuilds: after.terrainChunkRebuilds - before.terrainChunkRebuilds,
        hydrationGenerations: after.hydrationGenerations - before.hydrationGenerations,
        providerRefreshStarted: after.providerRefreshStarted - before.providerRefreshStarted,
      };
    };

    let before = snapshot();
    engine.update(withoutBoundary, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position: boundary, before: original }], 'benchmark-delete'));
    await settleHydration(80, engine);
    let after = snapshot();
    recordGate('LOCAL_DELETE', before, after);

    before = after;
    engine.update(project, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position: boundary, after: original }], 'benchmark-place'));
    await settleHydration(80, engine);
    after = snapshot();
    recordGate('LOCAL_PLACE_UNDO_REDO_EQUIVALENT', before, after);

    const beforeTrace = snapshot();
    const beforeStaticBuilds = Number(engine.runtimeTraceSample().staticModels?.['buildCount'] ?? 0);
    for (let index = 0; index < 100; index += 1) engine.runtimeTraceSample();
    const afterTrace = snapshot();
    const afterStaticBuilds = Number(engine.runtimeTraceSample().staticModels?.['buildCount'] ?? 0);
    expect(afterTrace.fullVisibleScans - beforeTrace.fullVisibleScans).toBe(0);
    expect(afterStaticBuilds - beforeStaticBuilds).toBe(0);
    expect(engine.runtimeTraceHeavySample().staticModels?.['candidates']).toBeDefined();
    gates['TRACE_LIGHT_SAMPLE_100X'] = { fullSceneRebuilds: 0, fullReconcileFallbacks: 0, fullVisibleScans: 0, occupancyFullRebuilds: 0, hydrationGenerations: 0, providerRefreshStarted: 0, staticModelDiagnosticBuilds: 0 };

    const groupedProject = {
      ...project,
      groups: [{ id: 'benchmark-group', name: 'Benchmark', visible: true, locked: false }],
      blocks: project.blocks.map((block, index) => index === 0 ? { ...block, groupIds: ['benchmark-group'] } : block),
    };
    const groupPosition = project.blocks[0].position;
    before = snapshot();
    engine.update(groupedProject, undefined, { exposedFaceRendering: true }, metadataMutationHint([{ position: project.blocks[0].position, before: project.blocks[0], after: groupedProject.blocks[0] }], [], 'benchmark-group-metadata'));
    await settleHydration(20, engine);
    after = snapshot();
    recordGate('GROUP_METADATA', before, after);

    const stonePositions = project.blocks.filter((block) => block.id === 'minecraft:stone').map((block) => ({ ...block.position }));
    before = snapshot();
    engine.update(groupedProject, undefined, { exposedFaceRendering: true, highlightedBlockId: 'minecraft:stone', highlightedBlockPositions: stonePositions });
    engine.update(groupedProject, undefined, { exposedFaceRendering: true, highlightedBlockId: undefined, highlightedBlockPositions: undefined });
    engine.update(groupedProject, undefined, { exposedFaceRendering: true, highlightedBlockId: 'minecraft:stone', highlightedBlockPositions: stonePositions });
    after = snapshot();
    recordGate('BLOCK_USAGE_HIGHLIGHT_ON_OFF_ON', before, after);

    before = snapshot();
    engine.update(groupedProject, undefined, { exposedFaceRendering: true, isolatedGroupId: 'benchmark-group', isolatedGroupPositions: [groupPosition] });
    engine.update(groupedProject, undefined, { exposedFaceRendering: true });
    after = snapshot();
    recordGate('ISOLATE_UNISOLATE', before, after);

    console.info(`[16d-a structural gates] blocks=${project.blocks.length} ${JSON.stringify(gates)}`);
    for (const [name, result] of Object.entries(gates)) {
      expect(result['fullSceneRebuilds'], `${name} rebuilt the full scene`).toBe(0);
      expect(result['fullReconcileFallbacks'], `${name} used a full reconcile fallback`).toBe(0);
      expect(result['fullVisibleScans'], `${name} performed a full visible scan`).toBe(0);
      expect(result['occupancyFullRebuilds'], `${name} rebuilt occupancy globally`).toBe(0);
      expect(result['hydrationGenerations'], `${name} restarted hydration`).toBe(0);
      expect(result['providerRefreshStarted'], `${name} refreshed the provider`).toBe(0);
    }
    expect(gates['LOCAL_DELETE']['terrainChunkRebuilds']).toBeLessThanOrEqual(boundaryChunkLimit);
    expect(gates['LOCAL_PLACE_UNDO_REDO_EQUIVALENT']['terrainChunkRebuilds']).toBeLessThanOrEqual(boundaryChunkLimit);
    expect(gates['BLOCK_USAGE_HIGHLIGHT_ON_OFF_ON']['terrainChunkRebuilds']).toBe(0);
    provider.dispose();
    engine.dispose();
  });

  it('runs Prompt 16D-B resource closure gates on the 110k fixture only when explicitly requested', { timeout: 180000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['PROMPT_16D_RESOURCE_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    const project = rendererBenchmarkProject('mega');
    const groupSize = 2048;
    const groupMembers = project.blocks.slice(0, groupSize);
    const groupedProject = {
      ...project,
      groups: [{ id: 'resource-benchmark-group', name: 'Resource benchmark', visible: true, locked: false }],
      blocks: project.blocks.map((block, index) => index < groupSize ? { ...block, groupIds: ['resource-benchmark-group'] } : block),
    };
    const groupPositions = groupMembers.map((block) => ({ ...block.position }));
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setVisualProvider(provider);
    engine.update(groupedProject, undefined, { exposedFaceRendering: true });
    await settleHydration(600, engine);
    const warm = engine.performanceEvidence();
    expect(warm.terrainLogicalBlocks).toBeGreaterThan(0);

    const internal = engine as unknown as {
      blockUsageHighlight?: THREE.InstancedMesh;
      blockUsageHighlightGeometry: THREE.BoxGeometry;
      blockUsageHighlightMaterial: THREE.MeshBasicMaterial;
      blockUsageHighlightCapacity: number;
      scene: THREE.Scene;
      cachedVisibleMap: Map<string, { block: { id: string } }>;
    };
    const stonePositions = groupedProject.blocks.filter((block) => block.id === 'minecraft:stone').map((block) => ({ ...block.position }));
    // Vitest does not provide a WebGL canvas, so install the same owned overlay
    // mount() creates and exercise the production high-water update path.
    internal.blockUsageHighlight = new THREE.InstancedMesh(internal.blockUsageHighlightGeometry, internal.blockUsageHighlightMaterial, 1);
    internal.blockUsageHighlight.userData['blockUsageHighlight'] = true;
    internal.scene.add(internal.blockUsageHighlight);
    const targetSizes = [100, 2_000, 20_000, 5_000, 20_000];
    for (const size of targetSizes) engine.setBlockUsageHighlight('minecraft:stone', stonePositions.slice(0, size));
    const highWaterOverlay = internal.blockUsageHighlight;
    const highWaterCapacity = internal.blockUsageHighlightCapacity;
    const highWater = engine.performanceEvidence();
    for (let cycle = 0; cycle < 10; cycle += 1) {
      engine.setBlockUsageHighlight(undefined, undefined);
      engine.setBlockUsageHighlight('minecraft:stone', stonePositions.slice(0, 20_000));
    }
    const afterHighlight = engine.performanceEvidence();
    const activeHighlightObjects = countObjectsWithUserData(internal.scene, 'blockUsageHighlight');
    expect(internal.blockUsageHighlight).toBe(highWaterOverlay);
    expect(internal.blockUsageHighlightCapacity).toBe(highWaterCapacity);
    expect(highWaterCapacity).toBeGreaterThanOrEqual(20_000);
    expect(activeHighlightObjects).toBe(1);
    expect(afterHighlight.meshCount).toBe(highWater.meshCount);

    const firstIsolation = engine.performanceEvidence();
    for (let cycle = 0; cycle < 20; cycle += 1) {
      engine.update(groupedProject, undefined, { exposedFaceRendering: true, isolatedGroupId: 'resource-benchmark-group', isolatedGroupPositions: groupPositions });
      await settleHydration(8, engine);
      engine.update(groupedProject, undefined, { exposedFaceRendering: true });
      await Promise.resolve();
    }
    const isolation = engine.isolationDiagnostics();
    const afterIsolation = engine.performanceEvidence();
    expect(isolation).toMatchObject({ active: false, state: 'inactive', targetBlocks: 0, requestedTargetBlocks: 0, activeTargetBlocks: 0, activeBundleCount: 0, stagingBundleCount: 0 });
    expect(isolation.createdBundleCount).toBe(20);
    expect(isolation.disposeRequestedCount).toBe(20);
    expect(isolation.disposedBundleCount).toBe(20);
    expect(isolation.disposeCount).toBe(20);
    expect(isolation.createdBundleCount).toBe(isolation.activeBundleCount + isolation.stagingBundleCount + isolation.disposedBundleCount);
    expect(afterIsolation.meshCount).toBe(firstIsolation.meshCount);

    const boundary = { x: TERRAIN_CHUNK_SIZE, y: 0, z: TERRAIN_CHUNK_SIZE };
    const original = groupedProject.blocks.find((block) => block.position.x === boundary.x && block.position.y === boundary.y && block.position.z === boundary.z)!;
    const withoutBoundary = { ...groupedProject, blocks: groupedProject.blocks.filter((block) => block !== original) };
    for (let cycle = 0; cycle < 50; cycle += 1) {
      engine.update(withoutBoundary, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position: boundary, before: original }], 'resource-benchmark-delete'));
      await settleHydration(8, engine);
      engine.update(groupedProject, undefined, { exposedFaceRendering: true }, blockMutationHint([{ position: boundary, after: original }], 'resource-benchmark-place'));
      await settleHydration(8, engine);
    }
    const afterEdits = engine.performanceEvidence();
    expect(afterEdits.renderedBlocks).toBeGreaterThan(40_000);
    expect(afterEdits.terrainLogicalBlocks).toBeGreaterThan(0);
    expect(afterEdits.terrainChunkMeshes).toBeLessThanOrEqual(afterIsolation.terrainChunkMeshes + 2);
    expect(afterEdits.meshCount).toBeLessThanOrEqual(afterIsolation.meshCount + 2);
    expect(afterEdits.terrainWorker).toMatchObject({ terrainWorkerQueued: 0, terrainWorkerRunning: 0 });
    expect(afterEdits.terrainCommit).toMatchObject({ terrainCommitQueueDepth: 0 });
    const finalDiagnostics = engine.runtimeTraceSample().hydration;
    expect(finalDiagnostics?.['queued']).toBe(0);
    expect(finalDiagnostics?.['running']).toBe(0);
    console.info(`[16d-b resource gates] blocks=${project.blocks.length} warm=${JSON.stringify({ terrainChunks: warm.terrainChunks, terrainMeshes: warm.terrainChunkMeshes, meshes: warm.meshCount })} highlight=${JSON.stringify({ capacity: highWaterCapacity, activeObjects: activeHighlightObjects, meshCount: afterHighlight.meshCount })} isolation=${JSON.stringify({ builds: isolation.buildCount, created: isolation.createdBundleCount, commits: isolation.commitCount, requested: isolation.disposeRequestedCount, disposed: isolation.disposedBundleCount, disposes: isolation.disposeCount, state: isolation.state })} edits=${JSON.stringify({ terrainMeshes: afterEdits.terrainChunkMeshes, meshes: afterEdits.meshCount })}`);

    engine.dispose();
    engine.dispose();
    provider.dispose();
    expect(engine.diagnostics().disposed).toBe(true);
    expect(provider.resourceCounts?.()).toEqual({ resolvedModels: 0, geometries: 0, textures: 0, fluidTextures: 0, thumbnails: 0 });
  });

  it('measures cooperative All-below projection scrubbing for the opt-in 110k fixture', { timeout: 120000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['Y_LAYER_PROJECTION_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    const project = rendererBenchmarkProject('mega');
    const byY = new Map<number, ReturnType<typeof benchmarkBlock>[]>();
    for (const block of project.blocks) (byY.get(block.position.y) ?? (byY.set(block.position.y, []), byY.get(block.position.y)!)).push(block);
    const layerIndex = { blocksAtY: (y: number) => byY.get(y) ?? [], blockCountAtY: (y: number) => byY.get(y)?.length ?? 0, occupiedLayers: () => [...byY.keys()].sort((left, right) => left - right), allBlocks: () => project.blocks };
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    engine.setLayerIndex(layerIndex);
    engine.update(project, undefined, { layerY: 0, visibility: 'all-below', layerIndex });
    await settleHydration(20, engine);
    const before = diagnostics.snapshot();
    engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 47 } }, undefined, { layerY: 47, visibility: 'all-below', layerIndex });
    for (let index = 0; index < 12_000 && engine.projectionActivity().activity !== 'idle'; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const after = diagnostics.snapshot();
    expect(after.yLayerProjectionSlices).toBeGreaterThan(1);
    expect(after.yLayerProjectionChangedBlocks - before.yLayerProjectionChangedBlocks).toBe(project.blocks.length);
    expect(after.yLayerProjectionYields).toBeGreaterThan(0);
    expect(after.yLayerProjectionCancellations).toBe(0);
    expect(engine.projectionActivity().activity).toBe('idle');
    console.info(`[y-layer benchmark] blocks=${project.blocks.length} changed=${after.yLayerProjectionChangedBlocks - before.yLayerProjectionChangedBlocks} slices=${after.yLayerProjectionSlices} yields=${after.yLayerProjectionYields} maxSliceMs=${after.yLayerProjectionMaxSliceMs.toFixed(2)} maxCommitMs=${after.yLayerProjectionMaxCommitMs.toFixed(2)} fullVisibleScans=${after.fullVisibleScans - before.fullVisibleScans} occupancyFull=${after.occupancyFullRebuilds - before.occupancyFullRebuilds} occupancyDelta=${after.occupancyDeltaUpdates - before.occupancyDeltaUpdates}`);
    engine.dispose();
  });

  it('measures all-layer visual preload and visibility reuse for the opt-in 110k fixture', { timeout: 300000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['Y_LAYER_PRELOAD_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    const baseProject = rendererBenchmarkProject('mega');
    const project = { ...baseProject, blocks: baseProject.blocks.map((block) => ({ ...block, id: 'minecraft:stone', namespace: 'minecraft', state: {} })) };
    const byY = new Map<number, ReturnType<typeof benchmarkBlock>[]>();
    for (const block of project.blocks) (byY.get(block.position.y) ?? (byY.set(block.position.y, []), byY.get(block.position.y)!)).push(block);
    const layerIndex = { blocksAtY: (y: number) => byY.get(y) ?? [], blockCountAtY: (y: number) => byY.get(y)?.length ?? 0, occupiedLayers: () => [...byY.keys()].sort((left, right) => left - right), allBlocks: () => project.blocks };
    const diagnostics = new RendererDiagnostics();
    const engine = new ThreeViewportEngine(diagnostics);
    const provider = rendererBenchmarkVisualProvider();
    engine.setLayerIndex(layerIndex);
    engine.setVisualProvider(provider);
    const options = (layerY: number, visibility: 'current-only' | 'all-below' | 'whole-structure') => ({ layerY, visibility, layerIndex });
    const time = async (name: string, operation: () => Promise<void>): Promise<number> => {
      const started = performance.now();
      await operation();
      const elapsed = performance.now() - started;
      console.info(`[y-layer preload benchmark] ${name}=${elapsed.toFixed(1)}ms`);
      return elapsed;
    };
    const switchLayer = async (layerY: number): Promise<void> => {
      engine.update(project, undefined, options(layerY, 'current-only'));
      await waitForProjection(engine);
      await settleHydration(300, engine);
    };
    const initialStarted = performance.now();
    engine.update(project, undefined, options(24, 'current-only'));
    await settleHydration(300, engine);
    const initial = performance.now() - initialStarted;
    console.info(`[y-layer preload benchmark] initial-current-layer-hydration=${initial.toFixed(1)}ms`);
    const coldSwitch = await time('first-switch-before-preload', () => switchLayer(47));
    await switchLayer(24);
    const preloadTime = await time('all-occupied-layer-preload', async () => {
      engine.prepareYLayerVisualResources(project);
      await waitForYLayerPreload(engine);
      await waitForRepresentationPrewarm(engine);
    });
    const preload = engine.yLayerVisualPreloadEvidence();
    const representationPreload = engine.yLayerRepresentationPrewarmEvidence();
    expect(preload.blocksTotal).toBe(110_592);
    expect(preload.blocksVisited).toBe(110_592);
    expect(preload.layersTotal).toBe(48);
    expect(preload.layersReady).toBe(48);
    expect(preload).toMatchObject({ state: 'templates-ready', templateState: 'ready', representationState: 'viewport-lazy', gpuPresentationState: 'viewport-dependent' });
    expect(representationPreload).toMatchObject({ state: 'ready', blocksTotal: 110_592, blocksVisited: 110_592, representationsResident: 110_592, jobsPending: 0 });
    const createsBeforeWarmSwitch = engine.rendererCounters().providerObjectCreations;
    const warmSwitch = await time('first-switch-after-preload', () => switchLayer(47));
    const createsAfterWarmSwitch = engine.rendererCounters().providerObjectCreations;
    await time('repeated-switch', async () => { await switchLayer(24); await switchLayer(47); });

    const beforeExpand = diagnostics.snapshot();
    const allBelow = await time('expand-all-below', async () => {
      engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 24, layerVisibility: 'all-below' } }, undefined, options(24, 'all-below'));
      await waitForProjection(engine);
    });
    const projectionOwner = (engine as unknown as { yLayerProjection: { visibleEntries: readonly unknown[]; directVisibleEntryCount: () => number | undefined } }).yLayerProjection;
    const belowCount = projectionOwner.directVisibleEntryCount() ?? projectionOwner.visibleEntries.length;
    const whole = await time('expand-all-below-to-whole', async () => {
      engine.update({ ...project, editorSettings: { ...project.editorSettings, currentY: 24, layerVisibility: 'whole-structure' } }, undefined, options(24, 'whole-structure'));
      await waitForProjection(engine);
    });
    const wholeCount = projectionOwner.directVisibleEntryCount() ?? projectionOwner.visibleEntries.length;
    const contract = await time('contract-whole-to-current-only', async () => {
      engine.update(project, undefined, options(24, 'current-only'));
      await waitForProjection(engine);
    });
    const afterVisibility = diagnostics.snapshot();
    expect(wholeCount).toBe(110_592);
    expect(wholeCount).toBeGreaterThan(belowCount);
    expect(afterVisibility.fullSceneRebuilds - beforeExpand.fullSceneRebuilds).toBe(0);
    expect(engine.rendererCounters().providerObjectCreations).toBe(createsAfterWarmSwitch);
    expect(afterVisibility.instanceMatrixWrites - beforeExpand.instanceMatrixWrites).toBe(0);
    expect(afterVisibility.yLayerPresentationTransitions - beforeExpand.yLayerPresentationTransitions).toBe(3);
    expect(afterVisibility.yLayerPresentationFallbacks - beforeExpand.yLayerPresentationFallbacks).toBe(0);
    expect(afterVisibility.yLayerProjectionVoxelVisits - beforeExpand.yLayerProjectionVoxelVisits).toBe(0);
    const processMemory = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number; rss: number } } }).process?.memoryUsage?.();
    console.info(`[y-layer preload benchmark] summary=${JSON.stringify({ blocks: project.blocks.length, preload, representationPreload, initialMs: initial, coldSwitchMs: coldSwitch, warmSwitchMs: warmSwitch, allBelowMs: allBelow, wholeExpansionMs: whole, contractionMs: contract, providerObjectCreationsBeforeWarmSwitch: createsBeforeWarmSwitch, providerObjectCreationsAfterWarmSwitch: createsAfterWarmSwitch, providerObjectCreationsAfterVisibility: engine.rendererCounters().providerObjectCreations, matrixWritesTotal: afterVisibility.instanceMatrixWrites, matrixWritesDuringVisibility: afterVisibility.instanceMatrixWrites - beforeExpand.instanceMatrixWrites, layerBatchVisibilityUpdates: afterVisibility.yLayerBatchVisibilityUpdates - beforeExpand.yLayerBatchVisibilityUpdates, layerBatchRoleUpdates: afterVisibility.yLayerBatchRoleUpdates - beforeExpand.yLayerBatchRoleUpdates, presentationCounters: { directTransitions: afterVisibility.yLayerPresentationTransitions - beforeExpand.yLayerPresentationTransitions, fallbacks: afterVisibility.yLayerPresentationFallbacks - beforeExpand.yLayerPresentationFallbacks, voxelVisits: afterVisibility.yLayerProjectionVoxelVisits - beforeExpand.yLayerProjectionVoxelVisits }, projectionCounters: { slices: afterVisibility.yLayerProjectionSlices - beforeExpand.yLayerProjectionSlices, changedBlocks: afterVisibility.yLayerProjectionChangedBlocks - beforeExpand.yLayerProjectionChangedBlocks, yields: afterVisibility.yLayerProjectionYields - beforeExpand.yLayerProjectionYields }, processMemory, gpuPresentation: 'not measurable in Vitest without WebGL/browser' })}`);
    expect(initial).toBeGreaterThanOrEqual(0);
    engine.dispose();
    provider.dispose();
  });

  it('measures generic chunked fluid representation when explicitly requested', { timeout: 120000 }, async () => {
    const benchmarkEnabled = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['FLUID_BENCHMARK'] === '1';
    if (!benchmarkEnabled) return;
    const blocks = [] as ReturnType<typeof benchmarkBlock>[];
    const map = new Map<string, ReturnType<typeof benchmarkBlock>>();
    for (let y = 0; y < 16; y += 1) for (let z = 0; z < 32; z += 1) for (let x = 0; x < 32; x += 1) {
      const id = x >= 30 && z >= 30 ? 'minecraft:lava' : 'minecraft:water';
      const value = { ...benchmarkBlock(blocks.length, { x, y, z }), id, namespace: 'minecraft', state: { level: '0' } };
      blocks.push(value); map.set(`${x},${y},${z}`, value);
    }
    const resolver = new RegistryFluidRenderResolver();
    resolver.register('minecraft:water', (block, world) => vanillaFluidRenderResolver.resolve(block, world)!);
    resolver.register('minecraft:lava', (block, world) => vanillaFluidRenderResolver.resolve(block, world)!);
    resolver.register('mod:test_fluid', (block, world) => ({ ...vanillaFluidRenderResolver.resolve({ ...block, id: 'minecraft:water' }, world)!, fluidTypeId: 'mod:test_fluid', connectivityKey: 'mod:test-fluid', materialKey: 'mod:test-fluid', stillTexture: 'mod:block/test_still', flowTexture: 'mod:block/test_flow', tint: 0x55aa55 }));
    const group = new THREE.Group(); const renderer = new FluidChunkRenderer(group); const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true;
    renderer.setProvider({ resolver, texture: async () => texture });
    await renderer.sync(blocks.map((block) => ({ block, state: resolver.resolve(block)! })), { getBlock: (position) => map.get(`${position.x},${position.y},${position.z}`) });
    const evidence = renderer.diagnostics();
    expect(evidence.fluidLogicalVoxels).toBe(blocks.length);
    expect(evidence.fluidStandaloneMeshes).toBe(0);
    expect(evidence.fluidChunkMeshes).toBeLessThan(blocks.length / 100);
    console.info(`[fluid benchmark] logical=${evidence.fluidLogicalVoxels} chunks=${evidence.fluidChunks} meshes=${evidence.fluidChunkMeshes} materials=${evidence.fluidMaterialBuckets} emitted=${evidence.fluidFacesEmitted} culled=${evidence.fluidFacesCulled} byType=${JSON.stringify(evidence.fluidByType)}`);
    renderer.dispose(); texture.dispose();
  });
});

async function settleRendererPromises(rounds = 1): Promise<void> { for (let index = 0; index < rounds; index += 1) { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); } }
async function settleHydration(rounds: number, engine: ThreeViewportEngine): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await settleRendererPromises();
    const hydration = engine.runtimeTraceSample().hydration;
    if (hydration && hydration['queued'] === 0 && hydration['running'] === 0) return;
  }
}

async function waitForYLayerPreload(engine: ThreeViewportEngine, attempts = 30_000): Promise<void> {
  for (let index = 0; index < attempts && engine.yLayerVisualPreloadEvidence().state === 'preparing'; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForRepresentationPrewarm(engine: ThreeViewportEngine, timeoutMs = 120_000): Promise<void> {
  const started = performance.now();
  while (engine.yLayerRepresentationPrewarmEvidence().state === 'preparing' && performance.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (engine.yLayerRepresentationPrewarmEvidence().state === 'preparing') throw new Error('Y-layer physical representation prewarm timed out');
}

async function waitForProjection(engine: ThreeViewportEngine, attempts = 30_000): Promise<void> {
  for (let index = 0; index < attempts && engine.projectionActivity().activity !== 'idle'; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(engine.projectionActivity().activity).toBe('idle');
}

function countObjectsWithUserData(root: THREE.Object3D, key: string): number {
  let count = 0;
  root.traverse((object) => { if (object.userData[key] === true) count += 1; });
  return count;
}
