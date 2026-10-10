import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { coordinateKey } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { groupIdsOf, isBlockLocked } from '../../editor/groups/group-membership';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import {
  logicalPartOffset,
  logicalPlacementForBehavior,
  oppositeLogicalPart,
  directionOffset,
} from './logical-placement';
import type { LogicalPlacementMetadata } from './logical-placement';

export type LogicalBlockDefinitionLookup = (id: string) => BlockDefinition | undefined;

export function resolveLogicalObjectParts(
  blocks: readonly PlacedBlock[],
  position: VoxelCoordinate,
  definition: LogicalBlockDefinitionLookup,
): readonly PlacedBlock[] {
  return resolveLogicalObjectPartsWithLookup(position, definition, (candidate) =>
    find(blocks, candidate),
  );
}

export function resolveLogicalObjectPartsFromLookup(
  lookup: ReadonlyBlockLookup,
  position: VoxelCoordinate,
  definition: LogicalBlockDefinitionLookup,
): readonly PlacedBlock[] {
  return resolveLogicalObjectPartsWithLookup(position, definition, (candidate) =>
    lookup.get(candidate),
  );
}

function resolveLogicalObjectPartsWithLookup(
  position: VoxelCoordinate,
  definition: LogicalBlockDefinitionLookup,
  lookup: (position: VoxelCoordinate) => PlacedBlock | undefined,
): readonly PlacedBlock[] {
  const block = lookup(position);
  const metadata = block && logicalMetadata(definition(block.id));
  if (!block || !metadata) return block ? [block] : [];
  const identityValue = block.state[metadata.identityProperty];
  const pairedIdentity = oppositeLogicalPart(metadata, identityValue ?? '');
  if (!pairedIdentity) return [block];
  const partOffset = logicalPartOffset(metadata, identityValue ?? '', block.state);
  const pairedOffset = logicalPartOffset(metadata, pairedIdentity, block.state);
  if (!partOffset || !pairedOffset) return [block];
  const pairedPosition = add(
    position,
    {
      x: pairedOffset.x - partOffset.x,
      y: pairedOffset.y - partOffset.y,
      z: pairedOffset.z - partOffset.z,
    },
    1,
  );
  const paired = lookup(pairedPosition);
  const isPair =
    paired?.id === block.id &&
    paired.state[metadata.identityProperty] === pairedIdentity &&
    (!metadata.facingProperty ||
      paired.state[metadata.facingProperty] === block.state[metadata.facingProperty]);
  return isPair && paired ? [block, paired] : [block];
}

export function expandLogicalObjectClosure(
  blocks: readonly PlacedBlock[] | ReadonlyBlockLookup,
  seeds: readonly PlacedBlock[],
  definition: LogicalBlockDefinitionLookup,
): readonly PlacedBlock[] {
  if (Array.isArray(blocks) && seeds.length === blocks.length) return blocks;
  const lookup: ReadonlyBlockLookup = 'get' in blocks ? blocks : new MapBlockLookup(blocks);
  const closure = new Map<string, PlacedBlock>();
  for (const seed of seeds)
    for (const part of resolveLogicalObjectPartsWithLookup(seed.position, definition, (position) =>
      lookup.get(position),
    ))
      closure.set(coordinateKey(part.position), part);
  return [...closure.values()];
}

export function normalizeLogicalObjectMemberships(
  project: ProjectDocument,
  definition: LogicalBlockDefinitionLookup,
): ProjectDocument {
  const index = new Map(
    project.blocks.map((block) => [coordinateKey(block.position), block] as const),
  );
  const memberships = new Map<string, readonly string[]>();
  for (const block of project.blocks) {
    const parts = resolveLogicalObjectPartsWithLookup(block.position, definition, (position) =>
      index.get(coordinateKey(position)),
    );
    const union = [...new Set(parts.flatMap((part) => groupIdsOf(part)))].sort(
      (a, b) => groupOrder(project, a) - groupOrder(project, b) || a.localeCompare(b),
    );
    for (const part of parts) memberships.set(coordinateKey(part.position), union);
  }
  let changed = false;
  const blocks = project.blocks.map((block) => {
    const groupIds = memberships.get(coordinateKey(block.position)) ?? groupIdsOf(block);
    if (sameValues(groupIds, groupIdsOf(block))) return block;
    changed = true;
    return { ...block, groupIds };
  });
  return changed ? { ...project, blocks } : project;
}

export function synchronizeLogicalObjectState(
  blocks: readonly PlacedBlock[],
  position: VoxelCoordinate,
  sourceState: Readonly<Record<string, string>>,
  definition: LogicalBlockDefinitionLookup,
): readonly PlacedBlock[] {
  const source = find(blocks, position);
  const metadata = source && logicalMetadata(definition(source.id));
  const identityProperty = metadata?.identityProperty;
  const keys = new Set(
    resolveLogicalObjectParts(blocks, position, definition).map((part) =>
      coordinateKey(part.position),
    ),
  );
  if (keys.size <= 1) return blocks;
  return blocks.map((block) =>
    keys.has(coordinateKey(block.position))
      ? {
          ...block,
          state: {
            ...sourceState,
            ...(identityProperty
              ? {
                  [identityProperty]:
                    block.state[identityProperty] ?? sourceState[identityProperty],
                }
              : {}),
          },
        }
      : block,
  );
}

/** Atomically rotates a paired-horizontal object around its first/foot part. */
export function transformPairedHorizontal(
  project: ProjectDocument,
  position: VoxelCoordinate,
  newFacing: string,
  definition: LogicalBlockDefinitionLookup,
): ProjectDocument | undefined {
  const selected = find(project.blocks, position);
  const behavior = selected && definition(selected.id)?.behavior;
  const metadata = selected && logicalMetadata(definition(selected.id));
  if (
    !selected ||
    behavior?.kind !== 'paired-horizontal' ||
    !metadata ||
    metadata.layout !== 'horizontal-two-part' ||
    !metadata.facingProperty
  )
    return undefined;
  const parts = resolveLogicalObjectParts(project.blocks, position, definition);
  if (parts.length !== 2 || parts.some((part) => isBlockLocked(part, project.groups)))
    return undefined;
  const foot = parts.find(
    (part) => part.state[metadata.identityProperty] === metadata.firstIdentity,
  );
  const head = parts.find(
    (part) => part.state[metadata.identityProperty] === metadata.secondIdentity,
  );
  if (!foot || !head || !isHorizontal(newFacing)) return undefined;
  const newHeadPosition = add(foot.position, directionOffset(newFacing), 1);
  if (!inBounds(newHeadPosition, project.size)) return undefined;
  const oldKeys = new Set(parts.map((part) => coordinateKey(part.position)));
  const destination = find(project.blocks, newHeadPosition);
  if (destination && !oldKeys.has(coordinateKey(destination.position))) return undefined;
  const occupied = foot.state['occupied'] ?? head.state['occupied'];
  const update = (block: PlacedBlock): PlacedBlock => {
    if (coordinateKey(block.position) === coordinateKey(foot.position))
      return {
        ...block,
        state: {
          ...block.state,
          [metadata.facingProperty!]: newFacing,
          [metadata.identityProperty]: metadata.firstIdentity,
          ...(occupied === undefined ? {} : { occupied }),
        },
      };
    if (coordinateKey(block.position) === coordinateKey(head.position))
      return {
        ...block,
        position: { ...newHeadPosition },
        state: {
          ...block.state,
          [metadata.facingProperty!]: newFacing,
          [metadata.identityProperty]: metadata.secondIdentity,
          ...(occupied === undefined ? {} : { occupied }),
        },
      };
    return block;
  };
  return { ...project, blocks: project.blocks.map(update) };
}

function find(blocks: readonly PlacedBlock[], position: VoxelCoordinate): PlacedBlock | undefined {
  const key = coordinateKey(position);
  return blocks.find((block) => coordinateKey(block.position) === key);
}
class MapBlockLookup implements ReadonlyBlockLookup {
  private readonly values: ReadonlyMap<string, PlacedBlock>;
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
function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}
function groupOrder(project: ProjectDocument, id: string): number {
  const index = project.groups.findIndex((group) => group.id === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
function logicalMetadata(
  definition: BlockDefinition | undefined,
): LogicalPlacementMetadata | undefined {
  return definition?.logicalPlacement ?? logicalPlacementForBehavior(definition?.behavior);
}
function add(position: VoxelCoordinate, offset: VoxelCoordinate, scale: 1 | -1): VoxelCoordinate {
  return {
    x: position.x + offset.x * scale,
    y: position.y + offset.y * scale,
    z: position.z + offset.z * scale,
  };
}
function inBounds(position: VoxelCoordinate, size: ProjectDocument['size']): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.z >= 0 &&
    position.x < size.x &&
    position.y < size.y &&
    position.z < size.z
  );
}
function isHorizontal(value: string): value is 'north' | 'east' | 'south' | 'west' {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}
