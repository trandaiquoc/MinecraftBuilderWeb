import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { isBlockLocked } from '../../editor/groups/group-membership';
import { PlacementContext } from '../../editor/placement/placement';
import {
  expandLogicalObjectClosure,
  resolveLogicalObjectParts,
} from '../logical-objects/logical-object';
import {
  expandLogicalPlacement,
  logicalPlacementForBehavior,
} from '../logical-objects/logical-placement';
import type { LogicalPlacementMetadata } from '../logical-objects/logical-placement';
import { hasBlockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import { add, find, sixOffsets } from './block-rule-geometry';
import { prepareBlockPlacement, prepareContextualPlacement } from './block-rule-placement';
import { derivedBlockState } from './block-rule-derived-state';
import { validateBlockSupport } from './block-rule-support';
export {
  minecraftPlayerFacing,
  minecraftSignRotation,
  minecraftSkullRotation,
} from './block-rule-placement';
export type {
  BlockDefinitionLookup,
  BlockSource,
  RuleMutationResult,
  RuleReason,
  RuleStatus,
  RuleValidation,
} from './block-rule-types';
import type {
  BlockDefinitionLookup,
  BlockSource,
  RuleMutationResult,
  RuleReason,
  RuleValidation,
} from './block-rule-types';

/** Returns the next canonical state when the active candle can stack in-place. */
export function nextCandleState(
  existing: PlacedBlock,
  activeId: string,
  definition: BlockDefinitionLookup,
): Readonly<Record<string, string>> | undefined {
  const behavior = definition(existing.id)?.behavior;
  if (existing.id !== activeId || behavior?.kind !== 'candle') return undefined;
  const current = Number(existing.state['candles'] ?? '1');
  if (!Number.isInteger(current) || current < 1 || current >= behavior.maxCandles) return undefined;
  return { ...existing.state, candles: String(current + 1) };
}

export class BlockRuleEngine {
  constructor(private readonly definition: BlockDefinitionLookup) {}

  /**
   * Evaluates only the verified support contract for an already materialized
   * block. This is intentionally read-only so import validation cannot trigger
   * placement, derived-state refresh, or project mutation.
   */
  validateSupportOnly(
    project: ProjectDocument,
    block: PlacedBlock,
    definition = this.definition(block.id),
    source: BlockSource = project.blocks,
  ): RuleValidation {
    return validateBlockSupport(project, block, definition, this.definition, source);
  }

  /**
   * Validates mutation candidates whose behavior requires a supported face.
   *
   * Refresh intentionally preserves some unsupported blocks so the editor can
   * report them without silently destroying data. Mutations that explicitly
   * change an attached block's state use this narrower invariant to reject a
   * newly unsupported orientation atomically.
   */
  validateMutation(
    project: ProjectDocument,
    positions: readonly VoxelCoordinate[],
    source: BlockSource = project.blocks,
  ): RuleValidation | undefined {
    for (const position of positions) {
      const block = find(source, position);
      if (!block || this.definition(block.id)?.behavior?.kind !== 'attached-six-face-placement')
        continue;
      const validation = validateBlockSupport(
        project,
        block,
        this.definition(block.id),
        this.definition,
        source,
      );
      if (validation.status !== 'valid') return validation;
    }
    return undefined;
  }

  place(
    project: ProjectDocument,
    requestedBlock: PlacedBlock,
    context?: PlacementContext,
    lookup?: ReadonlyBlockLookup,
  ): RuleMutationResult {
    const prepared = prepareBlockPlacement(
      requestedBlock,
      context,
      this.definition(requestedBlock.id),
      this.definition,
    );
    if (!prepared) return invalid('missing-support', [requestedBlock.position]);
    const source = lookup ?? project.blocks;
    const block = prepareContextualPlacement(prepared, context, this.definition, source);
    const definition = this.definition(block.id);
    const metadata = logicalMetadata(definition);
    const targets = expandedTargets(block, metadata);
    if (targets.some((position) => !inBounds(position, project)))
      return invalid('out-of-bounds', targets);
    if (targets.some((position) => find(source, position))) return invalid('occupied', targets);
    const support = validateBlockSupport(project, block, definition, this.definition, source);
    if (support.status === 'invalid') return { validation: support };
    const placed = expandPlacedBlocks(block, metadata);
    const placementLookup = new PreviewBlockLookup(lookup ?? new ArrayBlockLookup(project.blocks));
    for (const entry of placed) placementLookup.set(entry);
    const refreshed = this.refresh(
      { ...project, blocks: [...project.blocks, ...placed] },
      targets,
      placementLookup,
    );
    if (!refreshed.project) return refreshed;
    const knownPlacement =
      !!definition?.behavior || hasBlockCapability(definition, 'direct-placement');
    const directPlacementOnly =
      !definition?.behavior && hasBlockCapability(definition, 'direct-placement');
    const status =
      support.status === 'unknown'
        ? directPlacementOnly
          ? 'valid'
          : 'unknown'
        : support.status === 'valid' && !knownPlacement
          ? 'unknown'
          : support.status;
    return {
      validation: {
        status,
        reason: status === 'valid' ? 'ok' : 'unknown-behavior',
        affectedPositions: refreshed.validation.affectedPositions,
      },
      project: touch(refreshed.project),
      plannedBlocks: placed,
      changedBlocks: refreshed.changedBlocks,
    };
  }

  /** Evaluates the same placement preparation/rules without cloning the project. */
  preview(
    project: ProjectDocument,
    requestedBlock: PlacedBlock,
    context: PlacementContext | undefined,
    lookup: ReadonlyBlockLookup,
  ): RuleMutationResult {
    const prepared = prepareBlockPlacement(
      requestedBlock,
      context,
      this.definition(requestedBlock.id),
      this.definition,
    );
    if (!prepared) return invalid('missing-support', [requestedBlock.position]);
    const block = prepareContextualPlacement(prepared, context, this.definition, lookup);
    const definition = this.definition(block.id);
    const metadata = logicalMetadata(definition);
    const targets = expandedTargets(block, metadata);
    if (targets.some((position) => !inBounds(position, project)))
      return invalid('out-of-bounds', targets);
    if (targets.some((position) => find(lookup, position))) return invalid('occupied', targets);
    const support = validateBlockSupport(project, block, definition, this.definition, lookup);
    if (support.status === 'invalid') return { validation: support };
    const placed = expandPlacedBlocks(block, metadata);
    const overlay = new PreviewBlockLookup(lookup);
    for (const entry of placed) overlay.set(entry);
    const refreshed = this.refreshPreview(project, overlay, targets);
    if (refreshed.status === 'invalid') return { validation: refreshed };
    const knownPlacement =
      !!definition?.behavior || hasBlockCapability(definition, 'direct-placement');
    const directPlacementOnly =
      !definition?.behavior && hasBlockCapability(definition, 'direct-placement');
    const status =
      support.status === 'unknown'
        ? directPlacementOnly
          ? 'valid'
          : 'unknown'
        : support.status === 'valid' && !knownPlacement
          ? 'unknown'
          : support.status;
    return {
      validation: {
        status,
        reason: status === 'valid' ? 'ok' : 'unknown-behavior',
        affectedPositions: refreshed.affectedPositions,
      },
      plannedBlocks: placed,
    };
  }

  delete(project: ProjectDocument, position: VoxelCoordinate): RuleMutationResult {
    return this.deleteMany(project, [position]);
  }

  deleteMany(
    project: ProjectDocument,
    positions: readonly VoxelCoordinate[],
    source: BlockSource = project.blocks,
  ): RuleMutationResult {
    const requested = new Set(positions.map(coordinateKey));
    const seeds = positions
      .map((position) => find(source, position))
      .filter(
        (block): block is PlacedBlock => !!block && requested.has(coordinateKey(block.position)),
      );
    if (!seeds.length) return invalid('occupied', positions);
    // Select All already contains every block, so resolving pair closure for each
    // seed would only add work and allocations without changing the result.
    const removing =
      seeds.length === project.blocks.length
        ? [...project.blocks]
        : [...expandLogicalObjectClosure(project.blocks, seeds, this.definition)];
    if (removing.some((entry) => isBlockLocked(entry, project.groups)))
      return invalid(
        'locked-affected-block',
        removing.map((entry) => entry.position),
      );
    const keys = new Set(removing.map((entry) => coordinateKey(entry.position)));
    // Removing the complete structure cannot leave a dependent neighbor to
    // refresh. Keep this as one atomic mutation instead of queueing every
    // deleted voxel (which would trip the stability guard for large projects).
    if (removing.length === project.blocks.length) {
      return {
        validation: {
          status: 'valid',
          reason: 'ok',
          affectedPositions: removing.map((entry) => entry.position),
        },
        project: touch({ ...project, blocks: [] }),
      };
    }
    const remaining = project.blocks.filter((entry) => !keys.has(coordinateKey(entry.position)));
    const unsupported = this.removeUnsupportedAttachedBlocks(project, remaining, keys);
    if (unsupported.locked) return invalid('locked-affected-block', [unsupported.locked.position]);
    const refreshed = this.refresh(
      { ...project, blocks: unsupported.blocks },
      [
        ...removing.map((entry) => entry.position),
        ...unsupported.removed.map((entry) => entry.position),
      ],
      new ArrayBlockLookup(unsupported.blocks),
    );
    return refreshed.project
      ? {
          validation: refreshed.validation,
          project: touch(refreshed.project),
          changedBlocks: refreshed.changedBlocks,
        }
      : refreshed;
  }

  refresh(
    project: ProjectDocument,
    changed: readonly VoxelCoordinate[],
    source: BlockSource = project.blocks,
  ): RuleMutationResult {
    const blocks = project.blocks;
    const updates = new Map<string, PlacedBlock>();
    const queue = new Map<string, VoxelCoordinate>();
    const affected = new Map<string, VoxelCoordinate>();
    for (const position of changed)
      for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))])
        queue.set(coordinateKey(candidate), candidate);
    const guard = Math.max(64, blocks.length * 12);
    let iterations = 0;
    while (queue.size) {
      if (++iterations > guard) return invalid('unstable-neighbor-update', [...affected.values()]);
      const [key, position] = queue.entries().next().value as [string, VoxelCoordinate];
      queue.delete(key);
      const block = updates.get(coordinateKey(position)) ?? find(source, position);
      if (!block) continue;
      const nextState = derivedBlockState(
        block,
        {
          get: (candidate) => updates.get(coordinateKey(candidate)) ?? find(source, candidate),
          has: (candidate) => !!(updates.get(coordinateKey(candidate)) ?? find(source, candidate)),
        },
        this.definition,
      );
      if (!nextState || equalState(block.state, nextState)) continue;
      if (isBlockLocked(block, project.groups)) return invalid('locked-affected-block', [position]);
      const updated = { ...block, state: nextState };
      updates.set(key, updated);
      affected.set(key, position);
      for (const offset of sixOffsets) {
        const neighbor = add(position, offset);
        queue.set(coordinateKey(neighbor), neighbor);
      }
    }
    const resultingBlocks = blocks.map(
      (entry) => updates.get(coordinateKey(entry.position)) ?? entry,
    );
    const resultingProject = { ...project, blocks: resultingBlocks };
    const afterLookup: ReadonlyBlockLookup = {
      get: (position) => updates.get(coordinateKey(position)) ?? find(source, position),
      has: (position) => !!(updates.get(coordinateKey(position)) ?? find(source, position)),
    };
    const supportInvalid = [...queueCandidates(changed).values()]
      .map((position) => find(afterLookup, position))
      .filter((block): block is PlacedBlock => !!block)
      .find(
        (block) =>
          validateBlockSupport(
            resultingProject,
            block,
            this.definition(block.id),
            this.definition,
            afterLookup,
          ).status === 'invalid',
      );
    return supportInvalid
      ? {
          validation: {
            status: 'invalid',
            reason: 'missing-support',
            affectedPositions: [supportInvalid.position],
            diagnostics: ['Dependent block was preserved but no longer has verified support.'],
          },
          project: resultingProject,
          changedBlocks: [...updates.values()],
        }
      : {
          validation: { status: 'valid', reason: 'ok', affectedPositions: [...affected.values()] },
          project: resultingProject,
          changedBlocks: [...updates.values()],
        };
  }

  isDerivedProperty(blockId: string, property: string): boolean {
    return (
      this.definition(blockId)?.stateDefinitions.some(
        (entry) => entry.name === property && entry.derived === true,
      ) ?? false
    );
  }

  private refreshPreview(
    project: ProjectDocument,
    source: PreviewBlockLookup,
    changed: readonly VoxelCoordinate[],
  ): RuleValidation {
    const queue = new Map<string, VoxelCoordinate>();
    const affected = new Map<string, VoxelCoordinate>();
    for (const position of changed)
      for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))])
        queue.set(coordinateKey(candidate), candidate);
    const guard = Math.max(64, changed.length * 24);
    let iterations = 0;
    while (queue.size) {
      if (++iterations > guard)
        return {
          status: 'invalid',
          reason: 'unstable-neighbor-update',
          affectedPositions: [...affected.values()],
        };
      const [key, position] = queue.entries().next().value as [string, VoxelCoordinate];
      queue.delete(key);
      const block = source.get(position);
      if (!block) continue;
      const nextState = derivedBlockState(block, source, this.definition);
      if (!nextState || equalState(block.state, nextState)) continue;
      if (isBlockLocked(block, project.groups))
        return {
          status: 'invalid',
          reason: 'locked-affected-block',
          affectedPositions: [position],
        };
      source.set({ ...block, state: nextState });
      affected.set(key, position);
      for (const offset of sixOffsets) {
        const neighbor = add(position, offset);
        queue.set(coordinateKey(neighbor), neighbor);
      }
    }
    for (const position of queueCandidates(changed).values()) {
      const block = source.get(position);
      if (
        block &&
        validateBlockSupport(project, block, this.definition(block.id), this.definition, source)
          .status === 'invalid'
      )
        return {
          status: 'invalid',
          reason: 'missing-support',
          affectedPositions: [block.position],
        };
    }
    return { status: 'valid', reason: 'ok', affectedPositions: [...affected.values()] };
  }

  private removeUnsupportedAttachedBlocks(
    project: ProjectDocument,
    blocks: readonly PlacedBlock[],
    removedKeys: ReadonlySet<string>,
  ): {
    readonly blocks: readonly PlacedBlock[];
    readonly removed: readonly PlacedBlock[];
    readonly locked?: PlacedBlock;
  } {
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
        const validation = validateBlockSupport(
          project,
          block,
          this.definition(block.id),
          this.definition,
          lookup,
        );
        if (
          validation.status !== 'invalid' ||
          !validation.affectedPositions.some((position) =>
            affectedKeys.has(coordinateKey(position)),
          )
        )
          continue;
        if (isBlockLocked(block, project.groups))
          return { blocks: current, removed, locked: block };
        const index = current.findIndex(
          (entry) => coordinateKey(entry.position) === coordinateKey(block.position),
        );
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

function logicalMetadata(
  definition: BlockDefinition | undefined,
): LogicalPlacementMetadata | undefined {
  return definition?.logicalPlacement ?? logicalPlacementForBehavior(definition?.behavior);
}
function expandPlacedBlocks(
  block: PlacedBlock,
  metadata: LogicalPlacementMetadata | undefined,
): readonly PlacedBlock[] {
  return metadata ? expandLogicalPlacement(block, metadata) : [block];
}
function expandedTargets(
  block: PlacedBlock,
  metadata: LogicalPlacementMetadata | undefined,
): readonly VoxelCoordinate[] {
  return (metadata ? expandLogicalPlacement(block, metadata) : [block]).map(
    (entry) => entry.position,
  );
}
class PreviewBlockLookup implements ReadonlyBlockLookup {
  private readonly overlay = new Map<string, PlacedBlock>();
  constructor(private readonly base: ReadonlyBlockLookup) {}
  get(position: VoxelCoordinate): PlacedBlock | undefined {
    return this.overlay.get(coordinateKey(position)) ?? this.base.get(position);
  }
  has(position: VoxelCoordinate): boolean {
    return this.get(position) !== undefined;
  }
  set(block: PlacedBlock): void {
    this.overlay.set(coordinateKey(block.position), block);
  }
}
export function overlayBlockLookup(
  base: ReadonlyBlockLookup,
  blocks: readonly PlacedBlock[],
): ReadonlyBlockLookup {
  const lookup = new PreviewBlockLookup(base);
  for (const block of blocks) lookup.set(block);
  return lookup;
}
class ArrayBlockLookup implements ReadonlyBlockLookup {
  private readonly values: Map<string, PlacedBlock>;
  constructor(blocks: readonly PlacedBlock[]) {
    this.values = new Map(blocks.map((block) => [coordinateKey(block.position), block] as const));
  }
  get(position: VoxelCoordinate): PlacedBlock | undefined {
    return this.values.get(coordinateKey(position));
  }
  has(position: VoxelCoordinate): boolean {
    return this.values.has(coordinateKey(position));
  }
}
function equalState(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const aKeys = Object.keys(a);
  return aKeys.length === Object.keys(b).length && aKeys.every((key) => a[key] === b[key]);
}
function inBounds(position: VoxelCoordinate, project: ProjectDocument): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    Number.isInteger(position.z) &&
    position.x >= 0 &&
    position.y >= 0 &&
    position.z >= 0 &&
    position.x < project.size.x &&
    position.y < project.size.y &&
    position.z < project.size.z
  );
}
function touch(project: ProjectDocument): ProjectDocument {
  return { ...project, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } };
}
function invalid(reason: RuleReason, positions: readonly VoxelCoordinate[]): RuleMutationResult {
  return { validation: { status: 'invalid', reason, affectedPositions: positions } };
}
function queueCandidates(changed: readonly VoxelCoordinate[]): Map<string, VoxelCoordinate> {
  const positions = new Map<string, VoxelCoordinate>();
  for (const position of changed)
    for (const candidate of [position, ...sixOffsets.map((offset) => add(position, offset))])
      positions.set(coordinateKey(candidate), candidate);
  return positions;
}
