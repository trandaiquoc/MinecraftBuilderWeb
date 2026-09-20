import { isWithinBounds } from '../../domain/coordinates';
import { ProjectSize, VoxelCoordinate } from '../../domain/project.types';

export interface VoxelBox { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate; }

export function normalizeVoxelBox(a: VoxelCoordinate, b: VoxelCoordinate): VoxelBox {
  return { min: { x: Math.min(Math.trunc(a.x), Math.trunc(b.x)), y: Math.min(Math.trunc(a.y), Math.trunc(b.y)), z: Math.min(Math.trunc(a.z), Math.trunc(b.z)) }, max: { x: Math.max(Math.trunc(a.x), Math.trunc(b.x)), y: Math.max(Math.trunc(a.y), Math.trunc(b.y)), z: Math.max(Math.trunc(a.z), Math.trunc(b.z)) } };
}

export function clampVoxelBox(box: VoxelBox, size: ProjectSize): VoxelBox | undefined {
  const min = { x: Math.max(0, box.min.x), y: Math.max(0, box.min.y), z: Math.max(0, box.min.z) };
  const max = { x: Math.min(size.x - 1, box.max.x), y: Math.min(size.y - 1, box.max.y), z: Math.min(size.z - 1, box.max.z) };
  return min.x <= max.x && min.y <= max.y && min.z <= max.z && isWithinBounds(min, size) && isWithinBounds(max, size) ? { min, max } : undefined;
}

export function voxelBoxSize(box: VoxelBox): VoxelCoordinate { return { x: box.max.x - box.min.x + 1, y: box.max.y - box.min.y + 1, z: box.max.z - box.min.z + 1 }; }
export function voxelInBox(position: VoxelCoordinate, box: VoxelBox): boolean { return position.x >= box.min.x && position.x <= box.max.x && position.y >= box.min.y && position.y <= box.max.y && position.z >= box.min.z && position.z <= box.max.z; }
