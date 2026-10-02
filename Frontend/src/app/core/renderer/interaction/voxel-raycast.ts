import type { VoxelCoordinate } from '../../domain/project.types';

export interface VoxelRayVector { readonly x: number; readonly y: number; readonly z: number; }
export interface VoxelRay { readonly origin: VoxelRayVector; readonly direction: VoxelRayVector; }
export interface VoxelGridSize { readonly x: number; readonly y: number; readonly z: number; }
export type VoxelFaceDirection = 'north' | 'east' | 'south' | 'west' | 'up' | 'down';
export interface VoxelRaycastHit {
  readonly position: VoxelCoordinate;
  readonly normal: VoxelRayVector;
  readonly direction: VoxelFaceDirection;
  readonly point: VoxelRayVector;
  readonly distance: number;
  readonly visitedVoxels: number;
}
export interface VoxelRaycastCandidate {
  readonly position: VoxelCoordinate;
  readonly normal: VoxelRayVector;
  readonly direction: VoxelFaceDirection;
  readonly point: VoxelRayVector;
  readonly distance: number;
}
export interface VoxelRaycastCandidates {
  readonly candidates: readonly VoxelRaycastCandidate[];
  readonly fullCubeHit?: VoxelRaycastHit;
  readonly visitedVoxels: number;
}
export type VoxelCellDecision = 'hit' | 'skip' | 'fallback';

const EPSILON = 1e-8;

/**
 * Conservative Amanatides-Woo traversal through a unit voxel grid.
 * The caller decides whether a visited cell is a full cube, hidden, or a
 * shape that must fall back to the precise scene raycast.
 */
export function ddaVoxelPick(
  ray: VoxelRay,
  size: VoxelGridSize,
  decide: (position: VoxelCoordinate) => VoxelCellDecision,
): VoxelRaycastHit | { readonly fallback: true; readonly visitedVoxels: number } | undefined {
  const bounds = rayBoxIntersection(ray, size);
  if (!bounds) return undefined;
  const startDistance = Math.max(0, bounds.near);
  const start = pointAt(ray, startDistance + EPSILON);
  let cell: VoxelCoordinate = { x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z) };
  cell = { x: clamp(cell.x, 0, size.x - 1), y: clamp(cell.y, 0, size.y - 1), z: clamp(cell.z, 0, size.z - 1) };
  const step = { x: sign(ray.direction.x), y: sign(ray.direction.y), z: sign(ray.direction.z) };
  const delta = { x: reciprocalAbs(ray.direction.x), y: reciprocalAbs(ray.direction.y), z: reciprocalAbs(ray.direction.z) };
  const next = {
    x: nextBoundary(cell.x, step.x, ray.direction.x),
    y: nextBoundary(cell.y, step.y, ray.direction.y),
    z: nextBoundary(cell.z, step.z, ray.direction.z),
  };
  const tMax = {
    x: finiteOrInfinity((next.x - ray.origin.x) / ray.direction.x),
    y: finiteOrInfinity((next.y - ray.origin.y) / ray.direction.y),
    z: finiteOrInfinity((next.z - ray.origin.z) / ray.direction.z),
  };
  let distance = startDistance;
  let entryNormal: VoxelRayVector = { x: 0, y: 0, z: 0 };
  let visitedVoxels = 0;
  const maxSteps = Math.max(1, size.x * size.y * size.z + 1);
  for (let steps = 0; steps < maxSteps; steps += 1) {
    if (!inBounds(cell, size)) break;
    visitedVoxels += 1;
    const decision = decide(cell);
    if (decision === 'fallback') return { fallback: true, visitedVoxels };
    if (decision === 'hit') {
      const point = pointAt(ray, distance);
      return { position: { ...cell }, normal: entryNormal, direction: faceDirection(entryNormal), point, distance, visitedVoxels };
    }
    const axis = smallestAxis(tMax);
    distance = tMax[axis];
    tMax[axis] += delta[axis];
    cell = { ...cell, [axis]: cell[axis] + step[axis] };
    entryNormal = axisNormal(axis, step[axis]);
  }
  return undefined;
}

/**
 * Traverses in distance order while retaining a small number of non-cube
 * candidates for a precise, candidate-scoped raycast. This keeps partial
 * geometry out of the global blocksGroup raycast path.
 */
export function ddaVoxelCandidates(
  ray: VoxelRay,
  size: VoxelGridSize,
  decide: (position: VoxelCoordinate) => VoxelCellDecision,
  maxCandidates = 8,
): VoxelRaycastCandidates | undefined {
  const bounds = rayBoxIntersection(ray, size);
  if (!bounds) return undefined;
  const startDistance = Math.max(0, bounds.near);
  const start = pointAt(ray, startDistance + EPSILON);
  let cell: VoxelCoordinate = { x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z) };
  cell = { x: clamp(cell.x, 0, size.x - 1), y: clamp(cell.y, 0, size.y - 1), z: clamp(cell.z, 0, size.z - 1) };
  const step = { x: sign(ray.direction.x), y: sign(ray.direction.y), z: sign(ray.direction.z) };
  const delta = { x: reciprocalAbs(ray.direction.x), y: reciprocalAbs(ray.direction.y), z: reciprocalAbs(ray.direction.z) };
  const next = {
    x: nextBoundary(cell.x, step.x, ray.direction.x),
    y: nextBoundary(cell.y, step.y, ray.direction.y),
    z: nextBoundary(cell.z, step.z, ray.direction.z),
  };
  const tMax = {
    x: finiteOrInfinity((next.x - ray.origin.x) / ray.direction.x),
    y: finiteOrInfinity((next.y - ray.origin.y) / ray.direction.y),
    z: finiteOrInfinity((next.z - ray.origin.z) / ray.direction.z),
  };
  let distance = startDistance;
  let entryNormal: VoxelRayVector = { x: 0, y: 0, z: 0 };
  let visitedVoxels = 0;
  const candidates: VoxelRaycastCandidate[] = [];
  const maxSteps = Math.max(1, size.x * size.y * size.z + 1);
  for (let steps = 0; steps < maxSteps; steps += 1) {
    if (!inBounds(cell, size)) break;
    visitedVoxels += 1;
    const decision = decide(cell);
    const point = pointAt(ray, distance);
    if (decision === 'fallback') {
      if (candidates.length < maxCandidates) candidates.push({ position: { ...cell }, normal: entryNormal, direction: faceDirection(entryNormal), point, distance });
    } else if (decision === 'hit') {
      return { candidates, fullCubeHit: { position: { ...cell }, normal: entryNormal, direction: faceDirection(entryNormal), point, distance, visitedVoxels }, visitedVoxels };
    }
    const axis = smallestAxis(tMax);
    distance = tMax[axis];
    tMax[axis] += delta[axis];
    cell = { ...cell, [axis]: cell[axis] + step[axis] };
    entryNormal = axisNormal(axis, step[axis]);
  }
  return { candidates, visitedVoxels };
}

function rayBoxIntersection(ray: VoxelRay, size: VoxelGridSize): { readonly near: number; readonly far: number } | undefined {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = ray.origin[axis];
    const direction = ray.direction[axis];
    const extent = size[axis];
    if (Math.abs(direction) < EPSILON) {
      if (origin < 0 || origin > extent) return undefined;
      continue;
    }
    const a = (0 - origin) / direction;
    const b = (extent - origin) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (far < near) return undefined;
  }
  return far >= 0 ? { near: Math.max(0, near), far } : undefined;
}

function pointAt(ray: VoxelRay, distance: number): VoxelRayVector { return { x: ray.origin.x + ray.direction.x * distance, y: ray.origin.y + ray.direction.y * distance, z: ray.origin.z + ray.direction.z * distance }; }
function sign(value: number): -1 | 0 | 1 { return value < -EPSILON ? -1 : value > EPSILON ? 1 : 0; }
function reciprocalAbs(value: number): number { return Math.abs(value) < EPSILON ? Number.POSITIVE_INFINITY : 1 / Math.abs(value); }
function nextBoundary(cell: number, step: number, direction: number): number { return direction >= 0 ? cell + 1 : cell; }
function finiteOrInfinity(value: number): number { return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function smallestAxis(values: { readonly x: number; readonly y: number; readonly z: number }): 'x' | 'y' | 'z' { return values.x <= values.y && values.x <= values.z ? 'x' : values.y <= values.z ? 'y' : 'z'; }
function axisNormal(axis: 'x' | 'y' | 'z', step: number): VoxelRayVector { return axis === 'x' ? { x: -step, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: -step, z: 0 } : { x: 0, y: 0, z: -step }; }
function faceDirection(normal: VoxelRayVector): VoxelFaceDirection {
  if (normal.x > 0) return 'east';
  if (normal.x < 0) return 'west';
  if (normal.y > 0) return 'up';
  if (normal.y < 0) return 'down';
  if (normal.z > 0) return 'south';
  return 'north';
}
function inBounds(position: VoxelCoordinate, size: VoxelGridSize): boolean { return position.x >= 0 && position.y >= 0 && position.z >= 0 && position.x < size.x && position.y < size.y && position.z < size.z; }
