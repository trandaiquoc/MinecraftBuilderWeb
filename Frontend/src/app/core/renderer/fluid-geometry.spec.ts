import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFluidGeometry } from './fluid-geometry';

const block = (id: string, position = { x: 0, y: 0, z: 0 }, level = '0') => ({ kind: 'resolved' as const, id, namespace: 'minecraft', position, state: { level } });
const key = (position: { x: number; y: number; z: number }) => `${position.x},${position.y},${position.z}`;

describe('static fluid geometry', () => {
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
});
