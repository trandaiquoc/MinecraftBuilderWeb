import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ProjectSize } from '../../domain/project.types';
import {
  createScreenSpaceMarqueeQuery,
  screenSpaceMarqueeRect,
} from './screen-space-marquee-selection';

describe('screen-space marquee selection geometry', () => {
  it('normalizes reverse drags and clips pointer positions outside the viewport', () => {
    expect(
      screenSpaceMarqueeRect(
        { x: 140, y: 90 },
        { x: -20, y: 140 },
        { left: 0, top: 0, width: 120, height: 100 },
      ),
    ).toEqual({ left: 0, top: 90, width: 120, height: 10 });
  });

  it('keeps horizontal and vertical drags selectable with a one-pixel screen area', () => {
    expect(
      screenSpaceMarqueeRect(
        { x: 50, y: 50 },
        { x: 90, y: 50 },
        { left: 0, top: 0, width: 100, height: 100 },
      ),
    ).toEqual({ left: 50, top: 49.5, width: 40, height: 1 });
  });

  it('selects overlapping projected voxels across depth from a top-down view and offset target', () => {
    const size = { x: 16, y: 32, z: 16 };
    const camera = topDownCamera(size);
    const viewport = { width: 400, height: 400 };
    const center = projectVoxel(camera, { x: 8, y: 0, z: 8 }, viewport);
    const rect = screenSpaceMarqueeRect(
      { x: center.x - 15, y: center.y - 15 },
      { x: center.x + 15, y: center.y + 15 },
      { left: 0, top: 0, ...viewport },
    )!;
    const query = createScreenSpaceMarqueeQuery(camera, viewport, rect, size)!;

    expect(query.intersectsVoxel({ x: 8, y: 0, z: 8 })).toBe(true);
    expect(query.intersectsVoxel({ x: 8, y: 28, z: 8 })).toBe(true);
    expect(query.intersectsVoxel({ x: 0, y: 28, z: 0 })).toBe(false);
    expect(query.candidateBounds.min.y).toBeLessThanOrEqual(0);
    expect(query.candidateBounds.max.y).toBeGreaterThanOrEqual(28);
  });

  it('uses the projected screen region for an oblique perspective camera', () => {
    const size = { x: 24, y: 24, z: 24 };
    const camera = new THREE.PerspectiveCamera(42, 1.25, 0.1, 500);
    camera.position.set(35, 31, 42);
    camera.lookAt(7, 17, 9);
    camera.updateMatrixWorld(true);
    const viewport = { width: 500, height: 400 };
    const targetBlock = { x: 6, y: 14, z: 8 };
    const center = projectVoxel(camera, targetBlock, viewport);
    const rect = screenSpaceMarqueeRect(
      { x: center.x - 12, y: center.y - 12 },
      { x: center.x + 12, y: center.y + 12 },
      { left: 0, top: 0, ...viewport },
    )!;
    const query = createScreenSpaceMarqueeQuery(camera, viewport, rect, size)!;

    expect(query.intersectsVoxel(targetBlock)).toBe(true);
    expect(query.intersectsVoxel({ x: 0, y: 0, z: 23 })).toBe(false);
  });

  it('returns no query when the marquee frustum misses the project', () => {
    const size = { x: 8, y: 8, z: 8 };
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(100, 100, 100);
    camera.lookAt(110, 100, 100);
    camera.updateMatrixWorld(true);
    const viewport = { width: 100, height: 100 };
    const rect = { left: 45, top: 45, width: 10, height: 10 };

    expect(createScreenSpaceMarqueeQuery(camera, viewport, rect, size)).toBeUndefined();
  });
});

function topDownCamera(size: ProjectSize): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(size.x / 2, size.y + 32, size.z / 2);
  camera.up.set(0, 0, -1);
  camera.lookAt(size.x / 2, size.y / 2 + 8, size.z / 2);
  camera.updateMatrixWorld(true);
  return camera;
}

function projectVoxel(
  camera: THREE.PerspectiveCamera,
  position: { readonly x: number; readonly y: number; readonly z: number },
  viewport: { readonly width: number; readonly height: number },
): { x: number; y: number } {
  const point = new THREE.Vector3(position.x + 0.5, position.y + 0.5, position.z + 0.5);
  point.project(camera);
  return {
    x: ((point.x + 1) / 2) * viewport.width,
    y: ((1 - point.y) / 2) * viewport.height,
  };
}
