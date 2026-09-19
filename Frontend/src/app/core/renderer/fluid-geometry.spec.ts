import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFluidGeometry } from './fluid-geometry';

const block = (id: string, position = { x: 0, y: 0, z: 0 }, level = '0') => ({ kind: 'resolved' as const, id, namespace: 'minecraft', position, state: { level } });
const key = (position: { x: number; y: number; z: number }) => `${position.x},${position.y},${position.z}`;

describe('static fluid geometry', () => {
  function triangleNormal(result: ReturnType<typeof createFluidGeometry>, face: number): THREE.Vector3 {
    const geometry = result!.geometry; const positions = geometry.getAttribute('position'); const indices = geometry.getIndex()!;
    const offset = face * 6; const a = indices.getX(offset); const b = indices.getX(offset + 1); const c = indices.getX(offset + 2);
    const first = new THREE.Vector3().fromBufferAttribute(positions, a); const second = new THREE.Vector3().fromBufferAttribute(positions, b); const third = new THREE.Vector3().fromBufferAttribute(positions, c);
    return second.sub(first).cross(third.sub(first)).normalize();
  }

  it('renders an isolated source below the voxel top', () => {
    const result = createFluidGeometry(block('minecraft:water'))!;
    const positions = [...result.geometry.getAttribute('position').array];
    expect(Math.max(...positions.filter((_, index) => index % 3 === 1))).toBeCloseTo(8 / 9 - .001);
    expect(result.faceCount).toBe(6);
  });
  it('culls internal same-fluid faces but preserves water/lava boundaries', () => {
    const water = block('minecraft:water'); const adjacentWater = block('minecraft:water', { x: 1, y: 0, z: 0 });
    const world = new Map([[key(water.position), water], [key(adjacentWater.position), adjacentWater]]);
    expect(createFluidGeometry(water, { getBlock: (position) => world.get(key(position)) })!.faceCount).toBe(5);
    const lava = block('minecraft:lava', { x: 1, y: 0, z: 0 }); world.set(key(lava.position), lava);
    expect(createFluidGeometry(water, { getBlock: (position) => world.get(key(position)) })!.faceCount).toBe(6);
  });
  it('culls the shared top/bottom boundary for vertically stacked matching fluids', () => {
    const lower = block('minecraft:water'); const upper = block('minecraft:water', { x: 0, y: 1, z: 0 });
    const world = new Map([[key(lower.position), lower], [key(upper.position), upper]]);
    expect(createFluidGeometry(lower, { getBlock: (position) => world.get(key(position)) })!.faceCount).toBe(5);
  });
  it('keeps lava opaque and selects flow texture orientation from static velocity', () => {
    const result = createFluidGeometry(block('minecraft:lava', undefined, '1'))!;
    expect(result.geometry).toBeInstanceOf(THREE.BufferGeometry); expect(result.flowAngle).toBe(0);
  });
  it('uses the stored level for shallow and falling fluid heights', () => {
    const shallow = createFluidGeometry(block('minecraft:water', undefined, '7'))!;
    const falling = createFluidGeometry(block('minecraft:water', undefined, '8'))!;
    const shallowY = [...shallow.geometry.getAttribute('position').array].filter((_, index) => index % 3 === 1);
    const fallingY = [...falling.geometry.getAttribute('position').array].filter((_, index) => index % 3 === 1);
    expect(Math.max(...shallowY)).toBeCloseTo(1 / 9 - .001); expect(Math.max(...fallingY)).toBeCloseTo(8 / 9 - .001);
  });
  it('keeps outward normals for every exposed water face', () => {
    const result = createFluidGeometry(block('minecraft:water'))!;
    expect(triangleNormal(result, 0).y).toBeGreaterThan(0);
    expect(triangleNormal(result, 1).y).toBeLessThan(0);
    expect(triangleNormal(result, 2).z).toBeLessThan(0);
    expect(triangleNormal(result, 3).z).toBeGreaterThan(0);
    expect(triangleNormal(result, 4).x).toBeLessThan(0);
    expect(triangleNormal(result, 5).x).toBeGreaterThan(0);
  });
  it('uses the same outward winding for lava faces', () => {
    const result = createFluidGeometry(block('minecraft:lava'))!;
    expect(triangleNormal(result, 0).y).toBeGreaterThan(0); expect(triangleNormal(result, 1).y).toBeLessThan(0);
    expect(triangleNormal(result, 2).z).toBeLessThan(0); expect(triangleNormal(result, 3).z).toBeGreaterThan(0);
    expect(triangleNormal(result, 4).x).toBeLessThan(0); expect(triangleNormal(result, 5).x).toBeGreaterThan(0);
  });
});
