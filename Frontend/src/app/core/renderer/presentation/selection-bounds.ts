import type { VoxelCoordinate } from '../../domain/project.types';

export function selectionBounds(
  positions: readonly VoxelCoordinate[],
): { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate } | undefined {
  if (!positions.length) return undefined;
  const first = positions[0];
  let minX = first.x;
  let minY = first.y;
  let minZ = first.z;
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;
  for (let index = 1; index < positions.length; index += 1) {
    const position = positions[index];
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}
