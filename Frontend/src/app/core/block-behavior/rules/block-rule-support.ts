import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { blockCapability, hasBlockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { ProjectDocument, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { BlockDefinitionLookup, BlockSource, RuleValidation } from './block-rule-types';
import { add, clockwise, counterClockwise, directionOffset, find, opposite, oppositeSixFace, sixFaceDirectionOffset } from './block-rule-geometry';

/** Owns verified support contracts; mutation policy remains in BlockRuleEngine. */
export function validateBlockSupport(project: ProjectDocument, block: PlacedBlock, definition: BlockDefinition | undefined, definitions: BlockDefinitionLookup, source: BlockSource = project.blocks): RuleValidation {
  const contractSupport = validateSupportContracts(block, definition, definitions, source);
  if (contractSupport) return contractSupport;
  const behavior = definition?.behavior;
  if (!behavior) return hasBlockCapability(definition, 'direct-placement')
    ? { status: 'valid', reason: 'ok', affectedPositions: [block.position] }
    : { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position] };
  let supportPosition: VoxelCoordinate | undefined;
  if (behavior.kind === 'wall-mounted' || behavior.kind === 'wall-sign' || behavior.kind === 'wall-hanging-sign') supportPosition = add(block.position, directionOffset(opposite(block.state[behavior.facingProperty] ?? 'north')));
  if (behavior.kind === 'standing-sign') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
  if (behavior.kind === 'hanging-sign') supportPosition = add(block.position, { x: 0, y: 1, z: 0 });
  if (behavior.kind === 'wall-hanging-sign') {
    const facing = block.state[behavior.facingProperty] ?? 'north';
    const supports = [clockwise(facing), counterClockwise(facing)].map((direction) => add(block.position, directionOffset(direction)));
    const valid = supports.find((position) => {
      const support = find(source, position);
      return isSupportBlock(support?.id ?? '', definitions) || compatibleWallHanging(support, facing, definitions);
    });
    return valid
      ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, valid] }
      : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, ...supports] };
  }
  if (behavior.kind === 'attached-six-face-placement') {
    const facing = block.state[behavior.facingProperty] ?? 'up';
    supportPosition = add(block.position, sixFaceDirectionOffset(oppositeSixFace(facing)));
    const support = find(source, supportPosition);
    if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
    const supportBehavior = definitions(support.id)?.behavior;
    return isSupportBlock(support.id, definitions)
      ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
      : supportBehavior ? { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] } : { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
  }
  if (behavior.kind === 'floor-supported' || behavior.kind === 'torch-placement') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
  if (behavior.kind === 'lantern-placement') {
    const hanging = block.state[behavior.hangingProperty] === 'true';
    supportPosition = add(block.position, hanging ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 });
    const support = find(source, supportPosition);
    if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
    const supportBehavior = definitions(support.id)?.behavior;
    if (hanging) return isVerticalChain(support, definitions)
      ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
      : supportBehavior ? { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] } : { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
  }
  if (behavior.kind === 'hanging-sign') {
    const support = find(source, supportPosition!);
    if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition!] };
    const supportBehavior = definitions(support.id)?.behavior;
    return isSupportBlock(support.id, definitions) || compatibleHangingSign(support, definitions) || supportBehavior?.kind === 'vertical-chain' && support.state[supportBehavior.axisProperty] === supportBehavior.verticalAxis
      ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition!] }
      : !supportBehavior ? { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition!] }
        : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition!] };
  }
  if (behavior.kind === 'double-height' && behavior.requiresFloor && block.state[behavior.halfProperty] !== 'upper') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
  if (!supportPosition) return { status: 'valid', reason: 'ok', affectedPositions: [block.position] };
  if (supportPosition.y === -1 && block.position.y === 0 && requiresSupportBelow(behavior)) return { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] };
  const support = find(source, supportPosition);
  if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
  const supportBehavior = definitions(support.id)?.behavior;
  if (!supportBehavior && !isSupportBlock(support.id, definitions)) return { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
  return isSupportBlock(support.id, definitions)
    ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
    : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
}

export function validateSupportContracts(block: PlacedBlock, definition: BlockDefinition | undefined, definitions: BlockDefinitionLookup, source: BlockSource): RuleValidation | undefined {
  const requirements = definition?.supportRequirements;
  if (!requirements?.length) return undefined;
  const affected = [block.position];
  let unknown = false;
  for (const requirement of requirements) {
    const offset = requirement.direction === 'below' ? { x: 0, y: -1, z: 0 } : requirement.direction === 'above' ? { x: 0, y: 1, z: 0 } : directionOffset(requirement.direction);
    const position = add(block.position, offset); affected.push(position);
    const support = find(source, position);
    if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: affected };
    const supportDefinition = definitions(support.id);
    if (!supportDefinition) { unknown = true; continue; }
    if (supportDefinition.supportContracts?.includes(requirement.contractId)) continue;
    if (!supportDefinition.supportContracts?.length) { unknown = true; continue; }
    return { status: 'invalid', reason: 'missing-support', affectedPositions: affected };
  }
  return unknown ? { status: 'unknown', reason: 'unknown-behavior', affectedPositions: affected } : { status: 'valid', reason: 'ok', affectedPositions: affected };
}

export function isSupportBlock(id: string, definitions: BlockDefinitionLookup): boolean {
  const definition = definitions(id);
  if (!definition) return false;
  const behavior = definition.behavior;
  if (behavior?.kind === 'solid') return true;
  if (behavior && ['fluid', 'horizontal-connect', 'wall-mounted', 'wall-sign', 'wall-hanging-sign', 'floor-supported', 'torch-placement', 'lantern-placement', 'vertical-chain', 'attached-six-face-placement'].includes(behavior.kind)) return false;
  return definition.support === 'full' && definition.visualSupport === 'real' && definition.visualClassification === 'standard-json';
}

export function isVerticalChain(block: PlacedBlock | undefined, definitions: BlockDefinitionLookup): boolean {
  if (!block) return false;
  const behavior = definitions(block.id)?.behavior;
  return behavior?.kind === 'vertical-chain' && block.state[behavior.axisProperty] === behavior.verticalAxis;
}

function compatibleWallHanging(block: PlacedBlock | undefined, facing: string, definitions: BlockDefinitionLookup): boolean {
  return !!block && definitions(block.id)?.behavior?.kind === 'wall-hanging-sign' && axis(block.state['facing']) === axis(facing);
}

function compatibleHangingSign(block: PlacedBlock | undefined, definitions: BlockDefinitionLookup): boolean { return !!block && definitions(block.id)?.behavior?.kind === 'hanging-sign'; }
function axis(direction: string | undefined): 'x' | 'z' { return direction === 'east' || direction === 'west' ? 'x' : 'z'; }
function requiresSupportBelow(behavior: NonNullable<BlockDefinition['behavior']>): boolean { return behavior.kind === 'floor-supported' || behavior.kind === 'torch-placement' || behavior.kind === 'standing-sign' || behavior.kind === 'double-height' && behavior.requiresFloor; }
