import type { BlockState, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { expandLogicalPlacement } from '../../block-behavior/logical-objects/logical-placement';
import type { LogicalPlacementMetadata } from '../../block-behavior/logical-objects/logical-placement';
import type { PlaceableManifestEntry } from './placeable-item.types';
import type { BlockDefinition } from '../catalog/block-definition.types';

export function createPlaceablePreviewBlocks(entry: PlaceableManifestEntry, definition: BlockDefinition, itemState: BlockState, logicalPlacement?: LogicalPlacementMetadata): readonly PlacedBlock[] {
  const state = { ...itemState };
  const make = (position: VoxelCoordinate, overrides: BlockState = {}, concreteId = definition.id): PlacedBlock => ({ kind: 'resolved', id: concreteId, namespace: concreteId.split(':')[0] ?? 'minecraft', position, state: { ...state, ...overrides } });
  return logicalPlacement ? expandLogicalPlacement(make({ x: 0, y: 0, z: 0 }), logicalPlacement) : [make({ x: 0, y: 0, z: 0 })];
}

/** Builds final, internally consistent preview blocks for a logical item state. */
export function previewBlocksForItem(item: import('./placeable-item.types').PlaceableItemDefinition, state: BlockState = item.defaultState): readonly PlacedBlock[] {
  const source = item.previewBlocks;
  if (!item.logicalPlacement || source.length === 0) return source.map((block) => ({ ...block, state: { ...block.state, ...state } }));
  const origin = { ...source[0], state: { ...source[0].state, ...state } };
  return expandLogicalPlacement(origin, item.logicalPlacement);
}
