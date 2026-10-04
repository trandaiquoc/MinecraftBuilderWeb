import { describe, expect, it } from 'vitest';
import { meshTerrainCore } from './terrain-mesh-core';
import type { TerrainMeshJob } from './terrain-mesh-protocol';

function job(entries: readonly { readonly key: string; readonly position: readonly [number, number, number] }[], opaque: readonly string[] = []): TerrainMeshJob {
  const mask = new Uint8Array(18 * 18 * 18);
  for (const key of opaque) {
    const [x, y, z] = key.split(',').map(Number);
    const ox = x + 1, oy = y + 1, oz = z + 1;
    mask[(oy * 18 + oz) * 18 + ox] = 1;
  }
  return { jobId: 1, generation: 2, providerGeneration: 3, revision: 4, chunk: { x: 0, y: 0, z: 0 }, templates: [{ faces: cubeFaces() }], entries: entries.map((entry) => ({ ...entry, templateIndex: 0 })), occupancy: { origin: [-1, -1, -1], size: 18, opaque: mask } };
}

function cubeFaces() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  return (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((direction) => ({ direction, bucketKey: 'stone', positions, normals, uvs }));
}

describe('pure terrain mesh core', () => {
  it('matches the six-face isolated voxel contract without Three.js', () => {
    const result = meshTerrainCore(job([{ key: '0,0,0', position: [0, 0, 0] }]));
    expect(result.blocksCompiled).toBe(1);
    expect(result.facesEmitted).toBe(6);
    expect(result.facesCulled).toBe(0);
    expect(result.buckets[0].positions).toBeInstanceOf(Float32Array);
    expect(result.buckets[0].faceCount).toBe(6);
  });

  it('culls an opaque neighbour across the chunk boundary using the halo', () => {
    const result = meshTerrainCore(job([{ key: '15,0,0', position: [15, 0, 0] }], ['16,0,0']));
    expect(result.facesEmitted).toBe(5);
    expect(result.facesCulled).toBe(1);
    expect(result.emittedKeys).toEqual(['15,0,0']);
  });

  it('preserves job identity metadata for stale-result validation', () => {
    const result = meshTerrainCore(job([]));
    expect(result).toMatchObject({ jobId: 1, generation: 2, providerGeneration: 3, revision: 4, chunk: { x: 0, y: 0, z: 0 } });
  });
});
