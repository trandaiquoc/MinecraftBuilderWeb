import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SpecialBlockVisualRegistry, createSpecialModel } from './special-block-visuals';
import { modelPartCuboidUv } from './special-model-descriptor';

const registry = new SpecialBlockVisualRegistry();
const block = (id: string) => ({ kind: 'resolved' as const, id, namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } });

describe('special block visuals', () => {
  it.each([['minecraft:red_bed', 'beds'], ['minecraft:chest', 'containers'], ['minecraft:oak_sign', 'signs'], ['minecraft:red_banner', 'banners'], ['minecraft:skeleton_skull', 'heads-skulls'], ['minecraft:blue_shulker_box', 'shulker-boxes']])('creates a static visual for %s', (id, family) => {
    const adapter = registry.resolve(block(id));
    expect(adapter?.family).toBe(family);
    expect(adapter?.create(block(id)).children.length).toBeGreaterThan(0);
  });
  it('does not claim generic JSON blocks as special', () => expect(registry.resolve(block('minecraft:stone'))).toBeUndefined());
  it('matches only the verified vanilla head/skull family and keeps piston_head generic', () => {
    expect(registry.resolve(block('minecraft:skeleton_skull'))?.family).toBe('heads-skulls');
    expect(registry.resolve(block('minecraft:dragon_head'))?.family).toBe('heads-skulls');
    expect(registry.resolve(block('minecraft:piglin_head'))?.family).toBe('heads-skulls');
    expect(registry.resolve(block('minecraft:piston_head'))).toBeUndefined();
  });
  it('uses vanilla skull texture resources and standing/wall anchors', () => {
    const standing = registry.resolve(block('minecraft:skeleton_skull'))!;
    const wall = registry.resolve(block('minecraft:skeleton_wall_skull'))!;
    expect(standing.textureResource?.(block('minecraft:skeleton_skull'))).toBe('minecraft:entity/skeleton/skeleton');
    expect(wall.textureResource?.(block('minecraft:skeleton_wall_skull'))).toBe('minecraft:entity/skeleton/skeleton');
    const standingVisual = standing.create({ ...block('minecraft:skeleton_skull'), state: { rotation: '4' } });
    expect(standingVisual.position.toArray()).toEqual([.5, 0, .5]);
    expect(standingVisual.rotation.y).toBe(0);
    expect(standingVisual.children[0].scale.toArray()).toEqual([-1, -1, 1]);
    expect(standingVisual.children[0].children[0].rotation.y).toBeCloseTo(Math.PI / 2);
    const wallVisual = wall.create({ ...block('minecraft:skeleton_wall_skull'), state: { facing: 'north' } });
    expect(wallVisual.position.toArray()).toEqual([.5, .25, .75]);
    expect(wallVisual.userData['specialModel']).toBe('minecraft-java-skeleton-skull-1.21.1');
  });
  it.each([
    ['north', { min: [.25, .25, .5], max: [.75, .75, 1] }],
    ['south', { min: [.25, .25, 0], max: [.75, .75, .5] }],
    ['east', { min: [0, .25, .25], max: [.5, .75, .75] }],
    ['west', { min: [.5, .25, .25], max: [1, .75, .75] }],
  ] as const)('keeps wall skull contact bounds for %s', (facing, expected) => {
    const visual = registry.resolve(block('minecraft:skeleton_wall_skull'))!.create({ ...block('minecraft:skeleton_wall_skull'), state: { facing } });
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.x).toBeCloseTo(expected.min[0], 5); expect(bounds.min.y).toBeCloseTo(expected.min[1], 5); expect(bounds.min.z).toBeCloseTo(expected.min[2], 5);
    expect(bounds.max.x).toBeCloseTo(expected.max[0], 5); expect(bounds.max.y).toBeCloseTo(expected.max[1], 5); expect(bounds.max.z).toBeCloseTo(expected.max[2], 5);
  });
  it.each([
    ['minecraft:creeper_head', 'minecraft:entity/creeper/creeper'],
    ['minecraft:zombie_head', 'minecraft:entity/zombie/zombie'],
    ['minecraft:player_head', 'minecraft:entity/player/wide/steve'],
    ['minecraft:wither_skeleton_skull', 'minecraft:entity/skeleton/wither_skeleton'],
  ])('maps %s to its vanilla entity texture', (id, texture) => {
    const adapter = registry.resolve(block(id))!;
    expect(adapter.family).toBe('heads-skulls');
    expect(adapter.textureResource?.(block(id))).toBe(texture);
  });
  it('uses distinct dragon and piglin model descriptors', () => {
    const dragon = registry.resolve(block('minecraft:dragon_head'))!.create(block('minecraft:dragon_head'));
    const piglin = registry.resolve(block('minecraft:piglin_head'))!.create(block('minecraft:piglin_head'));
    expect(dragon.userData['specialModel']).toBe('minecraft-java-dragon-head-1.21.1');
    expect(piglin.userData['specialModel']).toBe('minecraft-java-piglin-head-1.21.1');
    const meshCount = (root: THREE.Object3D): number => { let count = 0; root.traverse((object) => { if (object instanceof THREE.Mesh) count++; }); return count; };
    expect(meshCount(dragon)).toBeGreaterThan(1);
    expect(meshCount(piglin)).toBe(36);
    let leftEarPivotFound = false;
    let rightEarPivotFound = false;
    piglin.traverse((child) => {
      if (child.position.x === 4.5 / 16 && child.position.y === -6 / 16 && Math.abs(child.rotation.z + Math.PI / 6) < 0.00001) leftEarPivotFound = true;
      if (child.position.x === -4.5 / 16 && child.position.y === -6 / 16 && Math.abs(child.rotation.z - Math.PI / 6) < 0.00001) rightEarPivotFound = true;
    });
    expect(leftEarPivotFound).toBe(true);
    expect(rightEarPivotFound).toBe(true);
    let jawPivotFound = false;
    dragon.traverse((child) => { if (child.position.toArray().every((value, index) => Math.abs(value - [0, .25, -.5][index]) < 0.00001)) jawPivotFound = true; });
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
      const visual = registry.resolve(block(id))!.create({ ...block(id), state: { rotation: '0' } });
      visual.updateMatrixWorld(true);
      expect(visual.position.toArray(), id).toEqual([.5, 0, .5]);
      expect(visual.rotation.y, id).toBe(0);
      expect(visual.children[0].scale.toArray(), id).toEqual([-1, -1, 1]);
    }
  });
  it.each([0, 4, 8, 12])('preserves the standing skull rotation step %s', (rotation) => {
    const visual = registry.resolve(block('minecraft:skeleton_skull'))!.create({ ...block('minecraft:skeleton_skull'), state: { rotation: String(rotation) } });
    expect(visual.children[0].children[0].rotation.y).toBeCloseTo(rotation * Math.PI / 8);
  });
  it('keeps every verified wall head flush to its support-facing voxel face', () => {
    const wallIds = [
      'minecraft:creeper_wall_head', 'minecraft:dragon_wall_head', 'minecraft:piglin_wall_head',
      'minecraft:player_wall_head', 'minecraft:skeleton_wall_skull', 'minecraft:wither_skeleton_wall_skull', 'minecraft:zombie_wall_head',
    ];
    for (const id of wallIds) {
      const visual = registry.resolve(block(id))!.create({ ...block(id), state: { facing: 'north' } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.max.z, id).toBeGreaterThanOrEqual(.9999);
    }
  });
  it('uses the exact 64x64 human head layers with undilated UV footprint', () => {
    for (const id of ['minecraft:player_head', 'minecraft:zombie_head']) {
      const visual = registry.resolve(block(id))!.create(block(id));
      expect(visual.userData['specialModel']).toBe(`minecraft-java-${id.endsWith('player_head') ? 'player' : 'zombie'}-skull-1.21.1`);
      const meshes: THREE.Mesh[] = [];
      visual.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
      expect(meshes).toHaveLength(12);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.y).toBeCloseTo(-.015625, 5);
      expect(bounds.max.y).toBeCloseTo(.515625, 5);
    }
  });
  it('uses one data-driven vanilla descriptor for colors, parts, and facing', () => {
    const bed = registry.resolve(block('minecraft:red_bed'))!;
    expect(bed.textureResource?.(block('minecraft:red_bed'))).toBe('minecraft:entity/bed/red');
    expect(bed.textureResource?.(block('minecraft:blue_bed'))).toBe('minecraft:entity/bed/blue');
    const head = bed.create({ ...block('minecraft:red_bed'), state: { part: 'head', facing: 'north' } });
    const foot = bed.create({ ...block('minecraft:red_bed'), state: { part: 'foot', facing: 'north' } });
    expect(head.userData['bedGeometry']).toBe('minecraft-java-bed-1.21.1-modelpart');
    expect(head.userData['bedWorldFootOffset']).toBe(0);
    expect(head.children.length).toBe(1); expect(foot.children.length).toBe(1);
  });
  it.each(['head', 'foot'] as const)('keeps the exact Bed %s ModelPart vertices inside one local voxel for every facing', (part) => {
    const bed = registry.resolve(block('minecraft:red_bed'))!;
    for (const facing of ['north', 'east', 'south', 'west']) {
      const visual = bed.create({ ...block('minecraft:red_bed'), state: { part, facing } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.x, `${part}/${facing} min=${bounds.min.toArray()}`).toBeGreaterThanOrEqual(-.000001);
      expect(bounds.min.y, `${part}/${facing} min=${bounds.min.toArray()}`).toBeGreaterThanOrEqual(-.000001);
      expect(bounds.min.z, `${part}/${facing} min=${bounds.min.toArray()}`).toBeGreaterThanOrEqual(-.000001);
      expect(bounds.max.x).toBeLessThanOrEqual(1.000001);
      expect(bounds.max.y).toBeCloseTo(.5625, 5);
      expect(bounds.max.z, `${part}/${facing} max=${bounds.max.toArray()}`).toBeLessThanOrEqual(1.000001);
      expect(bounds.min.y).toBeCloseTo(0, 5);
    }
  });
  it('does not select the 1.21.1 Bed provider for an unverified game version', () => {
    expect(new SpecialBlockVisualRegistry('1.22').resolve(block('minecraft:red_bed'))).toBeUndefined();
  });
  it('derives all six ModelPart cuboid UV regions without a cropped texture clone', () => {
    const uv = modelPartCuboidUv({ id: 'head', uv: [0, 0], from: [0, 0, 0], size: [16, 16, 6] });
    expect(uv.north).toEqual([6, 6, 22, 22]);
    expect(uv.up).toEqual([6, 0, 22, 6]);
    expect(uv.east).not.toEqual(uv.west);
  });
  it('keeps UV dimensions tied to the base cuboid when dilation expands geometry', () => {
    const base = modelPartCuboidUv({ id: 'head', uv: [32, 0], from: [-4, -8, -4], size: [8, 8, 8] });
    const dilated = modelPartCuboidUv({ id: 'hat', uv: [32, 0], from: [-4, -8, -4], size: [8, 8, 8], dilation: .25 });
    expect(dilated).toEqual(base);
  });
  it('uses Java ModelPart top-to-bottom UV orientation for entity faces', () => {
    const visual = createSpecialModel({ id: 'uv-test', textureSize: [32, 32], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }] }] });
    const mesh = visual.children[0].children[0].children[0] as THREE.Mesh;
    const uv = Array.from(mesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    expect(uv[1]).toBeCloseTo(1 - 8 / 32);
    expect(uv[3]).toBeCloseTo(1 - 8 / 32);
    expect(uv[5]).toBeCloseTo(1 - 16 / 32);
    expect(uv[7]).toBeCloseTo(1 - 16 / 32);
  });
  it('applies the Java wall-sign transform independently of wall-facing state', () => {
    const sign = registry.resolve(block('minecraft:oak_wall_sign'))!;
    for (const facing of ['north', 'east', 'south', 'west']) {
      const visual = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing } });
      expect(visual.position.toArray()).toEqual([.5, .5, .5]);
      expect(visual.children[0].position.toArray()).toEqual([0, -.3125, -.4375]);
    }
  });
  it('uses a separate wall-hanging-sign hierarchy while retaining the shared facing transform for text', () => {
    const sign = registry.resolve(block('minecraft:oak_wall_hanging_sign'))!;
    const visual = sign.create({ ...block('minecraft:oak_wall_hanging_sign'), state: { facing: 'east' } });
    expect(visual.children).toHaveLength(1);
    expect(visual.position.y).toBeCloseTo(.9375);
    expect(visual.children[0].position.y).toBeCloseTo(-.3125);
    expect(visual.rotation.y).toBeCloseTo(-Math.PI * 1.5);
  });
  it('uses the verified Java 1.21.1 normal Sign ModelPart dimensions and standing/wall visibility', () => {
    const sign = registry.resolve(block('minecraft:oak_sign'))!;
    const standing = sign.create({ ...block('minecraft:oak_sign'), state: { rotation: '0', waterlogged: 'false' } });
    const wall = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing: 'north', waterlogged: 'false' } });
    expect(sign.textureResource?.(block('minecraft:oak_sign'))).toBe('minecraft:entity/signs/oak');
    expect(standing.userData['providerId']).toBe('minecraft-java-sign-1.21.1-modelpart');
    expect(standing.children[0].children[0].children).toHaveLength(6);
    expect(standing.children[1].visible).toBe(true);
    expect(wall.children[0].children[1].visible).toBe(false);
    expect(standing.scale.toArray()).toEqual([2 / 3, -2 / 3, -2 / 3]);
  });
  it('uses hanging-sign chain visibility and the separate wall-hanging plank state', () => {
    const sign = registry.resolve(block('minecraft:acacia_hanging_sign'))!;
    const hanging = sign.create({ ...block('minecraft:acacia_hanging_sign'), state: { rotation: '4', attached: 'false' } });
    const attached = sign.create({ ...block('minecraft:acacia_hanging_sign'), state: { rotation: '4', attached: 'true' } });
    const wall = sign.create({ ...block('minecraft:acacia_wall_hanging_sign'), state: { facing: 'east' } });
    expect(sign.textureResource?.(block('minecraft:acacia_hanging_sign'))).toBe('minecraft:entity/signs/hanging/acacia');
    expect(hanging.children[0].children[1].visible).toBe(false);
    expect(hanging.children[0].children[2].visible).toBe(true);
    expect(attached.children[0].children[2].visible).toBe(false);
    expect(attached.children[0].children[3].visible).toBe(true);
    expect(wall.children[0].children[1].visible).toBe(true);
    expect(wall.children[0].children[2].visible).toBe(true);
    expect(wall.children[0].children[3].visible).toBe(false);
    expect(wall.position.y).toBeCloseTo(.9375);
  });
});
