import type { ActiveBlock } from '../../blocks/placement-palette/active-block.service';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { placementStatus, PlacementContext, PlacementStatus } from '../../editor/placement/placement';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { PlacementPlan } from '../../block-behavior/placement/placement-plan';

export interface PlacementPreviewResolution {
  readonly plan?: PlacementPlan;
  readonly status?: PlacementStatus;
}

export interface PlacementFeedback { readonly status: PlacementStatus; }

/** Uses the same resolved preview result for the ghost and the viewport badge. */
export function placementFeedbackForHit(hit: { readonly placement?: { readonly status: PlacementStatus }; readonly decorationPlan?: { readonly status: PlacementStatus } }, decorationActive: boolean): PlacementFeedback | undefined {
  const status = decorationActive ? hit.decorationPlan?.status : hit.placement?.status;
  return status ? { status } : undefined;
}

export interface PlacementPreviewRequest {
  readonly requested: boolean;
  readonly project: ProjectDocument;
  readonly active?: ActiveBlock;
  readonly target?: VoxelCoordinate;
  readonly context?: PlacementContext;
  readonly lookup?: ReadonlyBlockLookup;
  readonly provider?: (project: ProjectDocument, active: ActiveBlock, target: VoxelCoordinate, context: PlacementContext | undefined, lookup?: ReadonlyBlockLookup) => PlacementPlan | undefined;
}

/** Keeps expensive placement policy out of the renderer's spatial hit path. */
export function resolvePlacementPreview(request: PlacementPreviewRequest): PlacementPreviewResolution {
  if (!request.requested || !request.target || !request.active) return {};
  const plan = request.provider?.(request.project, request.active, request.target, request.context, request.lookup);
  return { plan, status: plan?.validation.status ?? placementStatus(request.target, request.project.size, request.active.support ?? 'unknown') };
}
