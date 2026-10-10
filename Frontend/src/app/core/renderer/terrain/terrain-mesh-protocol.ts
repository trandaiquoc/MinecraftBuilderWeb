import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';

export interface TerrainMeshChunkCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TerrainMeshFace {
  readonly direction: SurfaceFaceDirection;
  readonly bucketKey: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
}

export interface TerrainMeshTemplateData {
  readonly faces: readonly TerrainMeshFace[];
}

export interface TerrainMeshEntryData {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly templateIndex: number;
}

/** A compact occupancy snapshot for the 18^3 chunk-local voxel halo. */
export interface TerrainOccupancyHalo {
  readonly origin: readonly [number, number, number];
  readonly size: 18;
  readonly opaque: Uint8Array;
}

export interface TerrainMeshJob {
  readonly jobId: number;
  readonly generation: number;
  readonly providerGeneration: number;
  readonly revision: number;
  readonly chunk: TerrainMeshChunkCoordinate;
  readonly templates: readonly TerrainMeshTemplateData[];
  readonly entries: readonly TerrainMeshEntryData[];
  readonly occupancy: TerrainOccupancyHalo;
  /** Higher values are reserved for user edits over background hydration. */
  readonly priority?: number;
}

export interface TerrainMeshBucketData {
  readonly key: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly faceCount: number;
}

export interface TerrainMeshResult {
  readonly jobId: number;
  readonly generation: number;
  readonly providerGeneration: number;
  readonly revision: number;
  readonly chunk: TerrainMeshChunkCoordinate;
  readonly buckets: readonly TerrainMeshBucketData[];
  readonly blocksCompiled: number;
  readonly facesEmitted: number;
  readonly facesCulled: number;
  readonly emittedKeys: readonly string[];
  readonly fullyOccludedKeys: readonly string[];
  readonly unrepresentedExposedKeys: readonly string[];
  readonly cpuMs: number;
}

export type TerrainMeshWorkerRequest = { readonly type: 'mesh'; readonly job: TerrainMeshJob };
export type TerrainMeshWorkerResponse =
  | { readonly type: 'result'; readonly result: TerrainMeshResult }
  | { readonly type: 'error'; readonly jobId: number; readonly message: string };

export function terrainMeshTransferList(job: TerrainMeshJob): Transferable[] {
  const transfer: Transferable[] = [job.occupancy.opaque.buffer];
  for (const template of job.templates)
    for (const face of template.faces) {
      transfer.push(face.positions.buffer, face.normals.buffer, face.uvs.buffer);
    }
  return transfer;
}

export function cloneTerrainMeshJob(job: TerrainMeshJob): TerrainMeshJob {
  return {
    ...job,
    chunk: { ...job.chunk },
    templates: job.templates.map((template) => ({
      faces: template.faces.map((face) => ({
        ...face,
        positions: new Float32Array(face.positions),
        normals: new Float32Array(face.normals),
        uvs: new Float32Array(face.uvs),
      })),
    })),
    entries: job.entries.map((entry) => ({
      ...entry,
      position: [...entry.position] as [number, number, number],
    })),
    occupancy: {
      ...job.occupancy,
      origin: [...job.occupancy.origin] as [number, number, number],
      opaque: new Uint8Array(job.occupancy.opaque),
    },
  };
}
