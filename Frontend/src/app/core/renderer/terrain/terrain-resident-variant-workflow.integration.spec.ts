import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import { renderChunkKey } from '../batching/render-chunk-geometry';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import type { ViewportRenderOptions } from '../engine/viewport-engine-contracts';
import type { VisibleBlockProjectionEntry } from '../engine/y-layer-presentation-owner';
import { meshTerrainCore } from './terrain-mesh-core';
import type { TerrainMeshJob, TerrainMeshResult, TerrainMeshWorkerRequest, TerrainMeshWorkerResponse } from './terrain-mesh-protocol';
import { ChunkSurfaceRenderer, type TerrainApplyResult, type TerrainSurfaceRecord } from './chunk-surface-renderer';
import type { TerrainWorkerLike } from './terrain-mesh-worker-pool';
import { ViewportTerrainWorkflowOwner, type TerrainWorkflowPorts } from './viewport-terrain-workflow-owner';

class ImmediateTerrainWorker implements TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted = 0;

  constructor(private readonly transformFirst?: (job: TerrainMeshJob, result: TerrainMeshResult) => TerrainMeshResult) {}

  postMessage(request: TerrainMeshWorkerRequest): void {
    this.posted += 1;
    const first = this.posted === 1;
    queueMicrotask(() => {
      const result = meshTerrainCore(request.job);
      const committed = first && this.transformFirst ? this.transformFirst(request.job, result) : result;
      this.onmessage?.({ data: { type: 'result', result: committed } } as MessageEvent<TerrainMeshWorkerResponse>);
    });
  }

  terminate(): void { this.onmessage = null; }
}

interface PublishedTerrainResult {
  readonly recordKeys: readonly string[];
  readonly result: TerrainApplyResult;
}

function createHarness(transformFirst?: (job: TerrainMeshJob, result: TerrainMeshResult) => TerrainMeshResult) {
  const blocksGroup = new THREE.Group();
  const store = new ViewportBlockRepresentationStore();
  const visibleEntries = new Map<string, VisibleBlockProjectionEntry>();
  const placeholderVisuals = new Set<string>();
  const completed: Array<{ generation: number; keys: readonly string[] }> = [];
  const fallbackEnqueue = vi.fn();
  const ensurePlaceholder = vi.fn((key: string) => placeholderVisuals.add(key));
  const removePlaceholder = vi.fn((key: string) => placeholderVisuals.delete(key));
  const published: PublishedTerrainResult[] = [];
  let workflow!: ViewportTerrainWorkflowOwner;
  const worker = new ImmediateTerrainWorker(transformFirst);
  const renderer = new ChunkSurfaceRenderer({
    blocksGroup,
    workerFactory: () => worker,
    workerCount: 1,
    record: () => undefined,
    onAsyncApply: (records, result) => {
      published.push({ recordKeys: records.map((record) => record.key), result });
      workflow.commit(records, result);
      if (result.failedKeys.length) workflow.enqueueFailed(result.failedKeys);
    },
  });
  const trace = vi.fn();
  const clearPending = vi.fn();
  const complete = vi.fn((generation: number, keys: readonly string[]) => completed.push({ generation, keys }));
  workflow = new ViewportTerrainWorkflowOwner({
    renderer,
    representation: {
      store,
      commit: { setTerrainMembership: (key, chunkKey, reusableKey) => store.setTerrainRepresentation(key, chunkKey, reusableKey) },
      visibleEntry: (key) => visibleEntries.get(key),
      visibleSignature: (key) => visibleEntries.get(key)?.signature,
      clearPending,
      pending: () => false,
      ensurePlaceholder,
      removePlaceholder,
      complete,
    },
    projection: { revision: () => 1, revisionFor: () => 1, disposed: () => false },
    hydration: {
      generation: () => 9,
      providerGeneration: () => 3,
      runningGenerationFor: () => undefined,
      removePending: vi.fn(),
      reorder: vi.fn(),
      beginProgress: vi.fn(),
      queuedBlocks: () => 0,
      schedule: vi.fn(),
    },
    fallback: {
      renderOptions: () => ({}) as ViewportRenderOptions,
      worldContext: () => ({ getBlock: () => undefined }),
      enqueue: fallbackEnqueue,
      surfaceVisibleEntries: () => visibleEntries,
    },
    visual: {
      create: vi.fn(),
      disposeTemplates: vi.fn(),
      acquireProviderReference: () => vi.fn(),
    } as unknown as TerrainWorkflowPorts['visual'],
    trace,
    recordProviderCacheStats: vi.fn(),
    scheduleRender: vi.fn(),
  });

  return {
    blocksGroup, store, visibleEntries, placeholderVisuals, completed, fallbackEnqueue,
    ensurePlaceholder, removePlaceholder, published, worker, renderer, workflow,
    register(block: PlacedBlock): string {
      const key = voxelKey(block.position);
      const signature = `signature:${key}`;
      visibleEntries.set(key, { block, role: 'normal', signature, occlusionClass: 'opaque-full-cube' });
      store.createOrReplace({ key, block, signature, role: 'normal', revision: 0 });
      return key;
    },
  };
}

describe('terrain resident variant workflow integration', () => {
  it('publishes a worker cache hit once to canonical membership and hydration without rebuilding geometry', async () => {
    const harness = createHarness();
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = blockAt({ x: 2, y: 8, z: 3 });
    const blockKey = harness.register(block);
    const record = toRecord(block, templates);
    harness.workflow.setPlaceholderSignature(blockKey, `signature:${blockKey}`);
    harness.placeholderVisuals.add(blockKey);

    harness.renderer.bulkUpsert([record], [toOccupancy(block)], [block.position], { initial: true });
    expect((await harness.renderer.whenSettled()).status).toBe('settled');
    const originalMesh = harness.blocksGroup.children[0] as THREE.Mesh;
    const originalGeometry = originalMesh.geometry;
    const disposeGeometry = vi.spyOn(originalGeometry, 'dispose');
    const extra = blockAt({ x: 5, y: 8, z: 3 });
    const extraKey = harness.register(extra);
    harness.renderer.applyBlockChanges([{ key: extraKey, position: extra.position, after: toRecord(extra, templates), afterOpaque: true }]);
    expect((await harness.renderer.whenSettled()).status).toBe('settled');

    harness.published.length = 0;
    harness.completed.length = 0;
    const rebuildsBeforeRestore = harness.renderer.evidence().terrainChunkRebuilds;
    const postedBeforeRestore = harness.worker.posted;
    harness.store.remove(extraKey);
    harness.visibleEntries.delete(extraKey);
    harness.store.setTerrainRepresentation(blockKey, undefined);
    harness.workflow.setPlaceholderSignature(blockKey, `signature:${blockKey}`);
    harness.placeholderVisuals.add(blockKey);

    const restore = harness.renderer.applyBlockChanges([
      { key: extraKey, position: extra.position, before: toRecord(extra, templates), afterOpaque: false },
    ], true, [blockKey]);
    expect(restore.pending).toBe(true);
    expect((await harness.renderer.whenSettled()).status).toBe('settled');

    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]).toMatchObject({
      recordKeys: [blockKey],
      result: {
        changedKeys: [],
        rebuiltChunks: [],
        representedKeys: [blockKey],
        failedKeys: [],
        hydrationCandidateKeys: [blockKey],
        disposition: 'accepted',
      },
    });
    expect(harness.store.get(blockKey)?.terrainChunkKey).toBe(renderChunkKey(block.position));
    expect(harness.workflow.hasPlaceholder(blockKey)).toBe(false);
    expect(harness.placeholderVisuals.has(blockKey)).toBe(false);
    expect(harness.completed).toEqual([{ generation: 9, keys: [blockKey] }]);
    expect(harness.renderer.evidence()).toMatchObject({
      terrainChunkRebuilds: rebuildsBeforeRestore,
      terrainResidentVariantHits: 1,
      terrainPendingHydrationCandidates: 0,
    });
    expect(harness.worker.posted).toBe(postedBeforeRestore);
    expect(harness.blocksGroup.children[0]).toBe(originalMesh);
    expect((harness.blocksGroup.children[0] as THREE.Mesh).geometry).toBe(originalGeometry);
    expect(disposeGeometry).not.toHaveBeenCalled();

    harness.workflow.dispose();
    harness.renderer.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('keeps failed keys failed when a partial resident variant is restored', async () => {
    const failedKey = voxelKey({ x: 4, y: 8, z: 3 });
    const harness = createHarness((job, result) => {
      const failedEntry = job.entries.find((entry) => entry.key === failedKey);
      if (!failedEntry) return result;
      const representedJob = { ...job, entries: job.entries.filter((entry) => entry.key !== failedKey) };
      const represented = meshTerrainCore(representedJob);
      return { ...represented, blocksCompiled: result.blocksCompiled, facesCulled: result.facesCulled, unrepresentedExposedKeys: [failedKey] };
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const representedBlock = blockAt({ x: 1, y: 8, z: 3 });
    const failedBlock = blockAt({ x: 4, y: 8, z: 3 });
    const representedKey = harness.register(representedBlock);
    harness.register(failedBlock);
    const representedRecord = toRecord(representedBlock, templates);
    const failedRecord = toRecord(failedBlock, templates);
    harness.renderer.bulkUpsert(
      [representedRecord, failedRecord],
      [toOccupancy(representedBlock), toOccupancy(failedBlock)],
      [representedBlock.position, failedBlock.position],
      { initial: true },
    );
    expect((await harness.renderer.whenSettled()).status).toBe('failed');

    const extra = blockAt({ x: 7, y: 8, z: 3 });
    const extraKey = harness.register(extra);
    harness.renderer.applyBlockChanges([{ key: extraKey, position: extra.position, after: toRecord(extra, templates), afterOpaque: true }]);
    await harness.renderer.whenSettled();

    harness.published.length = 0;
    harness.completed.length = 0;
    harness.ensurePlaceholder.mockClear();
    harness.fallbackEnqueue.mockClear();
    harness.store.setTerrainRepresentation(representedKey, undefined);
    harness.store.setTerrainRepresentation(failedKey, undefined);
    harness.store.remove(extraKey);
    harness.visibleEntries.delete(extraKey);

    harness.renderer.applyBlockChanges([
      { key: extraKey, position: extra.position, before: toRecord(extra, templates), afterOpaque: false },
    ], true, [representedKey, failedKey]);
    expect((await harness.renderer.whenSettled()).status).toBe('failed');

    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]).toMatchObject({
      result: {
        rebuiltChunks: [],
        representedKeys: [representedKey],
        failedKeys: [failedKey],
        hydrationCandidateKeys: [representedKey, failedKey],
        disposition: 'partial-unrepresented',
      },
    });
    expect(harness.store.get(representedKey)?.terrainChunkKey).toBe(renderChunkKey(representedBlock.position));
    expect(harness.store.get(failedKey)?.terrainChunkKey).toBeUndefined();
    expect(harness.workflow.hasPlaceholder(failedKey)).toBe(true);
    expect(harness.placeholderVisuals.has(failedKey)).toBe(true);
    expect(harness.ensurePlaceholder).toHaveBeenCalledOnce();
    expect(harness.completed).toEqual([{ generation: 9, keys: [representedKey] }]);
    expect(harness.fallbackEnqueue).toHaveBeenCalledOnce();
    expect(harness.fallbackEnqueue).toHaveBeenCalledWith(expect.objectContaining({ key: failedKey }));
    expect(harness.renderer.ownershipFor(failedKey)).toBeUndefined();
    expect(harness.renderer.ownershipFor(representedKey)).toBeDefined();
    harness.workflow.dispose();
    harness.renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });
});

function toRecord(block: PlacedBlock, templates: readonly SurfaceFaceTemplate[]): TerrainSurfaceRecord {
  return { key: voxelKey(block.position), block, templates };
}

function toOccupancy(block: PlacedBlock) {
  return { block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const };
}

function blockAt(position: PlacedBlock['position']): PlacedBlock {
  return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} };
}

function voxelKey(position: PlacedBlock['position']): string { return `${position.x},${position.y},${position.z}`; }

function cubeTemplates(material: THREE.Material): readonly SurfaceFaceTemplate[] {
  return (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((direction) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return { geometry, material, direction, matrix: new THREE.Matrix4() };
  });
}
