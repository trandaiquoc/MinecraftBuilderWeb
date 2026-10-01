import { VoxelCoordinate } from '../../domain/project.types';

/** Returns the helper voxel immediately outside the project's minimum X/Z corner. */
export function structureBlockGuidePosition(min: VoxelCoordinate): VoxelCoordinate {
  return { x: min.x - 1, y: min.y, z: min.z - 1 };
}

/** The guide is centered in its helper voxel, just like a normal block model. */
export function structureBlockGuideCenter(position: VoxelCoordinate): VoxelCoordinate {
  return { x: position.x + .5, y: position.y + .5, z: position.z + .5 };
}
