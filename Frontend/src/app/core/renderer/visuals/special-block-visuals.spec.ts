import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chestModelFor, chestRotationRadians, chestTextureResource, conduitInactiveModel, decoratedPotBaseModel, decoratedPotRootRotationRadians, decoratedPotSideModels, decoratedPotSherdTextureResource, shulkerFacingQuaternion, shulkerTextureResource, SpecialBlockVisualRegistry } from './special-block-visuals';
import { SPECIAL_VISUAL_COMPATIBILITY } from './special-visual-contracts';
import { createSpecialModel } from './special-model-geometry';

const registry = new SpecialBlockVisualRegistry();
const block = (id: string) => ({ kind: 'resolved' as const, id, namespace: id.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } });

describe('special block visuals', () => {
  it('keeps an explicit compatibility contract for every registered special family', () => {
    expect(Object.keys(SPECIAL_VISUAL_COMPATIBILITY).sort()).toEqual(['banners', 'beds', 'chests', 'conduits', 'containers', 'decorated-pots', 'heads-skulls', 'shulker-boxes', 'signs'].sort());
  });
  it.each([['minecraft:red_bed', 'beds'], ['minecraft:chest', 'chests'], ['minecraft:barrel', 'containers'], ['minecraft:oak_sign', 'signs'], ['minecraft:red_banner', 'banners'], ['minecraft:skeleton_skull', 'heads-skulls'], ['minecraft:blue_shulker_box', 'shulker-boxes']])('creates a static visual for %s', (id, family) => {
    const adapter = registry.resolve(block(id));
    expect(adapter?.family).toBe(family);
    expect(adapter?.create(block(id)).children.length).toBeGreaterThan(0);
  });
  it('does not claim generic JSON blocks as special', () => expect(registry.resolve(block('minecraft:stone'))).toBeUndefined());
  it('does not fabricate a classic entity-bed texture for a new bed family', () => expect(registry.resolve(block('minecraft:straw_bed'))).toBeUndefined());
  it('accepts a verified common-sign descriptor for an external namespace', () => {
    registry.registerDescriptor({ contentId: 'example:maple_sign', contractId: 'common-sign', resources: { default: 'example:entity/signs/maple' }, stateDependencies: ['facing'], provenance: 'trusted-data' });
    const target = { ...block('example:maple_sign'), state: { facing: 'north' } };
    expect(registry.resolve(target)?.family).toBe('signs');
    expect(registry.resolve(target)?.textureResource?.(target)).toBe('example:entity/signs/maple');
    const visual = registry.resolve(target)!.create({ ...target, blockEntityData: { kind: 'sign', front: { lines: ['A', '', '', ''], color: 'black', glowing: false }, back: { lines: ['', '', '', ''], color: 'black', glowing: false }, waxed: false } });
    expect(visual.userData['signVariant']).toBe('wall');
    expect(visual.getObjectByName('frontTextSide')).toBeDefined();
  });
  it('replaces transient descriptors so hover variants do not accumulate', () => {
    const transient = new SpecialBlockVisualRegistry();
    const descriptor = (contentId: string) => ({ contentId, contractId: 'common-sign' as const, resources: { default: `${contentId}/sign` }, stateDependencies: ['facing'], provenance: 'trusted-data' as const });
    transient.setDescriptors([descriptor('example:wall_sign')]);
    expect(transient.resolve(block('example:wall_sign'))?.family).toBe('signs');
    transient.setDescriptors([descriptor('example:wall_hanging_sign')]);
    expect(transient.resolve(block('example:wall_sign'))).toBeUndefined();
    expect(transient.resolve(block('example:wall_hanging_sign'))?.family).toBe('signs');
  });
  it('uses verified sign defaults when an older project omitted orientation state', () => {
    registry.registerDescriptor({ contentId: 'example:legacy_sign', contractId: 'common-sign', variant: 'standing', resources: { default: 'example:entity/signs/legacy' }, stateDependencies: ['rotation'], provenance: 'trusted-data' });
    const target = { ...block('example:legacy_sign'), state: {} };
    const adapter = registry.resolve(target);
    expect(adapter?.family).toBe('signs');
    expect(adapter?.create(target).userData['signVariant']).toBe('standing');
  });

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
  it('exposes heads as a static item capability while refusing profile-dependent player skins', () => {
    expect(registry.resolveItemVisual('minecraft:skeleton_skull')?.family).toBe('heads-skulls');
    expect(registry.resolveItemVisual('minecraft:piston_head')).toBeUndefined();
    expect(registry.resolveItemVisual('minecraft:player_head', { 'minecraft:profile': { name: 'custom' } })).toBeUndefined();
  });
  it('reuses a compatible Bed provider across game versions when no resource gate is supplied', () => {
    expect(new SpecialBlockVisualRegistry('1.22').resolve(block('minecraft:red_bed'))?.family).toBe('beds');
  });
  it('gates special visuals by resources when a selected asset provider is available', () => {
    const available = new SpecialBlockVisualRegistry({
      gameVersion: '1.22',
      readBinary: (path) => path === 'assets/minecraft/textures/entity/bed/red.png' ? new Uint8Array([1]) : undefined,
    });
    expect(available.inspect(block('minecraft:red_bed'))).toMatchObject({ family: 'beds', missingResources: [] });

    const missing = new SpecialBlockVisualRegistry({ gameVersion: '1.22', readBinary: () => undefined });
    expect(missing.inspect(block('minecraft:red_bed'))).toMatchObject({ family: 'beds', adapter: undefined, missingResources: ['assets/minecraft/textures/entity/bed/red.png'] });
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
});
