import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { isBlockLocked } from '../../editor/groups/group-membership';
import { PlacementContext } from '../../editor/placement/placement';
import { expandLogicalObjectClosure, resolveLogicalObjectParts } from '../logical-objects/logical-object';
import { expandLogicalPlacement, logicalPlacementForBehavior } from '../logical-objects/logical-placement';
import type { LogicalPlacementMetadata } from '../logical-objects/logical-placement';
import { blockCapability, hasBlockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';

export type RuleStatus = 'valid' | 'warning' | 'invalid' | 'unknown';
export type RuleReason = 'ok' | 'unknown-behavior' | 'out-of-bounds' | 'occupied' | 'missing-support' | 'locked-affected-block' | 'unstable-neighbor-update';
export interface RuleValidation { readonly status: RuleStatus; readonly reason: RuleReason; readonly affectedPositions: readonly VoxelCoordinate[]; readonly diagnostics?: readonly string[]; }
export interface RuleMutationResult { readonly validation: RuleValidation; readonly project?: ProjectDocument; readonly plannedBlocks?: readonly PlacedBlock[]; readonly changedBlocks?: readonly PlacedBlock[]; }
export type BlockDefinitionLookup = (id: string) => BlockDefinition | undefined;
export type BlockSource = readonly PlacedBlock[] | ReadonlyBlockLookup;

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

  /**
   * Evaluates only the verified support contract for an already materialized
   * block. This is intentionally read-only so import validation cannot trigger
   * placement, derived-state refresh, or project mutation.
   */
  validateSupportOnly(project: ProjectDocument, block: PlacedBlock, definition = this.definition(block.id), source: BlockSource = project.blocks): RuleValidation {
    return this.validateSupport(project, block, definition, source);
  }

  /**
   * Validates mutation candidates whose behavior requires a supported face.
   *
   * Refresh intentionally preserves some unsupported blocks so the editor can
   * report them without silently destroying data. Mutations that explicitly
   * change an attached block's state use this narrower invariant to reject a
   * newly unsupported orientation atomically.
   */
  validateMutation(project: ProjectDocument, positions: readonly VoxelCoordinate[], source: BlockSource = project.blocks): RuleValidation | undefined {
    for (const position of positions) {
      const block = find(source, position);
      if (!block || this.definition(block.id)?.behavior?.kind !== 'attached-six-face-placement') continue;
      const validation = this.validateSupport(project, block, this.definition(block.id), source);
      if (validation.status !== 'valid') return validation;
    }
    return undefined;
  }

  place(project: ProjectDocument, requestedBlock: PlacedBlock, context?: PlacementContext, lookup?: ReadonlyBlockLookup): RuleMutationResult {
    const prepared = this.preparePlacement(requestedBlock, context);
    if (!prepared) return invalid('missing-support', [requestedBlock.position]);
    const source = lookup ?? project.blocks;
    const block = this.prepareContextualPlacement(project, prepared, context, source);
    const definition = this.definition(block.id);
    const metadata = logicalMetadata(definition);
    const targets = expandedTargets(block, metadata);
    if (targets.some((position) => !inBounds(position, project))) return invalid('out-of-bounds', targets);
    if (targets.some((position) => find(source, position))) return invalid('occupied', targets);
    const support = this.validateSupport(project, block, definition, source);
    if (support.status === 'invalid') return { validation: support };
    const placed = expandPlacedBlocks(block, metadata);
    const placementLookup = new PreviewBlockLookup(lookup ?? new ArrayBlockLookup(project.blocks));
    for (const entry of placed) placementLookup.set(entry);
    const refreshed = this.refresh({ ...project, blocks: [...project.blocks, ...placed] }, targets, placementLookup);
    if (!refreshed.project) return refreshed;
    const knownPlacement = !!definition?.behavior || hasBlockCapability(definition, 'direct-placement');
    const directPlacementOnly = !definition?.behavior && hasBlockCapability(definition, 'direct-placement');
    const status = support.status === 'unknown' ? (directPlacementOnly ? 'valid' : 'unknown') : support.status === 'valid' && !knownPlacement ? 'unknown' : support.status;
    return { validation: { status, reason: status === 'valid' ? 'ok' : 'unknown-behavior', affectedPositions: refreshed.validation.affectedPositions }, project: touch(refreshed.project), plannedBlocks: placed, changedBlocks: refreshed.changedBlocks };
  }

  /** Evaluates the same placement preparation/rules without cloning the project. */
  preview(project: ProjectDocument, requestedBlock: PlacedBlock, context: PlacementContext | undefined, lookup: ReadonlyBlockLookup): RuleMutationResult {
    const prepared = this.preparePlacement(requestedBlock, context);
    if (!prepared) return invalid('missing-support', [requestedBlock.position]);
    const block = this.prepareContextualPlacement(project, prepared, context, lookup);
    const definition = this.definition(block.id);
    const metadata = logicalMetadata(definition);
    const targets = expandedTargets(block, metadata);
    if (targets.some((position) => !inBounds(position, project))) return invalid('out-of-bounds', targets);
    if (targets.some((position) => find(lookup, position))) return invalid('occupied', targets);
    const support = this.validateSupport(project, block, definition, lookup);
    if (support.status === 'invalid') return { validation: support };
    const placed = expandPlacedBlocks(block, metadata);
    const overlay = new PreviewBlockLookup(lookup);
    for (const entry of placed) overlay.set(entry);
    const refreshed = this.refreshPreview(project, overlay, targets);
    if (refreshed.status === 'invalid') return { validation: refreshed };
    const knownPlacement = !!definition?.behavior || hasBlockCapability(definition, 'direct-placement');
    const directPlacementOnly = !definition?.behavior && hasBlockCapability(definition, 'direct-placement');
    const status = support.status === 'unknown' ? (directPlacementOnly ? 'valid' : 'unknown') : support.status === 'valid' && !knownPlacement ? 'unknown' : support.status;
    return { validation: { status, reason: status === 'valid' ? 'ok' : 'unknown-behavior', affectedPositions: refreshed.affectedPositions }, plannedBlocks: placed };
  }

  delete(project: ProjectDocument, position: VoxelCoordinate): RuleMutationResult {
    return this.deleteMany(project, [position]);
  }

  deleteMany(project: ProjectDocument, positions: readonly VoxelCoordinate[], source: BlockSource = project.blocks): RuleMutationResult {
    const requested = new Set(positions.map(coordinateKey));
    const seeds = positions.map((position) => find(source, position)).filter((block): block is PlacedBlock => !!block && requested.has(coordinateKey(block.position)));
    if (!seeds.length) return invalid('occupied', positions);
    // Select All already contains every block, so resolving pair closure for each
    // seed would only add work and allocations without changing the result.
    const removing = seeds.length === project.blocks.length ? [...project.blocks] : [...expandLogicalObjectClosure(project.blocks, seeds, this.definition)];
    if (removing.some((entry) => isBlockLocked(entry, project.groups))) return invalid('locked-affected-block', removing.map((entry) => entry.position));
    const keys = new Set(removing.map((entry) => coordinateKey(entry.position)));
    // Removing the complete structure cannot leave a dependent neighbor to
    // refresh. Keep this as one atomic mutation instead of queueing every
    // deleted voxel (which would trip the stability guard for large projects).
    if (removing.length === project.blocks.length) {
      return {
        validation: { status: 'valid', reason: 'ok', affectedPositions: removing.map((entry) => entry.position) },
        project: touch({ ...project, blocks: [] }),
      };
    }
    const remaining = project.blocks.filter((entry) => !keys.has(coordinateKey(entry.position)));
    const unsupported = this.removeUnsupportedAttachedBlocks(project, remaining, keys);
    if (unsupported.locked) return invalid('locked-affected-block', [unsupported.locked.position]);
    const refreshed = this.refresh({ ...project, blocks: unsupported.blocks }, [...removing.map((entry) => entry.position), ...unsupported.removed.map((entry) => entry.position)], new ArrayBlockLookup(unsupported.blocks));
    return refreshed.project ? { validation: refreshed.validation, project: touch(refreshed.project), changedBlocks: refreshed.changedBlocks } : refreshed;
  }

  refresh(project: ProjectDocument, changed: readonly VoxelCoordinate[], source: BlockSource = project.blocks): RuleMutationResult {
    const blocks = project.blocks;
    const updates = new Map<string, PlacedBlock>();
    const queue = new Map<string, VoxelCoordinate>();
    const affected = new Map<string, VoxelCoordinate>();
    for (const position of changed) for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))]) queue.set(coordinateKey(candidate), candidate);
    const guard = Math.max(64, blocks.length * 12);
    let iterations = 0;
    while (queue.size) {
      if (++iterations > guard) return invalid('unstable-neighbor-update', [...affected.values()]);
      const [key, position] = queue.entries().next().value as [string, VoxelCoordinate]; queue.delete(key);
      const block = updates.get(coordinateKey(position)) ?? find(source, position); if (!block) continue;
      const nextState = this.derivedState(block, { get: (candidate) => updates.get(coordinateKey(candidate)) ?? find(source, candidate), has: (candidate) => !!(updates.get(coordinateKey(candidate)) ?? find(source, candidate)) });
      if (!nextState || equalState(block.state, nextState)) continue;
      if (isBlockLocked(block, project.groups)) return invalid('locked-affected-block', [position]);
      const updated = { ...block, state: nextState };
      updates.set(key, updated);
      affected.set(key, position);
      for (const offset of sixOffsets) { const neighbor = add(position, offset); queue.set(coordinateKey(neighbor), neighbor); }
    }
    const resultingBlocks = blocks.map((entry) => updates.get(coordinateKey(entry.position)) ?? entry);
    const resultingProject = { ...project, blocks: resultingBlocks };
    const afterLookup: ReadonlyBlockLookup = { get: (position) => updates.get(coordinateKey(position)) ?? find(source, position), has: (position) => !!(updates.get(coordinateKey(position)) ?? find(source, position)) };
    const supportInvalid = [...queueCandidates(changed).values()].map((position) => find(afterLookup, position)).filter((block): block is PlacedBlock => !!block).find((block) => this.validateSupport(resultingProject, block, this.definition(block.id), afterLookup).status === 'invalid');
    return supportInvalid
      ? { validation: { status: 'invalid', reason: 'missing-support', affectedPositions: [supportInvalid.position], diagnostics: ['Dependent block was preserved but no longer has verified support.'] }, project: resultingProject, changedBlocks: [...updates.values()] }
      : { validation: { status: 'valid', reason: 'ok', affectedPositions: [...affected.values()] }, project: resultingProject, changedBlocks: [...updates.values()] };
  }

  isDerivedProperty(blockId: string, property: string): boolean { return this.definition(blockId)?.stateDefinitions.some((entry) => entry.name === property && entry.derived === true) ?? false; }

  private preparePlacement(block: PlacedBlock, context: PlacementContext | undefined): PlacedBlock | undefined {
    const definition = this.definition(block.id);
    const behavior = definition?.behavior;
    const axisCapability = blockCapability(definition, 'axis-oriented');
    if (axisCapability && context?.faceNormal) {
      const normal = context.faceNormal;
      const axis = Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z) ? 'x' : Math.abs(normal.z) >= Math.abs(normal.y) ? 'z' : 'y';
      return { ...block, state: { ...block.state, [axisCapability.axisProperty]: axis } };
    }
    if (behavior?.kind === 'double-height') {
      // The resource-selected branch is visual evidence only. A new logical
      // two-block placement always starts from its lower half so support is
      // validated against the floor before the upper half is created.
      return { ...block, state: { ...block.state, [behavior.halfProperty]: 'lower' } };
    }
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
    if (behavior?.kind === 'six-face-placement') {
      const facing = context?.faceNormal && directionFromSixFaceNormal(context.faceNormal);
      return facing ? { ...block, state: { ...block.state, [behavior.facingProperty]: facing } } : undefined;
    }
    if (behavior?.kind === 'attached-six-face-placement') {
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
    if (behavior?.kind === 'decorated-pot-placement') {
      return { ...block, state: { ...block.state, [behavior.facingProperty]: minecraftPlayerFacing(context?.yaw ?? 0), cracked: 'false' } };
    }
    if (behavior?.kind === 'conduit-placement') {
      return { ...block, state: { ...block.state, [behavior.waterloggedProperty]: 'false' } };
    }
    if (behavior?.kind === 'standing-sign') {
      if (context?.faceNormal && context.faceNormal.y !== 1) return undefined;
      return { ...block, state: { ...block.state, [behavior.rotationProperty]: minecraftSignRotation(context?.yaw) } };
    }
    if (behavior?.kind === 'hanging-sign') {
      // A valid support/chain target may come from grid/attachment snapping;
      // requiring a downward face would make that editor UX unnecessarily strict.
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

  private prepareContextualPlacement(project: ProjectDocument, block: PlacedBlock, context: PlacementContext | undefined, source: BlockSource = project.blocks): PlacedBlock {
    const behavior = this.definition(block.id)?.behavior;
    if (behavior?.kind === 'hanging-sign') {
      const above = find(source, add(block.position, { x: 0, y: 1, z: 0 }));
      const attached = !!above && this.isSupportBlock(above.id);
      return { ...block, state: { ...block.state, [behavior.attachedProperty]: attached ? 'true' : 'false' } };
    }
    if (behavior?.kind !== 'lantern-placement') return block;
    const above = find(source, add(block.position, { x: 0, y: 1, z: 0 }));
    const hanging = context?.faceNormal?.y === -1 || (!context?.faceNormal && isVerticalChain(above, behavior.chainId, this.definition));
    return { ...block, state: { ...block.state, [behavior.hangingProperty]: hanging ? 'true' : 'false' } };
  }

  private validateSupport(project: ProjectDocument, block: PlacedBlock, definition: BlockDefinition | undefined, source: BlockSource = project.blocks): RuleValidation {
    const contractSupport = this.validateSupportContracts(project, block, definition, source);
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
        return this.isSupportBlock(support?.id ?? '') || compatibleWallHanging(support, facing, this.definition);
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
      const supportBehavior = this.definition(support.id)?.behavior;
      return this.isSupportBlock(support.id)
        ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
        : supportBehavior ? { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] } : { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
    }
    if (behavior.kind === 'floor-supported' || behavior.kind === 'torch-placement') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
    if (behavior.kind === 'lantern-placement') {
      const hanging = block.state[behavior.hangingProperty] === 'true';
      supportPosition = add(block.position, hanging ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 });
      const support = find(source, supportPosition);
      if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
      const supportBehavior = this.definition(support.id)?.behavior;
      if (hanging) return isVerticalChain(support, behavior.chainId, this.definition)
        ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
        : supportBehavior ? { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] } : { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
    }
    if (behavior.kind === 'hanging-sign') {
      const support = find(source, supportPosition!);
      if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition!] };
      const supportBehavior = this.definition(support.id)?.behavior;
      return this.isSupportBlock(support.id) || compatibleHangingSign(support, this.definition) || supportBehavior?.kind === 'vertical-chain' && support.state[supportBehavior.axisProperty] === supportBehavior.verticalAxis
        ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition!] }
        : !supportBehavior ? { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition!] }
          : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition!] };
    }
    if (behavior.kind === 'double-height' && behavior.requiresFloor && block.state[behavior.halfProperty] !== 'upper') supportPosition = add(block.position, { x: 0, y: -1, z: 0 });
    if (!supportPosition) return { status: 'valid', reason: 'ok', affectedPositions: [block.position] };
    if (supportPosition.y === -1 && block.position.y === 0 && requiresSupportBelow(behavior)) return { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] };
    const support = find(source, supportPosition);
    if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
    const supportBehavior = this.definition(support.id)?.behavior;
    if (!supportBehavior && !this.isSupportBlock(support.id)) return { status: 'unknown', reason: 'unknown-behavior', affectedPositions: [block.position, supportPosition] };
    return this.isSupportBlock(support.id)
      ? { status: 'valid', reason: 'ok', affectedPositions: [block.position, supportPosition] }
      : { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position, supportPosition] };
  }

  private validateSupportContracts(project: ProjectDocument, block: PlacedBlock, definition: BlockDefinition | undefined, source: BlockSource = project.blocks): RuleValidation | undefined {
    const requirements = definition?.supportRequirements;
    if (!requirements?.length) return undefined;
    const affected = [block.position];
    let unknown = false;
    for (const requirement of requirements) {
      const offset = requirement.direction === 'below' ? { x: 0, y: -1, z: 0 } : requirement.direction === 'above' ? { x: 0, y: 1, z: 0 } : directionOffset(requirement.direction);
      const position = add(block.position, offset); affected.push(position);
      const support = find(source, position);
      if (!support) return { status: 'invalid', reason: 'missing-support', affectedPositions: affected };
      const supportDefinition = this.definition(support.id);
      if (!supportDefinition) { unknown = true; continue; }
      if (supportDefinition.supportContracts?.includes(requirement.contractId)) continue;
      if (!supportDefinition.supportContracts?.length) { unknown = true; continue; }
      return { status: 'invalid', reason: 'missing-support', affectedPositions: affected };
    }
    return unknown ? { status: 'unknown', reason: 'unknown-behavior', affectedPositions: affected } : { status: 'valid', reason: 'ok', affectedPositions: affected };
  }

  private refreshPreview(project: ProjectDocument, source: PreviewBlockLookup, changed: readonly VoxelCoordinate[]): RuleValidation {
    const queue = new Map<string, VoxelCoordinate>();
    const affected = new Map<string, VoxelCoordinate>();
    for (const position of changed) for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))]) queue.set(coordinateKey(candidate), candidate);
    const guard = Math.max(64, changed.length * 24);
    let iterations = 0;
    while (queue.size) {
      if (++iterations > guard) return { status: 'invalid', reason: 'unstable-neighbor-update', affectedPositions: [...affected.values()] };
      const [key, position] = queue.entries().next().value as [string, VoxelCoordinate]; queue.delete(key);
      const block = source.get(position); if (!block) continue;
      const nextState = this.derivedState(block, source);
      if (!nextState || equalState(block.state, nextState)) continue;
      if (isBlockLocked(block, project.groups)) return { status: 'invalid', reason: 'locked-affected-block', affectedPositions: [position] };
      source.set({ ...block, state: nextState });
      affected.set(key, position);
      for (const offset of sixOffsets) { const neighbor = add(position, offset); queue.set(coordinateKey(neighbor), neighbor); }
    }
    for (const position of queueCandidates(changed).values()) {
      const block = source.get(position);
      if (block && this.validateSupport(project, block, this.definition(block.id), source).status === 'invalid') return { status: 'invalid', reason: 'missing-support', affectedPositions: [block.position] };
    }
    return { status: 'valid', reason: 'ok', affectedPositions: [...affected.values()] };
  }

  private derivedState(block: PlacedBlock, blocks: BlockSource): Readonly<Record<string, string>> | undefined {
    const behavior = this.definition(block.id)?.behavior;
    if (behavior?.kind === 'horizontal-connect') {
      const state = { ...block.state };
      for (const [name, offset] of horizontalDirections) {
        const neighbor = find(blocks, add(block.position, offset)); const neighborBehavior = neighbor && this.definition(neighbor.id)?.behavior;
        const connects = behavior.connectsToSolid && !!neighbor && this.isSupportBlock(neighbor.id)
          || neighborBehavior?.kind === 'horizontal-connect' && behavior.compatibleGroups.includes(neighborBehavior.connectionGroup);
        state[name] = behavior.family === 'wall' ? connects ? 'low' : 'none' : connects ? 'true' : 'false';
      }
      if (behavior.family === 'wall') {
        const connectedDirections = horizontalDirections.filter(([name]) => state[name] !== 'none');
        const upper = find(blocks, add(block.position, { x: 0, y: 1, z: 0 }));
        const upperIsSolid = upper && this.isSupportBlock(upper.id);
        if (upperIsSolid) for (const [name] of connectedDirections) state[name] = 'tall';
        state['up'] = connectedDirections.length === 4 ? 'false' : 'true';
      }
      return state;
    }
    if (behavior?.kind === 'stairs') return { ...block.state, shape: stairShape(block, blocks, this.definition) };
    if (behavior?.kind === 'hanging-sign') {
      const above = find(blocks, add(block.position, { x: 0, y: 1, z: 0 }));
      return { ...block.state, [behavior.attachedProperty]: above && this.isSupportBlock(above.id) ? 'true' : 'false' };
    }
    return undefined;
  }

  private isSupportBlock(id: string): boolean {
    const definition = this.definition(id);
    if (!definition) return false;
    const behavior = definition.behavior;
    if (behavior?.kind === 'solid') return true;
    if (behavior && ['fluid', 'horizontal-connect', 'wall-mounted', 'wall-sign', 'wall-hanging-sign', 'floor-supported', 'torch-placement', 'lantern-placement', 'vertical-chain', 'attached-six-face-placement'].includes(behavior.kind)) return false;
    return definition.support === 'full' && definition.visualSupport === 'real' && definition.visualClassification === 'standard-json';
  }

  private removeUnsupportedAttachedBlocks(project: ProjectDocument, blocks: readonly PlacedBlock[], removedKeys: ReadonlySet<string>): { readonly blocks: readonly PlacedBlock[]; readonly removed: readonly PlacedBlock[]; readonly locked?: PlacedBlock } {
    const current = [...blocks];
    const removed: PlacedBlock[] = [];
    const affectedKeys = new Set(removedKeys);
    let changed = true;
    while (changed) {
      changed = false;
      const lookup = new ArrayBlockLookup(current);
      for (const block of [...current]) {
        const behavior = this.definition(block.id)?.behavior;
        if (behavior?.kind !== 'attached-six-face-placement') continue;
        const validation = this.validateSupport(project, block, this.definition(block.id), lookup);
        if (validation.status !== 'invalid' || !validation.affectedPositions.some((position) => affectedKeys.has(coordinateKey(position)))) continue;
        if (isBlockLocked(block, project.groups)) return { blocks: current, removed, locked: block };
        const index = current.findIndex((entry) => coordinateKey(entry.position) === coordinateKey(block.position));
        if (index < 0) continue;
        current.splice(index, 1);
        removed.push(block);
        affectedKeys.add(coordinateKey(block.position));
        changed = true;
      }
    }
    return { blocks: current, removed };
  }
}

function isVerticalChain(block: PlacedBlock | undefined, chainId: string, definition: BlockDefinitionLookup): boolean {
  return !!block && block.id === chainId && definition(block.id)?.behavior?.kind === 'vertical-chain' && block.state['axis'] === 'y';
}

function stairShape(block: PlacedBlock, blocks: BlockSource, definition: BlockDefinitionLookup): string {
  const facing = block.state['facing'] ?? 'north'; const half = block.state['half'];
  const front = find(blocks, add(block.position, directionOffset(facing)));
  if (isCompatibleStair(front, half, definition) && axis(front!.state['facing']) !== axis(facing) && differentOrientation(block, blocks, opposite(front!.state['facing'] ?? 'north'), definition)) return front!.state['facing'] === rotateCounterClockwise(facing) ? 'outer_left' : 'outer_right';
  const back = find(blocks, add(block.position, directionOffset(opposite(facing))));
  if (isCompatibleStair(back, half, definition) && axis(back!.state['facing']) !== axis(facing) && differentOrientation(block, blocks, back!.state['facing'] ?? 'north', definition)) return back!.state['facing'] === rotateCounterClockwise(facing) ? 'inner_left' : 'inner_right';
  return 'straight';
}
function differentOrientation(block: PlacedBlock, blocks: BlockSource, direction: string, definition: BlockDefinitionLookup): boolean { const neighbor = find(blocks, add(block.position, directionOffset(direction))); return !isCompatibleStair(neighbor, block.state['half'], definition) || neighbor?.state['facing'] !== block.state['facing']; }
function isCompatibleStair(block: PlacedBlock | undefined, half: string | undefined, definition: BlockDefinitionLookup): boolean { return !!block && definition(block.id)?.behavior?.kind === 'stairs' && block.state['half'] === half; }
function axis(direction: string | undefined): 'x' | 'z' { return direction === 'east' || direction === 'west' ? 'x' : 'z'; }
function rotateCounterClockwise(direction: string): string { return ({ north: 'west', west: 'south', south: 'east', east: 'north' } as Record<string, string>)[direction] ?? direction; }
function opposite(direction: string): string { return ({ north: 'south', south: 'north', east: 'west', west: 'east' } as Record<string, string>)[direction] ?? direction; }
function clockwise(direction: string): string { return ({ north: 'east', east: 'south', south: 'west', west: 'north' } as Record<string, string>)[direction] ?? direction; }
function counterClockwise(direction: string): string { return ({ north: 'west', west: 'south', south: 'east', east: 'north' } as Record<string, string>)[direction] ?? direction; }
function compatibleWallHanging(block: PlacedBlock | undefined, facing: string, definition: BlockDefinitionLookup): boolean {
  return !!block && definition(block.id)?.behavior?.kind === 'wall-hanging-sign' && axis(block.state['facing']) === axis(facing);
}
/** A ceiling hanging sign may be chained from another compatible ceiling sign. */
function compatibleHangingSign(block: PlacedBlock | undefined, definition: BlockDefinitionLookup): boolean {
  return !!block && definition(block.id)?.behavior?.kind === 'hanging-sign';
}
/** Java RotationPropertyHelper equivalent for SignBlock placement: player yaw + 180. */
export function minecraftSignRotation(yaw: number | undefined): string {
  const degrees = ((yaw ?? 0) + 180) % 360;
  return String(Math.floor((degrees * 16 / 360) + .5) & 15);
}
/** Java SkullBlock uses the player's yaw directly; SignBlock has a separate +180° rule. */
export function minecraftSkullRotation(yaw: number | undefined): string {
  return String(Math.round((yaw ?? 0) * 16 / 360) & 15);
}
/** Minecraft Direction.fromRotation(yaw), used by BedBlock placement. */
export function minecraftPlayerFacing(yaw = 0): 'south' | 'west' | 'north' | 'east' {
  const index = Math.floor(yaw / 90 + 0.5) & 3;
  return (['south', 'west', 'north', 'east'] as const)[index] ?? 'south';
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
function directionFromSixFaceNormal(normal: { readonly x: number; readonly y: number; readonly z: number }): 'north' | 'east' | 'south' | 'west' | 'up' | 'down' | undefined {
  if (normal.x > 0) return 'east';
  if (normal.x < 0) return 'west';
  if (normal.y > 0) return 'up';
  if (normal.y < 0) return 'down';
  if (normal.z > 0) return 'south';
  if (normal.z < 0) return 'north';
  return undefined;
}
function sixFaceDirectionOffset(direction: string): VoxelCoordinate { return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 }; }
function oppositeSixFace(direction: string): 'north' | 'east' | 'south' | 'west' | 'up' | 'down' { return ({ north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' } as const)[direction as 'north' | 'east' | 'south' | 'west' | 'up' | 'down'] ?? 'down'; }
function stairHalfFromContext(context: PlacementContext | undefined, fallback: string): string {
  if (!context?.faceNormal) return fallback;
  if (context.faceNormal.y < 0) return 'top';
  if (context.faceNormal.y > 0) return 'bottom';
  if (!context.hitPoint) return fallback;
  const localY = context.hitPoint.y - Math.floor(context.hitPoint.y);
  return localY > 0.5 ? 'top' : 'bottom';
}
function add(a: VoxelCoordinate, b: VoxelCoordinate): VoxelCoordinate { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function find(blocks: BlockSource, position: VoxelCoordinate): PlacedBlock | undefined { return 'get' in blocks ? blocks.get(position) : blocks.find((block) => coordinateKey(block.position) === coordinateKey(position)); }
function logicalMetadata(definition: BlockDefinition | undefined): LogicalPlacementMetadata | undefined { return definition?.logicalPlacement ?? logicalPlacementForBehavior(definition?.behavior); }
function expandPlacedBlocks(block: PlacedBlock, metadata: LogicalPlacementMetadata | undefined): readonly PlacedBlock[] { return metadata ? expandLogicalPlacement(block, metadata) : [block]; }
function expandedTargets(block: PlacedBlock, metadata: LogicalPlacementMetadata | undefined): readonly VoxelCoordinate[] { return (metadata ? expandLogicalPlacement(block, metadata) : [block]).map((entry) => entry.position); }
class PreviewBlockLookup implements ReadonlyBlockLookup {
  private readonly overlay = new Map<string, PlacedBlock>();
  constructor(private readonly base: ReadonlyBlockLookup) {}
  get(position: VoxelCoordinate): PlacedBlock | undefined { return this.overlay.get(coordinateKey(position)) ?? this.base.get(position); }
  has(position: VoxelCoordinate): boolean { return this.get(position) !== undefined; }
  set(block: PlacedBlock): void { this.overlay.set(coordinateKey(block.position), block); }
}
export function overlayBlockLookup(base: ReadonlyBlockLookup, blocks: readonly PlacedBlock[]): ReadonlyBlockLookup {
  const lookup = new PreviewBlockLookup(base);
  for (const block of blocks) lookup.set(block);
  return lookup;
}
class ArrayBlockLookup implements ReadonlyBlockLookup {
  private readonly values: Map<string, PlacedBlock>;
  constructor(blocks: readonly PlacedBlock[]) { this.values = new Map(blocks.map((block) => [coordinateKey(block.position), block] as const)); }
  get(position: VoxelCoordinate): PlacedBlock | undefined { return this.values.get(coordinateKey(position)); }
  has(position: VoxelCoordinate): boolean { return this.values.has(coordinateKey(position)); }
}
function equalState(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean { const aKeys = Object.keys(a); return aKeys.length === Object.keys(b).length && aKeys.every((key) => a[key] === b[key]); }
function inBounds(position: VoxelCoordinate, project: ProjectDocument): boolean { return Number.isInteger(position.x) && Number.isInteger(position.y) && Number.isInteger(position.z) && position.x >= 0 && position.y >= 0 && position.z >= 0 && position.x < project.size.x && position.y < project.size.y && position.z < project.size.z; }
function touch(project: ProjectDocument): ProjectDocument { return { ...project, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } }; }
function invalid(reason: RuleReason, positions: readonly VoxelCoordinate[]): RuleMutationResult { return { validation: { status: 'invalid', reason, affectedPositions: positions } }; }
function queueCandidates(changed: readonly VoxelCoordinate[]): Map<string, VoxelCoordinate> { const positions = new Map<string, VoxelCoordinate>(); for (const position of changed) for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))]) positions.set(coordinateKey(candidate), candidate); return positions; }
