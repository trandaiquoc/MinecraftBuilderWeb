import { canonicalStructureModeForSize } from '../../domain/structure-size-policy';
import type { ProjectDocument, ProjectSize, StructureMode, VoxelCoordinate } from '../../domain/project.types';
import { isWithinBounds } from '../../domain/coordinates';
import type { StructureJson } from './structure-json';

export interface StructureJsonBoundsPreflight {
  readonly requiredSize: ProjectSize;
  readonly exceedsCurrent: boolean;
  readonly hasNegativeCoordinates: boolean;
  readonly blocksOutsideBounds: number;
  readonly decorationsOutsideBounds: number;
}

export function resizeProjectForStructureJsonImport(project: ProjectDocument, bounds: StructureJsonBoundsPreflight): ProjectDocument | undefined {
  if (bounds.hasNegativeCoordinates) return undefined;
  const size: ProjectSize = {
    x: Math.max(project.size.x, bounds.requiredSize.x),
    y: Math.max(project.size.y, bounds.requiredSize.y),
    z: Math.max(project.size.z, bounds.requiredSize.z),
  };
  const mode = importStructureModeForSize(size);
  if (!mode) return undefined;
  return { ...project, size, structureMode: mode };
}

function importStructureModeForSize(size: ProjectSize): StructureMode | undefined {
  return canonicalStructureModeForSize(size);
}

export function inspectStructureJsonBounds(source: StructureJson, currentSize: ProjectSize): StructureJsonBoundsPreflight {
  const coordinates: VoxelCoordinate[] = [
    ...source.blocks.map(({ x, y, z }) => ({ x, y, z })),
    ...source.decorations.map(({ anchor }) => anchor),
  ];
  const max = { x: 0, y: 0, z: 0 };
  let hasNegativeCoordinates = false;
  for (const coordinate of coordinates) {
    max.x = Math.max(max.x, coordinate.x);
    max.y = Math.max(max.y, coordinate.y);
    max.z = Math.max(max.z, coordinate.z);
    hasNegativeCoordinates ||= coordinate.x < 0 || coordinate.y < 0 || coordinate.z < 0;
  }
  const requiredSize = { x: max.x + 1, y: max.y + 1, z: max.z + 1 };
  const blocksOutsideBounds = source.blocks.filter((block) => !isWithinBounds(block, currentSize)).length;
  const decorationsOutsideBounds = source.decorations.filter((decoration) => !isWithinBounds(decoration.anchor, currentSize)).length;
  return {
    requiredSize,
    exceedsCurrent: requiredSize.x > currentSize.x || requiredSize.y > currentSize.y || requiredSize.z > currentSize.z,
    hasNegativeCoordinates,
    blocksOutsideBounds,
    decorationsOutsideBounds,
  };
}

export function clipStructureJsonToBounds(source: StructureJson, size: ProjectSize): StructureJson {
  return {
    ...source,
    blocks: source.blocks.filter((block) => isWithinBounds(block, size)),
    decorations: source.decorations.filter((decoration) => isWithinBounds(decoration.anchor, size)),
  };
}
