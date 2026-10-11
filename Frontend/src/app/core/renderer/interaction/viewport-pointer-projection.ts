import * as THREE from 'three';

export interface PointerProjectionSurface {
  readonly getBoundingClientRect: () => DOMRect;
}

export function projectPointerToAxisPlane(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  surface: PointerProjectionSurface,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  axis: 'x' | 'y' | 'z',
  coordinate: number,
): { readonly x: number; readonly y: number; readonly z: number } | undefined {
  const normal = { x: 0, y: 0, z: 0 };
  normal[axis] = 1;
  const point = { x: 0, y: 0, z: 0 };
  point[axis] = coordinate;
  return projectPointerToWorldPlane(event, surface, camera, raycaster, point, normal);
}

export function projectPointerToWorldPlane(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  surface: PointerProjectionSurface,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  point: { readonly x: number; readonly y: number; readonly z: number },
  normal: { readonly x: number; readonly y: number; readonly z: number },
): { readonly x: number; readonly y: number; readonly z: number } | undefined {
  const rect = surface.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(normal.x, normal.y, normal.z),
    new THREE.Vector3(point.x, point.y, point.z),
  );
  const intersection = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  return intersection ? { x: intersection.x, y: intersection.y, z: intersection.z } : undefined;
}
