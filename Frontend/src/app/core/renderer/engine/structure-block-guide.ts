import { VoxelCoordinate } from '../../domain/project.types';

/**
 * Returns the helper voxel directly below the structure origin.
 *
 * This matches the editor's Structure Block workflow convention of Relative
 * Position `0 1 0`: the guide keeps the project's minimum X/Z and sits one
 * voxel below its minimum Y.
 */
export function structureBlockGuidePosition(min: VoxelCoordinate): VoxelCoordinate {
  return { x: min.x, y: min.y - 1, z: min.z };
}

/** The guide is centered in its helper voxel, just like a normal block model. */
export function structureBlockGuideCenter(position: VoxelCoordinate): VoxelCoordinate {
  return { x: position.x + 0.5, y: position.y + 0.5, z: position.z + 0.5 };
}
