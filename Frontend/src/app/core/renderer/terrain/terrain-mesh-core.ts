import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import type { TerrainMeshBucketData, TerrainMeshEntryData, TerrainMeshFace, TerrainMeshJob, TerrainMeshResult } from './terrain-mesh-protocol';

const DIRECTIONS: readonly SurfaceFaceDirection[] = ['north', 'south', 'east', 'west', 'up', 'down'];

/** Pure terrain compiler. It intentionally has no Three.js or DOM dependency. */
export function meshTerrainCore(job: TerrainMeshJob): TerrainMeshResult {
  const buckets = new Map<string, MutableBucket>();
  let blocksCompiled = 0;
  let facesEmitted = 0;
  let facesCulled = 0;
  const emittedKeys = new Set<string>();
  const fullyOccludedKeys = new Set<string>();
  const unrepresentedExposedKeys: string[] = [];

  for (const entry of job.entries) {
    blocksCompiled += 1;
    let emittedForEntry = 0;
    let culledForEntry = 0;
    const template = job.templates[entry.templateIndex];
    if (!template) {
      unrepresentedExposedKeys.push(entry.key);
      continue;
    }
    for (const face of template.faces) {
      if (hasOpaqueNeighbour(job, entry.position, face.direction)) {
        facesCulled += 1;
        culledForEntry += 1;
        continue;
      }
      const bucket = buckets.get(face.bucketKey) ?? createBucket(face.bucketKey);
      buckets.set(face.bucketKey, bucket);
      appendFace(bucket, face, entry.position);
      facesEmitted += 1;
      emittedKeys.add(entry.key);
      emittedForEntry += 1;
    }
    if (emittedForEntry === 0) {
      if (culledForEntry === DIRECTIONS.length) fullyOccludedKeys.add(entry.key);
      else unrepresentedExposedKeys.push(entry.key);
    }
  }

  return {
    jobId: job.jobId,
    generation: job.generation,
    providerGeneration: job.providerGeneration,
    revision: job.revision,
    chunk: job.chunk,
    buckets: [...buckets.values()].map(finalizeBucket),
    blocksCompiled,
    facesEmitted,
    facesCulled,
    emittedKeys: [...emittedKeys],
    fullyOccludedKeys: [...fullyOccludedKeys],
    unrepresentedExposedKeys,
    cpuMs: 0,
  };
}

interface MutableBucket { readonly key: string; readonly positions: number[]; readonly normals: number[]; readonly uvs: number[]; readonly indices: number[]; faceCount: number; }
function createBucket(key: string): MutableBucket { return { key, positions: [], normals: [], uvs: [], indices: [], faceCount: 0 }; }
function appendFace(bucket: MutableBucket, face: TerrainMeshFace, position: readonly [number, number, number]): void {
  const base = bucket.positions.length / 3;
  for (let index = 0; index < face.positions.length; index += 3) {
    bucket.positions.push(face.positions[index] + position[0], face.positions[index + 1] + position[1], face.positions[index + 2] + position[2]);
    bucket.normals.push(face.normals[index], face.normals[index + 1], face.normals[index + 2]);
    const uvIndex = (index / 3) * 2;
    bucket.uvs.push(face.uvs[uvIndex] ?? 0, face.uvs[uvIndex + 1] ?? 0);
  }
  const count = face.positions.length / 3;
  if (count === 4) bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else for (let index = 0; index < count; index += 1) bucket.indices.push(base + index);
  bucket.faceCount += 1;
}
function finalizeBucket(bucket: MutableBucket): TerrainMeshBucketData {
  return { key: bucket.key, positions: new Float32Array(bucket.positions), normals: new Float32Array(bucket.normals), uvs: new Float32Array(bucket.uvs), indices: new Uint32Array(bucket.indices), faceCount: bucket.faceCount };
}

function hasOpaqueNeighbour(job: TerrainMeshJob, position: readonly [number, number, number], direction: SurfaceFaceDirection): boolean {
  let x = position[0], y = position[1], z = position[2];
  if (direction === 'north') z -= 1;
  else if (direction === 'south') z += 1;
  else if (direction === 'east') x += 1;
  else if (direction === 'west') x -= 1;
  else if (direction === 'up') y += 1;
  else y -= 1;
  const ox = x - job.occupancy.origin[0], oy = y - job.occupancy.origin[1], oz = z - job.occupancy.origin[2];
  if (ox < 0 || oy < 0 || oz < 0 || ox >= job.occupancy.size || oy >= job.occupancy.size || oz >= job.occupancy.size) return false;
  return job.occupancy.opaque[(oy * job.occupancy.size + oz) * job.occupancy.size + ox] === 1;
}
