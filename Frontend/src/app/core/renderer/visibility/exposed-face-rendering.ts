import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { isConfirmedOpaqueFullCube, OcclusionEntry } from './interior-occlusion';

export type SurfaceFaceDirection = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface ExposedFaceEntry extends OcclusionEntry {
  readonly block: PlacedBlock;
}

const DIRECTIONS: readonly {
  readonly direction: SurfaceFaceDirection;
  readonly offset: VoxelCoordinate;
}[] = [
  { direction: 'east', offset: { x: 1, y: 0, z: 0 } },
  { direction: 'west', offset: { x: -1, y: 0, z: 0 } },
  { direction: 'up', offset: { x: 0, y: 1, z: 0 } },
  { direction: 'down', offset: { x: 0, y: -1, z: 0 } },
  { direction: 'south', offset: { x: 0, y: 0, z: 1 } },
  { direction: 'north', offset: { x: 0, y: 0, z: -1 } },
];

export function exposedFaceDirections(
  entry: ExposedFaceEntry,
  visible: ReadonlyMap<string, ExposedFaceEntry>,
): readonly SurfaceFaceDirection[] {
  if (!isConfirmedOpaqueFullCube(entry)) return [];
  return DIRECTIONS.filter(({ offset }) => {
    const neighborPosition = {
      x: entry.block.position.x + offset.x,
      y: entry.block.position.y + offset.y,
      z: entry.block.position.z + offset.z,
    };
    const neighbor = visible.get(coordinateKey(neighborPosition));
    return !neighbor || !isConfirmedOpaqueFullCube(neighbor);
  }).map(({ direction }) => direction);
}

export function exposedFaceCount(entries: readonly ExposedFaceEntry[]): number {
  const visible = new Map(
    entries.map((entry) => [coordinateKey(entry.block.position), entry] as const),
  );
  return entries.reduce((count, entry) => count + exposedFaceDirections(entry, visible).length, 0);
}

export function neighborFacesCulled(entries: readonly ExposedFaceEntry[]): number {
  const visible = new Map(
    entries.map((entry) => [coordinateKey(entry.block.position), entry] as const),
  );
  return entries.reduce(
    (count, entry) =>
      count +
      (isConfirmedOpaqueFullCube(entry) ? 6 - exposedFaceDirections(entry, visible).length : 0),
    0,
  );
}

export function surfaceFaceDirections(): readonly SurfaceFaceDirection[] {
  return DIRECTIONS.map(({ direction }) => direction);
}
