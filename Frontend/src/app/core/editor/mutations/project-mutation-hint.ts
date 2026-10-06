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
  /** Metadata-only transitions preserve block geometry and must not rehydrate models. */
  readonly metadataOnly?: boolean;
  /** Group visibility changes are presentation deltas over the listed blocks. */
  readonly presentation?: 'membership' | 'visibility' | 'metadata';
  /** False for membership/metadata transitions: usage counts remain unchanged. */
  readonly usageChanged?: boolean;
}

export function blockMutationHint(changes: readonly ProjectMutationChange[], source?: string, origin: ProjectMutationOrigin = 'editor', options: Pick<ProjectMutationHint, 'metadataOnly' | 'presentation' | 'usageChanged'> = {}): ProjectMutationHint {
  return Object.freeze({
    kind: 'block-delta' as const,
    changes: Object.freeze(changes.map((change) => Object.freeze({ ...change, position: { ...change.position } }))),
    origin,
    ...(source ? { source } : {}),
    ...(options.metadataOnly ? { metadataOnly: true } : {}),
    ...(options.presentation ? { presentation: options.presentation } : {}),
    ...(options.usageChanged === false ? { usageChanged: false } : {}),
  });
}

export function metadataMutationHint(source = 'metadata', presentation: ProjectMutationHint['presentation'] = 'metadata'): ProjectMutationHint {
  return blockMutationHint([], source, 'editor', { metadataOnly: true, presentation, usageChanged: false });
}

export function blockMetadataMutationHint(changes: readonly ProjectMutationChange[], source = 'block-metadata', presentation: ProjectMutationHint['presentation'] = 'membership'): ProjectMutationHint {
  return blockMutationHint(changes, source, 'editor', { metadataOnly: true, presentation, usageChanged: false });
}

export function invertProjectMutationHint(hint: ProjectMutationHint): ProjectMutationHint {
  return blockMutationHint(hint.changes.map((change) => ({ position: change.position, before: change.after, after: change.before })), hint.source, hint.origin, { metadataOnly: hint.metadataOnly, presentation: hint.presentation, usageChanged: hint.usageChanged });
}

export function isProjectMutationTransition(from: ProjectDocument | undefined, to: ProjectDocument | undefined, hint: ProjectMutationHint | undefined): boolean {
  return !!from && !!to && !!hint && hint.kind === 'block-delta' && hint.changes.length > 0;
}
