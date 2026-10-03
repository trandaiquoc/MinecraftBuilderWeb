import type { VoxelCoordinate } from '../../domain/project.types';

/** Render-only terrain section size. Project coordinates remain world voxels. */
export const TERRAIN_CHUNK_SIZE = 16;

export interface TerrainChunkCoordinate { readonly x: number; readonly y: number; readonly z: number; }
export interface TerrainLocalCoordinate { readonly x: number; readonly y: number; readonly z: number; }

export function worldToTerrainChunk(position: VoxelCoordinate): TerrainChunkCoordinate {
  return { x: Math.floor(position.x / TERRAIN_CHUNK_SIZE), y: Math.floor(position.y / TERRAIN_CHUNK_SIZE), z: Math.floor(position.z / TERRAIN_CHUNK_SIZE) };
}

export function worldToTerrainLocal(position: VoxelCoordinate): TerrainLocalCoordinate {
  return { x: positiveModulo(position.x, TERRAIN_CHUNK_SIZE), y: positiveModulo(position.y, TERRAIN_CHUNK_SIZE), z: positiveModulo(position.z, TERRAIN_CHUNK_SIZE) };
}

export function terrainChunkKey(chunk: TerrainChunkCoordinate): string { return `${chunk.x},${chunk.y},${chunk.z}`; }

export function parseTerrainChunkKey(key: string): TerrainChunkCoordinate | undefined {
  const values = key.split(',').map(Number);
  return values.length === 3 && values.every(Number.isInteger) ? { x: values[0], y: values[1], z: values[2] } : undefined;
}

export function terrainChunkBounds(chunk: TerrainChunkCoordinate): { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } {
  const min = { x: chunk.x * TERRAIN_CHUNK_SIZE, y: chunk.y * TERRAIN_CHUNK_SIZE, z: chunk.z * TERRAIN_CHUNK_SIZE };
  return { min, max: { x: min.x + TERRAIN_CHUNK_SIZE, y: min.y + TERRAIN_CHUNK_SIZE, z: min.z + TERRAIN_CHUNK_SIZE } };
}

/** Returns the chunk containing the voxel and any directly touched neighbor chunks. */
export function relevantTerrainChunks(position: VoxelCoordinate): readonly TerrainChunkCoordinate[] {
  const chunk = worldToTerrainChunk(position);
  const local = worldToTerrainLocal(position);
  const result = new Map<string, TerrainChunkCoordinate>([[terrainChunkKey(chunk), chunk]]);
  if (local.x === 0) addNeighbor(result, chunk, -1, 0, 0);
  if (local.x === TERRAIN_CHUNK_SIZE - 1) addNeighbor(result, chunk, 1, 0, 0);
  if (local.y === 0) addNeighbor(result, chunk, 0, -1, 0);
  if (local.y === TERRAIN_CHUNK_SIZE - 1) addNeighbor(result, chunk, 0, 1, 0);
  if (local.z === 0) addNeighbor(result, chunk, 0, 0, -1);
  if (local.z === TERRAIN_CHUNK_SIZE - 1) addNeighbor(result, chunk, 0, 0, 1);
  return [...result.values()];
}

function addNeighbor(result: Map<string, TerrainChunkCoordinate>, chunk: TerrainChunkCoordinate, x: number, y: number, z: number): void {
  const neighbor = { x: chunk.x + x, y: chunk.y + y, z: chunk.z + z };
  result.set(terrainChunkKey(neighbor), neighbor);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
