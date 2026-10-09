import type { BlockDefinition } from '../catalog/block-definition.types';
import type { BlockState, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { PlacementContext } from '../../editor/placement/placement';
import type { PlaceableItemDefinition } from './placeable-item.types';
import { vanillaPlaceableForConcreteId } from './manifest/vanilla-placeable-manifest';

export function canonicalPlaceableItemId(concreteId: string, items?: readonly PlaceableItemDefinition[]): string {
  const dynamic = items?.find((item) => item.concreteBlockIds.includes(concreteId));
  return dynamic?.itemId ?? vanillaPlaceableForConcreteId(concreteId)?.itemId ?? concreteId;
}

export function resolveConcreteBlockId(item: PlaceableItemDefinition, context?: PlacementContext): string {
  const variants = item.placementVariants;
  const normal = variants?.standing ?? item.displayBlockId;
  const side = !!context?.faceNormal && Math.abs(context.faceNormal.x) + Math.abs(context.faceNormal.z) > 0 && context.faceNormal.y === 0;
  if (item.placementKind === 'hanging-sign') {
    if (side) return variants?.wallHanging ?? normal;
    if (context?.faceNormal?.y === -1) return variants?.hanging ?? normal;
    return normal;
  }
  return side ? variants?.wall ?? normal : normal;
}

export function resolveItemBlock(item: PlaceableItemDefinition, state: BlockState, position: VoxelCoordinate, context?: PlacementContext, definition?: (id: string) => BlockDefinition | undefined): PlacedBlock {
  const blockId = resolveConcreteBlockId(item, context);
  const target = definition?.(blockId);
  const source = { ...state, ...context?.stateOverride };
  const finalState: Record<string, string> = {};
  if (target) {
    for (const entry of target.stateDefinitions) {
      const value = source[entry.name] ?? target.defaultState[entry.name];
      if (typeof value === 'string') finalState[entry.name] = value;
    }
  } else {
    Object.assign(finalState, source);
  }
  return { kind: 'resolved', id: blockId, namespace: item.namespace, position: { ...position }, state: finalState, blockEntityData: undefined };
}
