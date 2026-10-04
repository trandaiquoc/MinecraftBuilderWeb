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
  private request?: TerrainMeshWorkerRequest;
  count = 0;
  postMessage(request: TerrainMeshWorkerRequest): void { this.count += 1; this.request = request; }
  resolve(): void { if (!this.request) return; const result = meshTerrainCore(this.request.job); this.onmessage?.({ data: { type: 'result', result } } as MessageEvent<TerrainMeshWorkerResponse>); this.request = undefined; }
  terminate(): void { this.request = undefined; }
}

describe('chunk surface renderer worker commit path', () => {
  it('keeps the old chunk until the worker replacement is committed', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, workerFactory: () => worker, workerCount: 1, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first = blockAt(0);
    const record = (block: PlacedBlock): TerrainSurfaceRecord => ({ key: key(block), block, templates });
    expect(renderer.bulkUpsert([record(first)], [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }], [first.position], { initial: true }).pending).toBe(true);
    expect(group.children).toHaveLength(0);
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(1);
    const oldMesh = group.children[0];
    const changed = blockAt(1);
    expect(renderer.applyBlockChanges([{ key: key(changed), position: changed.position, before: record(first), after: record(changed), afterOpaque: true }]).pending).toBe(true);
    expect(worker.count).toBe(2);
    expect((worker as unknown as { request?: TerrainMeshWorkerRequest }).request?.job.revision).toBe(2);
    expect(group.children[0]).toBe(oldMesh);
    await Promise.resolve();
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBe(0);
    expect(group.children[0]).not.toBe(oldMesh);
    renderer.dispose(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('rejects a result from an older terrain generation without removing current ownership', async () => {
    const group = new THREE.Group();
    const worker = new DeferredWorker();
    let generation = 0;
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, workerFactory: () => worker, workerCount: 1, terrainGeneration: () => generation, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = blockAt(0);
    renderer.bulkUpsert([{ key: key(block), block, templates }], [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }], [block.position], { initial: true });
    generation = 1;
    worker.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(group.children).toHaveLength(0);
    expect(renderer.evidence().terrainWorker.terrainWorkerStaleResults).toBe(1);
    renderer.dispose(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });
});

function key(block: PlacedBlock): string { return `${block.position.x},${block.position.y},${block.position.z}`; }
function blockAt(x: number): PlacedBlock { return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y: 0, z: 0 }, state: {} }; }
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
