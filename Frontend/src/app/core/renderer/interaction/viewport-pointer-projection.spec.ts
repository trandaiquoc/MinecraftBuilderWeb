import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectPointerToAxisPlane } from './viewport-pointer-projection';

describe('projectPointerToAxisPlane', () => {
  it('projects the pointer ray onto the requested fixed axis plane', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    const surface = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as HTMLElement;
    const point = projectPointerToAxisPlane(
      { clientX: 50, clientY: 50 } as PointerEvent,
      surface,
      camera,
      raycaster,
      'y',
      0,
    );
    expect(point).toBeDefined();
    expect(point?.y).toBeCloseTo(0);
  });

  it('returns undefined when the ray is parallel to the selected plane', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    const surface = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as HTMLElement;
    const point = projectPointerToAxisPlane(
      { clientX: 50, clientY: 50 } as PointerEvent,
      surface,
      camera,
      raycaster,
      'x',
      1,
    );
    expect(point).toBeUndefined();
  });
});
