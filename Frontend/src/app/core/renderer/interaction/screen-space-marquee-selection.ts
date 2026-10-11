import * as THREE from 'three';
import type { ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import type { IndexedVoxelSelectionQuery, VoxelBox } from '../../editor/selection/selection';

export interface ScreenPointerPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScreenViewportBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenSpaceMarqueeRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenSpaceMarqueeQuery extends IndexedVoxelSelectionQuery {
  readonly rect: ScreenSpaceMarqueeRect;
}

/** Normalizes a drag rectangle in viewport-local CSS pixels and clips it to the viewport. */
export function screenSpaceMarqueeRect(
  start: ScreenPointerPosition,
  end: ScreenPointerPosition,
  viewport: ScreenViewportBounds,
): ScreenSpaceMarqueeRect | undefined {
  if (viewport.width <= 0 || viewport.height <= 0) return undefined;
  const startX = clamp(start.x - viewport.left, 0, viewport.width);
  const startY = clamp(start.y - viewport.top, 0, viewport.height);
  const endX = clamp(end.x - viewport.left, 0, viewport.width);
  const endY = clamp(end.y - viewport.top, 0, viewport.height);
  const horizontal = normalizedAxis(startX, endX, viewport.width);
  const vertical = normalizedAxis(startY, endY, viewport.height);
  return {
    left: horizontal.start,
    top: vertical.start,
    width: horizontal.length,
    height: vertical.length,
  };
}

/**
 * Builds the 3D frustum represented by a screen rectangle. A marquee selects every
 * voxel cell intersecting that frustum, including cells occluded by nearer blocks;
 * group visibility and isolation are applied later by SelectionService.
 */
export function createScreenSpaceMarqueeQuery(
  camera: THREE.PerspectiveCamera,
  viewport: { readonly width: number; readonly height: number },
  rect: ScreenSpaceMarqueeRect,
  projectSize: ProjectSize,
): ScreenSpaceMarqueeQuery | undefined {
  if (viewport.width <= 0 || viewport.height <= 0 || rect.width <= 0 || rect.height <= 0)
    return undefined;

  const marqueeCamera = camera.clone();
  marqueeCamera.clearViewOffset();
  marqueeCamera.setViewOffset(
    viewport.width,
    viewport.height,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
  );
  marqueeCamera.updateMatrixWorld(true);

  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    marqueeCamera.projectionMatrix,
    marqueeCamera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection);
  const marqueeBounds = frustumWorldBounds(marqueeCamera);
  const projectBounds = new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(projectSize.x, projectSize.y, projectSize.z),
  );
  if (!marqueeBounds.intersectsBox(projectBounds)) return undefined;
  marqueeBounds.intersect(projectBounds);

  const candidateBounds = voxelBoundsForWorldBounds(marqueeBounds, projectSize);
  if (!candidateBounds) return undefined;
  const voxelBounds = new THREE.Box3();
  return {
    rect,
    candidateBounds,
    intersectsVoxel(position: VoxelCoordinate): boolean {
      voxelBounds.min.set(position.x, position.y, position.z);
      voxelBounds.max.set(position.x + 1, position.y + 1, position.z + 1);
      return frustum.intersectsBox(voxelBounds);
    },
  };
}

function frustumWorldBounds(camera: THREE.PerspectiveCamera): THREE.Box3 {
  const corners: THREE.Vector3[] = [];
  for (const depth of [-1, 1])
    for (const y of [-1, 1])
      for (const x of [-1, 1]) corners.push(new THREE.Vector3(x, y, depth).unproject(camera));
  return new THREE.Box3().setFromPoints(corners);
}

function voxelBoundsForWorldBounds(bounds: THREE.Box3, size: ProjectSize): VoxelBox | undefined {
  const min = {
    x: Math.max(0, Math.ceil(bounds.min.x) - 1),
    y: Math.max(0, Math.ceil(bounds.min.y) - 1),
    z: Math.max(0, Math.ceil(bounds.min.z) - 1),
  };
  const max = {
    x: Math.min(size.x - 1, Math.floor(bounds.max.x)),
    y: Math.min(size.y - 1, Math.floor(bounds.max.y)),
    z: Math.min(size.z - 1, Math.floor(bounds.max.z)),
  };
  return min.x <= max.x && min.y <= max.y && min.z <= max.z ? { min, max } : undefined;
}

function normalizedAxis(
  start: number,
  end: number,
  limit: number,
): { start: number; length: number } {
  const minimum = Math.min(start, end);
  const maximum = Math.max(start, end);
  if (maximum - minimum >= 1) return { start: minimum, length: maximum - minimum };
  return { start: clamp(minimum - 0.5, 0, limit - 1), length: 1 };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
