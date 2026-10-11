import type { VoxelCoordinate } from '../../domain/project.types';

export type LogicalPlacementLayout = 'vertical-two-part' | 'horizontal-two-part';

export interface LogicalPlacementMetadata {
  readonly layout: LogicalPlacementLayout;
  readonly identityProperty: string;
  readonly firstIdentity: string;
  readonly secondIdentity: string;
  readonly facingProperty?: string;
  readonly sharedState: 'all-except-identity';
  readonly sharedStateDefaults?: Readonly<Record<string, string>>;
}

export interface LogicalPlacementPart {
  readonly identityValue: string;
  readonly offset: VoxelCoordinate;
}
