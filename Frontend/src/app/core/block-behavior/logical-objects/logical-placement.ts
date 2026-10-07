import type { BlockBehavior } from '../../blocks/catalog/block-definition.types';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';

/**
 * The persisted block state remains the source of truth, while this contract
 * describes how a new logical object is materialized from its origin voxel.
 * It is deliberately independent of registry IDs and presentation names.
 */
export type LogicalPlacementLayout = 'vertical-two-part' | 'horizontal-two-part';

export interface LogicalPlacementMetadata {
  readonly layout: LogicalPlacementLayout;
  readonly identityProperty: string;
  readonly firstIdentity: string;
  readonly secondIdentity: string;
  readonly facingProperty?: string;
  /** Every state key except the identity key is copied to both parts. */
  readonly sharedState: 'all-except-identity';
  /** Defaults applied to shared state when a new object is materialized. */
  readonly sharedStateDefaults?: Readonly<Record<string, string>>;
}

export interface LogicalPlacementPart {
  readonly identityValue: string;
  readonly offset: VoxelCoordinate;
}

export function logicalPlacementForBehavior(behavior: BlockBehavior | undefined): LogicalPlacementMetadata | undefined {
  if (behavior?.kind === 'double-height') {
    return { layout: 'vertical-two-part', identityProperty: behavior.halfProperty, firstIdentity: 'lower', secondIdentity: 'upper', sharedState: 'all-except-identity' };
  }
  if (behavior?.kind === 'paired-horizontal') {
    return {
      layout: 'horizontal-two-part',
      identityProperty: behavior.partProperty,
      firstIdentity: behavior.firstPart,
      secondIdentity: behavior.secondPart,
      facingProperty: behavior.facingProperty,
      sharedState: 'all-except-identity',
      sharedStateDefaults: { occupied: 'false' },
    };
  }
  return undefined;
}

export function logicalPlacementParts(metadata: LogicalPlacementMetadata, state: Readonly<Record<string, string>>): readonly LogicalPlacementPart[] {
  if (metadata.layout === 'vertical-two-part') return [
    { identityValue: metadata.firstIdentity, offset: { x: 0, y: 0, z: 0 } },
    { identityValue: metadata.secondIdentity, offset: { x: 0, y: 1, z: 0 } },
  ];
  const facing = state[metadata.facingProperty ?? 'facing'] ?? 'north';
  const offset = directionOffset(facing);
  return [
    { identityValue: metadata.firstIdentity, offset: { x: 0, y: 0, z: 0 } },
    { identityValue: metadata.secondIdentity, offset },
  ];
}

/** Materialize all parts from one origin block without mutating its state. */
export function expandLogicalPlacement(block: PlacedBlock, metadata: LogicalPlacementMetadata): readonly PlacedBlock[] {
  const sharedState = { ...(metadata.sharedStateDefaults ?? {}), ...block.state };
  return logicalPlacementParts(metadata, sharedState).map((part) => ({
    ...block,
    position: add(block.position, part.offset),
    state: { ...sharedState, [metadata.identityProperty]: part.identityValue },
  }));
}

export function logicalPartOffset(metadata: LogicalPlacementMetadata, identityValue: string, state: Readonly<Record<string, string>>): VoxelCoordinate | undefined {
  const parts = logicalPlacementParts(metadata, state);
  const part = parts.find((entry) => entry.identityValue === identityValue);
  return part?.offset;
}

export function oppositeLogicalPart(metadata: LogicalPlacementMetadata, identityValue: string): string | undefined {
  if (identityValue === metadata.firstIdentity) return metadata.secondIdentity;
  if (identityValue === metadata.secondIdentity) return metadata.firstIdentity;
  return undefined;
}

export function directionOffset(direction: string): VoxelCoordinate {
  return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 };
}

function add(position: VoxelCoordinate, offset: VoxelCoordinate): VoxelCoordinate { return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z }; }
