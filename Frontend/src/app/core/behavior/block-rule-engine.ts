import { BlockDefinition } from '../blocks/block-definition.types';
import { coordinateKey } from '../domain/coordinates';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../domain/project.types';
import { isBlockLocked } from '../editor/group-membership';
import { PlacementContext } from '../editor/placement';
import { expandLogicalObjectClosure, resolveLogicalObjectParts } from './logical-object';

export type RuleStatus = 'valid' | 'warning' | 'invalid' | 'unknown';
export type RuleReason = 'ok' | 'unknown-behavior' | 'out-of-bounds' | 'occupied' | 'missing-support' | 'locked-affected-block' | 'unstable-neighbor-update';
export interface RuleValidation { readonly status: RuleStatus; readonly reason: RuleReason; readonly affectedPositions: readonly VoxelCoordinate[]; readonly diagnostics?: readonly string[]; }
export interface RuleMutationResult { readonly validation: RuleValidation; readonly project?: ProjectDocument; }
export type BlockDefinitionLookup = (id: string) => BlockDefinition | undefined;

/** Returns the next canonical state when the active candle can stack in-place. */
export function nextCandleState(existing: PlacedBlock, activeId: string, definition: BlockDefinitionLookup): Readonly<Record<string, string>> | undefined {
  const behavior = definition(existing.id)?.behavior;
  if (existing.id !== activeId || behavior?.kind !== 'candle') return undefined;
  const current = Number(existing.state['candles'] ?? '1');
  if (!Number.isInteger(current) || current < 1 || current >= behavior.maxCandles) return undefined;
  return { ...existing.state, candles: String(current + 1) };
}

const horizontalDirections = [
  ['north', { x: 0, y: 0, z: -1 }], ['east', { x: 1, y: 0, z: 0 }],
  ['south', { x: 0, y: 0, z: 1 }], ['west', { x: -1, y: 0, z: 0 }],
] as const;
const sixOffsets: readonly VoxelCoordinate[] = [...horizontalDirections.map((entry) => entry[1]), { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];

export class BlockRuleEngine {
  constructor(private readonly definition: BlockDefinitionLookup) {}

  place(project: ProjectDocument, requestedBlock: PlacedBlock, context?: PlacementContext): RuleMutationResult {
    const prepared = this.preparePlacement(requestedBlock, context);
    if (!prepared) return invalid('missing-support', [requestedBlock.position]);
    const block = this.prepareContextualPlacement(project, prepared, context);
    const definition = this.definition(block.id);
    const behavior = definition?.behavior;
    const targets = behavior?.kind === 'double-height'
      ? [block.position, add(block.position, { x: 0, y: 1, z: 0 })]
      : behavior?.kind === 'paired-horizontal'
        ? [block.position, add(block.position, directionOffset(block.state[behavior.facingProperty] ?? 'north'))]
        : [block.position];
    if (targets.some((position) => !inBounds(position, project))) return invalid('out-of-bounds', targets);
    if (targets.some((position) => find(project.blocks, position))) return invalid('occupied', targets);
    const support = this.validateSupport(project, block, definition);
    if (support.status === 'invalid') return { validation: support };
    const placed = behavior?.kind === 'double-height'
      ? [withState(block, { ...block.state, half: 'lower' }, block.position), withState(block, { ...block.state, half: 'upper' }, targets[1])]
      : behavior?.kind === 'paired-horizontal'
        ? [withState(block, { ...block.state, [behavior.partProperty]: behavior.firstPart, occupied: 'false' }, block.position), withState(block, { ...block.state, [behavior.partProperty]: behavior.secondPart, occupied: 'false' }, targets[1])]
      : [block];
    const refreshed = this.refresh({ ...project, blocks: [...project.blocks, ...placed] }, targets);
    if (!refreshed.project) return refreshed;
    const status = support.status === 'unknown' || !definition?.behavior ? 'unknown' : 'valid';
    return { validation: { status, reason: status === 'valid' ? 'ok' : 'unknown-behavior', affectedPositions: refreshed.validation.affectedPositions }, project: touch(refreshed.project) };
  }

  delete(project: ProjectDocument, position: VoxelCoordinate): RuleMutationResult {
    return this.deleteMany(project, [position]);
  }

  deleteMany(project: ProjectDocument, positions: readonly VoxelCoordinate[]): RuleMutationResult {
    const requested = new Set(positions.map(coordinateKey));
    const seeds = project.blocks.filter((block) => requested.has(coordinateKey(block.position)));
    if (!seeds.length) return invalid('occupied', positions);
    const removing = [...expandLogicalObjectClosure(project.blocks, seeds, this.definition)];
    if (removing.some((entry) => isBlockLocked(entry, project.groups))) return invalid('locked-affected-block', removing.map((entry) => entry.position));
    const keys = new Set(removing.map((entry) => coordinateKey(entry.position)));
    const refreshed = this.refresh({ ...project, blocks: project.blocks.filter((entry) => !keys.has(coordinateKey(entry.position))) }, removing.map((entry) => entry.position));
    return refreshed.project ? { validation: refreshed.validation, project: touch(refreshed.project) } : refreshed;
  }

  refresh(project: ProjectDocument, changed: readonly VoxelCoordinate[]): RuleMutationResult {
    let blocks = [...project.blocks];
    const queue = new Map<string, VoxelCoordinate>();
    const affected = new Map<string, VoxelCoordinate>();
    for (const position of changed) for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))]) queue.set(coordinateKey(candidate), candidate);
    const guard = Math.max(64, blocks.length * 12);
    let iterations = 0;
    while (queue.size) {
      if (++iterations > guard) return invalid('unstable-neighbor-update', [...affected.values()]);
      const [key, position] = queue.entries().next().value as [string, VoxelCoordinate]; queue.delete(key);
      const block = find(blocks, position); if (!block) continue;
      const nextState = this.derivedState(block, blocks);
      if (!nextState || equalState(block.state, nextState)) continue;
      if (isBlockLocked(block, project.groups)) return invalid('locked-affected-block', [position]);
      blocks = blocks.map((entry) => coordinateKey(entry.position) === key ? { ...entry, state: nextState } : entry);
      affected.set(key, position);
      for (const offset of sixOffsets) { const neighbor = add(position, offset); queue.set(coordinateKey(neighbor), neighbor); }
    }
    const resultingProject = { ...project, blocks };
    const supportInvalid = [...queueCandidates(changed).values()].map((position) => find(blocks, position)).filter((block): block is PlacedBlock => !!block).find((block) => this.validateSupport(resultingProject, block, this.definition(block.id)).status === 'invalid');
    return supportInvalid
      ? { validation: { status: 'invalid', reason: 'missing-support', affectedPositions: [supportInvalid.position], diagnostics: ['Dependent block was preserved but no longer has verified support.'] }, project: resultingProject }
      : { validation: { status: 'valid', reason: 'ok', affectedPositions: [...affected.values()] }, project: resultingProject };
  }

  isDerivedProperty(blockId: string, property: string): boolean { return this.definition(blockId)?.stateDefinitions.some((entry) => entry.name === property && entry.derived === true) ?? false; }

  private preparePlacement(block: PlacedBlock, context: PlacementContext | undefined): PlacedBlock | undefined {
    const definition = this.definition(block.id);
    const behavior = definition?.behavior;
    if (behavior?.kind === 'torch-placement' && context?.faceNormal) {
      const normal = context.faceNormal;
      if (normal.y < 0) return undefined;
      if (normal.y === 0) {
        const wallDefinition = this.definition(behavior.wallBlockId);
        const facing = directionFromNormal(normal);
        if (!wallDefinition || !facing) return undefined;
        return { ...block, id: wallDefinition.id, namespace: wallDefinition.namespace, state: { ...wallDefinition.defaultState, facing } };
      }
    }
    if (behavior?.kind === 'wall-mounted' && context?.faceNormal) {
      const facing = directionFromNormal(context.faceNormal);
      if (facing) return { ...block, state: { ...block.state, [behavior.facingProperty]: facing } };
    }
    if (behavior?.kind === 'standing-sign') {
      if (context?.faceNormal && context.faceNormal.y !== 1) return undefined;
      return { ...block, state: { ...block.state, [behavior.rotationProperty]: minecraftSignRotation(context?.yaw) } };
    }
    if (behavior?.kind === 'hanging-sign') {
      if (!context?.faceNormal || context.faceNormal.y !== -1) return undefined;
      return { ...block, state: { ...block.state, [behavior.rotationProperty]: minecraftSignRotation(context.yaw) } };
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

  private prepareContextualPlacement(project: ProjectDocument, block: PlacedBlock, context: PlacementContext | undefined): PlacedBlock {
    const behavior = this.definition(block.id)?.behavior;
    if (behavior?.kind === 'hanging-sign') {
      const above = find(project.blocks, add(block.position, { x: 0, y: 1, z: 0 }));
      const attached = !!above && this.definition(above.id)?.behavior?.kind === 'solid';
      return { ...block, state: { ...block.state, [behavior.attachedProperty]: attached ? 'true' : 'false' } };
    }
    if (behavior?.kind !== 'lantern-placement') return block;
    const above = find(project.blocks, add(block.position, { x: 0, y: 1, z: 0 }));
    const hanging = context?.faceNormal?.y === -1 || (!context?.faceNormal && isVerticalChain(above, behavior.chainId, this.definition));
    return { ...block, state: { ...block.state, [behavior.hangingProperty]: hanging ? 'true' : 'false' } };
  }

  private validateSupport(project: ProjectDocument, block: PlacedBlock, definition: BlockDefinition | undefined): RuleValidation {
    const behavior = definition?.behavior;
    if (!behavior) return { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position] };
    let supportPosition: VoxelCoordinate | undefined;
    if (behavior.kind === 'wall-mounted' || behavior.kind === 'wall-sign') supportPosition = add(block.position, directionOffset(opposite(block.state[behavior.facingProperty] ?? 'north')));
    if (behavior.kind === 'standing-sign') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
    if (behavior.kind === 'hanging-sign') supportPosition = add(block.position, { x: 0, y: 1, z: 0 });
    if (behavior.kind === 'wall-hanging-sign') {
      const facing = block.state[behavior.facingProperty] ?? 'north';
      const supports = [clockwise(facing), counterClockwise(facing)].map((direction) => add(block.position, directionOffset(direction)));
      const valid = supports.find((position) => {
        const support = find(project.blocks, position);
        return this.definition(support?.id ?? '')?.behavior?.kind === 'solid' || compatibleWallHanging(support, facing, this.definition);
      });
      return valid
        ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, valid] }
        : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, ...supports] };
    }
    if (behavior.kind === 'floor-supported' || behavior.kind === 'torch-placement') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
    if (behavior.kind === 'lantern-placement') {
      const hanging = block.state[behavior.hangingProperty] === 'true';
      supportPosition = add(block.position, hanging ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 });
      const support = find(project.blocks, supportPosition);
      if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
      const supportBehavior = this.definition(support.id)?.behavior;
      if (hanging) return isVerticalChain(support, behavior.chainId, this.definition)
        ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
        : supportBehavior ? { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] } : { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
    }
    if (behavior.kind === 'hanging-sign') {
      const support = find(project.blocks, supportPosition!);
      if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition!] };
      const supportBehavior = this.definition(support.id)?.behavior;
      return supportBehavior?.kind === 'solid' || supportBehavior?.kind === 'vertical-chain' && support.state[supportBehavior.axisProperty] === supportBehavior.verticalAxis
        ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition!] }
        : !supportBehavior ? { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition!] }
          : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition!] };
    }
    if (behavior.kind === 'double-height' && behavior.requiresFloor && block.state[behavior.halfProperty] !== 'upper') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
    if (!supportPosition) return { status: 'valid', reason: 'ok', affectedPositions: [block.position] };
    if (supportPosition.y === -1 && block.position.y === 0 && requiresSupportBelow(behavior)) return { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] };
    const support = find(project.blocks, supportPosition);
    if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
    const supportBehavior = this.definition(support.id)?.behavior;
    if (!supportBehavior) return { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
    return supportBehavior.kind === 'solid'
      ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
      : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
  }

  private derivedState(block: PlacedBlock, blocks: readonly PlacedBlock[]): Readonly<Record<string, string>> | undefined {
    const behavior = this.definition(block.id)?.behavior;
    if (behavior?.kind === 'horizontal-connect') {
      const state = { ...block.state };
      for (const [name, offset] of horizontalDirections) {
        const neighbor = find(blocks, add(block.position, offset)); const neighborBehavior = neighbor && this.definition(neighbor.id)?.behavior;
        const connects = behavior.connectsToSolid && neighborBehavior?.kind === 'solid'
          || neighborBehavior?.kind === 'horizontal-connect' && behavior.compatibleGroups.includes(neighborBehavior.connectionGroup);
        state[name] = behavior.family === 'wall' ? connects ? 'low' : 'none' : connects ? 'true' : 'false';
      }
      if (behavior.family === 'wall') {
        const connectedDirections = horizontalDirections.filter(([name]) => state[name] !== 'none');
        const upper = find(blocks, add(block.position, { x: 0, y: 1, z: 0 }));
        const upperIsSolid = upper && this.definition(upper.id)?.behavior?.kind === 'solid';
        if (upperIsSolid) for (const [name] of connectedDirections) state[name] = 'tall';
        state['up'] = connectedDirections.length === 4 ? 'false' : 'true';
      }
      return state;
    }
    if (behavior?.kind === 'stairs') return { ...block.state, shape: stairShape(block, blocks, this.definition) };
    if (behavior?.kind === 'hanging-sign') {
      const above = find(blocks, add(block.position, { x: 0, y: 1, z: 0 }));
      return { ...block.state, [behavior.attachedProperty]: this.definition(above?.id ?? '')?.behavior?.kind === 'solid' ? 'true' : 'false' };
    }
    return undefined;
  }
}

function isVerticalChain(block: PlacedBlock | undefined, chainId: string, definition: BlockDefinitionLookup): boolean {
  return !!block && block.id === chainId && definition(block.id)?.behavior?.kind === 'vertical-chain' && block.state['axis'] === 'y';
}

function stairShape(block: PlacedBlock, blocks: readonly PlacedBlock[], definition: BlockDefinitionLookup): string {
  const facing = block.state['facing'] ?? 'north'; const half = block.state['half'];
  const front = find(blocks, add(block.position, directionOffset(facing)));
  if (isCompatibleStair(front, half, definition) && axis(front!.state['facing']) !== axis(facing) && differentOrientation(block, blocks, opposite(front!.state['facing'] ?? 'north'), definition)) return front!.state['facing'] === rotateCounterClockwise(facing) ? 'outer_left' : 'outer_right';
  const back = find(blocks, add(block.position, directionOffset(opposite(facing))));
  if (isCompatibleStair(back, half, definition) && axis(back!.state['facing']) !== axis(facing) && differentOrientation(block, blocks, back!.state['facing'] ?? 'north', definition)) return back!.state['facing'] === rotateCounterClockwise(facing) ? 'inner_left' : 'inner_right';
  return 'straight';
}
function differentOrientation(block: PlacedBlock, blocks: readonly PlacedBlock[], direction: string, definition: BlockDefinitionLookup): boolean { const neighbor = find(blocks, add(block.position, directionOffset(direction))); return !isCompatibleStair(neighbor, block.state['half'], definition) || neighbor?.state['facing'] !== block.state['facing']; }
function isCompatibleStair(block: PlacedBlock | undefined, half: string | undefined, definition: BlockDefinitionLookup): boolean { return !!block && definition(block.id)?.behavior?.kind === 'stairs' && block.state['half'] === half; }
function axis(direction: string | undefined): 'x' | 'z' { return direction === 'east' || direction === 'west' ? 'x' : 'z'; }
function rotateCounterClockwise(direction: string): string { return ({ north: 'west', west: 'south', south: 'east', east: 'north' } as Record<string, string>)[direction] ?? direction; }
function opposite(direction: string): string { return ({ north: 'south', south: 'north', east: 'west', west: 'east' } as Record<string, string>)[direction] ?? direction; }
function clockwise(direction: string): string { return ({ north: 'east', east: 'south', south: 'west', west: 'north' } as Record<string, string>)[direction] ?? direction; }
function counterClockwise(direction: string): string { return ({ north: 'west', west: 'south', south: 'east', east: 'north' } as Record<string, string>)[direction] ?? direction; }
function compatibleWallHanging(block: PlacedBlock | undefined, facing: string, definition: BlockDefinitionLookup): boolean {
  return !!block && definition(block.id)?.behavior?.kind === 'wall-hanging-sign' && axis(block.state['facing']) === axis(facing);
}
/** Java RotationPropertyHelper equivalent for SignBlock placement: player yaw + 180. */
export function minecraftSignRotation(yaw: number | undefined): string {
  const degrees = ((yaw ?? 0) + 180) % 360;
  return String(Math.floor((degrees * 16 / 360) + .5) & 15);
}
function requiresSupportBelow(behavior: NonNullable<BlockDefinition['behavior']>): boolean {
  return behavior.kind === 'floor-supported' || behavior.kind === 'torch-placement' || behavior.kind === 'standing-sign' || behavior.kind === 'double-height' && behavior.requiresFloor;
}
function directionOffset(direction: string): VoxelCoordinate { return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 }; }
function directionFromNormal(normal: { readonly x: number; readonly z: number }): 'north' | 'east' | 'south' | 'west' | undefined {
  if (normal.x > 0) return 'east';
  if (normal.x < 0) return 'west';
  if (normal.z > 0) return 'south';
  if (normal.z < 0) return 'north';
  return undefined;
}
function stairHalfFromContext(context: PlacementContext | undefined, fallback: string): string {
  if (!context?.faceNormal) return fallback;
  if (context.faceNormal.y < 0) return 'top';
  if (context.faceNormal.y > 0) return 'bottom';
  if (!context.hitPoint) return fallback;
  const localY = context.hitPoint.y - Math.floor(context.hitPoint.y);
  return localY > 0.5 ? 'top' : 'bottom';
}
function add(a: VoxelCoordinate, b: VoxelCoordinate): VoxelCoordinate { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function find(blocks: readonly PlacedBlock[], position: VoxelCoordinate): PlacedBlock | undefined { const key = coordinateKey(position); return blocks.find((block) => coordinateKey(block.position) === key); }
function withState(block: PlacedBlock, state: Readonly<Record<string, string>>, position: VoxelCoordinate): PlacedBlock { return { ...block, position: { ...position }, state }; }
function equalState(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean { const aKeys = Object.keys(a); return aKeys.length === Object.keys(b).length && aKeys.every((key) => a[key] === b[key]); }
function inBounds(position: VoxelCoordinate, project: ProjectDocument): boolean { return Number.isInteger(position.x) && Number.isInteger(position.y) && Number.isInteger(position.z) && position.x >= 0 && position.y >= 0 && position.z >= 0 && position.x < project.size.x && position.y < project.size.y && position.z < project.size.z; }
function touch(project: ProjectDocument): ProjectDocument { return { ...project, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } }; }
function invalid(reason: RuleReason, positions: readonly VoxelCoordinate[]): RuleMutationResult { return { validation: { status: 'invalid', reason, affectedPositions: positions } }; }
function queueCandidates(changed: readonly VoxelCoordinate[]): Map<string, VoxelCoordinate> { const positions = new Map<string, VoxelCoordinate>(); for (const position of changed) for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))]) positions.set(coordinateKey(candidate), candidate); return positions; }
