import type { PlacedBlock } from '../../domain/project.types';
import {
  isConfirmedOpaqueFullCube,
  type OcclusionClass,
  type OcclusionRole,
} from '../visibility/interior-occlusion';

export interface TerrainClassificationEntry {
  readonly block: PlacedBlock;
  readonly role: OcclusionRole;
  readonly occlusionClass: OcclusionClass;
}

/**
 * Positive proof required before a voxel can enter compiled terrain. The
 * provider's occlusion proof already checks the resolved six-face full cube;
 * this classifier deliberately does not infer eligibility from registry names.
 */
export function isCompiledTerrainEntry(entry: TerrainClassificationEntry): boolean {
  return isConfirmedOpaqueFullCube(entry);
}

/** Reference layers may use terrain geometry, but never contribute occlusion. */
export function isTerrainRenderableEntry(entry: TerrainClassificationEntry): boolean {
  return (
    (entry.role === 'normal' || entry.role === 'reference') &&
    entry.block.kind === 'resolved' &&
    entry.occlusionClass === 'opaque-full-cube'
  );
}
