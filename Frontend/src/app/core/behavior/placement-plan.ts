import type { ActiveBlock } from '../blocks/active-block.service';
import { resolveItemBlock } from '../blocks/placeable-item';
import type { PlaceableItemDefinition } from '../blocks/placeable-item';
import type { BlockDefinition } from '../blocks/block-definition.types';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../domain/project.types';
import type { PlacementContext } from '../editor/placement';
import { BlockRuleEngine, minecraftPlayerFacing, RuleValidation } from './block-rule-engine';

export interface PlacementPlan {
  readonly request: PlacedBlock;
  readonly blocks: readonly PlacedBlock[];
  readonly validation: RuleValidation;
  readonly project?: ProjectDocument;
}

export function placementRequestForActive(active: ActiveBlock, position: VoxelCoordinate, context: PlacementContext | undefined, item?: PlaceableItemDefinition): PlacedBlock {
  const block = item
    ? resolveItemBlock(item, active.state, position, context)
    : { kind: active.support === 'unknown' ? 'missing' : 'resolved', id: active.id, namespace: active.id.split(':')[0] ?? 'minecraft', position: { ...position }, state: { ...active.state, ...context?.stateOverride } } as PlacedBlock;
  return { ...block, kind: active.support === 'unknown' ? 'missing' : 'resolved' };
}

export function planPlacement(project: ProjectDocument, active: ActiveBlock, position: VoxelCoordinate, context: PlacementContext | undefined, definition: (id: string) => BlockDefinition | undefined, item?: PlaceableItemDefinition): PlacementPlan {
  const request = placementRequestForActive(active, position, context, item);
  const result = new BlockRuleEngine(definition).place(project, request, context);
  const original = new Set(project.blocks.map((block) => key(block.position)));
  const blocks = result.project
    ? result.project.blocks.filter((block) => !original.has(key(block.position)))
    : attemptedBlocks(request, context, definition);
  return { request, blocks, validation: result.validation, project: result.project };
}

function attemptedBlocks(request: PlacedBlock, context: PlacementContext | undefined, definition: (id: string) => BlockDefinition | undefined): readonly PlacedBlock[] {
  const behavior = definition(request.id)?.behavior;
  if (behavior?.kind === 'paired-horizontal') {
    const facing = context?.yaw === undefined ? request.state[behavior.facingProperty] ?? 'north' : minecraftPlayerFacing(context.yaw);
    const state = { ...request.state, [behavior.facingProperty]: facing, occupied: 'false' };
    return [
      { ...request, state: { ...state, [behavior.partProperty]: behavior.firstPart } },
      { ...request, position: add(request.position, directionOffset(facing)), state: { ...state, [behavior.partProperty]: behavior.secondPart } },
    ];
  }
  if (behavior?.kind === 'double-height') return [
    { ...request, state: { ...request.state, [behavior.halfProperty]: 'lower' } },
    { ...request, position: { ...request.position, y: request.position.y + 1 }, state: { ...request.state, [behavior.halfProperty]: 'upper' } },
  ];
  return [request];
}

function directionOffset(direction: string): VoxelCoordinate { return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 }; }
function add(position: VoxelCoordinate, offset: VoxelCoordinate): VoxelCoordinate { return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z }; }
function key(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }
