import type { VoxelCoordinate } from '../../domain/project.types';

/** Shared interaction boundary for Alt+LMB/pick-block in both viewports. */
export function pickBlockFromViewportHit(hit: { readonly block?: VoxelCoordinate }, pick: (position: VoxelCoordinate) => void): boolean {
  if (!hit.block) return false;
  pick(hit.block);
  return true;
}
