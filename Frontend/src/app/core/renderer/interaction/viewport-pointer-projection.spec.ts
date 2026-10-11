import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  projectPointerToAxisPlane,
  projectPointerToWorldPlane,
} from './viewport-pointer-projection';
import { freeSpaceSelectionBox, freeSpaceSelectionPlane } from '../../editor/selection/selection';

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

  it.each([
    ['north', { x: 0, y: 0, z: -1 }],
    ['south', { x: 0, y: 0, z: 1 }],
    ['east', { x: 1, y: 0, z: 0 }],
    ['west', { x: -1, y: 0, z: 0 }],
    ['above', { x: 0, y: -1, z: 0 }],
    ['below', { x: 0, y: 1, z: 0 }],
  ])('projects free-space drag rays in front of the camera from %s', (_name, offset) => {
    const target = new THREE.Vector3(8, 6, 4);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position
      .copy(target)
      .add(new THREE.Vector3(offset.x, offset.y, offset.z).multiplyScalar(20));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const plane = freeSpaceSelectionPlane({ x: 16, y: 12, z: 8 }, direction, {
      x: target.x,
      y: target.y,
      z: target.z,
    });
    const raycaster = new THREE.Raycaster();
    const surface = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as HTMLElement;

    for (const [clientX, clientY] of [
      [2, 2],
      [98, 98],
    ]) {
      const point = projectPointerToWorldPlane(
        { clientX, clientY } as PointerEvent,
        surface,
        camera,
        raycaster,
        plane.point,
        plane.normal,
      );
      expect(point, `${_name} ${clientX},${clientY}`).toBeDefined();
      const rayDirection = raycaster.ray.direction;
      expect(
        new THREE.Vector3(point!.x, point!.y, point!.z).sub(raycaster.ray.origin).dot(rayDirection),
      ).toBeGreaterThan(0);
    }
  });

  it.each([
    ['octant +++', { x: 1, y: 1, z: 1 }],
    ['octant ++-', { x: 1, y: 1, z: -1 }],
    ['octant +-+', { x: 1, y: -1, z: 1 }],
    ['octant +--', { x: 1, y: -1, z: -1 }],
    ['octant -++', { x: -1, y: 1, z: 1 }],
    ['octant -+-', { x: -1, y: 1, z: -1 }],
    ['octant --+', { x: -1, y: -1, z: 1 }],
    ['octant ---', { x: -1, y: -1, z: -1 }],
  ])('turns blank-space drag rays into bounded regions from %s', (_name, offset) => {
    const size = { x: 16, y: 12, z: 8 };
    const target = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position
      .copy(target)
      .add(new THREE.Vector3(offset.x, offset.y, offset.z).multiplyScalar(20));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const plane = freeSpaceSelectionPlane(size, direction, {
      x: target.x,
      y: target.y,
      z: target.z,
    });
    const raycaster = new THREE.Raycaster();
    const surface = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as HTMLElement;
    const project = (clientX: number, clientY: number) =>
      projectPointerToWorldPlane(
        { clientX, clientY } as PointerEvent,
        surface,
        camera,
        raycaster,
        plane.point,
        plane.normal,
      );
    const start = project(40, 40);
    const end = project(60, 60);

    expect(start).toBeDefined();
    expect(end).toBeDefined();
    const box = freeSpaceSelectionBox(start!, end!, size);
    expect(box).toBeDefined();
    expect(box!.min.x).toBeGreaterThanOrEqual(0);
    expect(box!.min.y).toBeGreaterThanOrEqual(0);
    expect(box!.min.z).toBeGreaterThanOrEqual(0);
    expect(box!.max.x).toBeLessThan(size.x);
    expect(box!.max.y).toBeLessThan(size.y);
    expect(box!.max.z).toBeLessThan(size.z);
    const coordinates = [start!, end!];
    const expectedMinimum = {
      x: Math.max(0, Math.min(...coordinates.map(({ x }) => Math.floor(x)))),
      y: Math.max(0, Math.min(...coordinates.map(({ y }) => Math.floor(y)))),
      z: Math.max(0, Math.min(...coordinates.map(({ z }) => Math.floor(z)))),
    };
    const expectedMaximum = {
      x: Math.min(size.x - 1, Math.max(...coordinates.map(({ x }) => Math.floor(x)))),
      y: Math.min(size.y - 1, Math.max(...coordinates.map(({ y }) => Math.floor(y)))),
      z: Math.min(size.z - 1, Math.max(...coordinates.map(({ z }) => Math.floor(z)))),
    };
    expect(box).toEqual({ min: expectedMinimum, max: expectedMaximum });
  });
});
