import { isWithinBounds } from '../../domain/coordinates';
import { ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import type { FaceNormal } from '../placement/placement';

export interface VoxelBox { readonly min: VoxelCoordinate; readonly max: VoxelCoordinate; }

export type FaceLockedPlaneAxis = 'x' | 'y' | 'z';
export interface FaceLockedSelectionPlane {
  readonly axis: FaceLockedPlaneAxis;
  readonly coordinate: number;
  readonly normal: FaceNormal;
}

/** Returns the voxel face plane that was touched when a selection drag began. */
export function faceLockedSelectionPlane(start: VoxelCoordinate, normal: FaceNormal): FaceLockedSelectionPlane | undefined {
  const axis = Math.abs(normal.x) >= .5 ? 'x' : Math.abs(normal.y) >= .5 ? 'y' : Math.abs(normal.z) >= .5 ? 'z' : undefined;
  if (!axis) return undefined;
  const direction = Math.sign(normal[axis]);
  if (!direction) return undefined;
  return { axis, coordinate: start[axis] + (direction > 0 ? 1 : 0), normal: { x: Math.sign(normal.x), y: Math.sign(normal.y), z: Math.sign(normal.z) } };
}

/** Converts a ray intersection on a locked face plane into an integer voxel on that plane. */
export function voxelOnFaceLockedPlane(point: { readonly x: number; readonly y: number; readonly z: number }, plane: FaceLockedSelectionPlane): VoxelCoordinate {
  const position = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
  position[plane.axis] = Math.floor(plane.coordinate - (plane.normal[plane.axis] > 0 ? 1 : 0));
  return position;
}

/** Returns visible, exposed blocks inside a face-locked rectangle. Hidden blocks never become drag seeds. */
export function exposedSurfaceSelectionSeeds<T extends { readonly position: VoxelCoordinate }>(blocks: readonly T[], box: VoxelBox, normal: FaceNormal, isVisible: (block: T) => boolean = () => true): readonly T[] {
  const visible = blocks.filter(isVisible);
  const occupied = new Set(visible.map((block) => coordinateKey(block.position)));
  return visible.filter((block) => voxelInBox(block.position, box) && !occupied.has(coordinateKey({ x: block.position.x + Math.sign(normal.x), y: block.position.y + Math.sign(normal.y), z: block.position.z + Math.sign(normal.z) })));
}

export function normalizeVoxelBox(a: VoxelCoordinate, b: VoxelCoordinate): VoxelBox {
  return { min: { x: Math.min(Math.trunc(a.x), Math.trunc(b.x)), y: Math.min(Math.trunc(a.y), Math.trunc(b.y)), z: Math.min(Math.trunc(a.z), Math.trunc(b.z)) }, max: { x: Math.max(Math.trunc(a.x), Math.trunc(b.x)), y: Math.max(Math.trunc(a.y), Math.trunc(b.y)), z: Math.max(Math.trunc(a.z), Math.trunc(b.z)) } };
}

export function clampVoxelBox(box: VoxelBox, size: ProjectSize): VoxelBox | undefined {
  const min = { x: Math.max(0, box.min.x), y: Math.max(0, box.min.y), z: Math.max(0, box.min.z) };
  const max = { x: Math.min(size.x - 1, box.max.x), y: Math.min(size.y - 1, box.max.y), z: Math.min(size.z - 1, box.max.z) };
  return min.x <= max.x && min.y <= max.y && min.z <= max.z && isWithinBounds(min, size) && isWithinBounds(max, size) ? { min, max } : undefined;
}

export function voxelBoxSize(box: VoxelBox): VoxelCoordinate { return { x: box.max.x - box.min.x + 1, y: box.max.y - box.min.y + 1, z: box.max.z - box.min.z + 1 }; }
export function voxelInBox(position: VoxelCoordinate, box: VoxelBox): boolean { return position.x >= box.min.x && position.x <= box.max.x && position.y >= box.min.y && position.y <= box.max.y && position.z >= box.min.z && position.z <= box.max.z; }
function coordinateKey(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }
