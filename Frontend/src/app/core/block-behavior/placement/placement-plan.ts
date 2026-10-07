import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import { resolveItemBlock } from '../../blocks/placement-palette/placeable-item';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { PlacementContext } from '../../editor/placement/placement';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import { BlockRuleEngine, minecraftPlayerFacing, RuleValidation } from '../rules/block-rule-engine';
import { expandLogicalPlacement, logicalPlacementForBehavior } from '../logical-objects/logical-placement';

export interface PlacementPlan {
  readonly request: PlacedBlock;
  readonly blocks: readonly PlacedBlock[];
  readonly validation: RuleValidation;
  readonly project?: ProjectDocument;
  readonly changedBlocks?: readonly PlacedBlock[];
}

export function placementRequestForActive(active: ActiveBlock, position: VoxelCoordinate, context: PlacementContext | undefined, item?: PlaceableItemDefinition, definition?: (id: string) => BlockDefinition | undefined): PlacedBlock {
  const block = item
    ? resolveItemBlock(item, active.state, position, context, definition)
    : { kind: active.support === 'unknown' ? 'missing' : 'resolved', id: active.id, namespace: active.id.split(':')[0] ?? 'minecraft', position: { ...position }, state: { ...active.state, ...context?.stateOverride } } as PlacedBlock;
  // Content existence is independent from placement-rule confidence. A known
  // catalog item/block must remain resolved even when its behavior is unknown;
  // the rule engine reports that uncertainty separately.
  const contentKnown = !!definition?.(block.id) || !!item?.concreteBlockIds.includes(block.id);
  return { ...block, kind: contentKnown || active.support !== 'unknown' ? 'resolved' : 'missing' };
}

export function planPlacement(project: ProjectDocument, active: ActiveBlock, position: VoxelCoordinate, context: PlacementContext | undefined, definition: (id: string) => BlockDefinition | undefined, item?: PlaceableItemDefinition, lookup?: ReadonlyBlockLookup, mutation = false): PlacementPlan {
  const request = placementRequestForActive(active, position, context, item, definition);
  const result = lookup && !mutation ? new BlockRuleEngine(definition).preview(project, request, context, lookup) : new BlockRuleEngine(definition).place(project, request, context, lookup);
  if (lookup && !mutation) return { request, blocks: result.plannedBlocks ?? attemptedBlocks(request, context, definition), validation: result.validation };
  const blocks = result.plannedBlocks ?? attemptedBlocks(request, context, definition);
  return { request, blocks, validation: result.validation, project: result.project, changedBlocks: result.changedBlocks };
}

function attemptedBlocks(request: PlacedBlock, context: PlacementContext | undefined, definition: (id: string) => BlockDefinition | undefined): readonly PlacedBlock[] {
  const behavior = definition(request.id)?.behavior;
  const metadata = logicalPlacementForBehavior(behavior);
  if (!metadata) return [request];
  const state = metadata.facingProperty && context?.yaw !== undefined
    ? { ...request.state, [metadata.facingProperty]: minecraftPlayerFacing(context.yaw) }
    : request.state;
  return expandLogicalPlacement({ ...request, state }, metadata);
}
