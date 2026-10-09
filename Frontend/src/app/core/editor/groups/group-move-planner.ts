import { coordinateKey, isWithinBounds } from '../../domain/coordinates';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { expandLogicalObjectClosure } from '../../block-behavior/logical-objects/logical-object';
import { decorationHasGroup, isDecorationLocked } from './decoration-membership';
import { hasGroup, isBlockLocked } from './group-membership';
import {
  decorationAabb,
  decorationInBounds,
  decorationOverlaps,
  directionVector,
  paintingSupportFootprint,
  supportsDecoration,
} from '../../decorations/placement/decoration-placement';
import { paintingVariant, type PlacedDecoration } from '../../decorations/decoration.types';

export interface GroupMovePreview {
  readonly groupId: string;
  readonly offset: VoxelCoordinate;
  readonly positions: readonly VoxelCoordinate[];
  readonly decorationIds: readonly string[];
  readonly valid: boolean;
  readonly reason?: 'bounds' | 'collision' | 'locked' | 'support';
}

export function groupMovingBlocks(
  project: ProjectDocument,
  groupId: string,
  definition: (id: string) => BlockDefinition | undefined = () => undefined,
) {
  const seeds = project.blocks.filter((block) => hasGroup(block, groupId));
  return expandLogicalObjectClosure(project.blocks, seeds, definition);
}

export function validateGroupMove(
  project: ProjectDocument,
  groupId: string,
  offset: VoxelCoordinate,
  definition: (id: string) => BlockDefinition | undefined = () => undefined,
): GroupMovePreview {
  const moving = groupMovingBlocks(project, groupId, definition);
  const movingDecorations = (project.decorations ?? []).filter((decoration) =>
    decorationHasGroup(decoration, groupId),
  );
  const group = project.groups.find((entry) => entry.id === groupId);
  const positions = moving.map((block) => block.position);
  const decorationIds = movingDecorations.map((decoration) => decoration.instanceId);
  if (
    (!moving.length && !movingDecorations.length) ||
    !group ||
    group.locked ||
    moving.some((block) => isBlockLocked(block, project.groups)) ||
    movingDecorations.some((decoration) => isDecorationLocked(decoration, project.groups))
  ) {
    return { groupId, offset, positions, decorationIds, valid: false, reason: 'locked' };
  }
  if (
    !Number.isInteger(offset.x) ||
    !Number.isInteger(offset.y) ||
    !Number.isInteger(offset.z) ||
    moving.some(
      (block) => !isWithinBounds(translateGroupPosition(block.position, offset), project.size),
    ) ||
    movingDecorations.some(
      (decoration) =>
        !decorationInBounds(translateGroupPosition(decoration.anchor, offset), project.size),
    )
  ) {
    return { groupId, offset, positions, decorationIds, valid: false, reason: 'bounds' };
  }
  const movingKeys = new Set(moving.map((block) => coordinateKey(block.position)));
  const occupied = new Set(
    project.blocks
      .filter((block) => !movingKeys.has(coordinateKey(block.position)))
      .map((block) => coordinateKey(block.position)),
  );
  if (
    moving.some((block) =>
      occupied.has(coordinateKey(translateGroupPosition(block.position, offset))),
    )
  )
    return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };

  const movedDecorations = movingDecorations.map((decoration) => ({
    ...decoration,
    anchor: translateGroupPosition(decoration.anchor, offset),
  }));
  if (
    movedDecorations.some(
      (decoration) => !decorationSupportValid(project, decoration, movingKeys, offset),
    )
  )
    return { groupId, offset, positions, decorationIds, valid: false, reason: 'support' };
  for (let index = 0; index < movedDecorations.length; index += 1) {
    for (let other = index + 1; other < movedDecorations.length; other += 1) {
      if (
        decorationOverlaps(
          decorationAabb(movedDecorations[index]),
          decorationAabb(movedDecorations[other]),
        )
      )
        return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
    }
  }
  const movingDecorationSet = new Set(decorationIds);
  if (
    movedDecorations.some((decoration) =>
      (project.decorations ?? []).some(
        (other) =>
          !movingDecorationSet.has(other.instanceId) &&
          decorationOverlaps(decorationAabb(decoration), decorationAabb(other)),
      ),
    )
  ) {
    return { groupId, offset, positions, decorationIds, valid: false, reason: 'collision' };
  }
  return { groupId, offset, positions, decorationIds, valid: true };
}

function decorationSupportValid(
  project: ProjectDocument,
  decoration: PlacedDecoration,
  movingBlockKeys: ReadonlySet<string>,
  offset: VoxelCoordinate,
): boolean {
  if (
    decoration.fixed &&
    (decoration.kind === 'item-frame' || decoration.kind === 'glow-item-frame')
  )
    return true;
  const direction = directionVector(decoration.facing);
  const support = {
    x: decoration.anchor.x - direction.x,
    y: decoration.anchor.y - direction.y,
    z: decoration.anchor.z - direction.z,
  };
  const supportKey = coordinateKey(support);
  const exists = project.blocks.some((block) =>
    movingBlockKeys.has(coordinateKey(block.position))
      ? coordinateKey(translateGroupPosition(block.position, offset)) === supportKey
      : coordinateKey(block.position) === supportKey,
  );
  if (!supportsDecoration(decoration.kind, decoration.facing, exists, decoration.fixed))
    return false;
  const variant =
    decoration.kind === 'painting' ? paintingVariant(decoration.variantId) : undefined;
  return (
    !variant ||
    paintingSupportFootprint(decoration.anchor, decoration.facing, variant).every((position) =>
      project.blocks.some((block) =>
        movingBlockKeys.has(coordinateKey(block.position))
          ? coordinateKey(translateGroupPosition(block.position, offset)) ===
            coordinateKey(position)
          : coordinateKey(block.position) === coordinateKey(position),
      ),
    )
  );
}

export function translateGroupPosition(
  position: VoxelCoordinate,
  offset: VoxelCoordinate,
): VoxelCoordinate {
  return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z };
}
