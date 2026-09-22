import { describe, expect, it } from 'vitest';
import { assessFabricCompatibility, ExternalModProvider, parseFabricModMetadata } from './external-mod-provider';

const blockstate = { variants: { 'powered=false': { model: 'example:block/widget' }, 'powered=true': { model: 'example:block/widget' } } };

describe('ExternalModProvider', () => {
  it('keeps Fabric compatibility conservative across project versions', () => {
    expect(assessFabricCompatibility('1.21.x', '1.21.1')).toBe('compatible');
    expect(assessFabricCompatibility('1.20.6', '1.21.1')).toBe('incompatible');
    expect(assessFabricCompatibility('[1.20,1.22)', '1.21.1')).toBe('compatible');
  });
  it('parses Fabric metadata and keeps source identity separate from namespaces', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'example', name: 'Example Mod', version: '1.2.3', depends: { minecraft: '1.21.x' } },
      json: new Map<string, unknown>([
        ['assets/example/blockstates/widget.json', blockstate],
        ['assets/example_compat/models/block/widget.json', { parent: 'minecraft:block/cube_all' }],
        ['assets/example/lang/en_us.json', { 'block.example.widget': 'Widget' }],
      ]),
      resources: new Map(),
    });
    expect(provider.source.id).toBe('mod:example');
    expect(provider.source.namespaces).toEqual(['example', 'example_compat']);
    expect(provider.catalog().blocks).toMatchObject([{ id: 'example:widget', displayName: 'Widget', behaviorSupport: 'unknown', defaultStateSource: 'resource-derived' }]);
    expect(provider.catalog().blocks[0]?.stateDefinitions).toEqual([{ name: 'powered', values: ['false', 'true'] }]);
  });

  it('requires blockstate evidence and does not infer vanilla behavior from names', () => {
    const resourcesOnly = ExternalModProvider.create({ metadata: { id: 'resources-only', version: '1.0.0' }, json: new Map<string, unknown>([['assets/resources_only/models/block/ghost.json', {}], ['assets/resources_only/lang/en_us.json', {}]]), resources: new Map() });
    expect(resourcesOnly.catalog().blocks).toHaveLength(0);
    const provider = ExternalModProvider.create({
      metadata: { id: 'lookalike', version: '1.0.0' },
      json: new Map([
        ['assets/lookalike/models/block/fake_sign.json', {}],
        ['assets/lookalike/textures/block/fake_sign.png', {}],
        ['assets/lookalike/blockstates/fake_sign.json', { variants: { '': { model: 'lookalike:block/fake_sign' } } }],
      ]),
      resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(provider.catalog().blocks).toHaveLength(1);
    expect(definition.id).toBe('lookalike:fake_sign');
    expect(definition.behavior).toBeUndefined();
    expect(definition.behaviorSupport).toBe('unknown');
  });

  it('rejects malformed or invalid Fabric metadata', () => {
    expect(() => parseFabricModMetadata({ version: '1.0.0' })).toThrow(/mod id/);
    expect(() => parseFabricModMetadata({ id: 'bad id', version: '1.0.0' })).toThrow(/invalid mod id/);
    expect(() => parseFabricModMetadata({ id: 'valid', version: '' })).toThrow(/version/);
  });

  it('serializes and restores normalized resources', () => {
    const provider = ExternalModProvider.create({ metadata: { id: 'roundtrip', version: '1.0.0' }, json: new Map([['assets/roundtrip/blockstates/a.json', { variants: {} }]]), resources: new Map([['assets/roundtrip/textures/block/a.png', new Uint8Array([1, 2, 3])]]) });
    const restored = ExternalModProvider.deserialize(provider.serialize());
    expect(restored.source.id).toBe(provider.source.id);
    expect(restored.readJson('assets/roundtrip/blockstates/a.json')).toEqual({ variants: {} });
    expect([...restored.readBinary('assets/roundtrip/textures/block/a.png')!]).toEqual([1, 2, 3]);
  });

  it('discovers modern and legacy Items independently from Blocks', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'content', version: '1.0.0', depends: { minecraft: '>=1.20 <1.22' } },
      json: new Map([
        ['assets/content/blockstates/marble.json', { variants: { '': { model: 'content:block/marble' } } }],
        ['assets/content/items/marble.json', { model: 'content:item/marble' }],
        ['assets/content/models/item/gem.json', { parent: 'minecraft:item/generated' }],
      ]),
      resources: new Map(),
    });
    const source = provider.catalog();
    expect(source.blocks.map((entry) => entry.id)).toEqual(['content:marble']);
    expect(source.targetItems?.map((entry) => [entry.itemId, entry.sourceFormat])).toEqual([
      ['content:gem', 'legacy-item-model'],
      ['content:marble', 'modern-item-definition'],
    ]);
    expect(source.targetItems?.find((entry) => entry.itemId === 'content:gem')?.explicitBlockPlacement).toBeUndefined();
    expect(source.targetItems?.find((entry) => entry.itemId === 'content:marble')?.explicitBlockPlacement).toEqual({ blockId: 'content:marble' });
  });

  it('uses trusted additive tags for common behavior and fails closed for lookalikes', () => {
    const make = (id: string, tagged: boolean) => ExternalModProvider.create({
      metadata: { id: tagged ? 'tagged' : 'lookalike', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [`assets/${id.split(':')[0]}/blockstates/${id.split(':')[1]}.json`, { multipart: [{ when: { north: 'true' }, apply: { model: `${id.split(':')[0]}:block/${id.split(':')[1]}` } }], variants: { 'north=false,east=false,south=false,west=false': { model: `${id.split(':')[0]}:block/${id.split(':')[1]}` } } }],
        ...(tagged ? [['data/minecraft/tags/block/fences.json', { replace: false, values: [id] }] as const] : []),
      ]),
      resources: new Map(),
    });
    const tagged = make('example:maple_fence', true).catalog().blocks[0]!;
    const lookalike = make('example:fake_fence', false).catalog().blocks[0]!;
    expect(tagged.behavior?.kind).toBe('horizontal-connect');
    expect(lookalike.behavior).toBeUndefined();
  });

  it('discovers data-driven painting variants and placeable tag state', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'paintings', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        ['data/example/painting_variant/poster.json', { width: 2, height: 1, asset_id: 'example:poster' }],
        ['data/minecraft/tags/painting_variant/placeable.json', { replace: false, values: ['example:poster'] }],
      ]),
      resources: new Map(),
    });
    expect(provider.catalog().paintingVariants).toEqual([{ id: 'example:poster', width: 2, height: 1, assetPath: 'example:painting/poster', placeable: true, sourceId: 'mod:paintings', sourceName: 'paintings' }]);
  });
  it('preserves nested painting asset paths during normalization', () => {
    const provider = ExternalModProvider.create({ metadata: { id: 'nested-paintings', version: '1.0.0' }, json: new Map([['data/example/painting_variant/gallery.json', { width: 1, height: 1, asset_id: 'example:gallery/poster' }]]), resources: new Map() });
    expect(provider.catalog().paintingVariants?.[0]?.assetPath).toBe('example:painting/gallery/poster');
  });
  it('connects a generic semantic manifest to the external catalog descriptor', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'semantic', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        ['assets/semantic/blockstates/showcase.json', { variants: { 'facing=north': { model: 'semantic:block/showcase' } } }],
        ['data/minecraftbuilder/semantic-manifest.json', { schemaVersion: 1, content: { 'semantic:showcase': { properties: { slot: { values: ['0'], defaultValue: '0', effects: { itemDisplay: true } } }, capabilities: [{ kind: 'item-storage-display', slotCount: 1, evidence: 'verified' }], specialVisual: { contractId: 'common-sign', resources: { default: 'semantic:entity/signs/maple' }, stateDependencies: ['facing'] } } } }],
      ]), resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(definition.contentDescriptor?.properties.map((property) => property.name)).toContain('slot');
    expect(definition.capabilities).toContainEqual({ kind: 'item-storage-display', slotCount: 1, evidence: 'verified' });
    expect(definition.specialVisual?.contractId).toBe('common-sign');
  });

  it('reevaluates a normalized cache entry for a different project version', () => {
    const provider = ExternalModProvider.create({ metadata: { id: 'range', version: '1.0.0', depends: { minecraft: '>=1.20 <1.22' } }, json: new Map([['assets/range/blockstates/a.json', { variants: {} }]]), resources: new Map(), minecraftVersion: '1.21.1' });
    const restored = ExternalModProvider.deserialize(provider.serialize(), '1.20.6');
    expect(restored.report.compatibility?.status).toBe('compatible');
    expect(restored.source.minecraftVersion).toBe('1.20.6');
    expect('minecraftVersion' in restored.serialize()).toBe(false);
    expect('projectMinecraftVersion' in restored.serialize().report).toBe(false);
  });
});
