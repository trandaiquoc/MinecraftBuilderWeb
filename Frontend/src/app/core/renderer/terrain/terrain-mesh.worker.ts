import { meshTerrainCore } from './terrain-mesh-core';
import type { TerrainMeshWorkerRequest, TerrainMeshWorkerResponse } from './terrain-mesh-protocol';

const scope = globalThis as unknown as { onmessage?: (event: MessageEvent<TerrainMeshWorkerRequest>) => void; postMessage?: (value: TerrainMeshWorkerResponse, transfer?: Transferable[]) => void };
scope.onmessage = (event) => {
  if (event.data.type !== 'mesh') return;
  try {
    const started = performance.now();
    const result = { ...meshTerrainCore(event.data.job), cpuMs: Math.max(0, performance.now() - started) };
    const transfer: Transferable[] = [];
    for (const bucket of result.buckets) transfer.push(bucket.positions.buffer, bucket.normals.buffer, bucket.uvs.buffer, bucket.indices.buffer);
    scope.postMessage?.({ type: 'result', result }, transfer);
  } catch (error) {
    scope.postMessage?.({ type: 'error', jobId: event.data.job.jobId, message: error instanceof Error ? error.message : String(error) });
  }
};
