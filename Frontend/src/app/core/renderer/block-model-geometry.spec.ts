import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ResolvedElement, ResolvedFace } from '../blocks/resolver';
import { VanillaAssetProvider } from '../assets/vanilla-asset-provider';
import { staticFluidTextureView, VanillaBlockVisualProvider, faceGeometry, grassColormapSampleCoordinate, isGrassTintBlock, sampleGrassColormap, tintColorForFace } from './block-model-geometry';
import { applyBlockTheme } from './three-viewport-engine';
import { viewportThemePalette } from './viewport-theme';

const face: ResolvedFace = { texture: 'minecraft:block/stone', uv: [16, 13, 0, 16] };

describe('block model geometry', () => {
  beforeEach(() => { Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:stone') }); });
  it('applies grass tint only to tintindexed vanilla grass faces', () => {
    const grass = 0x79c05a;
    expect(tintColorForFace('minecraft:grass_block', 0, grass)).toBe(grass);
    expect(tintColorForFace('minecraft:short_grass', 0, grass)).toBe(grass);
    expect(tintColorForFace('minecraft:tall_grass', 0, grass)).toBe(grass);
    expect(tintColorForFace('minecraft:grass_block', undefined, grass)).toBeUndefined();
    expect(tintColorForFace('minecraft:stone', 0, grass)).toBeUndefined();
    expect(isGrassTintBlock('minecraft:tall_grass')).toBe(true);
    expect(grassColormapSampleCoordinate(256, 256)).toEqual([127, 127]);
  });

  it('samples the vanilla default grass pixel from the colormap image data', () => {
    const data = new Uint8Array(256 * 256 * 4);
    const offset = (127 * 256 + 127) * 4;
    data.set([0x72, 0xb8, 0x55, 0xff], offset);
    const texture = new THREE.Texture({ width: 256, height: 256, data });
    expect(sampleGrassColormap(texture)).toBe(0x72b855);
  });
  it('preserves out-of-range element coordinates and reversed UV ordering', () => {
    const element: ResolvedElement = { from: [-2, 0, 0], to: [20, 8, 16], faces: { north: face } };
    const geometry = faceGeometry(element, 'north', face);
    const position = [...geometry.getAttribute('position').array]; const uv = [...geometry.getAttribute('uv').array];
    expect(Math.min(...position)).toBe(-.125); expect(Math.max(...position)).toBe(1.25);
    expect(uv).toEqual([1, 0, 0, 0, 0, .1875, 1, .1875]);
  });

  it('applies face rotation without sorting UV coordinates', () => {
    const element: ResolvedElement = { from: [0, 0, 0], to: [16, 16, 16], faces: { up: { ...face, rotation: 90 } } };
    const uv = [...faceGeometry(element, 'up', element.faces['up']).getAttribute('uv').array];
    expect(uv).toEqual([0, 0, 0, .1875, 1, .1875, 1, 0]);
  });

  it('creates multiple model parts and keeps configured and element rotations separate', async () => {
    const provider = new VanillaAssetProvider('fixture.jar', {
      'assets/minecraft/blockstates/test.json': { multipart: [{ apply: { model: 'minecraft:block/a', x: 90, y: 180, uvlock: true } }, { apply: { model: 'minecraft:block/b' } }] },
      'assets/minecraft/models/block/a.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], rotation: { origin: [8, 8, 8], axis: 'y', angle: 22.5, rescale: true }, faces: { north: { texture: 'minecraft:block/missing' } } }] },
      'assets/minecraft/models/block/b.json': { elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: 'minecraft:block/missing' } } }] },
    }, new Map());
    const result = await new VanillaBlockVisualProvider(provider).create({ kind: 'resolved', id: 'minecraft:test', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} });
    expect(result.object?.children).toHaveLength(2); expect(result.resolved.parts[0].transform).toEqual({ x: 90, y: 180, uvlock: true });
    expect(result.resolved.parts[0].elements[0].rotation).toMatchObject({ axis: 'y', angle: 22.5, rescale: true });
  });

  it('returns a controlled fallback result without losing ID or state', async () => {
    const provider = new VanillaAssetProvider('fixture.jar', {}, new Map());
    const result = await new VanillaBlockVisualProvider(provider).create({ kind: 'resolved', id: 'minecraft:missing', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { facing: 'north' } });
    expect(result.object).toBeUndefined(); expect(result.resolved).toMatchObject({ blockId: 'minecraft:missing', state: { facing: 'north' }, support: 'fallback' });
    expect(result.mode).toBe('fallback'); expect(result.diagnostics[0].code).toBe('MODEL_NOT_FOUND');
  });

  it('resolves the real-like Stone variant array to a textured full cube', async () => {
    const visual = realLikeVisualProvider();
    const result = await visual.create(block('minecraft:stone', {}));
    expect(result.mode).toBe('real');
    expect(result.resolved.trace).toMatchObject({ matchedVariantKeys: [''], elementCount: 1, faceCount: 6, textureResources: ['minecraft:block/stone'] });
    expect(result.trace).toMatchObject({ pngBytesFound: true, textureDecoded: true, geometryBuilt: true, meshBuilt: true, bounds: { min: [0, 0, 0], max: [1, 1, 1] } });
    expect(firstMaterial(result.object!).map).toBeInstanceOf(THREE.Texture);
  });

  it('ignores extra state when resolving a real-like bottom Stone Slab and builds half-height geometry', async () => {
    const result = await realLikeVisualProvider().create(block('minecraft:stone_slab', { type: 'bottom', waterlogged: 'false' }));
    expect(result.mode).toBe('real');
    expect(result.resolved.trace.matchedVariantKeys).toEqual(['type=bottom']);
    expect(result.resolved.trace.selectedModelIds).toEqual(['minecraft:block/stone_slab']);
    expect(result.trace.bounds).toEqual({ min: [0, 0, 0], max: [1, .5, 1] });
  });

  it('does not retain fallback resolution when a ready asset provider replaces the fixture provider', async () => {
    const unavailable = new VanillaBlockVisualProvider(new VanillaAssetProvider('fixture', {}, new Map()), async () => new THREE.Texture());
    expect((await unavailable.create(block('minecraft:stone', {}))).mode).toBe('fallback');
    expect((await realLikeVisualProvider().create(block('minecraft:stone', {}))).mode).toBe('real');
  });

  it('preserves a real texture map when light and dark block themes are applied', async () => {
    const result = await realLikeVisualProvider().create(block('minecraft:stone', {}));
    const material = firstMaterial(result.object!); const map = material.map;
    result.object!.traverse((object) => { object.userData['realModel'] = true; });
    applyBlockTheme(result.object!, viewportThemePalette('light')); applyBlockTheme(result.object!, viewportThemePalette('dark'));
    expect(material.map).toBe(map);
  });

  it('uses an asset-backed Stone thumbnail after the provider becomes ready', () => {
    expect(realLikeVisualProvider().thumbnailUrl('minecraft:stone', {})).toBe('blob:stone');
  });

  it('renders an exact vanilla chest special visual as real when its texture is available', async () => {
    const assets = new VanillaAssetProvider('1.21.1.jar', {}, new Map([
      ['assets/minecraft/textures/entity/chest/normal.png', new Uint8Array([1])],
    ]));
    const result = await new VanillaBlockVisualProvider(assets, async () => new THREE.Texture()).create(block('minecraft:chest', { facing: 'south', type: 'single', waterlogged: 'false' }));
    expect(result.mode).toBe('real');
    expect(result.trace.texturePaths).toEqual(['assets/minecraft/textures/entity/chest/normal.png']);
    expect(result.object?.userData['specialVisualFamily']).toBe('chests');
    expect(result.object?.userData['specialModel']).toBe('minecraft-java-chest-single-1.21.1');
    expect(result.resolved.state).toEqual({ facing: 'south', type: 'single', waterlogged: 'false' });
  });

  it('renders a vanilla Shulker Box special visual as real when its texture is available', async () => {
    const assets = new VanillaAssetProvider('1.21.1.jar', {}, new Map([
      ['assets/minecraft/textures/entity/shulker/shulker_light_blue.png', new Uint8Array([1])],
    ]));
    const result = await new VanillaBlockVisualProvider(assets, async () => new THREE.Texture()).create(block('minecraft:light_blue_shulker_box', { facing: 'north' }));
    expect(result.mode).toBe('real');
    expect(result.trace.texturePaths).toEqual(['assets/minecraft/textures/entity/shulker/shulker_light_blue.png']);
    expect(result.object?.userData['specialVisualFamily']).toBe('shulker-boxes');
    expect(result.object?.userData['specialModel']).toBe('minecraft-java-shulker-box-1.21.1');
  });
  it('prioritizes Decorated Pot special rendering and loads all five textures', async () => {
    const json = {
      'assets/minecraft/blockstates/decorated_pot.json': { variants: { 'facing=north,waterlogged=false,cracked=false': { model: 'minecraft:block/decorated_pot' } } },
      'assets/minecraft/models/block/decorated_pot.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: cubeFaces() }] },
    };
    const files = new Map<string, Uint8Array>([
      ['assets/minecraft/textures/entity/decorated_pot/decorated_pot_base.png', new Uint8Array([1])],
      ['assets/minecraft/textures/entity/decorated_pot/decorated_pot_side.png', new Uint8Array([1])],
      ['assets/minecraft/textures/entity/decorated_pot/angler_pottery_pattern.png', new Uint8Array([1])],
      ['assets/minecraft/textures/entity/decorated_pot/skull_pottery_pattern.png', new Uint8Array([1])],
      ['assets/minecraft/textures/entity/decorated_pot/heart_pottery_pattern.png', new Uint8Array([1])],
    ]);
    const assets = new VanillaAssetProvider('1.21.1.jar', json, files);
    const result = await new VanillaBlockVisualProvider(assets, async () => new THREE.Texture()).create({ ...block('minecraft:decorated_pot', { facing: 'north', waterlogged: 'false', cracked: 'false' }), blockEntityData: { kind: 'decorated-pot', decorations: { back: 'minecraft:angler_pottery_sherd', left: 'minecraft:brick', right: 'minecraft:skull_pottery_sherd', front: 'minecraft:heart_pottery_sherd' } } });
    expect(result.mode).toBe('real'); expect(result.object?.userData['specialVisualFamily']).toBe('decorated-pots');
    expect(result.trace.texturePaths).toEqual([
      'assets/minecraft/textures/entity/decorated_pot/decorated_pot_base.png',
      'assets/minecraft/textures/entity/decorated_pot/angler_pottery_pattern.png',
      'assets/minecraft/textures/entity/decorated_pot/decorated_pot_side.png',
      'assets/minecraft/textures/entity/decorated_pot/skull_pottery_pattern.png',
      'assets/minecraft/textures/entity/decorated_pot/heart_pottery_pattern.png',
    ]);
    expect(result.object?.userData['specialModel']).toBe('minecraft-java-decorated-pot-1.21.1');
  });
  it('reports partial Decorated Pot rendering when a required side texture is missing', async () => {
    const assets = new VanillaAssetProvider('1.21.1.jar', {}, new Map([
      ['assets/minecraft/textures/entity/decorated_pot/decorated_pot_base.png', new Uint8Array([1])],
      ['assets/minecraft/textures/entity/decorated_pot/decorated_pot_side.png', new Uint8Array([1])],
    ]));
    const result = await new VanillaBlockVisualProvider(assets, async () => new THREE.Texture()).create({ ...block('minecraft:decorated_pot', { facing: 'north', waterlogged: 'false', cracked: 'false' }), blockEntityData: { kind: 'decorated-pot', decorations: { back: 'minecraft:angler_pottery_sherd', left: 'minecraft:brick', right: 'minecraft:brick', front: 'minecraft:brick' } } });
    expect(result.mode).toBe('partial'); expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'TEXTURE_NOT_FOUND')).toBe(true);
  });
  it('prioritizes the Conduit special renderer and only requires its inactive base texture', async () => {
    const assets = new VanillaAssetProvider('1.21.1.jar', {
      'assets/minecraft/blockstates/conduit.json': { variants: { 'waterlogged=true': { model: 'minecraft:block/conduit' } } },
      'assets/minecraft/models/block/conduit.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: cubeFaces() }] },
    }, new Map([['assets/minecraft/textures/entity/conduit/base.png', new Uint8Array([1])]]));
    const result = await new VanillaBlockVisualProvider(assets, async () => new THREE.Texture()).create(block('minecraft:conduit', { waterlogged: 'false' }));
    expect(result.mode).toBe('real'); expect(result.object?.userData['specialVisualFamily']).toBe('conduits');
    expect(result.trace.texturePaths).toEqual(['assets/minecraft/textures/entity/conduit/base.png']);
    expect(result.object?.userData['specialModel']).toBe('minecraft-java-conduit-inactive-1.21.1');
  });
  it('renders water and lava through the fluid path with distinct material intent', async () => {
    const json = { 'assets/minecraft/blockstates/water.json': { variants: {} }, 'assets/minecraft/blockstates/lava.json': { variants: {} } };
    const files = new Map<string, Uint8Array>([
      ['assets/minecraft/textures/block/water_still.png', new Uint8Array([1])], ['assets/minecraft/textures/block/water_flow.png', new Uint8Array([1])],
      ['assets/minecraft/textures/block/lava_still.png', new Uint8Array([1])], ['assets/minecraft/textures/block/lava_flow.png', new Uint8Array([1])],
    ]);
    const visual = new VanillaBlockVisualProvider(new VanillaAssetProvider('1.21.1.jar', json, files), async () => new THREE.Texture());
    const water = await visual.create(block('minecraft:water', { level: '0' })); const lava = await visual.create(block('minecraft:lava', { level: '0' }));
    expect(water.mode).toBe('real'); expect(lava.mode).toBe('real');
    const waterMaterial = (water.object?.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial; const lavaMaterial = (lava.object?.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    expect(waterMaterial.transparent).toBe(true); expect(lavaMaterial.transparent).toBe(false); expect(water.object?.userData['fluidKind']).toBe('water'); expect(lava.object?.userData['fluidKind']).toBe('lava');
  });
  it('uses one nearest-filtered frame from an animated fluid strip without mutating the cache texture', () => {
    const source = new THREE.Texture(); source.image = { width: 16, height: 64 } as never;
    const view = staticFluidTextureView(source, { animation: { frames: [{ index: 1 }], height: 16 } });
    expect(view).not.toBe(source); expect(view.repeat.y).toBeCloseTo(.25); expect(view.offset.y).toBeCloseTo(.5);
    expect(view.magFilter).toBe(THREE.NearestFilter); expect(view.minFilter).toBe(THREE.NearestFilter); expect(source.repeat.y).toBe(1);
  });
});

function realLikeVisualProvider(): VanillaBlockVisualProvider {
  const json = {
    'assets/minecraft/blockstates/stone.json': { variants: { '': [{ model: 'minecraft:block/stone' }, { model: 'minecraft:block/stone_mirrored' }] } },
    'assets/minecraft/blockstates/stone_slab.json': { variants: { 'type=bottom': { model: 'minecraft:block/stone_slab' }, 'type=double': { model: 'minecraft:block/stone' }, 'type=top': { model: 'minecraft:block/stone_slab_top' } } },
    'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
    'assets/minecraft/models/block/stone_mirrored.json': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
    'assets/minecraft/models/block/cube_all.json': { parent: 'block/cube', textures: { down: '#all', up: '#all', north: '#all', south: '#all', west: '#all', east: '#all' } },
    'assets/minecraft/models/block/cube.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: cubeFaces() }] },
    'assets/minecraft/models/block/stone_slab.json': { parent: 'minecraft:block/slab', textures: { bottom: 'minecraft:block/stone', side: 'minecraft:block/stone', top: 'minecraft:block/stone' } },
    'assets/minecraft/models/block/slab.json': { elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { down: { texture: '#bottom' }, up: { texture: '#top' }, north: { texture: '#side' }, south: { texture: '#side' }, west: { texture: '#side' }, east: { texture: '#side' } } }] },
  };
  const assets = new VanillaAssetProvider('1.21.1.jar', json, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1])]]));
  return new VanillaBlockVisualProvider(assets, async () => new THREE.Texture());
}

function cubeFaces(): Record<string, { texture: string }> { return Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map((direction) => [direction, { texture: `#${direction}` }])); }
function block(id: string, state: Readonly<Record<string, string>>): import('../domain/project.types').PlacedBlock { return { kind: 'resolved', id, namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state }; }
function firstMaterial(root: THREE.Object3D): THREE.MeshLambertMaterial { let result: THREE.MeshLambertMaterial | undefined; root.traverse((object) => { if (!result && object instanceof THREE.Mesh) result = object.material as THREE.MeshLambertMaterial; }); return result!; }
