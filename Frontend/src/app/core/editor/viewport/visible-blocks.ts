import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { isBlockVisible } from '../groups/group-membership';
import { blocksForLayers, YLayerVisibility } from './y-layer';
import { coordinateKey } from '../../domain/coordinates';

export interface VisibleBlockQuery {
  readonly layerY?: number;
  readonly visibility?: YLayerVisibility;
  readonly isolatedGroupId?: string;
  readonly isolatedGroupPositions?: readonly VoxelCoordinate[];
}

/** Single source of truth for block membership in a viewport projection. */
export function visibleBlockEntries(project: ProjectDocument, query: VisibleBlockQuery = {}): readonly PlacedBlock[] {
  const layered = query.layerY === undefined || !query.visibility
    ? project.blocks
    : blocksForLayers(project.blocks, query.layerY, query.visibility);
  const isolatedKeys = new Set(query.isolatedGroupPositions?.map((position) => coordinateKey(position)));
  return layered.filter((block) => isBlockVisible(block, project.groups) && (!query.isolatedGroupId || isolatedKeys.has(coordinateKey(block.position))));
}

export function visibleBlockKeys(project: ProjectDocument, query: VisibleBlockQuery = {}): ReadonlySet<string> {
  return new Set(visibleBlockEntries(project, query).map((block) => coordinateKey(block.position)));
}
