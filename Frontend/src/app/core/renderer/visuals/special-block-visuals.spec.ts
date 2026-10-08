import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { conduitInactiveModel, SpecialBlockVisualRegistry } from './special-block-visuals';
import { SPECIAL_VISUAL_COMPATIBILITY } from './special-visual-contracts';

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
