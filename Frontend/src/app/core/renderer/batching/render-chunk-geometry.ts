import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';

export const RENDER_CHUNK_SIZE = 16;

export function renderChunkKey(position: VoxelCoordinate): string {
  return `${Math.floor(position.x / RENDER_CHUNK_SIZE)},${Math.floor(position.y / RENDER_CHUNK_SIZE)},${Math.floor(position.z / RENDER_CHUNK_SIZE)}`;
}

export function renderChunkBounds(chunk: string, envelope: THREE.Box3): THREE.Box3 {
  const [chunkX, chunkY, chunkZ] = chunk.split(',').map(Number);
  const origin = new THREE.Vector3(
    chunkX * RENDER_CHUNK_SIZE,
    chunkY * RENDER_CHUNK_SIZE,
    chunkZ * RENDER_CHUNK_SIZE,
  );
  return new THREE.Box3(
    origin.clone().add(envelope.min),
    origin
      .clone()
      .add(new THREE.Vector3(RENDER_CHUNK_SIZE - 1, RENDER_CHUNK_SIZE - 1, RENDER_CHUNK_SIZE - 1))
      .add(envelope.max),
  );
}

export function unitVoxelEnvelope(): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
}
