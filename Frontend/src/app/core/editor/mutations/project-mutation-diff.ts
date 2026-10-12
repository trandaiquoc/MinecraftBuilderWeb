import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { stableValueKey } from '../../domain/stable-value-key';
import type { ProjectMutationChange } from './project-mutation-hint';

/**
 * Compares only the positions supplied by the operation. This is deliberately
 * not a ProjectDocument-wide diff: local editor mutations must stay bounded.
 */
export function boundedProjectMutationChanges(
  positions: readonly VoxelCoordinate[],
  beforeAt: (position: VoxelCoordinate) => PlacedBlock | undefined,
  afterAt: (position: VoxelCoordinate) => PlacedBlock | undefined,
): readonly ProjectMutationChange[] {
  const unique = new Map<string, VoxelCoordinate>();
  for (const position of positions) unique.set(coordinateKey(position), position);
  const changes: ProjectMutationChange[] = [];
  for (const position of unique.values()) {
    const before = beforeAt(position);
    const after = afterAt(position);
    if (placedBlockValueEqual(before, after)) continue;
    changes.push({ position, before, after });
  }
  return changes;
}

export function projectMutationChanges(
  before: ProjectDocument,
  after: ProjectDocument,
  positions: readonly VoxelCoordinate[],
): readonly ProjectMutationChange[] {
  return boundedProjectMutationChanges(
    positions,
    (position) => findBlock(before, position),
    (position) => findBlock(after, position),
  );
}

/** Equality for persisted/render-relevant block values, independent of object identity. */
export function placedBlockValueEqual(
  left: PlacedBlock | undefined,
  right: PlacedBlock | undefined,
): boolean {
  return stableValueKey(left) === stableValueKey(right);
}

function findBlock(project: ProjectDocument, position: VoxelCoordinate): PlacedBlock | undefined {
  const key = coordinateKey(position);
  return project.blocks.find((block) => coordinateKey(block.position) === key);
}
