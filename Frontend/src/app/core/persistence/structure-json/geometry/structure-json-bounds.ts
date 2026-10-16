import { canonicalStructureModeForSize } from '../../../domain/structure-size-policy';
import type {
  ProjectDocument,
  ProjectSize,
  StructureMode,
  VoxelCoordinate,
} from '../../../domain/project.types';
import { isWithinBounds } from '../../../domain/coordinates';
import type { StructureJson } from '../structure-json-contracts';

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
  const scan = scanStructureJsonCoordinates(source, currentSize);
  const requiredSize = scan.requiredSize ?? { x: 1, y: 1, z: 1 };
  return {
    requiredSize,
    hasCoordinateContent: scan.requiredSize !== undefined,
    exceedsCurrent:
      requiredSize.x > currentSize.x ||
      requiredSize.y > currentSize.y ||
      requiredSize.z > currentSize.z,
    hasNegativeCoordinates: scan.hasNegativeCoordinates,
    blocksOutsideBounds: scan.blocksOutsideBounds,
    decorationsOutsideBounds: scan.decorationsOutsideBounds,
  };
}

/** Infers the smallest non-empty project size from block and decoration anchors. */
export function inferRequiredStructureJsonSize(source: StructureJson): ProjectSize | undefined {
  return scanStructureJsonCoordinates(source).requiredSize;
}

function scanStructureJsonCoordinates(
  source: StructureJson,
  currentSize?: ProjectSize,
): {
  readonly requiredSize: ProjectSize | undefined;
  readonly hasNegativeCoordinates: boolean;
  readonly blocksOutsideBounds: number;
  readonly decorationsOutsideBounds: number;
} {
  let hasCoordinateContent = false;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let hasNegativeCoordinates = false;
  let blocksOutsideBounds = 0;
  let decorationsOutsideBounds = 0;

  const includeCoordinate = (coordinate: VoxelCoordinate): void => {
    hasCoordinateContent = true;
    maxX = Math.max(maxX, coordinate.x);
    maxY = Math.max(maxY, coordinate.y);
    maxZ = Math.max(maxZ, coordinate.z);
    hasNegativeCoordinates ||= coordinate.x < 0 || coordinate.y < 0 || coordinate.z < 0;
  };

  for (const block of source.blocks) {
    includeCoordinate(block);
    if (currentSize && !isWithinBounds(block, currentSize)) blocksOutsideBounds += 1;
  }
  for (const decoration of source.decorations) {
    includeCoordinate(decoration.anchor);
    if (currentSize && !isWithinBounds(decoration.anchor, currentSize))
      decorationsOutsideBounds += 1;
  }

  return {
    requiredSize: hasCoordinateContent ? { x: maxX + 1, y: maxY + 1, z: maxZ + 1 } : undefined,
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
