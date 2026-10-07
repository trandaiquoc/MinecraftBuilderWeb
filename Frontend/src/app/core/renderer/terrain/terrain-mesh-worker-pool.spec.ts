import { describe, expect, it } from 'vitest';
import { TerrainMeshWorkerPool, type TerrainWorkerLike } from './terrain-mesh-worker-pool';
import { cloneTerrainMeshJob, terrainMeshTransferList, type TerrainMeshJob, type TerrainMeshWorkerResponse } from './terrain-mesh-protocol';
import { meshTerrainCore } from './terrain-mesh-core';

function job(): TerrainMeshJob {
  return { jobId: 9, generation: 1, providerGeneration: 2, revision: 3, chunk: { x: 0, y: 0, z: 0 }, templates: [{ faces: [{ direction: 'up', bucketKey: 'stone', positions: new Float32Array([0, 0, 0]), normals: new Float32Array([0, 1, 0]), uvs: new Float32Array([0, 0]) }] }], entries: [{ key: '0,0,0', position: [0, 0, 0], templateIndex: 0 }], occupancy: { origin: [-1, -1, -1], size: 18, opaque: new Uint8Array(18 * 18 * 18) } };
}

class FakeWorker implements TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: { type: 'mesh'; job: TerrainMeshJob }): void { queueMicrotask(() => this.onmessage?.({ data: { type: 'result', result: meshTerrainCore(message.job) } } as MessageEvent<TerrainMeshWorkerResponse>)); }
  terminate(): void { this.onmessage = null; }
}

class RunningWorker implements TerrainWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMeshWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = 0;
  postMessage(): void { /* Keep the request running until the owner is disposed. */ }
  terminate(): void { this.terminated += 1; }
}

describe('terrain mesh worker protocol/pool', () => {
  it('clones typed arrays and exposes every transferable buffer', () => {
    const original = job();
    const cloned = cloneTerrainMeshJob(original);
    expect(cloned).not.toBe(original);
    expect(cloned.templates[0].faces[0].positions).toEqual(original.templates[0].faces[0].positions);
    expect(terrainMeshTransferList(cloned)).toHaveLength(4);
  });

  it('uses the same pure core through an injected bounded worker', async () => {
    const pool = new TerrainMeshWorkerPool({ supported: true, workerCount: 1, workerFactory: () => new FakeWorker() });
    const result = await pool.submit(job());
    expect(result.jobId).toBe(9);
    expect(pool.evidence()).toMatchObject({ terrainWorkerSupported: true, terrainWorkerCount: 1, terrainWorkerCompleted: 1, terrainWorkerFailures: 0 });
    pool.dispose();
  });

  it('falls back deterministically when workers are unavailable', async () => {
    const pool = new TerrainMeshWorkerPool({ supported: false, workerCount: 2 });
    const result = await pool.submit(job());
    expect(result).toMatchObject({ jobId: 9, generation: 1, providerGeneration: 2, revision: 3, facesEmitted: 1, facesCulled: 0, emittedKeys: ['0,0,0'] });
    expect(pool.evidence()).toMatchObject({ terrainWorkerSupported: false, terrainWorkerFallbackJobs: 1, terrainWorkerCompleted: 1 });
    pool.dispose();
  });

  it('rejects a running job and ignores a late worker response after disposal', async () => {
    let worker!: RunningWorker;
    const pool = new TerrainMeshWorkerPool({ supported: true, workerCount: 1, workerFactory: () => (worker = new RunningWorker()) });
    const request = pool.submit(job());
    const lateResponse = worker.onmessage;

    pool.dispose();

    await expect(request).rejects.toThrow('Terrain mesh worker pool disposed');
    expect(worker.terminated).toBe(1);
    expect(pool.evidence()).toMatchObject({ terrainWorkerQueued: 0, terrainWorkerRunning: 0, terrainWorkerCompleted: 0 });

    lateResponse?.({ data: { type: 'result', result: meshTerrainCore(job()) } } as MessageEvent<TerrainMeshWorkerResponse>);
    expect(pool.evidence()).toMatchObject({ terrainWorkerCompleted: 0, terrainWorkerFailures: 0 });
    pool.dispose();
  });
});
