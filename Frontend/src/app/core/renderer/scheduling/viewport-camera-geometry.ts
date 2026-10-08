import * as THREE from 'three';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import type { CameraPreset, CameraVector } from '../../editor/camera/camera';

export function cameraMovementDirection(keys: ReadonlySet<string>, camera: THREE.Camera): THREE.Vector3 {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  forward.y = 0;
  if (forward.lengthSq() === 0) return new THREE.Vector3();
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward);
  if (keys.has('KeyS')) direction.sub(forward);
  if (keys.has('KeyD')) direction.add(right);
  if (keys.has('KeyA')) direction.sub(right);
  if (keys.has('Space')) direction.y += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) direction.y -= 1;
  return direction;
}

export function cameraActionMovementDelta(actions: ReadonlySet<MovementAction>, camera: THREE.Camera, translationSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const direction = new THREE.Vector3();
  const horizontal = new Set<string>();
  if (actions.has('move-forward')) horizontal.add('KeyW');
  if (actions.has('move-backward')) horizontal.add('KeyS');
  if (actions.has('move-left')) horizontal.add('KeyA');
  if (actions.has('move-right')) horizontal.add('KeyD');
  const horizontalDirection = cameraMovementDirection(horizontal, camera);
  if (horizontalDirection.lengthSq()) direction.add(horizontalDirection.normalize().multiplyScalar(deltaSeconds * translationSpeed));
  if (actions.has('move-up')) direction.y += deltaSeconds * translationSpeed;
  if (actions.has('move-down')) direction.y -= deltaSeconds * translationSpeed;
  return direction;
}

export function cameraMovementDelta(keys: ReadonlySet<string>, camera: THREE.Camera, translationSpeed: number, _legacyVerticalSpeed: number, deltaSeconds: number): THREE.Vector3 {
  const horizontalKeys = new Set([...keys].filter((key) => key === 'KeyW' || key === 'KeyA' || key === 'KeyS' || key === 'KeyD'));
  const direction = cameraMovementDirection(horizontalKeys, camera);
  if (direction.lengthSq()) direction.normalize().multiplyScalar(deltaSeconds * translationSpeed);
  direction.y += ((keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)) * deltaSeconds * translationSpeed;
  return direction;
}

export function vectorValue(vector: THREE.Vector3): CameraVector { return { x: vector.x, y: vector.y, z: vector.z }; }
export function perspectiveDirection(): THREE.Vector3 { return new THREE.Vector3(1, .75, 1).normalize(); }
export function presetDirection(preset: CameraPreset): THREE.Vector3 {
  switch (preset) {
    case 'top': return new THREE.Vector3(0, 1, 0);
    case 'front': return new THREE.Vector3(0, 0, 1);
    case 'back': return new THREE.Vector3(0, 0, -1);
    case 'left': return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(1, 0, 0);
    case 'perspective': return perspectiveDirection();
  }
}
