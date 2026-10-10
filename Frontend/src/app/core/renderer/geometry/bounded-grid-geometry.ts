import * as THREE from 'three';

export function createBoundedGrid(sizeX: number, sizeZ: number, color: number): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  for (let x = 0; x <= sizeX; x += 1)
    points.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 0, sizeZ));
  for (let z = 0; z <= sizeZ; z += 1)
    points.push(new THREE.Vector3(0, 0, z), new THREE.Vector3(sizeX, 0, z));
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
}
