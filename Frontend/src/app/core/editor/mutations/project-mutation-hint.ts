import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';

export interface ProjectMutationChange {
  readonly position: VoxelCoordinate;
  readonly before?: PlacedBlock;
  readonly after?: PlacedBlock;
}

export interface ProjectMetadataDecorationChange {
  readonly id: string;
  readonly before?: PlacedDecoration;
  readonly after?: PlacedDecoration;
}

export type ProjectMutationOrigin = 'editor' | 'content-resolution';

/** Renderer-neutral metadata for one known local ProjectDocument transition. */
export interface BlockMutationHint {
  readonly kind: 'block-delta';
  readonly changes: readonly ProjectMutationChange[];
  readonly origin: ProjectMutationOrigin;
  readonly source?: string;
}

export interface MetadataMutationHint {
  readonly kind: 'metadata-delta';
  readonly changes: readonly ProjectMutationChange[];
  readonly decorationChanges?: readonly ProjectMetadataDecorationChange[];
  readonly origin: ProjectMutationOrigin;
  readonly source?: string;
  readonly presentation?: 'metadata' | 'visibility';
}

export type ProjectMutationHint = BlockMutationHint | MetadataMutationHint;

export function blockMutationHint(
  changes: readonly ProjectMutationChange[],
  source?: string,
  origin: ProjectMutationOrigin = 'editor',
): ProjectMutationHint {
  return Object.freeze({
    kind: 'block-delta' as const,
    changes: Object.freeze(
      changes.map((change) => Object.freeze({ ...change, position: { ...change.position } })),
    ),
    origin,
    ...(source ? { source } : {}),
  });
}

export function metadataMutationHint(
  changes: readonly ProjectMutationChange[],
  decorationChanges: readonly ProjectMetadataDecorationChange[] = [],
  source?: string,
  presentation: MetadataMutationHint['presentation'] = 'metadata',
): ProjectMutationHint {
  return Object.freeze({
    kind: 'metadata-delta' as const,
    changes: Object.freeze(
      changes.map((change) => Object.freeze({ ...change, position: { ...change.position } })),
    ),
    decorationChanges: Object.freeze(
      decorationChanges.map((change) => Object.freeze({ ...change })),
    ),
    origin: 'editor' as const,
    presentation,
    ...(source ? { source } : {}),
  });
}

export function invertProjectMutationHint(hint: ProjectMutationHint): ProjectMutationHint {
  if (hint.kind === 'metadata-delta') {
    return metadataMutationHint(
      hint.changes.map((change) => ({
        position: change.position,
        before: change.after,
        after: change.before,
      })),
      (hint.decorationChanges ?? []).map((change) => ({
        id: change.id,
        before: change.after,
        after: change.before,
      })),
      hint.source,
      hint.presentation,
    );
  }
  return blockMutationHint(
    hint.changes.map((change) => ({
      position: change.position,
      before: change.after,
      after: change.before,
    })),
    hint.source,
    hint.origin,
  );
}

export function isProjectMutationTransition(
  from: ProjectDocument | undefined,
  to: ProjectDocument | undefined,
  hint: ProjectMutationHint | undefined,
): boolean {
  return (
    !!from &&
    !!to &&
    !!hint &&
    (hint.changes.length > 0 ||
      (hint.kind === 'metadata-delta' && (hint.decorationChanges?.length ?? 0) > 0))
  );
}
