import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';

export type OcclusionRole = 'normal' | 'reference' | 'missing';

export interface OcclusionEntry {
  readonly block: PlacedBlock;
  readonly role: OcclusionRole;
}

export type BlockDefinitionLookup = (id: string) => BlockDefinition | undefined;

/**
 * Only an explicit solid behavior is sufficient evidence for whole-voxel
 * occlusion. Model names, registry-name suffixes, and fallback visuals are
 * intentionally not treated as proof because they can represent thin or
 * translucent blocks.
 */
export function isConfirmedOpaqueFullCube(entry: OcclusionEntry, definition: BlockDefinition | undefined): boolean {
  return entry.role === 'normal' && entry.block.kind === 'resolved' && definition?.behavior?.kind === 'solid';
}

export function hasConfirmedOpaqueNeighbors(
  entry: OcclusionEntry,
  entries: ReadonlyMap<string, OcclusionEntry>,
  definitions: BlockDefinitionLookup,
): boolean {
  if (!isConfirmedOpaqueFullCube(entry, definitions(entry.block.id))) return false;
  return coordinateNeighbors(entry.block.position).every((position) => {
    const neighbor = entries.get(coordinateKey(position));
    return !!neighbor && isConfirmedOpaqueFullCube(neighbor, definitions(neighbor.block.id));
  });
}

/** Deterministic full-cube benchmark helper. It has no Three.js dependency. */
export function interiorOpaqueFullCubeKeys(entries: readonly OcclusionEntry[], definitions: BlockDefinitionLookup): ReadonlySet<string> {
  const map = new Map(entries.map((entry) => [coordinateKey(entry.block.position), entry] as const));
  return new Set(entries
    .filter((entry) => hasConfirmedOpaqueNeighbors(entry, map, definitions))
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
