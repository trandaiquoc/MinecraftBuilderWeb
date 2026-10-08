import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceDirection } from './exposed-face-rendering';

export function surfaceNeighbor(position: VoxelCoordinate, direction: SurfaceFaceDirection): VoxelCoordinate {
  switch (direction) {
    case 'north': return { x: position.x, y: position.y, z: position.z - 1 };
    case 'south': return { x: position.x, y: position.y, z: position.z + 1 };
    case 'east': return { x: position.x + 1, y: position.y, z: position.z };
    case 'west': return { x: position.x - 1, y: position.y, z: position.z };
    case 'up': return { x: position.x, y: position.y + 1, z: position.z };
    case 'down': return { x: position.x, y: position.y - 1, z: position.z };
  }
}

export function isHorizontalDirection(value: string | undefined): value is 'north' | 'east' | 'south' | 'west' {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}

export function surfaceFaceNormal(direction: SurfaceFaceDirection): THREE.Vector3 {
  switch (direction) {
    case 'north': return new THREE.Vector3(0, 0, -1);
    case 'south': return new THREE.Vector3(0, 0, 1);
    case 'east': return new THREE.Vector3(1, 0, 0);
    case 'west': return new THREE.Vector3(-1, 0, 0);
    case 'up': return new THREE.Vector3(0, 1, 0);
    case 'down': return new THREE.Vector3(0, -1, 0);
  }
}
