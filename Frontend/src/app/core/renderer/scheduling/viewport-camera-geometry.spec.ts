import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { effectiveCameraMovementSpeed } from './camera-movement-speed';
import { cameraMovementDelta, cameraMovementDirection } from './viewport-camera-geometry';
import { rendererBenchmarkProject } from '../benchmark/renderer-benchmark-fixtures';

describe('viewport camera geometry', () => {
  const camera = new THREE.PerspectiveCamera();
  beforeEach(() => {
    camera.position.set(0, 2, 4);
    camera.lookAt(0, 2, 0);
  });

  it('uses the camera plane for WASD and world vertical for Space/Shift', () => {
    expect(cameraMovementDirection(new Set(['KeyW']), camera).z).toBeLessThan(0);
    expect(cameraMovementDirection(new Set(['Space']), camera)).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(cameraMovementDirection(new Set(['ShiftLeft']), camera)).toMatchObject({
      x: 0,
      y: -1,
      z: 0,
    });
    const combined = cameraMovementDirection(new Set(['KeyW', 'Space']), camera);
    expect(combined.y).toBe(1);
    expect(combined.z).toBeLessThan(0);
  });

  it('uses the same translation speed for horizontal and vertical movement', () => {
    const horizontal = cameraMovementDelta(new Set(['KeyW']), camera, 12, 3, 1);
    const vertical = cameraMovementDelta(new Set(['Space']), camera, 12, 3, 1);
    const combined = cameraMovementDelta(new Set(['KeyW', 'Space']), camera, 12, 3, 1);
    expect(horizontal.length()).toBeCloseTo(12);
    expect(vertical.y).toBe(12);
    expect(combined.y).toBe(12);
    expect(combined.z).toBeCloseTo(horizontal.z);
  });

  it('keeps vertical movement aligned with adaptive horizontal speed', () => {
    for (const distance of [8, 16, 40]) {
      const speed = effectiveCameraMovementSpeed(15, distance);
      const horizontal = cameraMovementDelta(new Set(['KeyD']), camera, speed, 1, 1);
      const vertical = cameraMovementDelta(new Set(['Space']), camera, speed, 1, 1);
      expect(vertical.length() / horizontal.length()).toBeCloseTo(1);
    }
  });

  it('does not mutate the project while resolving camera movement', () => {
    const project = rendererBenchmarkProject('small');
    const before = JSON.stringify(project);
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD'])
      cameraMovementDelta(new Set([key]), camera, 9, 9, 1);
    expect(JSON.stringify(project)).toBe(before);
  });
});
