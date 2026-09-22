import { afterEach, describe, expect, it, vi } from 'vitest';
import { VanillaAssetProvider, texturePath } from './vanilla-asset-provider';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { parseVanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';

describe('VanillaAssetProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves generic namespaced texture paths and preserves missing resources', () => {
    expect(texturePath('minecraft:block/stone')).toBe('assets/minecraft/textures/block/stone.png');
    expect(texturePath('minecraft:textures/block/yellow_stained_glass.png')).toBe('assets/minecraft/textures/block/yellow_stained_glass.png');
    expect(texturePath('assets/minecraft/textures/entity/shulker/shulker_yellow.png')).toBe('assets/minecraft/textures/entity/shulker/shulker_yellow.png');
    expect(texturePath('example:custom/path')).toBe('assets/example/textures/custom/path.png');
    const provider = new VanillaAssetProvider('fixture.jar', { 'assets/example/models/block/test.json': { elements: [] } }, new Map());
    expect(provider.readJson('assets/example/models/block/test.json')).toEqual({ elements: [] });
    expect(provider.readJson('assets/example/models/block/missing.json')).toBeUndefined();
  });

  it('returns one cached object URL for repeated texture lookup', () => {
    const createObjectUrl = vi.fn(() => 'blob:texture'); const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const provider = new VanillaAssetProvider('fixture.jar', {}, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1, 2, 3])]]));
    expect(provider.textureUrl('minecraft:block/stone')).toBe('blob:texture');
    expect(provider.textureUrl('minecraft:block/stone')).toBe('blob:texture');
    expect(createObjectUrl).toHaveBeenCalledTimes(1); provider.dispose(); expect(revokeObjectUrl).toHaveBeenCalledWith('blob:texture');
  });

  it('builds a localized blockstate-derived catalog and overlays verified definitions', () => {
    const provider = new VanillaAssetProvider('fixture.jar', {
      'assets/minecraft/lang/en_us.json': { 'block.minecraft.stone': 'Stone', 'block.example.machine': 'Machine' },
      'assets/minecraft/blockstates/stone.json': { variants: { '': { model: 'minecraft:block/stone' } } },
      'assets/example/blockstates/machine.json': { variants: { 'facing=north': { model: 'example:block/machine' }, 'facing=south': { model: 'example:block/machine' } } },
    }, new Map());
    const catalog = new BlockCatalog(); catalog.load(provider.catalog());
    expect(catalog.get('minecraft:stone')).toMatchObject({ displayName: 'Stone', namespace: 'minecraft', support: 'fallback' });
    expect(catalog.get('example:machine')).toMatchObject({ displayName: 'Machine', namespace: 'example', support: 'partial', stateDefinitions: [{ name: 'facing', values: ['north', 'south'] }] });
  });

  it('retains modern item definitions as placeable evidence without promoting internal blocks', () => {
    const provider = new VanillaAssetProvider('26.3.jar', '26.3', {
      'assets/minecraft/items/copper_torch.json': { model: { type: 'minecraft:model', model: 'minecraft:block/copper_torch' } },
      'assets/minecraft/blockstates/copper_torch.json': { variants: { '': { model: 'minecraft:block/copper_torch' } } },
      'assets/minecraft/blockstates/copper_wall_torch.json': { variants: { facing: { model: 'minecraft:block/copper_wall_torch' } } },
      'assets/minecraft/blockstates/potted_torchflower.json': { variants: { '': { model: 'minecraft:block/potted_torchflower' } } },
    }, new Map());
    const source = provider.catalog();
    expect(source.blocks.find((block) => block.id === 'minecraft:copper_torch')?.itemEvidence).toMatchObject({ itemId: 'minecraft:copper_torch', placeable: true, sourceFormat: 'modern-item-definition' });
    expect(source.blocks.find((block) => block.id === 'minecraft:potted_torchflower')?.itemEvidence).toBeUndefined();
  });

  it('keeps item registry evidence independent when an item targets a different fluid block', () => {
    const provider = new VanillaAssetProvider('26.3.jar', '26.3', {
      'assets/minecraft/items/water_bucket.json': { model: { type: 'minecraft:model', model: 'minecraft:item/water_bucket' } },
      'assets/minecraft/items/lava_bucket.json': { model: { type: 'minecraft:model', model: 'minecraft:item/lava_bucket' } },
      'assets/minecraft/blockstates/water.json': { variants: { level: { model: 'minecraft:block/water' } } },
      'assets/minecraft/blockstates/lava.json': { variants: { level: { model: 'minecraft:block/lava' } } },
    }, new Map());
    const source = provider.catalog();
    expect(source.targetItems?.map((item) => item.itemId)).toEqual(['minecraft:lava_bucket', 'minecraft:water_bucket']);
    expect(source.targetItems?.every((item) => !source.blocks.some((block) => block.id === item.itemId))).toBe(true);
  });

  it('keeps declared Full support only when the representative model and PNG resolve', () => {
    const provider = new VanillaAssetProvider('fixture.jar', {
      'assets/minecraft/lang/en_us.json': { 'block.minecraft.stone': 'Stone' },
      'assets/minecraft/blockstates/stone.json': { variants: { '': { model: 'minecraft:block/stone' } } },
      'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
      'assets/minecraft/models/block/cube_all.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }] },
    }, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1])]]));
    const catalog = new BlockCatalog(); catalog.load(provider.catalog());
    expect(catalog.get('minecraft:stone')?.support).toBe('full');
  });

  it('enriches generated visual entries with independent vanilla behavior metadata', () => {
    const provider = new VanillaAssetProvider('fixture.jar', {
      'assets/minecraft/lang/en_us.json': {},
      'assets/minecraft/blockstates/acacia_fence.json': { multipart: [{ apply: { model: 'minecraft:block/acacia_fence_post' } }] },
      'assets/minecraft/blockstates/red_bed.json': { variants: { 'facing=north,occupied=false,part=foot': { model: 'minecraft:block/red_bed_foot' } } },
      'assets/minecraft/blockstates/custom_visual.json': { variants: { '': { model: 'minecraft:block/custom_visual' } } },
      'assets/minecraft/models/block/custom_visual.json': { textures: { all: 'minecraft:block/custom_visual' }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }] },
      'data/minecraft/tags/block/fences.json': { values: ['#minecraft:wooden_fences'] },
      'data/minecraft/tags/block/wooden_fences.json': { values: ['minecraft:acacia_fence'] },
      'data/minecraft/tags/block/beds.json': { values: ['minecraft:red_bed'] },
    }, new Map([['assets/minecraft/textures/block/custom_visual.png', new Uint8Array([1])]]));
    const catalog = new BlockCatalog(); catalog.load(provider.catalog());
    expect(catalog.get('minecraft:acacia_fence')).toMatchObject({ visualSupport: 'partial', behaviorSupport: 'partial', behavior: { family: 'fence' } });
    expect(catalog.get('minecraft:red_bed')).toMatchObject({ visualSupport: 'fallback', behaviorSupport: 'full', behavior: { kind: 'paired-horizontal' } });
    expect(catalog.get('minecraft:custom_visual')).toMatchObject({ visualSupport: 'real', behaviorSupport: 'unknown' });
    expect(catalog.get('minecraft:custom_visual')?.behavior).toBeUndefined();
  });

  it('applies the verified three-slot Shelf host contract only to the known Vanilla family', () => {
    const provider = new VanillaAssetProvider('26.3.jar', '26.3', {
      'assets/minecraft/lang/en_us.json': { 'block.minecraft.oak_shelf': 'Oak Shelf', 'item.minecraft.oak_shelf': 'Oak Shelf' },
      'assets/minecraft/blockstates/oak_shelf.json': { variants: { 'facing=north,powered=false': { model: 'minecraft:block/oak_shelf_unpowered' } } },
      'assets/minecraft/items/oak_shelf.json': { model: { type: 'minecraft:model', model: 'minecraft:block/oak_shelf_inventory' } },
    }, new Map());
    const shelf = provider.catalog().blocks.find((entry) => entry.id === 'minecraft:oak_shelf');
    expect(shelf?.capabilities).toContainEqual({ kind: 'item-storage-display', slotCount: 3, evidence: 'verified' });
    expect(provider.catalog().targetItems?.map((item) => item.itemId)).toContain('minecraft:oak_shelf');
  });

  it('round-trips its versioned normalized cache', () => {
    const original = new VanillaAssetProvider('fixture.jar', { 'assets/minecraft/lang/en_us.json': {} }, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([4, 5])]]));
    const restored = VanillaAssetProvider.deserialize(original.serialize());
    expect(restored.sourceName).toBe('fixture.jar');
    expect([...restored.readBinary('assets/minecraft/textures/block/stone.png')!]).toEqual([4, 5]);
  });

  it('derives a renderable generic default state independently of behavior compatibility', () => {
    const provider = new VanillaAssetProvider('target.jar', {
      'assets/minecraft/blockstates/acacia_log.json': { variants: { 'axis=x': { model: 'minecraft:block/log' }, 'axis=y': { model: 'minecraft:block/log' }, 'axis=z': { model: 'minecraft:block/log' } } },
      'assets/minecraft/models/block/log.json': { elements: [] },
    }, new Map());
    const log = provider.catalog().blocks.find((entry) => entry.id === 'minecraft:acacia_log');
    expect(log?.defaultState).toEqual({ axis: 'x' });
    expect(log?.defaultStateSource).toBe('resource-render-fallback');
  });

  it('treats an unconditional empty blockstate variant as a known empty default', () => {
    const provider = new VanillaAssetProvider('target.jar', {
      'assets/example/blockstates/simple.json': { variants: { '': { model: 'example:block/simple' } } },
    }, new Map());
    expect(provider.catalog().blocks.find((entry) => entry.id === 'example:simple')).toMatchObject({ defaultState: {}, defaultStateSource: 'resource-derived' });
  });

  it('rejects a stale normalized cache schema', () => {
    const original = new VanillaAssetProvider('fixture.jar', {}, new Map()).serialize();
    expect(() => VanillaAssetProvider.deserialize({ ...original, schemaVersion: 1 } as never)).toThrow('cache is outdated');
  });

  it('reports whether restored core Stone resources are usable', () => {
    const provider = new VanillaAssetProvider('fixture.jar', {
      'assets/minecraft/lang/en_us.json': {},
      'assets/minecraft/blockstates/stone.json': {},
      'assets/minecraft/models/block/stone.json': {},
    }, new Map([['assets/minecraft/textures/block/stone.png', new Uint8Array([1])]]));
    expect(provider.diagnostics()).toMatchObject({ resourceCount: 4, language: true, stoneBlockstate: true, stoneModel: true, stoneTexture: true });
    expect(() => provider.assertUsable()).not.toThrow();
  });

  it('does not apply the verified 1.21.1 Stone checks to another modern release', () => {
    const provider = new VanillaAssetProvider('fixture-26.3.jar', '26.3', {
      'assets/minecraft/blockstates/custom.json': {},
      'assets/minecraft/models/block/custom.json': {},
    }, new Map());
    expect(provider.diagnostics().resourceFormat.support).toBe('resource-compatible');
    expect(() => provider.assertUsable()).not.toThrow();
  });

  it('accepts a legacy-limited resource set without calling it a bad download', () => {
    const provider = new VanillaAssetProvider('legacy.jar', '1.7.10', {
      'assets/minecraft/lang/en_us.json': {},
    }, new Map([['assets/minecraft/textures/stone.png', new Uint8Array([1])]]));
    expect(provider.diagnostics().resourceFormat.support).toBe('legacy-limited');
    expect(() => provider.assertUsable()).not.toThrow();
  });

  it('composes authoritative defaults, translations, visual resources, and behavior independently', () => {
    const registry = parseVanillaBlockRegistry({ schemaVersion: 1, minecraftVersion: '1.21.1', source: 'test report', blocks: [
      { id: 'minecraft:acacia_stairs', properties: [{ name: 'facing', values: ['north', 'south'] }, { name: 'half', values: ['top', 'bottom'] }, { name: 'shape', values: ['straight'] }, { name: 'waterlogged', values: ['true', 'false'] }], defaultState: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } },
    ] });
    const provider = new VanillaAssetProvider('fixture.jar', {
      'assets/minecraft/lang/en_us.json': { 'block.minecraft.acacia_stairs': 'Acacia Stairs' },
      'assets/minecraft/blockstates/acacia_stairs.json': { variants: { 'facing=north,half=bottom,shape=straight': { model: 'minecraft:block/acacia_stairs' } } },
      'data/minecraft/tags/block/stairs.json': { values: ['minecraft:acacia_stairs'] },
    }, new Map());
    const catalog = new BlockCatalog(); catalog.load(provider.catalog(registry));
    expect(catalog.all()).toHaveLength(1);
    expect(catalog.get('minecraft:acacia_stairs')).toMatchObject({ displayName: 'Acacia Stairs', defaultStateSource: 'authoritative-report', defaultState: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' }, behavior: { kind: 'stairs' } });
  });
});
