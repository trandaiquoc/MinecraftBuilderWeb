import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { ChestVisualProvider, chestModelFor, chestRotationRadians, chestTextureResource } from './chest-visual-provider';

const provider = new ChestVisualProvider();
const block = (id = 'minecraft:chest', state: Record<string, string> = {}): PlacedBlock => ({
  kind: 'resolved', id, namespace: id.split(':')[0] ?? 'minecraft',
  position: { x: 0, y: 0, z: 0 }, state,
});

describe('ChestVisualProvider', () => {
  it('matches only exact vanilla chest IDs', () => {
    for (const id of ['minecraft:chest', 'minecraft:trapped_chest', 'minecraft:ender_chest']) expect(provider.matches(block(id))).toBe(true);
    expect(provider.matches(block('mod:steel_chest'))).toBe(false);
  });

  it('maps chest textures and models by vanilla state', () => {
    expect(chestTextureResource(block('minecraft:chest', { type: 'single' }))).toBe('minecraft:entity/chest/normal');
    expect(chestTextureResource(block('minecraft:chest', { type: 'left' }))).toBe('minecraft:entity/chest/normal_left');
    expect(chestTextureResource(block('minecraft:chest', { type: 'right' }))).toBe('minecraft:entity/chest/normal_right');
    expect(chestTextureResource(block('minecraft:trapped_chest', { type: 'left' }))).toBe('minecraft:entity/chest/trapped_left');
    expect(chestTextureResource(block('minecraft:trapped_chest', { type: 'single' }))).toBe('minecraft:entity/chest/trapped');
    expect(chestTextureResource(block('minecraft:trapped_chest', { type: 'right' }))).toBe('minecraft:entity/chest/trapped_right');
    expect(chestTextureResource(block('minecraft:ender_chest'))).toBe('minecraft:entity/chest/ender');
    expect(chestModelFor(block('minecraft:chest', { type: 'single' })).id).toBe('minecraft-java-chest-single-1.21.1');
    expect(chestModelFor(block('minecraft:chest', { type: 'left' })).id).toBe('minecraft-java-chest-left-1.21.1');
    expect(chestModelFor(block('minecraft:chest', { type: 'right' })).id).toBe('minecraft-java-chest-right-1.21.1');
    expect(chestModelFor(block('minecraft:ender_chest', { type: 'right' })).id).toBe('minecraft-java-chest-single-1.21.1');
  });

  it('keeps exact vanilla chest cuboid dimensions, UVs, and pivots', () => {
    const model = chestModelFor(block());
    expect(model.textureSize).toEqual([64, 64]);
    expect(model.parts.map((part) => part.id)).toEqual(['bottom', 'lid', 'lock']);
    expect(model.parts[0].cuboids[0]).toMatchObject({ uv: [0, 19], from: [1, 0, 1], size: [14, 10, 14] });
    expect(model.parts[1]).toMatchObject({ pivot: [0, 9, 1], applyPivot: true });
    expect(model.parts[1].cuboids[0]).toMatchObject({ uv: [0, 0], from: [1, 0, 0], size: [14, 5, 14] });
    expect(model.parts[2].cuboids[0]).toMatchObject({ uv: [0, 0], from: [7, -2, 14], size: [2, 4, 1] });
    expect(chestModelFor(block('minecraft:chest', { type: 'left' })).parts[0].cuboids[0].size).toEqual([15, 10, 14]);
    expect(chestModelFor(block('minecraft:chest', { type: 'right' })).parts[2].cuboids[0].from).toEqual([15, -2, 14]);
  });

  it('uses closed geometry, pivots, bounds, and world-facing rotations', () => {
    const visual = provider.create(block('minecraft:chest', { facing: 'south', type: 'single', waterlogged: 'false' }));
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(visual.userData['specialModel']).toBe('minecraft-java-chest-single-1.21.1');
    expect(visual.position.toArray()).toEqual([0, 0, 0]);
    expect(visual.children[0].position.toArray()).toEqual([.5, .5, .5]);
    expect(visual.children[0].rotation.y).toBeCloseTo(0);
    expect(visual.children[0].children[0].position.toArray()).toEqual([-.5, -.5, -.5]);
    expect(visual.children[0].children[0].children[1].position.toArray()).toEqual([0, 9 / 16, 1 / 16]);
    expect(bounds.min.toArray()).toEqual([1 / 16, 0, 1 / 16]);
    expect(bounds.max.toArray()).toEqual([15 / 16, 14 / 16, 1]);
    for (const [facing, radians] of Object.entries({ south: 0, west: Math.PI / 2, north: Math.PI, east: Math.PI * 1.5 })) {
      expect(chestRotationRadians(facing)).toBeCloseTo(radians);
      const oriented = provider.create(block('minecraft:chest', { facing, type: 'single' }));
      expect(oriented.children[0].rotation.y).toBeCloseTo(-radians);
    }
  });

  it.each([
    ['south', (center: THREE.Vector3) => center.z > .9],
    ['north', (center: THREE.Vector3) => center.z < .1],
    ['east', (center: THREE.Vector3) => center.x > .9],
    ['west', (center: THREE.Vector3) => center.x < .1],
  ] as const)('keeps the chest lock on the front face for %s', (facing, isFront) => {
    const visual = provider.create(block('minecraft:chest', { facing, type: 'single' }));
    visual.updateMatrixWorld(true);
    const lock = visual.children[0].children[0].children[2];
    const center = new THREE.Box3().setFromObject(lock).getCenter(new THREE.Vector3());
    expect(isFront(center)).toBe(true);
  });

  it('keeps double chest halves, state data, and waterlogging independent', () => {
    for (const type of ['left', 'right'] as const) {
      const visual = provider.create(block('minecraft:chest', { facing: 'south', type, waterlogged: 'true' }));
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeCloseTo(14 / 16);
      expect(visual.userData['chestType']).toBe(type);
      expect(visual.userData['specialModel']).toBe(`minecraft-java-chest-${type}-1.21.1`);
      expect(provider.textureResource(block('minecraft:chest', { type }))).toBe(`minecraft:entity/chest/normal_${type}`);
    }
    const dry = provider.create(block('minecraft:chest', { facing: 'north', type: 'single', waterlogged: 'false' }));
    const wet = provider.create(block('minecraft:chest', { facing: 'north', type: 'single', waterlogged: 'true' }));
    dry.updateMatrixWorld(true);
    wet.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(wet).min.toArray()).toEqual(new THREE.Box3().setFromObject(dry).min.toArray());
    expect(new THREE.Box3().setFromObject(wet).max.toArray()).toEqual(new THREE.Box3().setFromObject(dry).max.toArray());
    expect(wet.userData['chestTexture']).toBe(dry.userData['chestTexture']);
  });
});
