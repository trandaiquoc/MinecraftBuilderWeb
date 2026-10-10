import type {
  FaceNormal,
  PlacementContext,
  PlacementStatus,
} from '../../editor/placement/placement';
import type { YLayerVisibility, LayerBlockIndex } from '../../editor/viewport/y-layer';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import type { DecorationPlacementPlan } from '../../decorations/placement/decoration-placement';
import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { ActiveDecoration } from '../../decorations/decoration.service';
import type { GroupMovePreview } from '../../editor/groups/group-move-planner';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { CompiledTerrainChunk } from '../terrain/chunk-surface-mesher';
import type { TerrainAtlasMode } from '../terrain/atlas/terrain-texture-atlas';
import type {
  HydrationFinalizationSnapshot,
  HydrationProgressSnapshot,
  HydrationStatus,
} from '../scheduling/hydration-progress-tracker';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';

export interface ViewportHit {
  readonly target?: VoxelCoordinate;
  readonly placement?: { readonly status: PlacementStatus; readonly plan?: PlacementPlan };
  readonly block?: VoxelCoordinate;
  readonly faceNormal?: FaceNormal;
  readonly placementContext?: PlacementContext;
  readonly decoration?: PlacedDecoration;
  readonly decorationPlan?: DecorationPlacementPlan;
  readonly decorationDistance?: number;
  readonly blockDistance?: number;
}
export type ViewportHoverListener = (hit: ViewportHit) => void;
export interface ViewportRenderOptions {
  readonly layerY?: number;
  readonly visibility?: YLayerVisibility;
  readonly referenceOpacity?: number;
  readonly layerIndex?: LayerBlockIndex;
  readonly selected?: VoxelCoordinate;
  readonly selectedPositions?: readonly VoxelCoordinate[];
  readonly selectionKind?: string;
  readonly selectionCount?: number;
  readonly selectionBounds?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  readonly selectedDecorationId?: string;
  readonly activeDecoration?: ActiveDecoration;
  readonly selectionBox?: { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate };
  readonly isolatedGroupId?: string;
  readonly isolatedGroupPositions?: readonly VoxelCoordinate[];
  readonly activeGroupId?: string;
  readonly activeGroupPositions?: readonly VoxelCoordinate[];
  readonly groupMovePreview?: GroupMovePreview;
  readonly highlightedBlockId?: string;
  readonly highlightedBlockPositions?: readonly VoxelCoordinate[];
  readonly showStructureBlockGuide?: boolean;
  readonly structureBlockGuideRevision?: number;
  readonly exposedFaceRendering?: boolean;
}
export interface ViewportEngineOptions {
  readonly terrainAtlasMode?: TerrainAtlasMode;
  readonly terrainShouldCommitChunk?: (chunkKey: string, compiled: CompiledTerrainChunk) => boolean;
}
/** Result of one preparation attempt; completion is not GPU-presentation readiness. */
export type ViewportPreparationAttempt = 'completed' | 'accepted' | 'in-progress' | 'rejected';
export type YLayerPrewarmPhase = 'visual-templates' | 'representations';
export type YLayerPrewarmOutcome = 'ready' | 'partial' | 'cancelled' | 'failed';
export interface YLayerPrewarmTerminalNotification {
  readonly attemptId: number;
  readonly projectId: string;
  readonly blocks: readonly PlacedBlock[];
  readonly provider: BlockVisualProvider;
  readonly providerGeneration: number;
  readonly phase: YLayerPrewarmPhase;
  readonly outcome: YLayerPrewarmOutcome;
}
export type ViewportHydrationStatus = HydrationStatus;
export interface ViewportHydrationWorkSnapshot {
  readonly blockQueued: number;
  readonly blockRunning: number;
  readonly decorationQueued: number;
  readonly terrainPending: number;
  readonly fluidPending: number;
  readonly projectionPending: boolean;
}
export type ViewportHydrationProgress = HydrationProgressSnapshot & {
  readonly providerRefreshCompleted?: number;
  readonly providerRefreshTotal?: number;
  readonly providerRefreshPlanning?: boolean;
  readonly providerRefreshQueued?: number;
  readonly providerRefreshRunning?: number;
  readonly terrainPending?: number;
  readonly work?: ViewportHydrationWorkSnapshot;
  readonly renderingFailureCount?: number;
  readonly finalization?: HydrationFinalizationSnapshot;
};
export type PlacementPlanProvider = (
  project: ProjectDocument,
  active: ActiveBlock,
  target: VoxelCoordinate,
  context: PlacementContext | undefined,
  lookup?: ReadonlyBlockLookup,
) => PlacementPlan | undefined;
