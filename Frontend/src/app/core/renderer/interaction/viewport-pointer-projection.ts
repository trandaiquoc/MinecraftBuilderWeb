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
  const rect = surface.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const origin = raycaster.ray.origin;
  const direction = raycaster.ray.direction;
  const component = direction[axis];
  if (Math.abs(component) < 1e-8) return undefined;
  const distance = (coordinate - origin[axis]) / component;
  if (distance < 0) return undefined;
  const point = raycaster.ray.at(distance, new THREE.Vector3());
  return { x: point.x, y: point.y, z: point.z };
}
