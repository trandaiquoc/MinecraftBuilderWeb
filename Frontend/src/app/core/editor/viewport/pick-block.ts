import type { VoxelCoordinate } from '../../domain/project.types';
import type { FaceNormal } from '../placement/placement';

export interface ViewportPickHit { readonly block?: VoxelCoordinate; readonly faceNormal?: FaceNormal; readonly decoration?: object; readonly blockDistance?: number; readonly decorationDistance?: number; }

/** Decorations that are closer to the pointer keep ownership of the interaction. */
export function blockHitWinsOverDecoration(hit: ViewportPickHit): boolean {
  if (!hit.block) return false;
  if (!hit.decoration) return true;
  return hit.blockDistance !== undefined && hit.decorationDistance !== undefined && hit.decorationDistance > hit.blockDistance;
}

/** Shared Pick + logical Selection boundary for Alt+LMB in both viewports. */
export function pickAndSelectBlockFromViewportHit(hit: ViewportPickHit, pick: (position: VoxelCoordinate) => void, select: (hit: ViewportPickHit) => void): boolean {
  if (!hit.block) return false;
  pick(hit.block);
  select(hit);
  return true;
}

/** Compatibility alias for callers that only need to resolve a pick target. */
export function pickBlockFromViewportHit(hit: ViewportPickHit, pick: (position: VoxelCoordinate) => void): boolean {
  return pickAndSelectBlockFromViewportHit(hit, pick, () => undefined);
}
