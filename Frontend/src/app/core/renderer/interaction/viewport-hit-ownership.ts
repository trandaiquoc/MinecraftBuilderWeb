import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';

export function blockCoordinateFromHit(hit: THREE.Intersection): VoxelCoordinate | undefined {
  const direct = hit.object.userData['voxel'] as VoxelCoordinate | undefined;
  if (direct) return direct;
  const instanceId = hit.instanceId;
  if (instanceId === undefined) return undefined;
  return (hit.object.userData['instanceVoxels'] as VoxelCoordinate[] | undefined)?.[instanceId];
}

export function surfaceFaceDirectionFromHit(hit: THREE.Intersection): SurfaceFaceDirection | undefined {
  if (hit.instanceId === undefined || hit.object.userData['surfaceFaceBatch'] !== true) return undefined;
  return (hit.object.userData['instanceFaceDirections'] as SurfaceFaceDirection[] | undefined)?.[hit.instanceId];
}
