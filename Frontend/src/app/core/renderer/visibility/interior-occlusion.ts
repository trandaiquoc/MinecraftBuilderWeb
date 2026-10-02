import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';

export type OcclusionRole = 'normal' | 'reference' | 'missing';
export type OcclusionClass = 'opaque-full-cube' | 'non-occluding' | 'unknown';

export interface OcclusionEntry {
  readonly block: PlacedBlock;
  readonly role: OcclusionRole;
  readonly occlusionClass: OcclusionClass;
}

/**
 * Only a provider-backed positive visual classification is sufficient evidence
 * for whole-voxel occlusion. Domain behavior, model names, registry-name
 * suffixes, and fallback visuals are intentionally not treated as proof.
 */
export function isConfirmedOpaqueFullCube(entry: OcclusionEntry): boolean {
  return entry.role === 'normal' && entry.block.kind === 'resolved' && entry.occlusionClass === 'opaque-full-cube';
}

export function hasConfirmedOpaqueNeighbors(
  entry: OcclusionEntry,
  entries: ReadonlyMap<string, OcclusionEntry>,
): boolean {
  if (!isConfirmedOpaqueFullCube(entry)) return false;
  return coordinateNeighbors(entry.block.position).every((position) => {
    const neighbor = entries.get(coordinateKey(position));
    return !!neighbor && isConfirmedOpaqueFullCube(neighbor);
  });
}

/** Deterministic full-cube benchmark helper. It has no Three.js dependency. */
export function interiorOpaqueFullCubeKeys(entries: readonly OcclusionEntry[]): ReadonlySet<string> {
  const map = new Map(entries.map((entry) => [coordinateKey(entry.block.position), entry] as const));
  return new Set(entries
    .filter((entry) => hasConfirmedOpaqueNeighbors(entry, map))
    .map((entry) => coordinateKey(entry.block.position)));
}

export function coordinateNeighbors(position: VoxelCoordinate): readonly VoxelCoordinate[] {
  return [
    { x: position.x + 1, y: position.y, z: position.z },
    { x: position.x - 1, y: position.y, z: position.z },
    { x: position.x, y: position.y + 1, z: position.z },
    { x: position.x, y: position.y - 1, z: position.z },
    { x: position.x, y: position.y, z: position.z + 1 },
    { x: position.x, y: position.y, z: position.z - 1 },
  ];
}
