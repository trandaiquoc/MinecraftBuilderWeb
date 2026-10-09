import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { metadataMutationHint } from '../mutations/project-mutation-hint';
import { decorationHasGroup } from './decoration-membership';
import { hasGroup } from './group-membership';

export function groupMetadataMutationHint(
  before: ProjectDocument,
  after: ProjectDocument,
  groupId: string,
  source: string,
  presentation: 'metadata' | 'visibility' = 'metadata',
) {
  const positions = [
    ...before.blocks.filter((block) => hasGroup(block, groupId)),
    ...after.blocks.filter((block) => hasGroup(block, groupId)),
  ].map((block) => block.position);
  const decorations = [...(before.decorations ?? []), ...(after.decorations ?? [])]
    .filter(
      (decoration, index, all) =>
        decorationHasGroup(decoration, groupId) &&
        all.findIndex((candidate) => candidate.instanceId === decoration.instanceId) === index,
    )
    .map((decoration) => decoration.instanceId);
  return groupMutationHintForPositions(before, after, positions, decorations, source, presentation);
}

export function groupMutationHintForPositions(
  before: ProjectDocument,
  after: ProjectDocument,
  positions: readonly VoxelCoordinate[],
  decorationIds: readonly string[],
  source: string,
  presentation: 'metadata' | 'visibility' = 'metadata',
) {
  const uniquePositions = new Set(positions.map(coordinateKey));
  const beforeBlocks = new Map(
    before.blocks.map((block) => [coordinateKey(block.position), block] as const),
  );
  const afterBlocks = new Map(
    after.blocks.map((block) => [coordinateKey(block.position), block] as const),
  );
  const changes = [...uniquePositions]
    .map((key) => ({
      position: afterBlocks.get(key)?.position ?? beforeBlocks.get(key)?.position!,
      before: beforeBlocks.get(key),
      after: afterBlocks.get(key),
    }))
    .filter((change) => !!change.position);
  const uniqueDecorationIds = new Set(decorationIds);
  const beforeDecorations = new Map(
    (before.decorations ?? []).map((decoration) => [decoration.instanceId, decoration] as const),
  );
  const afterDecorations = new Map(
    (after.decorations ?? []).map((decoration) => [decoration.instanceId, decoration] as const),
  );
  const decorationChanges = [...uniqueDecorationIds].map((id) => ({
    id,
    before: beforeDecorations.get(id),
    after: afterDecorations.get(id),
  }));
  return metadataMutationHint(changes, decorationChanges, source, presentation);
}
