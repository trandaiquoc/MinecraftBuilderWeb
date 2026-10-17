import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';

export interface ProjectPreviewBounds {
  readonly min: VoxelCoordinate;
  readonly max: VoxelCoordinate;
}

export function projectPreviewBounds(
  project: Pick<ProjectDocument, 'blocks' | 'decorations'>,
): ProjectPreviewBounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const block of project.blocks) {
    const { x, y, z } = block.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x + 1 > maxX) maxX = x + 1;
    if (y + 1 > maxY) maxY = y + 1;
    if (z + 1 > maxZ) maxZ = z + 1;
  }

  for (const decoration of project.decorations ?? []) {
    const { x, y, z } = decoration.anchor;
    if (x - 1 < minX) minX = x - 1;
    if (y - 1 < minY) minY = y - 1;
    if (z - 1 < minZ) minZ = z - 1;
    if (x + 2 > maxX) maxX = x + 2;
    if (y + 2 > maxY) maxY = y + 2;
    if (z + 2 > maxZ) maxZ = z + 2;
  }

  if (minX === Infinity) return undefined;
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}
