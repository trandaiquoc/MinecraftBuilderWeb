import type { PlacementContext } from '../../editor/placement/placement';
import type { ReadonlyBlockLookup } from '../../domain/project-block-spatial-index';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';

export const horizontalDirections = [
  ['north', { x: 0, y: 0, z: -1 }], ['east', { x: 1, y: 0, z: 0 }],
  ['south', { x: 0, y: 0, z: 1 }], ['west', { x: -1, y: 0, z: 0 }],
] as const;

export const sixOffsets: readonly VoxelCoordinate[] = [...horizontalDirections.map((entry) => entry[1]), { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];

export function add(a: VoxelCoordinate, b: VoxelCoordinate): VoxelCoordinate { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

export function find(blocks: readonly PlacedBlock[] | ReadonlyBlockLookup, position: VoxelCoordinate): PlacedBlock | undefined {
  return 'get' in blocks ? blocks.get(position) : blocks.find((block) => coordinateKey(block.position) === coordinateKey(position));
}

export function directionOffset(direction: string): VoxelCoordinate {
  return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 };
}

export function directionFromNormal(normal: { readonly x: number; readonly z: number }): 'north' | 'east' | 'south' | 'west' | undefined {
  if (normal.x > 0) return 'east';
  if (normal.x < 0) return 'west';
  if (normal.z > 0) return 'south';
  if (normal.z < 0) return 'north';
  return undefined;
}

export function directionFromSixFaceNormal(normal: { readonly x: number; readonly y: number; readonly z: number }): 'north' | 'east' | 'south' | 'west' | 'up' | 'down' | undefined {
  if (normal.x > 0) return 'east';
  if (normal.x < 0) return 'west';
  if (normal.y > 0) return 'up';
  if (normal.y < 0) return 'down';
  if (normal.z > 0) return 'south';
  if (normal.z < 0) return 'north';
  return undefined;
}

export function sixFaceDirectionOffset(direction: string): VoxelCoordinate {
  return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 };
}

export function oppositeSixFace(direction: string): 'north' | 'east' | 'south' | 'west' | 'up' | 'down' {
  return ({ north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' } as const)[direction as 'north' | 'east' | 'south' | 'west' | 'up' | 'down'] ?? 'down';
}

export function opposite(direction: string): string { return ({ north: 'south', south: 'north', east: 'west', west: 'east' } as Record<string, string>)[direction] ?? direction; }
export function clockwise(direction: string): string { return ({ north: 'east', east: 'south', south: 'west', west: 'north' } as Record<string, string>)[direction] ?? direction; }
export function counterClockwise(direction: string): string { return ({ north: 'west', west: 'south', south: 'east', east: 'north' } as Record<string, string>)[direction] ?? direction; }

export function stairHalfFromContext(context: PlacementContext | undefined, fallback: string): string {
  if (!context?.faceNormal) return fallback;
  if (context.faceNormal.y < 0) return 'top';
  if (context.faceNormal.y > 0) return 'bottom';
  if (!context.hitPoint) return fallback;
  const localY = context.hitPoint.y - Math.floor(context.hitPoint.y);
  return localY > 0.5 ? 'top' : 'bottom';
}

function coordinateKey(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }
