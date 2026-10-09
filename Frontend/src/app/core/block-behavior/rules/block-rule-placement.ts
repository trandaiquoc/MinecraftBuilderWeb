import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { PlacementContext } from '../../editor/placement/placement';
import type { PlacedBlock } from '../../domain/project.types';
import type { BlockDefinitionLookup, BlockSource } from './block-rule-types';
import { directionFromNormal, directionFromSixFaceNormal, find, stairHalfFromContext } from './block-rule-geometry';
import { isSupportBlock, isVerticalChain } from './block-rule-support';

/** Owns state preparation for a placement request; mutation remains in the rule engine. */
export function prepareBlockPlacement(block: PlacedBlock, context: PlacementContext | undefined, definition: BlockDefinition | undefined, definitions: BlockDefinitionLookup): PlacedBlock | undefined {
  const behavior = definition?.behavior;
  const axisCapability = blockCapability(definition, 'axis-oriented');
  if (axisCapability && context?.faceNormal) {
    const normal = context.faceNormal;
    const axis = Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z) ? 'x' : Math.abs(normal.z) >= Math.abs(normal.y) ? 'z' : 'y';
    return { ...block, state: { ...block.state, [axisCapability.axisProperty]: axis } };
  }
  if (behavior?.kind === 'double-height') return { ...block, state: { ...block.state, [behavior.halfProperty]: 'lower' } };
  if (behavior?.kind === 'torch-placement' && context?.faceNormal) {
    const normal = context.faceNormal;
    if (normal.y < 0) return undefined;
    if (normal.y === 0) {
      const wallDefinition = definitions(behavior.wallBlockId);
      const facing = directionFromNormal(normal);
      if (!wallDefinition || !facing) return undefined;
      return { ...block, id: wallDefinition.id, namespace: wallDefinition.namespace, state: { ...wallDefinition.defaultState, facing } };
    }
  }
  if (behavior?.kind === 'wall-mounted' && context?.faceNormal) {
    const facing = directionFromNormal(context.faceNormal);
    if (facing) return { ...block, state: { ...block.state, [behavior.facingProperty]: facing } };
  }
  if (behavior?.kind === 'six-face-placement' || behavior?.kind === 'attached-six-face-placement') {
    const facing = context?.faceNormal && directionFromSixFaceNormal(context.faceNormal);
    return facing ? { ...block, state: { ...block.state, [behavior.facingProperty]: facing } } : undefined;
  }
  if (behavior?.kind === 'head-placement') {
    if (behavior.wall) {
      const facing = context?.faceNormal && directionFromNormal(context.faceNormal);
      return facing ? { ...block, state: { ...block.state, [behavior.facingProperty]: facing } } : undefined;
    }
    if (context?.faceNormal && context.faceNormal.y !== 1) return undefined;
    return { ...block, state: { ...block.state, [behavior.rotationProperty]: minecraftSkullRotation(context?.yaw) } };
  }
  if (behavior?.kind === 'paired-horizontal') {
    const facing = context?.yaw === undefined ? block.state[behavior.facingProperty] ?? 'north' : minecraftPlayerFacing(context.yaw);
    return { ...block, state: { ...block.state, [behavior.facingProperty]: facing, occupied: 'false' } };
  }
  if (behavior?.kind === 'decorated-pot-placement') return { ...block, state: { ...block.state, [behavior.facingProperty]: minecraftPlayerFacing(context?.yaw ?? 0), cracked: 'false' } };
  if (behavior?.kind === 'conduit-placement') return { ...block, state: { ...block.state, [behavior.waterloggedProperty]: 'false' } };
  if (behavior?.kind === 'standing-sign') {
    if (context?.faceNormal && context.faceNormal.y !== 1) return undefined;
    return { ...block, state: { ...block.state, [behavior.rotationProperty]: minecraftSignRotation(context?.yaw) } };
  }
  if (behavior?.kind === 'hanging-sign') {
    if (context?.faceNormal && context.faceNormal.y !== -1) return undefined;
    return { ...block, state: { ...block.state, [behavior.rotationProperty]: minecraftSignRotation(context?.yaw) } };
  }
  if (behavior?.kind === 'wall-sign') {
    const facing = context?.faceNormal && directionFromNormal(context.faceNormal);
    return facing ? { ...block, state: { ...block.state, [behavior.facingProperty]: facing } } : undefined;
  }
  if (behavior?.kind === 'wall-hanging-sign') {
    const supportDirection = context?.faceNormal && directionFromNormal(context.faceNormal);
    return supportDirection ? { ...block, state: { ...block.state, [behavior.facingProperty]: counterClockwise(supportDirection) } } : undefined;
  }
  if (behavior?.kind !== 'stairs') return block;
  const half = stairHalfFromContext(context, block.state['half'] ?? 'bottom');
  return { ...block, state: { ...block.state, ...(context?.facing ? { facing: context.facing } : {}), half } };
}

export function prepareContextualPlacement(block: PlacedBlock, context: PlacementContext | undefined, definitions: BlockDefinitionLookup, source: BlockSource): PlacedBlock {
  const behavior = definitions(block.id)?.behavior;
  if (behavior?.kind === 'hanging-sign') {
    const above = find(source, { x: block.position.x, y: block.position.y + 1, z: block.position.z });
    return { ...block, state: { ...block.state, [behavior.attachedProperty]: above && isSupportBlock(above.id, definitions) ? 'true' : 'false' } };
  }
  if (behavior?.kind !== 'lantern-placement') return block;
  const above = find(source, { x: block.position.x, y: block.position.y + 1, z: block.position.z });
  const hanging = context?.faceNormal?.y === -1 || (!context?.faceNormal && isVerticalChain(above, definitions));
  return { ...block, state: { ...block.state, [behavior.hangingProperty]: hanging ? 'true' : 'false' } };
}

/** Java RotationPropertyHelper equivalent for SignBlock placement: player yaw + 180. */
export function minecraftSignRotation(yaw: number | undefined): string {
  const degrees = ((yaw ?? 0) + 180) % 360;
  return String(Math.floor((degrees * 16 / 360) + .5) & 15);
}

/** Java SkullBlock uses the player's yaw directly; SignBlock has a separate +180° rule. */
export function minecraftSkullRotation(yaw: number | undefined): string { return String(Math.round((yaw ?? 0) * 16 / 360) & 15); }

/** Minecraft Direction.fromRotation(yaw), used by BedBlock placement. */
export function minecraftPlayerFacing(yaw = 0): 'south' | 'west' | 'north' | 'east' {
  const index = Math.floor(yaw / 90 + 0.5) & 3;
  return (['south', 'west', 'north', 'east'] as const)[index] ?? 'south';
}

function counterClockwise(direction: string): string { return ({ north: 'west', west: 'south', south: 'east', east: 'north' } as Record<string, string>)[direction] ?? direction; }
