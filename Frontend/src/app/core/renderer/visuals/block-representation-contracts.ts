import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ViewportRenderOptions } from '../engine/viewport-engine-contracts';
import type { VisibleBlockProjectionEntry } from '../engine/y-layer-projection-coordinator';
import type { BlockVisualResult } from './block-visual-provider-contract';
import type { RenderedBlockEntry } from '../engine/viewport-block-representation-store';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';

export type HydrationBlock = ProjectDocument['blocks'][number];
export type BlockRenderRole = RenderedBlockEntry['role'];

export interface HydrationWorldContext {
  readonly getBlock: (position: VoxelCoordinate) => HydrationBlock | undefined;
}

/** The scheduler owns this value; representation owners only consume it. */
export interface BlockHydrationJob {
  readonly token: number;
  readonly projectionRevision: number;
  readonly key: string;
  readonly block: HydrationBlock;
  readonly signature: string;
  readonly role: BlockRenderRole;
  readonly worldContext: HydrationWorldContext;
  readonly options: ViewportRenderOptions;
  readonly allowInstancing: boolean;
  readonly surfaceFastPathEligible: boolean;
  readonly surfaceVisibleEntries: ReadonlyMap<string, VisibleBlockProjectionEntry>;
  readonly layerPrewarm?: boolean;
  readonly providerRefresh?: boolean;
  readonly providerRefreshGeneration?: number;
}

export interface HydratedBlockVisualResult extends BlockVisualResult {
  readonly terrainTemplates?: readonly SurfaceFaceTemplate[];
}
