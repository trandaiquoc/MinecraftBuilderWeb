import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';

export interface ProjectMutationChange {
  readonly position: VoxelCoordinate;
  readonly before?: PlacedBlock;
  readonly after?: PlacedBlock;
}

/** Renderer-neutral metadata for one known local ProjectDocument transition. */
export interface ProjectMutationHint {
  readonly kind: 'block-delta';
  readonly changes: readonly ProjectMutationChange[];
  readonly source?: string;
}

export function blockMutationHint(changes: readonly ProjectMutationChange[], source?: string): ProjectMutationHint {
  return Object.freeze({
    kind: 'block-delta' as const,
    changes: Object.freeze(changes.map((change) => Object.freeze({ ...change, position: { ...change.position } }))),
    ...(source ? { source } : {}),
  });
}

export function invertProjectMutationHint(hint: ProjectMutationHint): ProjectMutationHint {
  return blockMutationHint(hint.changes.map((change) => ({ position: change.position, before: change.after, after: change.before })), hint.source);
}

export function isProjectMutationTransition(from: ProjectDocument | undefined, to: ProjectDocument | undefined, hint: ProjectMutationHint | undefined): boolean {
  return !!from && !!to && !!hint && hint.kind === 'block-delta' && hint.changes.length > 0;
}
