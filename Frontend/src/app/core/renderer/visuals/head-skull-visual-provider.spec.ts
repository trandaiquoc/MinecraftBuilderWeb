import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { HeadSkullVisualProvider } from './head-skull-visual-provider';

const provider = new HeadSkullVisualProvider();
const block = (id: string): PlacedBlock => ({
  kind: 'resolved', id, namespace: id.split(':')[0] ?? 'minecraft',
  position: { x: 0, y: 0, z: 0 }, state: { rotation: '0' },
});

describe('HeadSkullVisualProvider', () => {
  it('matches only the verified vanilla head/skull family and keeps piston_head generic', () => {
    expect(provider.matches(block('minecraft:skeleton_skull'))).toBe(true);
    expect(provider.matches(block('minecraft:dragon_head'))).toBe(true);
    expect(provider.matches(block('minecraft:piglin_head'))).toBe(true);
    expect(provider.matches(block('minecraft:piston_head'))).toBe(false);
    expect(provider.matches(block('other:skeleton_skull'))).toBe(false);
  });

  it('exposes static head items while refusing profile-dependent player skins', () => {
    expect(provider.matchesItemVisual('minecraft:skeleton_skull')).toBe(true);
    expect(provider.matchesItemVisual('minecraft:piston_head')).toBe(false);
    expect(provider.matchesItemVisual('minecraft:player_head', { 'minecraft:profile': { name: 'custom' } })).toBe(false);
    expect(provider.matchesItemVisual('minecraft:player_head', { 'other:profile': {} })).toBe(false);
    expect(provider.matchesItemVisual('minecraft:player_head')).toBe(true);
  });

  it('uses vanilla skull texture resources and standing/wall anchors', () => {
    const standingBlock = block('minecraft:skeleton_skull');
    const wallBlock = block('minecraft:skeleton_wall_skull');
    expect(provider.textureResource(standingBlock)).toBe('minecraft:entity/skeleton/skeleton');
    expect(provider.textureResource(wallBlock)).toBe('minecraft:entity/skeleton/skeleton');
    const standing = provider.create({ ...standingBlock, state: { rotation: '4' } });
    expect(standing.position.toArray()).toEqual([.5, 0, .5]);
    expect(standing.rotation.y).toBe(0);
    expect(standing.children[0].scale.toArray()).toEqual([-1, -1, 1]);
    expect(standing.children[0].children[0].rotation.y).toBeCloseTo(Math.PI / 2);
    const wall = provider.create({ ...wallBlock, state: { facing: 'north' } });
    expect(wall.position.toArray()).toEqual([.5, .25, .75]);
    expect(wall.userData['specialModel']).toBe('minecraft-java-skeleton-skull-1.21.1');
  });

  it.each([
    ['north', { min: [.25, .25, .5], max: [.75, .75, 1] }],
    ['south', { min: [.25, .25, 0], max: [.75, .75, .5] }],
    ['east', { min: [0, .25, .25], max: [.5, .75, .75] }],
    ['west', { min: [.5, .25, .25], max: [1, .75, .75] }],
  ] as const)('keeps wall skull contact bounds for %s', (facing, expected) => {
    const visual = provider.create({ ...block('minecraft:skeleton_wall_skull'), state: { facing } });
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.x).toBeCloseTo(expected.min[0], 5);
    expect(bounds.min.y).toBeCloseTo(expected.min[1], 5);
    expect(bounds.min.z).toBeCloseTo(expected.min[2], 5);
    expect(bounds.max.x).toBeCloseTo(expected.max[0], 5);
    expect(bounds.max.y).toBeCloseTo(expected.max[1], 5);
    expect(bounds.max.z).toBeCloseTo(expected.max[2], 5);
  });

  it.each([
    ['minecraft:creeper_head', 'minecraft:entity/creeper/creeper'],
    ['minecraft:zombie_head', 'minecraft:entity/zombie/zombie'],
    ['minecraft:player_head', 'minecraft:entity/player/slim/steve'],
    ['minecraft:wither_skeleton_skull', 'minecraft:entity/skeleton/wither_skeleton'],
  ])('maps %s to its vanilla entity texture', (id, texture) => expect(provider.textureResource(block(id))).toBe(texture));

  it('uses distinct dragon and piglin model descriptors', () => {
    const dragon = provider.create(block('minecraft:dragon_head'));
    const piglin = provider.create(block('minecraft:piglin_head'));
    expect(dragon.userData['specialModel']).toBe('minecraft-java-dragon-head-1.21.1');
    expect(piglin.userData['specialModel']).toBe('minecraft-java-piglin-head-1.21.1');
    const meshCount = (root: THREE.Object3D): number => { let count = 0; root.traverse((object) => { if (object instanceof THREE.Mesh) count++; }); return count; };
    expect(meshCount(dragon)).toBeGreaterThan(1);
    expect(meshCount(piglin)).toBe(36);
    let leftEarPivotFound = false;
    let rightEarPivotFound = false;
    piglin.traverse((child) => {
      if (child.position.x === 4.5 / 16 && child.position.y === -6 / 16 && Math.abs(child.rotation.z + Math.PI / 6) < .00001) leftEarPivotFound = true;
      if (child.position.x === -4.5 / 16 && child.position.y === -6 / 16 && Math.abs(child.rotation.z - Math.PI / 6) < .00001) rightEarPivotFound = true;
    });
    expect(leftEarPivotFound).toBe(true);
    expect(rightEarPivotFound).toBe(true);
    let jawPivotFound = false;
    dragon.traverse((child) => { if (child.position.toArray().every((value, index) => Math.abs(value - [0, .25, -.5][index]) < .00001)) jawPivotFound = true; });
    expect(jawPivotFound).toBe(true);
    expect(dragon.children[0].children[0].children[0].position.toArray()).toEqual([0, -.374375, 0]);
    expect(dragon.children[0].children[0].children[0].scale.toArray()).toEqual([.75, .75, .75]);
  });

  it('keeps every verified standing head in the shared upright transform hierarchy', () => {
    const standingIds = [
      'minecraft:creeper_head', 'minecraft:dragon_head', 'minecraft:piglin_head',
      'minecraft:player_head', 'minecraft:skeleton_skull', 'minecraft:wither_skeleton_skull', 'minecraft:zombie_head',
    ];
    for (const id of standingIds) {
      const visual = provider.create({ ...block(id), state: { rotation: '0' } });
      visual.updateMatrixWorld(true);
      expect(visual.position.toArray(), id).toEqual([.5, 0, .5]);
      expect(visual.rotation.y, id).toBe(0);
      expect(visual.children[0].scale.toArray(), id).toEqual([-1, -1, 1]);
    }
  });

  it.each([0, 4, 8, 12])('preserves the standing skull rotation step %s', (rotation) => {
    const visual = provider.create({ ...block('minecraft:skeleton_skull'), state: { rotation: String(rotation) } });
    expect(visual.children[0].children[0].rotation.y).toBeCloseTo(rotation * Math.PI / 8);
  });

  it('keeps every verified wall head flush to its support-facing voxel face', () => {
    const wallIds = [
      'minecraft:creeper_wall_head', 'minecraft:dragon_wall_head', 'minecraft:piglin_wall_head',
      'minecraft:player_wall_head', 'minecraft:skeleton_wall_skull', 'minecraft:wither_skeleton_wall_skull', 'minecraft:zombie_wall_head',
    ];
    for (const id of wallIds) {
      const visual = provider.create({ ...block(id), state: { facing: 'north' } });
      visual.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(visual).max.z, id).toBeGreaterThanOrEqual(.9999);
    }
  });

  it('uses exact 64x64 human head layers and undilated UV footprint', () => {
    for (const id of ['minecraft:player_head', 'minecraft:zombie_head']) {
      const visual = provider.create(block(id));
      expect(visual.userData['specialModel']).toBe(`minecraft-java-${id.endsWith('player_head') ? 'player' : 'zombie'}-skull-1.21.1`);
      const meshes: THREE.Mesh[] = [];
      visual.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
      expect(meshes).toHaveLength(12);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.y).toBeCloseTo(-.015625, 5);
      expect(bounds.max.y).toBeCloseTo(.515625, 5);
    }
  });

  it('keeps the Player base and hat on their distinct vanilla 64x64 atlas regions', () => {
    const visual = provider.create(block('minecraft:player_head'));
    const cuboids = visual.children[0].children[0].children[0].children;
    const baseMesh = cuboids[0].children[0] as THREE.Mesh;
    const hatMesh = cuboids[1].children[0] as THREE.Mesh;
    const baseUv = Array.from(baseMesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    const hatUv = Array.from(hatMesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    expect(baseUv[0]).toBeCloseTo(16 / 64);
    expect(hatUv[0]).toBeCloseTo(48 / 64);
    expect(provider.textureResource(block('minecraft:player_head'))).toBe('minecraft:entity/player/slim/steve');
  });
});
