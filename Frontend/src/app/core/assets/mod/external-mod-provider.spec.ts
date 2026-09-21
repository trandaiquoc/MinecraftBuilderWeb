import { describe, expect, it } from 'vitest';
import { ExternalModProvider, parseFabricModMetadata } from './external-mod-provider';

const blockstate = { variants: { 'powered=false': { model: 'example:block/widget' }, 'powered=true': { model: 'example:block/widget' } } };

describe('ExternalModProvider', () => {
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
    expect(provider.catalog().blocks).toMatchObject([{ id: 'example:widget', displayName: 'Widget', behaviorSupport: 'unknown', defaultStateSource: 'unknown' }]);
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
});
