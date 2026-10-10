import { canonicalStructureModeForSize } from '../../domain/structure-size-policy';
import type {
  ProjectDocument,
  ProjectSize,
  StructureMode,
  VoxelCoordinate,
} from '../../domain/project.types';
import { isWithinBounds } from '../../domain/coordinates';
import type { StructureJson } from './structure-json';

export interface StructureJsonBoundsPreflight {
  readonly requiredSize: ProjectSize;
  readonly hasCoordinateContent: boolean;
  readonly exceedsCurrent: boolean;
  readonly hasNegativeCoordinates: boolean;
  readonly blocksOutsideBounds: number;
  readonly decorationsOutsideBounds: number;
}

export function resizeProjectForStructureJsonImport(
  project: ProjectDocument,
  bounds: StructureJsonBoundsPreflight,
): ProjectDocument | undefined {
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

export function inspectStructureJsonBounds(
  source: StructureJson,
  currentSize: ProjectSize,
): StructureJsonBoundsPreflight {
  const inferredSize = inferRequiredStructureJsonSize(source);
  const coordinates: VoxelCoordinate[] = [
    ...source.blocks.map(({ x, y, z }) => ({ x, y, z })),
    ...source.decorations.map(({ anchor }) => anchor),
  ];
  let hasNegativeCoordinates = false;
  for (const coordinate of coordinates) {
    hasNegativeCoordinates ||= coordinate.x < 0 || coordinate.y < 0 || coordinate.z < 0;
  }
  const requiredSize = inferredSize ?? { x: 1, y: 1, z: 1 };
  const blocksOutsideBounds = source.blocks.filter(
    (block) => !isWithinBounds(block, currentSize),
  ).length;
  const decorationsOutsideBounds = source.decorations.filter(
    (decoration) => !isWithinBounds(decoration.anchor, currentSize),
  ).length;
  return {
    requiredSize,
    hasCoordinateContent: inferredSize !== undefined,
    exceedsCurrent:
      requiredSize.x > currentSize.x ||
      requiredSize.y > currentSize.y ||
      requiredSize.z > currentSize.z,
    hasNegativeCoordinates,
    blocksOutsideBounds,
    decorationsOutsideBounds,
  };
}

/** Infers the smallest non-empty project size from block and decoration anchors. */
export function inferRequiredStructureJsonSize(source: StructureJson): ProjectSize | undefined {
  const coordinates = [
    ...source.blocks.map(({ x, y, z }) => ({ x, y, z })),
    ...source.decorations.map(({ anchor }) => anchor),
  ];
  if (!coordinates.length) return undefined;
  return {
    x: Math.max(...coordinates.map(({ x }) => x)) + 1,
    y: Math.max(...coordinates.map(({ y }) => y)) + 1,
    z: Math.max(...coordinates.map(({ z }) => z)) + 1,
  };
}

export function clipStructureJsonToBounds(source: StructureJson, size: ProjectSize): StructureJson {
  return {
    ...source,
    blocks: source.blocks.filter((block) => isWithinBounds(block, size)),
    decorations: source.decorations.filter((decoration) => isWithinBounds(decoration.anchor, size)),
  };
}
