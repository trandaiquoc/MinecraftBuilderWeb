import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { ChunkSurfaceRenderer } from './chunk-surface-renderer';
import type { TerrainApplyResult } from './chunk-surface-renderer';
import type { TerrainWorkerLike } from './terrain-mesh-worker-pool';
import { meshTerrainCore } from './terrain-mesh-core';
import type { TerrainMeshWorkerRequest, TerrainMeshWorkerResponse } from './terrain-mesh-protocol';

class ImmediateTerrainWorker implements TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted = 0;
  postMessage(request: TerrainMeshWorkerRequest): void {
    this.posted += 1;
    queueMicrotask(() =>
      this.onmessage?.({
        data: { type: 'result', result: meshTerrainCore(request.job) },
      } as MessageEvent<TerrainMeshWorkerResponse>),
    );
  }
  terminate(): void {
    this.onmessage = null;
  }
}

describe('chunk surface renderer ownership', () => {
  it('defers cooperative projection terrain work and flushes a dirty chunk once at completion', async () => {
    const group = new THREE.Group();
    const worker = new ImmediateTerrainWorker();
    const applied: TerrainApplyResult[] = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      record: () => undefined,
      workerFactory: () => worker,
      workerCount: 1,
      onAsyncApply: (_records, result) => applied.push(result),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const blocks = [blockAt({ x: 0, y: 0, z: 0 }), blockAt({ x: 1, y: 0, z: 0 })];
    const records = blocks.map((block) => ({ key: voxelKey(block.position), block, templates }));
    renderer.bulkUpsert(
      records,
      blocks.map((block) => ({
        block,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      })),
      blocks.map((block) => block.position),
      { initial: true },
    );
    await renderer.whenSettled();
    applied.length = 0;
    const before = worker.posted;
    const changes = blocks.map((block) => {
      const after = { ...block, state: { powered: 'true' } };
      const key = voxelKey(block.position);
      return {
        key,
        position: block.position,
        before: { key, block, templates },
        after: { key, block: after, templates },
        afterOpaque: true,
      };
    });

    renderer.applyBlockChanges(
      changes,
      false,
      changes.map((change) => change.key),
      true,
    );
    expect(worker.posted).toBe(before);
    expect(renderer.evidence().terrainPendingHydrationCandidates).toBe(2);
    renderer.flushPending();
    expect(worker.posted).toBe(before + 1);
    await renderer.whenSettled();
    expect(applied.at(-1)?.hydrationCandidateKeys).toEqual(changes.map((change) => change.key));

    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('terminates stale generation work instead of leaving settlement pending', async () => {
    let generation = 1;
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: new THREE.Group(),
      record: () => undefined,
      workerCount: 1,
      workerFactory: () => new ImmediateTerrainWorker(),
      terrainGeneration: () => generation,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = blockAt({ x: 0, y: 0, z: 0 });
    renderer.bulkUpsert(
      [{ key: voxelKey(block.position), block, templates }],
      [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [block.position],
      { initial: true },
    );
    generation = 2;

    const settlement = await renderer.whenSettled();

    expect(settlement.status).toBe('settled');
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBeGreaterThanOrEqual(1);
    expect(renderer.ownershipFor(voxelKey(block.position))).toBeDefined();
    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('compiles a 100k solid shape into material-bucket meshes rather than face instances', () => {
    const group = new THREE.Group();
    const counters = new Map<string, number>();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 10; y += 1)
      for (let z = 0; z < 100; z += 1)
        for (let x = 0; x < 100; x += 1)
          blocks.push({
            kind: 'resolved',
            id: 'minecraft:stone',
            namespace: 'minecraft',
            position: { x, y, z },
            state: {},
          });
    const entries = blocks.map((block) => ({
      block,
      role: 'normal' as const,
      occlusionClass: 'opaque-full-cube' as const,
    }));
    renderer.bulkUpsert(
      blocks.map((block) => ({ key: voxelKey(block.position), block, templates })),
      entries,
      blocks.map((block) => block.position),
      { initial: true },
    );
    const evidence = renderer.evidence();
    expect(evidence.terrainLogicalBlocks).toBe(100_000);
    expect(evidence.terrainChunks).toBe(49);
    expect(evidence.terrainChunkMeshes).toBe(49);
    expect(evidence.terrainFacesEmitted).toBe(24_000);
    expect(evidence.terrainFacesCulled).toBe(576_000);
    expect(evidence.terrainChunkRebuilds).toBe(49);
    expect(evidence.terrainBulkBatches).toBe(1);
    expect(
      [...group.children].every((child) => child instanceof THREE.Mesh && child.frustumCulled),
    ).toBe(true);
    expect((group.children[0] as THREE.Mesh).geometry.boundingBox?.min.toArray()).toEqual([
      0, 0, 0,
    ]);
    expect((group.children[0] as THREE.Mesh).geometry.boundingBox?.max.toArray()).toEqual([
      16, 16, 16,
    ]);
    expect(counters.get('terrainTemplateResolutions') ?? 0).toBe(0);
    const unrelatedChunk = group.children.find(
      (child) => child.userData['terrainChunk'] === '1,0,0',
    );
    const beforeLocalRebuilds = renderer.evidence().terrainChunkRebuilds;
    const localPosition = { x: 5, y: 0, z: 5 };
    const localBlock = blocks.find(
      (block) =>
        block.position.x === localPosition.x &&
        block.position.y === localPosition.y &&
        block.position.z === localPosition.z,
    )!;
    const edited = { ...localBlock, state: { powered: 'true' } };
    renderer.applyBlockChanges([
      {
        key: voxelKey(localPosition),
        position: localPosition,
        before: { key: voxelKey(localPosition), block: localBlock, templates },
        after: { key: voxelKey(localPosition), block: edited, templates },
        afterOpaque: true,
      },
    ]);
    expect(renderer.evidence().terrainChunkRebuilds - beforeLocalRebuilds).toBe(1);
    expect(group.children.find((child) => child.userData['terrainChunk'] === '1,0,0')).toBe(
      unrelatedChunk,
    );
    renderer.applyBlockChanges([
      {
        key: voxelKey(localPosition),
        position: localPosition,
        before: { key: voxelKey(localPosition), block: edited, templates },
        afterOpaque: false,
      },
    ]);
    expect(renderer.logicalBlockCount).toBe(99_999);
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('builds a complete chunk once per bulk batch and does not rebuild an unrelated chunk', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = (position: VoxelCoordinate): PlacedBlock => ({
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position,
      state: {},
    });
    const first = Array.from({ length: 16 ** 3 }, (_, index) =>
      block({ x: index % 16, y: Math.floor(index / 256), z: Math.floor(index / 16) % 16 }),
    );
    const firstEntries = first.map((value) => ({
      block: value,
      role: 'normal' as const,
      occlusionClass: 'opaque-full-cube' as const,
    }));
    renderer.bulkUpsert(
      first.map((value) => ({ key: voxelKey(value.position), block: value, templates })),
      firstEntries,
      first.map((value) => value.position),
      { initial: true },
    );
    expect(renderer.evidence().terrainChunkRebuilds).toBe(1);
    const before = renderer.evidence().terrainChunkRebuilds;
    const second = Array.from({ length: 16 ** 3 }, (_, index) =>
      block({ x: 32 + (index % 16), y: Math.floor(index / 256), z: Math.floor(index / 16) % 16 }),
    );
    const allEntries = [
      ...firstEntries,
      ...second.map((value) => ({
        block: value,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      })),
    ];
    renderer.bulkUpsert(
      second.map((value) => ({ key: voxelKey(value.position), block: value, templates })),
      allEntries,
      second.map((value) => value.position),
    );
    expect(renderer.evidence().terrainChunkRebuilds - before).toBe(1);
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('assigns each initial hydration candidate to one owning chunk only', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const blocks = [
      blockAt({ x: 0, y: 0, z: 0 }),
      blockAt({ x: 16, y: 0, z: 0 }),
      blockAt({ x: 32, y: 0, z: 0 }),
    ];
    const records = blocks.map((block) => ({ key: voxelKey(block.position), block, templates }));
    renderer.bulkUpsert(
      records,
      blocks.map((block) => ({
        block,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      })),
      blocks.map((block) => block.position),
      { initial: true },
    );
    expect(renderer.evidence()).toMatchObject({
      terrainCandidateOwnershipTotal: 3,
      terrainCandidateFanoutTotal: 3,
      maxHydrationCandidatesPerChunk: 1,
      maxRecordsPerChunk: 1,
    });
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('keeps a boundary neighbor rebuild geometry-only for hydration accounting', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt({ x: 15, y: 0, z: 0 });
    const neighbor = blockAt({ x: 16, y: 0, z: 0 });
    const initial = [first, neighbor];
    renderer.bulkUpsert(
      initial.map((block) => ({ key: voxelKey(block.position), block, templates })),
      initial.map((block) => ({
        block,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      })),
      initial.map((block) => block.position),
      { initial: true },
    );
    const before = renderer.evidence();
    const changed = { ...first, state: { powered: 'true' } };
    renderer.applyBlockChanges(
      [
        {
          key: voxelKey(changed.position),
          position: changed.position,
          before: { key: voxelKey(first.position), block: first, templates },
          after: { key: voxelKey(changed.position), block: changed, templates },
          afterOpaque: true,
        },
      ],
      true,
      [voxelKey(changed.position)],
    );
    const after = renderer.evidence();
    expect(after.terrainCandidateOwnershipTotal - before.terrainCandidateOwnershipTotal).toBe(1);
    expect(after.terrainCandidateFanoutTotal - before.terrainCandidateFanoutTotal).toBe(1);
    expect(after.maxHydrationCandidatesPerChunk).toBe(1);
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it(
    'keeps the 48 cubed initial generation near one build per populated chunk',
    { timeout: 15_000 },
    () => {
      const group = new THREE.Group();
      const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const templates = cubeTemplates(material);
      const blocks: PlacedBlock[] = [];
      for (let y = 0; y < 48; y += 1)
        for (let z = 0; z < 48; z += 1)
          for (let x = 0; x < 48; x += 1)
            blocks.push({
              kind: 'resolved',
              id: 'minecraft:stone',
              namespace: 'minecraft',
              position: { x, y, z },
              state: {},
            });
      const entries = blocks.map((block) => ({
        block,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      }));
      renderer.bulkUpsert(
        blocks.map((block) => ({ key: voxelKey(block.position), block, templates })),
        entries,
        blocks.map((block) => block.position),
        { initial: true },
      );
      // 27 occupied coordinates are rebuilt; the fully enclosed center chunk
      // correctly emits no physical mesh.
      expect(renderer.evidence().terrainChunks).toBe(26);
      expect(renderer.evidence().terrainChunkRebuilds).toBe(27);
      expect(renderer.evidence().terrainFacesEmitted).toBe(13_824);
      renderer.clear();
      material.dispose();
      for (const template of templates) template.geometry.dispose();
    },
  );

  it('rebuilds only the affected chunk after a local change', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = (position: VoxelCoordinate): PlacedBlock => ({
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position,
      state: {},
    });
    const first = [block({ x: 0, y: 0, z: 0 }), block({ x: 16, y: 0, z: 0 })];
    const entries = first.map((value) => ({
      block: value,
      role: 'normal' as const,
      occlusionClass: 'opaque-full-cube' as const,
    }));
    renderer.syncOccupancy(
      entries,
      first.map((value) => value.position),
      true,
    );
    for (const value of first)
      renderer.upsert({ key: voxelKey(value.position), block: value, templates });
    renderer.flushNow();
    const firstMesh = group.children.find((child) => child.userData['terrainChunk'] === '0,0,0');
    const secondMesh = group.children.find((child) => child.userData['terrainChunk'] === '1,0,0');
    const secondGeometryDispose = vi.spyOn((secondMesh as THREE.Mesh).geometry, 'dispose');
    const beforeRebuilds = renderer.evidence().terrainChunkRebuilds;
    const changed = block({ x: 17, y: 0, z: 1 });
    renderer.upsert({ key: voxelKey(changed.position), block: changed, templates });
    renderer.syncOccupancy(
      [...entries, { block: changed, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [changed.position],
    );
    renderer.flushNow();
    expect(group.children.find((child) => child.userData['terrainChunk'] === '0,0,0')).toBe(
      firstMesh,
    );
    expect(group.children.find((child) => child.userData['terrainChunk'] === '1,0,0')).not.toBe(
      secondMesh,
    );
    expect(secondGeometryDispose).not.toHaveBeenCalled();
    expect(renderer.residentVariantCount).toBeGreaterThan(0);
    expect(renderer.evidence().terrainChunkRebuilds - beforeRebuilds).toBe(1);
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('reattaches exact Y-projection terrain meshes without remeshing or reallocating geometry', () => {
    const group = new THREE.Group();
    const asyncApplies: TerrainApplyResult[] = [];
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      record: () => undefined,
      onAsyncApply: (_records, result) => asyncApplies.push(result),
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const lower = blockAt({ x: 0, y: 10, z: 0 });
    const upper = blockAt({ x: 0, y: 11, z: 0 });
    const lowerKey = voxelKey(lower.position);
    const upperKey = voxelKey(upper.position);
    const record = (block: PlacedBlock) => ({ key: voxelKey(block.position), block, templates });
    const visible = (block: PlacedBlock) => ({
      block,
      role: 'normal' as const,
      occlusionClass: 'opaque-full-cube' as const,
    });
    renderer.bulkUpsert([record(lower)], [visible(lower)], [lower.position], { initial: true });
    const originalMesh = group.children[0] as THREE.Mesh;
    const originalGeometry = originalMesh.geometry;
    const rebuilds = renderer.evidence().terrainChunkRebuilds;

    renderer.applyBlockChanges([
      { key: lowerKey, position: lower.position, before: record(lower), afterOpaque: false },
      { key: upperKey, position: upper.position, after: record(upper), afterOpaque: true },
    ]);
    const upperMesh = group.children[0] as THREE.Mesh;
    expect(upperMesh).not.toBe(originalMesh);
    expect(renderer.isRepresented(upperKey)).toBe(true);

    const restored = renderer.applyBlockChanges([
      { key: upperKey, position: upper.position, before: record(upper), afterOpaque: false },
      { key: lowerKey, position: lower.position, after: record(lower), afterOpaque: true },
    ]);

    expect(group.children[0]).toBe(originalMesh);
    expect((group.children[0] as THREE.Mesh).geometry).toBe(originalGeometry);
    expect(renderer.evidence().terrainChunkRebuilds - rebuilds).toBe(1);
    expect(renderer.evidence().terrainResidentVariantHits).toBe(1);
    expect(renderer.evidence().terrainResidentVariantBytes).toBeGreaterThan(0);
    expect(renderer.isRepresented(lowerKey)).toBe(true);
    expect(renderer.isRepresented(upperKey)).toBe(false);
    expect(restored.representedKeys).toContain(lowerKey);
    expect(restored.rebuiltChunks).toEqual([]);
    expect(asyncApplies).toEqual([]);

    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('reuses resident projection variants through the worker commit path', async () => {
    const worker = new ImmediateTerrainWorker();
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      record: () => undefined,
      workerFactory: () => worker,
      workerCount: 1,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const lower = blockAt({ x: 0, y: 10, z: 0 });
    const upper = blockAt({ x: 0, y: 11, z: 0 });
    const lowerKey = voxelKey(lower.position);
    const upperKey = voxelKey(upper.position);
    const record = (block: PlacedBlock) => ({ key: voxelKey(block.position), block, templates });
    const visible = (block: PlacedBlock) => ({
      block,
      role: 'normal' as const,
      occlusionClass: 'opaque-full-cube' as const,
    });
    renderer.bulkUpsert([record(lower)], [visible(lower)], [lower.position], { initial: true });
    await renderer.whenSettled();
    const originalMesh = group.children[0];
    const posted = worker.posted;

    renderer.applyBlockChanges([
      { key: lowerKey, position: lower.position, before: record(lower), afterOpaque: false },
      { key: upperKey, position: upper.position, after: record(upper), afterOpaque: true },
    ]);
    await renderer.whenSettled();
    renderer.applyBlockChanges([
      { key: upperKey, position: upper.position, before: record(upper), afterOpaque: false },
      { key: lowerKey, position: lower.position, after: record(lower), afterOpaque: true },
    ]);
    await renderer.whenSettled();

    expect(worker.posted - posted).toBe(1);
    expect(group.children[0]).toBe(originalMesh);
    expect(renderer.evidence().terrainResidentVariantHits).toBe(1);
    expect(renderer.ownershipFor(lowerKey)).toBeDefined();
    expect(renderer.ownershipFor(upperKey)).toBeUndefined();

    renderer.dispose();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('applies a terrain add/remove delta without replacing the full occupancy set', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 5, y: 5, z: 5 },
      state: {},
    };
    renderer.bulkUpsert(
      [{ key: voxelKey(first.position), block: first, templates }],
      [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [first.position],
      { initial: true },
    );
    const second: PlacedBlock = { ...first, position: { x: 6, y: 5, z: 5 } };
    renderer.applyBlockChanges([
      {
        key: voxelKey(second.position),
        position: second.position,
        after: { key: voxelKey(second.position), block: second, templates },
        afterOpaque: true,
      },
    ]);
    expect(renderer.logicalBlockCount).toBe(2);
    renderer.applyBlockChanges([
      {
        key: voxelKey(first.position),
        position: first.position,
        before: { key: voxelKey(first.position), block: first, templates },
        afterOpaque: false,
      },
    ]);
    expect(renderer.logicalBlockCount).toBe(1);
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('supports strict OFF and atlas ON with the same isolated voxel evidence', () => {
    const make = (terrainAtlasMode: 'off' | 'on') => {
      const group = new THREE.Group();
      const renderer = new ChunkSurfaceRenderer({
        blocksGroup: group,
        terrainAtlasMode,
        record: () => undefined,
      });
      const pixels = new THREE.DataTexture(
        new Uint8Array([255, 0, 0, 255]),
        1,
        1,
        THREE.RGBAFormat,
      );
      pixels.flipY = true;
      const material = new THREE.MeshBasicMaterial({ map: pixels });
      const templates = cubeTemplates(material);
      const block: PlacedBlock = {
        kind: 'resolved',
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 0, y: 0, z: 0 },
        state: {},
      };
      renderer.bulkUpsert(
        [{ key: voxelKey(block.position), block, templates }],
        [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }],
        [block.position],
        { initial: true },
      );
      const evidence = renderer.evidence();
      expect(evidence.terrainLogicalBlocks).toBe(1);
      expect(evidence.terrainFacesEmitted).toBe(6);
      expect(evidence.terrainChunkMeshes).toBe(1);
      if (terrainAtlasMode === 'on') expect(evidence.terrainAtlas.terrainAtlasSprites).toBe(1);
      renderer.clear();
      material.dispose();
      pixels.dispose();
      for (const template of templates) template.geometry.dispose();
      return evidence;
    };
    expect(make('off')).toMatchObject({
      terrainLogicalBlocks: 1,
      terrainFacesEmitted: 6,
      terrainChunkMeshes: 1,
    });
    expect(make('on')).toMatchObject({
      terrainLogicalBlocks: 1,
      terrainFacesEmitted: 6,
      terrainChunkMeshes: 1,
    });
  });

  it('reports key-scoped physical ownership and keeps failed exposed keys unrepresented', () => {
    const group = new THREE.Group();
    const failedKey = voxelKey({ x: 1, y: 0, z: 0 });
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      terrainAtlasMode: 'on',
      shouldCommitChunk: (key) => key !== '0,0,0',
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt({ x: 0, y: 0, z: 0 });
    const second = blockAt({ x: 1, y: 0, z: 0 });
    const result = renderer.bulkUpsert(
      [
        { key: voxelKey(first.position), block: first, templates },
        { key: failedKey, block: second, templates },
      ],
      [
        { block: first, role: 'normal', occlusionClass: 'opaque-full-cube' },
        { block: second, role: 'normal', occlusionClass: 'opaque-full-cube' },
      ],
      [first.position, second.position],
      { initial: true },
    );
    expect(result.representedKeys).toEqual([]);
    expect(result.failedKeys).toEqual(
      expect.arrayContaining([voxelKey(first.position), failedKey]),
    );
    expect(renderer.ownershipFor(failedKey)).toBeUndefined();
    expect(renderer.logicalBlockCount).toBe(2);
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('commits one key while preserving a failed key in a partial local batch', () => {
    const group = new THREE.Group();
    const failedKey = voxelKey({ x: 16, y: 0, z: 0 });
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      shouldCommitChunk: (key) => key !== '1,0,0',
      record: () => undefined,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt({ x: 0, y: 0, z: 0 });
    const second = blockAt({ x: 16, y: 0, z: 0 });
    const result = renderer.applyBlockChanges([
      {
        key: voxelKey(first.position),
        position: first.position,
        after: { key: voxelKey(first.position), block: first, templates },
        afterOpaque: true,
      },
      {
        key: failedKey,
        position: second.position,
        after: { key: failedKey, block: second, templates },
        afterOpaque: true,
      },
    ]);
    expect(result.representedKeys).toContain(voxelKey(first.position));
    expect(result.failedKeys).toContain(failedKey);
    expect(renderer.ownershipFor(voxelKey(first.position))).toBeDefined();
    expect(renderer.ownershipFor(failedKey)).toBeUndefined();
    renderer.clear();
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('keeps the 100k homogeneous atlas sprite work bounded by texture sources', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      terrainAtlasMode: 'on',
      record: () => undefined,
    });
    const pixels = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255]), 1, 1, THREE.RGBAFormat);
    pixels.flipY = true;
    const material = new THREE.MeshBasicMaterial({ map: pixels });
    const templates = cubeTemplates(material);
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 10; y += 1)
      for (let z = 0; z < 100; z += 1)
        for (let x = 0; x < 100; x += 1)
          blocks.push({
            kind: 'resolved',
            id: 'minecraft:stone',
            namespace: 'minecraft',
            position: { x, y, z },
            state: {},
          });
    renderer.bulkUpsert(
      blocks.map((block) => ({ key: voxelKey(block.position), block, templates })),
      blocks.map((block) => ({
        block,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      })),
      blocks.map((block) => block.position),
      { initial: true },
    );
    expect(renderer.evidence()).toMatchObject({
      terrainLogicalBlocks: 100_000,
      terrainFacesEmitted: 24_000,
      terrainChunkMeshes: 49,
    });
    expect(renderer.evidence().terrainAtlas.terrainAtlasSprites).toBe(1);
    expect(renderer.evidence().terrainAtlas.terrainAtlasInsertions).toBe(1);
    renderer.clear();
    material.dispose();
    pixels.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('preserves the 48 cubed outer-shell counts in atlas mode', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      terrainAtlasMode: 'on',
      record: () => undefined,
    });
    const pixels = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255]), 1, 1, THREE.RGBAFormat);
    pixels.flipY = true;
    const material = new THREE.MeshBasicMaterial({ map: pixels });
    const templates = cubeTemplates(material);
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 48; y += 1)
      for (let z = 0; z < 48; z += 1)
        for (let x = 0; x < 48; x += 1)
          blocks.push({
            kind: 'resolved',
            id: 'minecraft:stone',
            namespace: 'minecraft',
            position: { x, y, z },
            state: {},
          });
    renderer.bulkUpsert(
      blocks.map((block) => ({ key: voxelKey(block.position), block, templates })),
      blocks.map((block) => ({
        block,
        role: 'normal' as const,
        occlusionClass: 'opaque-full-cube' as const,
      })),
      blocks.map((block) => block.position),
      { initial: true },
    );
    expect(renderer.evidence()).toMatchObject({
      terrainLogicalBlocks: 110_592,
      terrainFacesEmitted: 13_824,
      terrainChunkRebuilds: 27,
    });
    expect(renderer.evidence().terrainAtlas.terrainAtlasSprites).toBe(1);
    renderer.clear();
    material.dispose();
    pixels.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('appends the first new local texture without rebuilding an unrelated chunk', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({
      blocksGroup: group,
      terrainAtlasMode: 'on',
      record: () => undefined,
    });
    const stonePixels = new THREE.DataTexture(
      new Uint8Array([90, 90, 90, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    stonePixels.flipY = true;
    const goldPixels = new THREE.DataTexture(
      new Uint8Array([220, 180, 40, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    goldPixels.flipY = true;
    const stoneMaterial = new THREE.MeshBasicMaterial({ map: stonePixels });
    const goldMaterial = new THREE.MeshBasicMaterial({ map: goldPixels });
    const stoneTemplates = cubeTemplates(stoneMaterial);
    const goldTemplates = cubeTemplates(goldMaterial);
    const stone: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: {},
    };
    renderer.bulkUpsert(
      [{ key: voxelKey(stone.position), block: stone, templates: stoneTemplates }],
      [{ block: stone, role: 'normal', occlusionClass: 'opaque-full-cube' }],
      [stone.position],
      { initial: true },
    );
    const oldChunk = group.children.find((child) => child.userData['terrainChunk'] === '0,0,0');
    expect(renderer.evidence().terrainAtlas.terrainAtlasSprites).toBe(1);
    const gold: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:gold_block',
      namespace: 'minecraft',
      position: { x: 32, y: 0, z: 0 },
      state: {},
    };
    renderer.applyBlockChanges([
      {
        key: voxelKey(gold.position),
        position: gold.position,
        after: { key: voxelKey(gold.position), block: gold, templates: goldTemplates },
        afterOpaque: true,
      },
    ]);
    expect(renderer.evidence().terrainAtlas.terrainAtlasSprites).toBe(2);
    expect(group.children.find((child) => child.userData['terrainChunk'] === '0,0,0')).toBe(
      oldChunk,
    );
    renderer.clear();
    stoneMaterial.dispose();
    goldMaterial.dispose();
    stonePixels.dispose();
    goldPixels.dispose();
    for (const template of [...stoneTemplates, ...goldTemplates]) template.geometry.dispose();
  });
});

function voxelKey(position: VoxelCoordinate): string {
  return `${position.x},${position.y},${position.z}`;
}

function blockAt(position: VoxelCoordinate): PlacedBlock {
  return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} };
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
