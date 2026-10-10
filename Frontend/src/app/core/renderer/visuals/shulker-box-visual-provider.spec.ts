import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import {
  ShulkerBoxVisualProvider,
  shulkerFacingQuaternion,
  shulkerTextureResource,
} from './shulker-box-visual-provider';

const provider = new ShulkerBoxVisualProvider();
const block = (id: string): PlacedBlock => ({
  kind: 'resolved',
  id,
  namespace: id.split(':')[0] ?? 'minecraft',
  position: { x: 0, y: 0, z: 0 },
  state: { facing: 'up' },
});

describe('ShulkerBoxVisualProvider', () => {
  it('matches only the vanilla Shulker Box namespace and ID family', () => {
    const ids = [
      'shulker_box',
      'white_shulker_box',
      'orange_shulker_box',
      'magenta_shulker_box',
      'light_blue_shulker_box',
      'yellow_shulker_box',
      'lime_shulker_box',
      'pink_shulker_box',
      'gray_shulker_box',
      'light_gray_shulker_box',
      'cyan_shulker_box',
      'purple_shulker_box',
      'blue_shulker_box',
      'brown_shulker_box',
      'green_shulker_box',
      'red_shulker_box',
      'black_shulker_box',
    ];
    for (const id of ids) expect(provider.matches(block(`minecraft:${id}`))).toBe(true);
    expect(provider.matches(block('mod:red_shulker_box'))).toBe(false);
  });

  it('maps Shulker Box textures without material color heuristics', () => {
    expect(shulkerTextureResource(block('minecraft:shulker_box'))).toBe(
      'minecraft:entity/shulker/shulker',
    );
    expect(shulkerTextureResource(block('minecraft:red_shulker_box'))).toBe(
      'minecraft:entity/shulker/shulker_red',
    );
    expect(shulkerTextureResource(block('minecraft:light_blue_shulker_box'))).toBe(
      'minecraft:entity/shulker/shulker_light_blue',
    );
    expect(shulkerTextureResource(block('minecraft:light_gray_shulker_box'))).toBe(
      'minecraft:entity/shulker/shulker_light_gray',
    );
  });

  it('uses only the exact closed base and lid ModelPart geometry', () => {
    const visual = provider.create(block('minecraft:shulker_box'));
    visual.updateMatrixWorld(true);
    expect(visual.userData['specialModel']).toBe('minecraft-java-shulker-box-1.21.1');
    const modelParts = visual.children[0].children[0].children[0].children[0].children[0].children;
    expect(modelParts).toHaveLength(2);
    expect(modelParts[0].position.toArray()).toEqual([0, 1.5, 0]);
    expect(modelParts[1].position.toArray()).toEqual([0, 1.5, 0]);
    const meshes: THREE.Mesh[] = [];
    visual.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(12);
    expect(modelParts.some((child) => child.userData['id'] === 'head')).toBe(false);
  });

  it('applies vanilla Shulker direction quaternions and keeps the closed box inside the voxel', () => {
    const expectedRotations: Record<string, THREE.Euler> = {
      up: new THREE.Euler(0, 0, 0, 'XYZ'),
      down: new THREE.Euler(Math.PI, 0, 0, 'XYZ'),
      north: new THREE.Euler(Math.PI / 2, 0, Math.PI, 'XYZ'),
      south: new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'),
      west: new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, 'XYZ'),
      east: new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2, 'XYZ'),
    };
    for (const facing of ['up', 'down', 'north', 'south', 'east', 'west']) {
      const visual = provider.create({ ...block('minecraft:shulker_box'), state: { facing } });
      visual.updateMatrixWorld(true);
      const expected = new THREE.Quaternion().setFromEuler(expectedRotations[facing]);
      expect(shulkerFacingQuaternion(facing).angleTo(expected)).toBeCloseTo(0);
      expect(visual.children[0].children[0].children[0].quaternion.angleTo(expected)).toBeCloseTo(
        0,
      );
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.x, facing).toBeCloseTo(0.00025, 4);
      expect(bounds.min.y, facing).toBeCloseTo(0.00025, 4);
      expect(bounds.min.z, facing).toBeCloseTo(0.00025, 4);
      expect(bounds.max.x, facing).toBeCloseTo(0.99975, 4);
      expect(bounds.max.y, facing).toBeCloseTo(0.99975, 4);
      expect(bounds.max.z, facing).toBeCloseTo(0.99975, 4);
    }
  });
});
