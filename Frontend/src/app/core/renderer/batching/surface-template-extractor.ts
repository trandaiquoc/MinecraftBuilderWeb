import * as THREE from 'three';
import type { SurfaceFaceTemplate } from './surface-face-batch-renderer';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';

export function extractSurfaceFaceTemplates(object: THREE.Object3D): readonly SurfaceFaceTemplate[] | undefined {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const templates = new Map<SurfaceFaceDirection, SurfaceFaceTemplate>();
  let valid = true;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !valid) return;
    const face = child.userData['face'];
    const cullface = child.userData['cullface'];
    const direction = (typeof cullface === 'string' ? cullface : face) as SurfaceFaceDirection;
    if (!['north', 'south', 'east', 'west', 'up', 'down'].includes(direction) || typeof face === 'string' && typeof cullface === 'string' && face !== cullface || templates.has(direction)) { valid = false; return; }
    if (Array.isArray(child.material) || child.material.transparent || child.material.depthWrite === false || child.morphTargetInfluences || child.type === 'SkinnedMesh') { valid = false; return; }
    const matrix = rootInverse.clone().multiply(child.matrixWorld);
    const geometry = child.geometry.clone().applyMatrix4(matrix);
    const canonicalTransform = canonicalizeSurfaceFaceGeometry(geometry, direction);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData['surfaceOwnedGeometry'] = true;
    templates.set(direction, { geometry, material: child.material.clone(), direction, matrix: canonicalTransform.clone().invert() });
  });
  if (!valid || templates.size !== 6) { for (const template of templates.values()) { template.geometry.dispose(); template.material.dispose(); } return undefined; }
  return (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((direction) => templates.get(direction)!);
}

function canonicalizeSurfaceFaceGeometry(geometry: THREE.BufferGeometry, direction: SurfaceFaceDirection): THREE.Matrix4 {
  const transform = new THREE.Matrix4();
  switch (direction) {
    case 'north': transform.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1); break;
    case 'south': transform.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 1); break;
    case 'east': transform.set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1); break;
    case 'west': transform.set(0, 0, -1, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1); break;
    case 'up': transform.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, 0, 1); break;
    case 'down': transform.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1); break;
  }
  geometry.applyMatrix4(transform);
  return transform;
}
