import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { isBlockVisible } from '../groups/group-membership';
import { blocksForLayers, LayerBlockIndex, YLayerVisibility } from './y-layer';
import { coordinateKey } from '../../domain/coordinates';

export interface VisibleBlockQuery {
  readonly layerY?: number;
  readonly visibility?: YLayerVisibility;
  readonly isolatedGroupId?: string;
  readonly isolatedGroupPositions?: readonly VoxelCoordinate[];
  readonly layerIndex?: LayerBlockIndex;
}

/** Single source of truth for block membership in a viewport projection. */
export function visibleBlockEntries(project: ProjectDocument, query: VisibleBlockQuery = {}): readonly PlacedBlock[] {
  const layered = query.layerY === undefined || !query.visibility
    ? project.blocks
    : blocksForLayers(project.blocks, query.layerY, query.visibility, query.layerIndex);
  const isolatedKeys = new Set(query.isolatedGroupPositions?.map((position) => coordinateKey(position)));
  return layered.filter((block) => isBlockVisible(block, project.groups) && (!query.isolatedGroupId || isolatedKeys.has(coordinateKey(block.position))));
}

/** Evaluates one voxel without scanning the project's block array. */
export function isBlockVisibleForViewport(block: PlacedBlock, project: ProjectDocument, query: VisibleBlockQuery = {}): boolean {
  if (!isBlockVisible(block, project.groups)) return false;
  if (query.layerY !== undefined && query.visibility && !visibleLayerSetForBlock(block, query.layerY, query.visibility)) return false;
  if (query.isolatedGroupId) {
    const isolated = query.isolatedGroupPositions?.some((position) => coordinateKey(position) === coordinateKey(block.position));
    if (!isolated) return false;
  }
  return true;
}

export function visibleBlockKeys(project: ProjectDocument, query: VisibleBlockQuery = {}): ReadonlySet<string> {
  return new Set(visibleBlockEntries(project, query).map((block) => coordinateKey(block.position)));
}

function visibleLayerSetForBlock(block: PlacedBlock, currentY: number, mode: YLayerVisibility): boolean {
  switch (mode) {
    case 'current-only': return block.position.y === currentY;
    case 'current-previous': return block.position.y === currentY || block.position.y === currentY - 1;
    case 'current-next': return block.position.y === currentY || block.position.y === currentY + 1;
    case 'previous-current-next': return Math.abs(block.position.y - currentY) <= 1;
    case 'all-below': return block.position.y <= currentY;
    case 'whole-structure': return true;
  }
}
