import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { meshTerrainCore } from './terrain-mesh-core';
import { ChunkSurfaceRenderer, type TerrainSurfaceRecord } from './chunk-surface-renderer';
import type { TerrainMeshWorkerRequest, TerrainMeshWorkerResponse } from './terrain-mesh-protocol';
import type { TerrainWorkerLike } from './terrain-mesh-worker-pool';

class DeferredWorker implements TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request?: TerrainMeshWorkerRequest;
  count = 0;
  terminated = 0;
  postMessage(request: TerrainMeshWorkerRequest): void {
    this.count += 1;
    this.request = request;
  }
  resolve(
    transform?: (result: ReturnType<typeof meshTerrainCore>) => ReturnType<typeof meshTerrainCore>,
  ): void {
    if (!this.request) return;
    const base = meshTerrainCore(this.request.job);
    const result = transform?.(base) ?? base;
    this.onmessage?.({
      data: { type: 'result', result },
    } as MessageEvent<TerrainMeshWorkerResponse>);
    this.request = undefined;
  }
  terminate(): void {
    this.terminated += 1;
    this.request = undefined;
  }
}

class ThrowingWorker implements TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(): void {
    throw new Error('test worker failure');
  }
  terminate(): void {
    /* test worker */
  }
}

describe('chunk surface renderer worker commit path', () => {
  it('keeps the old chunk until the worker replacement is committed', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt(0);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({
      key: key(block),
      block,
      templates,
    });
    expect(
      renderer.bulkUpsert(
        [record(first)],
        [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }],
        [first.position],
        { initial: true },
      ).pending,
    ).toBe(true);
    expect(renderer.evidence()).toMatchObject({
      terrainPendingHydrationCandidates: 1,
      terrainPendingHydrationCandidateChunks: 1,
    });
    expect(group.children).toHaveLength(0);
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(1);
    const oldMesh = group.children[0];
    const changed = { ...first, state: { powered: 'true' } };
    expect(
      renderer.applyBlockChanges([
        {
          key: key(changed),
          position: changed.position,
          before: record(first),
          after: record(changed),
          afterOpaque: true,
        },
      ]).pending,
    ).toBe(true);
    expect(worker.count).toBe(2);
    expect(
      (worker as unknown as { request?: TerrainMeshWorkerRequest }).request?.job.revision,
    ).toBe(2);
    expect(group.children[0]).toBe(oldMesh);
    await Promise.resolve();
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBe(0);
    expect(group.children[0]).not.toBe(oldMesh);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('reports pending terrain replacement and settles the callback only after commit', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt(0);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({
      key: key(block),
      block,
      templates,
    });
    renderer.bulkUpsert(
      [record(first)],
      [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [first.position],
      { initial: true },
    );
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const oldMesh = group.children[0];
    let committed = false;
    let failed = false;
    const changed = blockAt(1);
    const status = renderer.upsertAndCommit(record(changed), {
      onCommitted: () => {
        committed = true;
      },
      onFailed: () => {
        failed = true;
      },
    });
    expect(status).toBe('pending');
    expect(group.children[0]).toBe(oldMesh);
    expect(committed).toBe(false);
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(committed).toBe(true);
    expect(failed).toBe(false);
    expect(group.children[0]).not.toBe(oldMesh);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('keeps an uncoupled pending replacement internally terminal when no callback is supplied', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt(0);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({
      key: key(block),
      block,
      templates,
    });
    renderer.bulkUpsert(
      [record(first)],
      [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [first.position],
      { initial: true },
    );
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const changed = { ...first, state: { powered: 'true' } };
    expect(renderer.upsertAndCommit(record(changed))).toBe('pending');
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(renderer.logicalBlockCount).toBe(1);
    expect(renderer.evidence().terrainWorker.terrainWorkerRunning).toBe(0);

    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('settles only after the worker commit, and resolves cancellation on dispose', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = interiorBlockAt(0);
    const record: TerrainSurfaceRecord = { key: key(block), block, templates };
    renderer.bulkUpsert(
      [record],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    let settled = false;
    const pending = renderer.whenSettled().then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.resolve();
    const result = await pending;
    expect(result.status).toBe('settled');
    expect(settled).toBe(true);

    const second = blockAt(1);
    renderer.bulkUpsert(
      [{ ...record, key: key(second), block: second }],
      [{ block: second, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [second.position],
      { initial: true },
    );
    const cancelled = renderer.whenSettled();
    renderer.dispose();
    expect((await cancelled).status).toBe('cancelled');
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('terminates terrain resources once and ignores late worker callbacks after dispose', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const applied: unknown[] = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      onAsyncApply: (_records, result) => applied.push(result),
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = interiorBlockAt(8);
    renderer.bulkUpsert(
      [{ key: key(block), block, templates }],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    const request = worker.request!;
    const lateMessage = worker.onmessage;
    const pending = renderer.whenSettled();
    renderer.dispose();
    renderer.dispose();

    expect(worker.terminated).toBe(1);
    expect((await pending).status).toBe('cancelled');
    lateMessage?.({
      data: { type: 'result', result: meshTerrainCore(request.job) },
    } as MessageEvent<TerrainMeshWorkerResponse>);
    await Promise.resolve();
    expect(applied).toHaveLength(0);
    expect(group.children).toHaveLength(0);
    expect((await renderer.whenSettled()).status).toBe('cancelled');

    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('keeps chunk ownership broad while keeping local hydration candidates bounded', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const applied: Array<{ readonly hydrationCandidateKeys?: readonly string[] }> = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      onAsyncApply: (_records, result) => applied.push(result),
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt(0);
    const second = blockAt(1);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({
      key: key(block),
      block,
      templates,
    });
    renderer.bulkUpsert(
      [record(first), record(second)],
      undefined,
      [first.position, second.position],
      { initial: true },
    );
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const changed = { ...first, state: { powered: 'true' } };
    renderer.applyBlockChanges(
      [
        {
          key: key(changed),
          position: changed.position,
          before: record(first),
          after: record(changed),
          afterOpaque: true,
        },
      ],
      true,
      [key(changed)],
    );
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const last = applied.at(-1)!;
    expect(last.hydrationCandidateKeys).toEqual([key(changed)]);
    expect(renderer.ownershipFor(key(second))).toBeDefined();
    expect(
      renderer.evidence().terrainCommitDiagnostics.stages['terrain.commit.geometryWrap'],
    ).toBeDefined();
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('publishes hydration completion only to the owning chunk on a multi-chunk flush', async () => {
    const group = new THREE.Group();
    const workers: DeferredWorker[] = [];
    const applied: Array<{
      readonly rebuiltChunks: readonly string[];
      readonly hydrationCandidateKeys?: readonly string[];
    }> = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => {
        const worker = new DeferredWorker();
        workers.push(worker);
        return worker;
      },
      workerCount: 2,
      onAsyncApply: (_records, result) =>
        applied.push({
          rebuiltChunks: result.rebuiltChunks,
          hydrationCandidateKeys: result.hydrationCandidateKeys,
        }),
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt(0);
    const second = blockAt(16);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({
      key: key(block),
      block,
      templates,
    });
    renderer.bulkUpsert(
      [record(first), record(second)],
      undefined,
      [first.position, second.position],
      { initial: true },
    );
    expect(workers).toHaveLength(2);
    for (const worker of workers) worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applied.filter((result) => result.rebuiltChunks.length)).toEqual(
      expect.arrayContaining([
        { rebuiltChunks: ['0,0,0'], hydrationCandidateKeys: [key(first)] },
        { rebuiltChunks: ['1,0,0'], hydrationCandidateKeys: [key(second)] },
      ]),
    );
    expect(renderer.evidence().terrainCandidateFanoutTotal).toBe(2);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('reschedules a result from an older terrain generation exactly once and keeps ownership pending', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    let generation = 0;
    const counters = new Map<string, number>();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      terrainGeneration: () => generation,
      record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = interiorBlockAt(0);
    renderer.bulkUpsert(
      [{ key: key(block), block, templates }],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    generation = 1;
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(0);
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBe(1);
    expect(counters.get('terrainAsyncRescheduledChunks')).toBe(1);
    expect(worker.count).toBe(2);
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(1);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('reschedules a provider-stale result without creating a duplicate replacement', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    let providerGeneration = 0;
    const counters = new Map<string, number>();
    const applied: Array<{ readonly hydrationCandidateKeys?: readonly string[] }> = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      providerGeneration: () => providerGeneration,
      onAsyncApply: (_records, result) => applied.push(result),
      record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = interiorBlockAt(0);
    renderer.bulkUpsert(
      [{ key: key(block), block, templates }],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    providerGeneration = 1;
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(worker.count).toBe(2);
    expect(counters.get('terrainAsyncRescheduledChunks')).toBe(1);
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(1);
    expect(applied.filter((result) => result.hydrationCandidateKeys?.length)).toHaveLength(1);
    expect(applied.at(-1)?.hydrationCandidateKeys).toEqual([key(block)]);
    expect(renderer.evidence().terrainPendingHydrationCandidates).toBe(0);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('discards a stale revision when a newer chunk job is already authoritative', async () => {
    const group = new THREE.Group();
    const workers: DeferredWorker[] = [];
    const applied: Array<{
      readonly changedKeys: readonly string[];
      readonly disposition?: string;
    }> = [];
    const counters = new Map<string, number>();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => {
        const worker = new DeferredWorker();
        workers.push(worker);
        return worker;
      },
      workerCount: 2,
      onAsyncApply: (_records, result) =>
        applied.push({ changedKeys: result.changedKeys, disposition: result.disposition }),
      record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = interiorBlockAt(0);
    const changed = interiorBlockAt(1);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({
      key: key(block),
      block,
      templates,
    });
    renderer.bulkUpsert(
      [record(first)],
      [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [first.position],
      { initial: true },
    );
    expect(workers).toHaveLength(2);
    renderer.applyBlockChanges([
      {
        key: key(changed),
        position: changed.position,
        before: record(first),
        after: record(changed),
        afterOpaque: true,
      },
    ]);
    expect(workers[1].request?.job.revision).toBe(2);
    workers[0].resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(counters.get('terrainAsyncRescheduledChunks') ?? 0).toBe(0);
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBe(1);
    expect(applied.filter((result) => result.disposition !== 'chunk-removed')).toEqual([]);
    workers[1].resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(1);
    expect(applied.filter((result) => result.disposition !== 'chunk-removed')).toEqual([
      { changedKeys: [key(changed)], disposition: 'accepted' },
    ]);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('reports an all-unrepresented current result as fallback work, not stale work', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const applied: Array<{ failedKeys: readonly string[]; disposition?: string }> = [];
    const counters = new Map<string, number>();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      onAsyncApply: (_records, result) =>
        applied.push({ failedKeys: result.failedKeys, disposition: result.disposition }),
      record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = interiorBlockAt(0);
    renderer.bulkUpsert(
      [{ key: key(block), block, templates }],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    worker.resolve((result) => ({
      ...result,
      emittedKeys: [],
      fullyOccludedKeys: [],
      unrepresentedExposedKeys: [key(block)],
    }));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applied.filter((result) => result.failedKeys.length)).toEqual([
      { failedKeys: [key(block)], disposition: 'all-unrepresented' },
    ]);
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBe(0);
    expect(counters.get('terrainAsyncAllUnrepresentedResults')).toBe(1);
    expect(renderer.ownershipFor(key(block))).toBeUndefined();
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('commits represented keys and forwards only partial failures to fallback', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const applied: Array<{
      representedKeys: readonly string[];
      failedKeys: readonly string[];
      disposition?: string;
    }> = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => worker,
      workerCount: 1,
      onAsyncApply: (_records, result) =>
        applied.push({
          representedKeys: result.representedKeys,
          failedKeys: result.failedKeys,
          disposition: result.disposition,
        }),
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = interiorBlockAt(0);
    const second = interiorBlockAt(1);
    const firstKey = key(first);
    const secondKey = key(second);
    renderer.bulkUpsert(
      [
        { key: firstKey, block: first, templates },
        { key: secondKey, block: second, templates },
      ],
      [
        { block: first, role: 'normal', occlusionClass: 'opaque-full-cube' },
        { block: second, role: 'normal', occlusionClass: 'opaque-full-cube' },
      ],
      [first.position, second.position],
      { initial: true },
    );
    worker.resolve((result) => ({
      ...result,
      emittedKeys: [firstKey],
      fullyOccludedKeys: [],
      unrepresentedExposedKeys: [secondKey],
    }));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applied.filter((result) => result.disposition !== 'chunk-removed')).toEqual([
      {
        representedKeys: [firstKey],
        failedKeys: [secondKey],
        disposition: 'partial-unrepresented',
      },
    ]);
    expect(renderer.ownershipFor(firstKey)).toBeDefined();
    expect(renderer.ownershipFor(secondKey)).toBeUndefined();
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('routes an exceptional worker rejection to fallback instead of leaving records pending', async () => {
    const group = new THREE.Group();
    const applied: Array<{ failedKeys: readonly string[]; disposition?: string }> = [];
    const counters = new Map<string, number>();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      workerFactory: () => new ThrowingWorker(),
      workerCount: 1,
      onAsyncApply: (_records, result) =>
        applied.push({ failedKeys: result.failedKeys, disposition: result.disposition }),
      record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = interiorBlockAt(0);
    renderer.bulkUpsert(
      [{ key: key(block), block, templates }],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(applied.filter((result) => result.failedKeys.length)).toEqual([
      { failedKeys: [key(block)], disposition: 'worker-failure' },
    ]);
    expect(counters.get('terrainAsyncWorkerFailures')).toBe(1);
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });
});

function key(block: PlacedBlock): string {
  return `${block.position.x},${block.position.y},${block.position.z}`;
}
function blockAt(x: number): PlacedBlock {
  return {
    kind: 'resolved',
    id: 'minecraft:stone',
    namespace: 'minecraft',
    position: { x, y: 0, z: 0 },
    state: {},
  };
}
function interiorBlockAt(x: number): PlacedBlock {
  return {
    kind: 'resolved',
    id: 'minecraft:stone',
    namespace: 'minecraft',
    position: { x, y: 8, z: 8 },
    state: {},
  };
}
function cubeTemplates(material: THREE.Material): readonly SurfaceFaceTemplate[] {
  return (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((direction) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return { geometry, material, direction, matrix: new THREE.Matrix4() };
  });
}
