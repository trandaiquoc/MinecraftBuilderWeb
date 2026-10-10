import type * as THREE from 'three';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { FluidRenderResolver, ResolvedFluidRenderState } from './fluid-state';

export interface FluidChunkRecord {
  readonly block: PlacedBlock;
  readonly state: ResolvedFluidRenderState;
  readonly role?: 'normal' | 'reference';
}
export interface FluidChunkChange {
  readonly position: VoxelCoordinate;
  readonly before?: FluidChunkRecord;
  readonly after?: FluidChunkRecord;
}
export interface FluidChunkVisualProvider {
  readonly contractKey?: string;
  readonly resolver: FluidRenderResolver;
  readonly texture: (resource: string) => Promise<THREE.Texture | undefined>;
}
export interface FluidChunkSyncResult {
  readonly status: 'committed' | 'stale' | 'unavailable';
  readonly committedKeys: readonly string[];
  readonly fallbackKeys: readonly string[];
}
export interface FluidLayerPresentation {
  readonly visibleLayers: ReadonlySet<number>;
  readonly currentY: number;
  readonly hiddenGroupIds: ReadonlySet<string>;
  readonly isolatedGroupId?: string;
  readonly referenceOpacity: number;
}
