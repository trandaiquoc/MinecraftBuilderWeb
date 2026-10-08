import * as THREE from 'three';
import type { ResolvedElement, ResolvedFace } from '../../blocks/resolver';

export function shadeDirectionFactor(direction: string): number {
  switch (direction) {
    case 'up': return 1;
    case 'down': return .7;
    case 'north':
    case 'south': return .85;
    case 'east':
    case 'west': return .9;
    default: return 1;
  }
}

export function modelCoordinateVector(value: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(value[0] / 16, value[1] / 16, value[2] / 16);
}

export function faceGeometry(element: ResolvedElement, direction: string, face: ResolvedFace, uvlockTurns = 0, origin = new THREE.Vector3()): THREE.BufferGeometry {
  const [x1, y1, z1] = element.from.map((value) => value / 16) as [number, number, number];
  const [x2, y2, z2] = element.to.map((value) => value / 16) as [number, number, number];
  const positions = facePositions(direction, x1, y1, z1, x2, y2, z2).flatMap((position) => [position[0] - origin.x, position[1] - origin.y, position[2] - origin.z]);
  const [u1, v1, u2, v2] = face.uv ?? [0, 0, 16, 16];
  const uv = rotateCorners([[u1 / 16, 1 - v2 / 16], [u2 / 16, 1 - v2 / 16], [u2 / 16, 1 - v1 / 16], [u1 / 16, 1 - v1 / 16]], ((face.rotation ?? 0) / 90) + uvlockTurns).flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
  return geometry;
}

function facePositions(direction: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): readonly (readonly [number, number, number])[] {
  switch (direction) {
    case 'north': return [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]];
    case 'south': return [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
    case 'west': return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]];
    case 'east': return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]];
    case 'down': return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]];
    default: return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]];
  }
}

function rotateCorners<T>(values: readonly T[], turns: number): T[] { const normalized = ((Math.round(turns) % 4) + 4) % 4; return values.map((_, index) => values[(index + normalized) % 4]); }
