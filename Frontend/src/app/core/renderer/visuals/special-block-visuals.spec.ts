import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chestModelFor, chestRotationRadians, chestTextureResource, conduitInactiveModel, decoratedPotBaseModel, decoratedPotRootRotationRadians, decoratedPotSideModels, decoratedPotSherdTextureResource, shulkerFacingQuaternion, shulkerTextureResource, SpecialBlockVisualRegistry, createSpecialModel, signTextLayout } from './special-block-visuals';
import { modelPartCuboidUv } from './special-model-descriptor';

const registry = new SpecialBlockVisualRegistry();
const block = (id: string) => ({ kind: 'resolved' as const, id, namespace: id.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } });

describe('special block visuals', () => {
  it.each([['minecraft:red_bed', 'beds'], ['minecraft:chest', 'chests'], ['minecraft:barrel', 'containers'], ['minecraft:oak_sign', 'signs'], ['minecraft:red_banner', 'banners'], ['minecraft:skeleton_skull', 'heads-skulls'], ['minecraft:blue_shulker_box', 'shulker-boxes']])('creates a static visual for %s', (id, family) => {
    const adapter = registry.resolve(block(id));
    expect(adapter?.family).toBe(family);
    expect(adapter?.create(block(id)).children.length).toBeGreaterThan(0);
  });
  it('does not claim generic JSON blocks as special', () => expect(registry.resolve(block('minecraft:stone'))).toBeUndefined());

  it('keeps Vanilla special adapters namespace-isolated', () => {
    for (const id of ['examplemod:barrel', 'examplemod:red_shulker_box', 'examplemod:oak_sign', 'examplemod:oak_bed', 'examplemod:dragon_head', 'examplemod:decorated_pot', 'examplemod:conduit']) {
      expect(registry.resolve(block(id))).toBeUndefined();
    }
  });
  it('uses the exact Decorated Pot adapter and independent side resources', () => {
    const adapter = registry.resolve({ ...block('minecraft:decorated_pot'), blockEntityData: { kind: 'decorated-pot', decorations: { back: 'minecraft:angler_pottery_sherd', left: 'minecraft:flow_pottery_sherd', right: 'minecraft:skull_pottery_sherd', front: 'minecraft:guster_pottery_sherd' } } });
    expect(adapter?.family).toBe('decorated-pots'); expect(adapter?.overrideGeneric).toBe(true);
    expect(adapter?.textureResources?.({ ...block('minecraft:decorated_pot'), blockEntityData: { kind: 'decorated-pot', decorations: { back: 'minecraft:angler_pottery_sherd', left: 'minecraft:flow_pottery_sherd', right: 'minecraft:skull_pottery_sherd', front: 'minecraft:guster_pottery_sherd' } } })).toEqual({ base: 'minecraft:entity/decorated_pot/decorated_pot_base', back: 'minecraft:entity/decorated_pot/angler_pottery_pattern', left: 'minecraft:entity/decorated_pot/flow_pottery_pattern', right: 'minecraft:entity/decorated_pot/skull_pottery_pattern', front: 'minecraft:entity/decorated_pot/guster_pottery_pattern' });
    expect(decoratedPotSherdTextureResource('minecraft:angler_pottery_sherd')).toBe('minecraft:entity/decorated_pot/angler_pottery_pattern');
  });
  it('keeps exact Decorated Pot ModelPart descriptors and face masks', () => {
    expect(decoratedPotBaseModel.textureSize).toEqual([32, 32]);
    expect(decoratedPotBaseModel.parts[0]).toMatchObject({ id: 'neck', pivot: [0, 37, 16], rotation: [180, 0, 0] });
    expect(decoratedPotBaseModel.parts[0].cuboids).toEqual(expect.arrayContaining([expect.objectContaining({ from: [4, 17, 4], size: [8, 3, 8], dilation: -.1 }), expect.objectContaining({ from: [5, 20, 5], size: [6, 1, 6], dilation: .2 })]));
    expect(decoratedPotBaseModel.parts[1].cuboids[0]).toMatchObject({ uv: [-14, 13], size: [14, 0, 14] });
    expect(decoratedPotSideModels.back.parts[0]).toMatchObject({ pivot: [15, 16, 1], rotation: [0, 0, 180] });
    expect(decoratedPotSideModels.front.parts[0]).toMatchObject({ pivot: [1, 16, 15], rotation: [180, 0, 0] });
    for (const model of Object.values(decoratedPotSideModels)) expect(model.parts[0].cuboids[0]).toMatchObject({ uv: [1, 0], size: [14, 16, 0], faces: ['north'] });
    const plane = createSpecialModel(decoratedPotSideModels.back);
    let meshes = 0; plane.traverse((object) => { if (object instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(1);
  });
  it.each([['north', 0], ['south', Math.PI], ['west', Math.PI / 2], ['east', -Math.PI / 2]])('uses vanilla Decorated Pot root rotation for %s', (facing, radians) => expect(decoratedPotRootRotationRadians(facing)).toBeCloseTo(radians));
  it('uses the exact inactive Conduit adapter and centered six-pixel shell', () => {
    const adapter = registry.resolve(block('minecraft:conduit'));
    expect(adapter?.family).toBe('conduits'); expect(adapter?.overrideGeneric).toBe(true);
    expect(adapter?.matches({ ...block('mod:conduit') })).toBe(false);
    expect(adapter?.textureResource?.(block('minecraft:conduit'))).toBe('minecraft:entity/conduit/base');
    expect(conduitInactiveModel.textureSize).toEqual([32, 16]);
    expect(conduitInactiveModel.parts[0].cuboids[0]).toMatchObject({ uv: [0, 0], from: [-3, -3, -3], size: [6, 6, 6] });
    const visual = adapter!.create(block('minecraft:conduit')); visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.toArray()).toEqual([.3125, .3125, .3125]); expect(bounds.max.toArray()).toEqual([.6875, .6875, .6875]);
    expect(visual.userData['conduitState']).toBe('inactive');
  });
  it('matches only the exact vanilla chest family', () => {
    expect(registry.resolve(block('minecraft:chest'))?.family).toBe('chests');
    expect(registry.resolve(block('minecraft:trapped_chest'))?.family).toBe('chests');
    expect(registry.resolve(block('minecraft:ender_chest'))?.family).toBe('chests');
    expect(registry.resolve(block('minecraft:barrel'))?.family).toBe('containers');
    expect(registry.resolve(block('mod:steel_chest'))).toBeUndefined();
  });
  it('matches only the exact vanilla Shulker Box IDs', () => {
    const ids = ['shulker_box', 'white_shulker_box', 'orange_shulker_box', 'magenta_shulker_box', 'light_blue_shulker_box', 'yellow_shulker_box', 'lime_shulker_box', 'pink_shulker_box', 'gray_shulker_box', 'light_gray_shulker_box', 'cyan_shulker_box', 'purple_shulker_box', 'blue_shulker_box', 'brown_shulker_box', 'green_shulker_box', 'red_shulker_box', 'black_shulker_box'];
    for (const id of ids) expect(registry.resolve(block(`minecraft:${id}`))?.family).toBe('shulker-boxes');
    expect(registry.resolve(block('mod:red_shulker_box'))).toBeUndefined();
  });
  it('maps Shulker Box textures without material color heuristics', () => {
    expect(shulkerTextureResource(block('minecraft:shulker_box'))).toBe('minecraft:entity/shulker/shulker');
    expect(shulkerTextureResource(block('minecraft:red_shulker_box'))).toBe('minecraft:entity/shulker/shulker_red');
    expect(shulkerTextureResource(block('minecraft:light_blue_shulker_box'))).toBe('minecraft:entity/shulker/shulker_light_blue');
    expect(shulkerTextureResource(block('minecraft:light_gray_shulker_box'))).toBe('minecraft:entity/shulker/shulker_light_gray');
  });
  it('uses only the exact closed base and lid ModelPart geometry', () => {
    const visual = registry.resolve(block('minecraft:shulker_box'))!.create({ ...block('minecraft:shulker_box'), state: { facing: 'up' } });
    visual.updateMatrixWorld(true);
    expect(visual.userData['specialModel']).toBe('minecraft-java-shulker-box-1.21.1');
    const modelParts = visual.children[0].children[0].children[0].children[0].children[0].children;
    expect(modelParts).toHaveLength(2);
    expect(modelParts[0].position.toArray()).toEqual([0, 1.5, 0]);
    expect(modelParts[1].position.toArray()).toEqual([0, 1.5, 0]);
    const meshes: THREE.Mesh[] = []; visual.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(12);
    expect(modelParts.some((child) => child.userData['id'] === 'head')).toBe(false);
  });
  it('applies vanilla Shulker direction quaternions and keeps the closed box inside the voxel', () => {
    const adapter = registry.resolve(block('minecraft:shulker_box'))!;
    const expectedRotations: Record<string, THREE.Euler> = {
      up: new THREE.Euler(0, 0, 0, 'XYZ'), down: new THREE.Euler(Math.PI, 0, 0, 'XYZ'),
      north: new THREE.Euler(Math.PI / 2, 0, Math.PI, 'XYZ'), south: new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'),
      west: new THREE.Euler(Math.PI / 2, 0, Math.PI / 2, 'XYZ'), east: new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2, 'XYZ'),
    };
    for (const facing of ['up', 'down', 'north', 'south', 'east', 'west']) {
      const visual = adapter.create({ ...block('minecraft:shulker_box'), state: { facing } });
      visual.updateMatrixWorld(true);
      const expected = new THREE.Quaternion().setFromEuler(expectedRotations[facing]);
      expect(shulkerFacingQuaternion(facing).angleTo(expected)).toBeCloseTo(0);
      expect(visual.children[0].children[0].children[0].quaternion.angleTo(expected)).toBeCloseTo(0);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.x, facing).toBeCloseTo(.00025, 4); expect(bounds.min.y, facing).toBeCloseTo(.00025, 4); expect(bounds.min.z, facing).toBeCloseTo(.00025, 4);
      expect(bounds.max.x, facing).toBeCloseTo(.99975, 4); expect(bounds.max.y, facing).toBeCloseTo(.99975, 4); expect(bounds.max.z, facing).toBeCloseTo(.99975, 4);
    }
  });
  it('maps chest textures and models by vanilla state', () => {
    expect(chestTextureResource({ ...block('minecraft:chest'), state: { type: 'single' } })).toBe('minecraft:entity/chest/normal');
    expect(chestTextureResource({ ...block('minecraft:chest'), state: { type: 'left' } })).toBe('minecraft:entity/chest/normal_left');
    expect(chestTextureResource({ ...block('minecraft:chest'), state: { type: 'right' } })).toBe('minecraft:entity/chest/normal_right');
    expect(chestTextureResource({ ...block('minecraft:trapped_chest'), state: { type: 'left' } })).toBe('minecraft:entity/chest/trapped_left');
    expect(chestTextureResource({ ...block('minecraft:trapped_chest'), state: { type: 'single' } })).toBe('minecraft:entity/chest/trapped');
    expect(chestTextureResource({ ...block('minecraft:trapped_chest'), state: { type: 'right' } })).toBe('minecraft:entity/chest/trapped_right');
    expect(chestTextureResource(block('minecraft:ender_chest'))).toBe('minecraft:entity/chest/ender');
    expect(chestModelFor({ ...block('minecraft:chest'), state: { type: 'single' } }).id).toBe('minecraft-java-chest-single-1.21.1');
    expect(chestModelFor({ ...block('minecraft:chest'), state: { type: 'left' } }).id).toBe('minecraft-java-chest-left-1.21.1');
    expect(chestModelFor({ ...block('minecraft:chest'), state: { type: 'right' } }).id).toBe('minecraft-java-chest-right-1.21.1');
    expect(chestModelFor({ ...block('minecraft:ender_chest'), state: { type: 'right' } }).id).toBe('minecraft-java-chest-single-1.21.1');
  });
  it('keeps the exact vanilla chest cuboid dimensions, UVs, and pivots', () => {
    const model = chestModelFor({ ...block('minecraft:chest'), state: { type: 'single' } });
    expect(model.textureSize).toEqual([64, 64]);
    expect(model.parts.map((part) => part.id)).toEqual(['bottom', 'lid', 'lock']);
    expect(model.parts[0].cuboids[0]).toMatchObject({ uv: [0, 19], from: [1, 0, 1], size: [14, 10, 14] });
    expect(model.parts[1]).toMatchObject({ pivot: [0, 9, 1], applyPivot: true });
    expect(model.parts[1].cuboids[0]).toMatchObject({ uv: [0, 0], from: [1, 0, 0], size: [14, 5, 14] });
    expect(model.parts[2]).toMatchObject({ pivot: [0, 9, 1], applyPivot: true });
    expect(model.parts[2].cuboids[0]).toMatchObject({ uv: [0, 0], from: [7, -2, 14], size: [2, 4, 1] });
    expect(chestModelFor({ ...block('minecraft:chest'), state: { type: 'left' } }).parts[0].cuboids[0].size).toEqual([15, 10, 14]);
    expect(chestModelFor({ ...block('minecraft:chest'), state: { type: 'right' } }).parts[2].cuboids[0].from).toEqual([15, -2, 14]);
  });
  it('uses the closed single chest geometry, pivots, bounds, and world-facing rotations', () => {
    const adapter = registry.resolve(block('minecraft:chest'))!;
    const visual = adapter.create({ ...block('minecraft:chest'), state: { facing: 'south', type: 'single', waterlogged: 'false' } });
    visual.updateMatrixWorld(true);
    expect(visual.userData['specialModel']).toBe('minecraft-java-chest-single-1.21.1');
    expect(visual.position.toArray()).toEqual([0, 0, 0]);
    expect(visual.children[0].position.toArray()).toEqual([.5, .5, .5]);
    expect(visual.children[0].rotation.y).toBeCloseTo(0);
    expect(visual.children[0].children[0].position.toArray()).toEqual([-.5, -.5, -.5]);
    expect(visual.children[0].children[0].children[1].position.toArray()).toEqual([0, 9 / 16, 1 / 16]);
    const bounds = new THREE.Box3().setFromObject(visual);
    expect(bounds.min.toArray()).toEqual([1 / 16, 0, 1 / 16]);
    expect(bounds.max.toArray()).toEqual([15 / 16, 14 / 16, 1]);
    for (const [facing, radians] of Object.entries({ south: 0, west: Math.PI / 2, north: Math.PI, east: Math.PI * 1.5 })) {
      expect(chestRotationRadians(facing)).toBeCloseTo(radians);
      const oriented = adapter.create({ ...block('minecraft:chest'), state: { facing, type: 'single' } });
      expect(oriented.children[0].rotation.y).toBeCloseTo(-radians);
    }
  });
  it.each([
    ['south', (center: THREE.Vector3) => center.z > .9],
    ['north', (center: THREE.Vector3) => center.z < .1],
    ['east', (center: THREE.Vector3) => center.x > .9],
    ['west', (center: THREE.Vector3) => center.x < .1],
  ] as const)('keeps the chest lock on the front face for %s', (facing, isFront) => {
    const visual = registry.resolve(block('minecraft:chest'))!.create({ ...block('minecraft:chest'), state: { facing, type: 'single' } });
    visual.updateMatrixWorld(true);
    const lock = visual.children[0].children[0].children[2];
    const center = new THREE.Box3().setFromObject(lock).getCenter(new THREE.Vector3());
    expect(isFront(center)).toBe(true);
  });
  it('keeps double chest half geometry and state data independent', () => {
    for (const type of ['left', 'right'] as const) {
      const visual = registry.resolve(block('minecraft:chest'))!.create({ ...block('minecraft:chest'), state: { facing: 'south', type, waterlogged: 'true' } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.y).toBeCloseTo(14 / 16);
      expect(visual.userData['chestType']).toBe(type);
      expect(visual.userData['specialModel']).toBe(`minecraft-java-chest-${type}-1.21.1`);
    }
  });
  it('does not let waterlogged alter the closed chest model', () => {
    const adapter = registry.resolve(block('minecraft:chest'))!;
    const dry = adapter.create({ ...block('minecraft:chest'), state: { facing: 'north', type: 'single', waterlogged: 'false' } });
    const wet = adapter.create({ ...block('minecraft:chest'), state: { facing: 'north', type: 'single', waterlogged: 'true' } });
    dry.updateMatrixWorld(true); wet.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(wet).min.toArray()).toEqual(new THREE.Box3().setFromObject(dry).min.toArray());
    expect(new THREE.Box3().setFromObject(wet).max.toArray()).toEqual(new THREE.Box3().setFromObject(dry).max.toArray());
    expect(wet.userData['chestTexture']).toBe(dry.userData['chestTexture']);
  });
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
    ['minecraft:player_head', 'minecraft:entity/player/slim/steve'],
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
  it('keeps the Player base and hat on their distinct vanilla 64x64 atlas regions', () => {
    const visual = registry.resolve(block('minecraft:player_head'))!.create(block('minecraft:player_head'));
    const cuboids = visual.children[0].children[0].children[0].children;
    const baseMesh = cuboids[0].children[0] as THREE.Mesh;
    const hatMesh = cuboids[1].children[0] as THREE.Mesh;
    const baseUv = Array.from(baseMesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    const hatUv = Array.from(hatMesh.geometry.getAttribute('uv').array as ArrayLike<number>);
    expect(baseUv[0]).toBeCloseTo(16 / 64);
    expect(hatUv[0]).toBeCloseTo(48 / 64);
    expect(registry.resolve(block('minecraft:player_head'))!.textureResource?.(block('minecraft:player_head'))).toBe('minecraft:entity/player/slim/steve');
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
    expect(uv.down).toEqual([6, 0, 22, 6]);
    expect(uv.up).toEqual([22, 6, 38, 0]);
    expect(uv.west).toEqual([0, 6, 6, 22]);
    expect(uv.north).toEqual([6, 6, 22, 22]);
    expect(uv.east).toEqual([22, 6, 28, 22]);
    expect(uv.south).toEqual([28, 6, 44, 22]);
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
    expect(uv[0]).toBeCloseTo(16 / 32);
    expect(uv[2]).toBeCloseTo(8 / 32);
    expect(uv[1]).toBeCloseTo(1 - 8 / 32);
    expect(uv[3]).toBeCloseTo(1 - 8 / 32);
    expect(uv[5]).toBeCloseTo(1 - 16 / 32);
    expect(uv[7]).toBeCloseTo(1 - 16 / 32);
  });
  it('keeps the ModelPart Quad vertex order for every cuboid face', () => {
    const cuboid = { id: 'head', uv: [0, 0] as const, from: [0, 0, 0] as const, size: [16, 16, 6] as const };
    const visual = createSpecialModel({ id: 'uv-faces', textureSize: [64, 64], parts: [{ id: 'head', cuboids: [cuboid] }] });
    const faceNames = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
    const uv = modelPartCuboidUv(cuboid);
    const cuboidGroup = visual.children[0].children[0];
    for (const [index, face] of faceNames.entries()) {
      const attribute = (cuboidGroup.children[index] as THREE.Mesh).geometry.getAttribute('uv');
      const values = Array.from(attribute.array as ArrayLike<number>);
      const [u1, v1, u2, v2] = uv[face];
      expect(values.slice(0, 8), face).toEqual([u2 / 64, 1 - v1 / 64, u1 / 64, 1 - v1 / 64, u1 / 64, 1 - v2 / 64, u2 / 64, 1 - v2 / 64]);
    }
  });
  it('applies the Java wall-sign transform independently of wall-facing state', () => {
    const sign = registry.resolve(block('minecraft:oak_wall_sign'))!;
    for (const facing of ['north', 'east', 'south', 'west']) {
      const visual = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing } });
      expect(visual.position.toArray()).toEqual([.5, .5, .5]);
      expect(visual.children[0].position.toArray()).toEqual([0, -.3125, -.4375]);
    }
  });
  it('keeps the wall-sign back edge on the support plane for all facings', () => {
    const sign = registry.resolve(block('minecraft:oak_wall_sign'))!;
    for (const [facing, axis] of [['north', 'z'], ['south', 'z'], ['east', 'x'], ['west', 'x']] as const) {
      const visual = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const edge = axis === 'z' ? (facing === 'north' ? bounds.max.z : bounds.min.z) : (facing === 'west' ? bounds.max.x : bounds.min.x);
      expect(edge, facing).toBeGreaterThan(facing === 'north' || facing === 'west' ? .97 : .0);
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
  it('anchors wall banners to the support plane for every facing', () => {
    const banner = registry.resolve(block('minecraft:red_wall_banner'))!;
    expect(banner.family).toBe('banners');
    for (const [facing, axis] of [['north', 'z'], ['south', 'z'], ['east', 'x'], ['west', 'x']] as const) {
      const visual = banner.create({ ...block('minecraft:red_wall_banner'), state: { facing } });
      visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(visual);
      const edge = axis === 'z' ? (facing === 'north' ? bounds.max.z : bounds.min.z) : (facing === 'west' ? bounds.max.x : bounds.min.x);
      expect(edge, facing).toBeCloseTo(facing === 'north' || facing === 'west' ? 1 : 0, 5);
    }
  });
  it('uses the verified Java 1.21.1 normal Sign ModelPart dimensions and standing/wall visibility', () => {
    const sign = registry.resolve(block('minecraft:oak_sign'))!;
    const standing = sign.create({ ...block('minecraft:oak_sign'), state: { rotation: '0', waterlogged: 'false' } });
    const wall = sign.create({ ...block('minecraft:oak_wall_sign'), state: { facing: 'north', waterlogged: 'false' } });
    expect(sign.textureResource?.(block('minecraft:oak_sign'))).toBe('minecraft:entity/signs/oak');
    expect(standing.userData['providerId']).toBe('minecraft-java-sign-1.21.1-modelpart');
    expect(standing.children[0].children).toHaveLength(2);
    expect(standing.children[0].children[1].visible).toBe(true);
    expect(wall.children[0].children).toHaveLength(2);
    expect(wall.children[0].children[0].children[1].visible).toBe(false);
    expect(standing.children[0].children[0].scale.toArray()).toEqual([2 / 3, -2 / 3, -2 / 3]);
  });
  it('keeps sign text layout independent from the model branch scale', () => {
    expect(signTextLayout('standing')).toEqual({ y: .33333334, z: .046666667, scale: 2 / 3, lineHeight: 10, maxWidth: 90 });
    expect(signTextLayout('hanging')).toEqual({ y: -.32, z: .073, scale: .9, lineHeight: 9, maxWidth: 60 });
    const visual = registry.resolve(block('minecraft:oak_sign'))!.create(block('minecraft:oak_sign'));
    expect(visual.children[0]?.children[0]?.scale.toArray()).toEqual([2 / 3, -2 / 3, -2 / 3]);
    expect(visual.children[0]?.children[1]?.scale.toArray()).toEqual([1, 1, 1]);
  });
  it('places text offsets in world space before text scale for all sign variants', () => {
    const data = { kind: 'sign' as const, front: { lines: ['Front', '', '', ''] as [string, string, string, string], color: 'black', glowing: false }, back: { lines: ['Back', '', '', ''] as [string, string, string, string], color: 'black', glowing: false }, waxed: false };
    const cases = [
      ['minecraft:oak_sign', { rotation: '0' }, .83333334],
      ['minecraft:oak_wall_sign', { facing: 'south' }, .52083334],
      ['minecraft:oak_hanging_sign', { rotation: '0' }, .305],
      ['minecraft:oak_wall_hanging_sign', { facing: 'south' }, .305],
    ] as const;
    for (const [id, state, expectedY] of cases) {
      const visual = registry.resolve(block(id))!.create({ ...block(id), state, blockEntityData: data });
      visual.updateMatrixWorld(true);
      const placement = visual.children[0]!;
      const textBranch = placement.children[1]!;
      const frontOffset = textBranch.children[0]!.children[0]!;
      const backOffset = textBranch.children[1]!.children[0]!;
      const frontWorld = frontOffset.getWorldPosition(new THREE.Vector3());
      const backWorld = backOffset.getWorldPosition(new THREE.Vector3());
      expect(frontWorld.y, id).toBeCloseTo(expectedY, 4);
      expect(backWorld.y, id).toBeCloseTo(expectedY, 4);
      if (id === 'minecraft:oak_sign') {
        expect(frontWorld.z).toBeGreaterThan(.54); expect(backWorld.z).toBeLessThan(.46);
      }
      if (id === 'minecraft:oak_wall_sign') {
        expect(frontWorld.z).toBeGreaterThan(.10); expect(backWorld.z).toBeLessThan(.02);
      }
      expect((frontOffset as THREE.Group).userData['signTextOffset']).toEqual([0, signTextLayout(id.includes('hanging_sign') ? 'hanging' : 'standing').y, signTextLayout(id.includes('hanging_sign') ? 'hanging' : 'standing').z]);
      expect((frontOffset.children[0] as THREE.Group).scale.x).toBeCloseTo(signTextLayout(id.includes('hanging_sign') ? 'hanging' : 'standing').scale * .015625, 8);
    }
  });
  it('uses hanging-sign chain visibility and the separate wall-hanging plank state', () => {
    const sign = registry.resolve(block('minecraft:acacia_hanging_sign'))!;
    const hanging = sign.create({ ...block('minecraft:acacia_hanging_sign'), state: { rotation: '4', attached: 'false' } });
    const attached = sign.create({ ...block('minecraft:acacia_hanging_sign'), state: { rotation: '4', attached: 'true' } });
    const wall = sign.create({ ...block('minecraft:acacia_wall_hanging_sign'), state: { facing: 'east' } });
    expect(sign.textureResource?.(block('minecraft:acacia_hanging_sign'))).toBe('minecraft:entity/signs/hanging/acacia');
    expect(hanging.children[0].children[0].children[1].visible).toBe(false);
    expect(hanging.children[0].children[0].children[2].visible).toBe(true);
    expect(attached.children[0].children[0].children[2].visible).toBe(false);
    expect(attached.children[0].children[0].children[3].visible).toBe(true);
    expect(wall.children[0].children[0].children[1].visible).toBe(true);
    expect(wall.children[0].children[0].children[2].visible).toBe(true);
    expect(wall.children[0].children[0].children[3].visible).toBe(false);
    expect(wall.position.y).toBeCloseTo(.9375);
  });
});
