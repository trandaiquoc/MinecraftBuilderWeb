import { BlockDefinition } from '../blocks/block-definition.types';
import { coordinateKey } from '../domain/coordinates';
import { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../domain/project.types';
import { groupIdsOf, isBlockLocked } from '../editor/groups/group-membership';

export type LogicalBlockDefinitionLookup = (id: string) => BlockDefinition | undefined;

export function resolveLogicalObjectParts(blocks: readonly PlacedBlock[], position: VoxelCoordinate, definition: LogicalBlockDefinitionLookup): readonly PlacedBlock[] {
  const block = find(blocks, position);
  const behavior = block && definition(block.id)?.behavior;
  if (!block || !behavior || behavior.kind !== 'double-height' && behavior.kind !== 'paired-horizontal') return block ? [block] : [];
  const pairedPosition = behavior.kind === 'double-height'
    ? { x: position.x, y: position.y + (block.state[behavior.halfProperty] === 'upper' ? -1 : 1), z: position.z }
    : add(position, directionOffset(block.state[behavior.facingProperty] ?? 'north'), block.state[behavior.partProperty] === behavior.secondPart ? -1 : 1);
  const paired = find(blocks, pairedPosition);
  const isPair = paired?.id === block.id && (behavior.kind === 'double-height'
    ? paired.state[behavior.halfProperty] !== block.state[behavior.halfProperty]
    : paired.state[behavior.partProperty] !== block.state[behavior.partProperty] && paired.state[behavior.facingProperty] === block.state[behavior.facingProperty]);
  return isPair && paired ? [block, paired] : [block];
}

export function expandLogicalObjectClosure(blocks: readonly PlacedBlock[], seeds: readonly PlacedBlock[], definition: LogicalBlockDefinitionLookup): readonly PlacedBlock[] {
  const closure = new Map<string, PlacedBlock>();
  for (const seed of seeds) for (const part of resolveLogicalObjectParts(blocks, seed.position, definition)) closure.set(coordinateKey(part.position), part);
  return [...closure.values()];
}

export function normalizeLogicalObjectMemberships(project: ProjectDocument, definition: LogicalBlockDefinitionLookup): ProjectDocument {
  const memberships = new Map<string, readonly string[]>();
  for (const block of project.blocks) {
    const parts = resolveLogicalObjectParts(project.blocks, block.position, definition);
    const union = [...new Set(parts.flatMap((part) => groupIdsOf(part)))].sort((a, b) => groupOrder(project, a) - groupOrder(project, b) || a.localeCompare(b));
    for (const part of parts) memberships.set(coordinateKey(part.position), union);
  }
  let changed = false;
  const blocks = project.blocks.map((block) => {
    const groupIds = memberships.get(coordinateKey(block.position)) ?? groupIdsOf(block);
    if (sameValues(groupIds, groupIdsOf(block))) return block;
    changed = true; return { ...block, groupIds };
  });
  return changed ? { ...project, blocks } : project;
}

export function synchronizeLogicalObjectState(blocks: readonly PlacedBlock[], position: VoxelCoordinate, sourceState: Readonly<Record<string, string>>, definition: LogicalBlockDefinitionLookup): readonly PlacedBlock[] {
  const source = find(blocks, position);
  const behavior = source && definition(source.id)?.behavior;
  const identityProperty = behavior?.kind === 'double-height' ? behavior.halfProperty : behavior?.kind === 'paired-horizontal' ? behavior.partProperty : undefined;
  const keys = new Set(resolveLogicalObjectParts(blocks, position, definition).map((part) => coordinateKey(part.position)));
  if (keys.size <= 1) return blocks;
  return blocks.map((block) => keys.has(coordinateKey(block.position)) ? { ...block, state: { ...sourceState, ...(identityProperty ? { [identityProperty]: block.state[identityProperty] ?? sourceState[identityProperty] } : {}) } } : block);
}

/** Atomically rotates a paired-horizontal object around its first/foot part. */
export function transformPairedHorizontal(project: ProjectDocument, position: VoxelCoordinate, newFacing: string, definition: LogicalBlockDefinitionLookup): ProjectDocument | undefined {
  const selected = find(project.blocks, position);
  const behavior = selected && definition(selected.id)?.behavior;
  if (!selected || behavior?.kind !== 'paired-horizontal') return undefined;
  const parts = resolveLogicalObjectParts(project.blocks, position, definition);
  if (parts.length !== 2 || parts.some((part) => isBlockLocked(part, project.groups))) return undefined;
  const foot = parts.find((part) => part.state[behavior.partProperty] === behavior.firstPart);
  const head = parts.find((part) => part.state[behavior.partProperty] === behavior.secondPart);
  if (!foot || !head || !isHorizontal(newFacing)) return undefined;
  const newHeadPosition = add(foot.position, directionOffset(newFacing), 1);
  if (!inBounds(newHeadPosition, project.size)) return undefined;
  const oldKeys = new Set(parts.map((part) => coordinateKey(part.position)));
  const destination = find(project.blocks, newHeadPosition);
  if (destination && !oldKeys.has(coordinateKey(destination.position))) return undefined;
  const occupied = foot.state['occupied'] ?? head.state['occupied'];
  const update = (block: PlacedBlock): PlacedBlock => {
    if (coordinateKey(block.position) === coordinateKey(foot.position)) return { ...block, state: { ...block.state, [behavior.facingProperty]: newFacing, [behavior.partProperty]: behavior.firstPart, ...(occupied === undefined ? {} : { occupied }) } };
    if (coordinateKey(block.position) === coordinateKey(head.position)) return { ...block, position: { ...newHeadPosition }, state: { ...block.state, [behavior.facingProperty]: newFacing, [behavior.partProperty]: behavior.secondPart, ...(occupied === undefined ? {} : { occupied }) } };
    return block;
  };
  return { ...project, blocks: project.blocks.map(update) };
}

function find(blocks: readonly PlacedBlock[], position: VoxelCoordinate): PlacedBlock | undefined { const key = coordinateKey(position); return blocks.find((block) => coordinateKey(block.position) === key); }
function sameValues(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((value) => b.includes(value)); }
function groupOrder(project: ProjectDocument, id: string): number { const index = project.groups.findIndex((group) => group.id === id); return index < 0 ? Number.MAX_SAFE_INTEGER : index; }
function directionOffset(direction: string): VoxelCoordinate { return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 }; }
function add(position: VoxelCoordinate, offset: VoxelCoordinate, scale: 1 | -1): VoxelCoordinate { return { x: position.x + offset.x * scale, y: position.y + offset.y * scale, z: position.z + offset.z * scale }; }
function inBounds(position: VoxelCoordinate, size: ProjectDocument['size']): boolean { return position.x >= 0 && position.y >= 0 && position.z >= 0 && position.x < size.x && position.y < size.y && position.z < size.z; }
function isHorizontal(value: string): value is 'north' | 'east' | 'south' | 'west' { return value === 'north' || value === 'east' || value === 'south' || value === 'west'; }
