import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';

export interface ProjectMutationChange {
  readonly position: VoxelCoordinate;
  readonly before?: PlacedBlock;
  readonly after?: PlacedBlock;
}

export type ProjectMutationOrigin = 'editor' | 'content-resolution';

/** Renderer-neutral metadata for one known local ProjectDocument transition. */
export interface ProjectMutationHint {
  readonly kind: 'block-delta';
  readonly changes: readonly ProjectMutationChange[];
  readonly origin: ProjectMutationOrigin;
  readonly source?: string;
}

export function blockMutationHint(changes: readonly ProjectMutationChange[], source?: string, origin: ProjectMutationOrigin = 'editor'): ProjectMutationHint {
  return Object.freeze({
    kind: 'block-delta' as const,
    changes: Object.freeze(changes.map((change) => Object.freeze({ ...change, position: { ...change.position } }))),
    origin,
    ...(source ? { source } : {}),
  });
}

export function invertProjectMutationHint(hint: ProjectMutationHint): ProjectMutationHint {
  return blockMutationHint(hint.changes.map((change) => ({ position: change.position, before: change.after, after: change.before })), hint.source, hint.origin);
}

export function isProjectMutationTransition(from: ProjectDocument | undefined, to: ProjectDocument | undefined, hint: ProjectMutationHint | undefined): boolean {
  return !!from && !!to && !!hint && hint.kind === 'block-delta' && hint.changes.length > 0;
}
