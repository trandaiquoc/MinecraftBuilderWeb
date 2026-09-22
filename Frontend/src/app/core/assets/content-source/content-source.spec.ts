import { BlockModelResolver } from '../../blocks/resolver';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { ContentSourceRegistry } from './content-source-registry';
import { ContentSourceProvider } from './content-source.types';
import type { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';
import { describe, expect, it } from 'vitest';

class FakeSource implements ContentSourceProvider {
  readonly source;
  private readonly json: Readonly<Record<string, unknown>>;
  private readonly binary = new Map<string, Uint8Array>();
  disposed = false;
  constructor(id: string, namespaces: readonly string[], json: Readonly<Record<string, unknown>>, blocks: readonly AssetBlockRecord[] = [], minecraftVersion = '1.21.1') {
    this.source = { id, kind: id === 'vanilla' ? 'vanilla' as const : 'external' as const, displayName: id === 'vanilla' ? 'Vanilla' : 'Example Content', minecraftVersion, namespaces };
    this.json = json; this.blocks = blocks;
  }
  readonly blocks: readonly AssetBlockRecord[];
  readJson(path: string): unknown | undefined { return this.json[path]; }
  paths(): readonly string[] { return Object.keys(this.json); }
  readBinary(path: string): Uint8Array | undefined { return this.binary.get(path); }
  textureUrl(): string | undefined { return undefined; }
  catalog() { return { minecraftVersion: '1.21.1' as const, sourceId: this.source.id, sourceName: this.source.displayName, blocks: this.blocks, targetItems: this.items, itemEvidenceAvailable: this.items.length > 0 }; }
  items: readonly import('../../blocks/catalog/block-definition.types').CatalogItemEvidence[] = [];
  dispose(): void { this.disposed = true; }
}

const block = (id: string, sourceId: string) => ({ id, displayName: id, defaultState: {}, stateDefinitions: [], resources: { blockstate: `assets/${id.split(':')[0]}/blockstates/${id.split(':')[1]}.json`, model: `assets/${id.split(':')[0]}/models/block/${id.split(':')[1]}.json`, textures: [] }, support: 'full' as const, visualSupport: 'real' as const, behaviorSupport: 'unknown' as const, defaultStateSource: 'unknown' as const, sourceId });

describe('ContentSourceRegistry', () => {
  it('routes namespaces explicitly and resolves a cross-source parent', () => {
    const vanilla = new FakeSource('vanilla', ['minecraft'], {
      'assets/minecraft/models/block/cube_all.json': { elements: [], textures: { all: 'minecraft:block/stone' } },
      'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all' },
    }, [block('minecraft:stone', 'vanilla')]);
    const external = new FakeSource('example', ['examplemod', 'examplemod_compat'], {
      'assets/examplemod/blockstates/test.json': { variants: { '': { model: 'examplemod:block/test' } } },
      'assets/examplemod/models/block/test.json': { parent: 'minecraft:block/cube_all', textures: { all: 'examplemod:block/test' } },
    }, [block('examplemod:test', 'example')]);
    const registry = new ContentSourceRegistry(); registry.register(vanilla); registry.register(external);
    expect(registry.sources().map((source) => source.id)).toEqual(['vanilla', 'example']);
    expect(registry.resources.readJson('assets/examplemod/models/block/test.json')).toBeDefined();
    const resolved = new BlockModelResolver(registry.resources).resolve('examplemod:test');
    expect(resolved.parts[0]?.model).toBe('examplemod:block/test');
    expect(resolved.trace.parentResources).toContain('assets/minecraft/models/block/cube_all.json');
    const catalog = registry.catalog(); expect(catalog.get('minecraft:stone')?.sourceId).toBe('vanilla'); expect(catalog.get('examplemod:test')?.sourceId).toBe('example');
  });

  it('allows additive namespace contributions and disposes only removed source', () => {
    const registry = new ContentSourceRegistry();
    const first = new FakeSource('first', ['examplemod'], {}); const second = new FakeSource('second', ['examplemod'], {});
    registry.register(first); registry.register(second); expect(registry.resources.providersForNamespace('examplemod')).toHaveLength(2);
    expect(registry.remove('first')).toBe(true); expect(first.disposed).toBe(true); expect(second.disposed).toBe(false);
  });

  it('accepts additive foreign-namespace paths but rejects exact collisions', () => {
    const registry = new ContentSourceRegistry();
    registry.register(new FakeSource('vanilla', ['minecraft'], { 'assets/minecraft/textures/block/stone.png': {} }));
    registry.register(new FakeSource('mod', ['minecraft'], { 'assets/minecraft/textures/entity/signs/example.png': {} }));
    expect(registry.resources.readJson('assets/minecraft/textures/entity/signs/example.png')).toEqual({});
    expect(() => registry.register(new FakeSource('other', ['minecraft'], { 'assets/minecraft/textures/block/stone.png': {} }))).toThrow(/Resource collision/);
  });

  it('merges additive tag values and blocks replace=true', () => {
    const registry = new ContentSourceRegistry();
    registry.register(new FakeSource('vanilla', ['minecraft'], { 'data/minecraft/tags/block/fences.json': { replace: false, values: ['minecraft:oak_fence'] } }));
    registry.register(new FakeSource('mod', ['example'], { 'data/minecraft/tags/block/fences.json': { replace: false, values: ['example:maple_fence'] } }));
    expect(registry.resources.readJson('data/minecraft/tags/block/fences.json')).toEqual({ replace: false, values: ['minecraft:oak_fence', 'example:maple_fence'] });
    expect(() => registry.register(new FakeSource('replace', ['other'], { 'data/minecraft/tags/block/fences.json': { replace: true, values: [] } }))).toThrow(/Tag replacement/);
  });

  it('rejects sources targeting an incompatible Minecraft version', () => {
    const registry = new ContentSourceRegistry();
    const incompatible = new FakeSource('old', ['old'], {});
    (incompatible.source as { minecraftVersion: string }).minecraftVersion = '1.20.6';
    expect(() => registry.register(incompatible)).toThrow(/Expected 1\.21\.1/);
    expect(registry.sources()).toEqual([]);
  });

  it('accepts sources matching a selected non-default active version', () => {
    const registry = new ContentSourceRegistry('1.20.6');
    registry.register(new FakeSource('vanilla-1.20.6', ['minecraft'], {}, [], '1.20.6'));
    expect(registry.sources().map((source) => source.minecraftVersion)).toEqual(['1.20.6']);
  });

  it('reports duplicate block IDs without replacing the first contribution', () => {
    const registry = new ContentSourceRegistry();
    registry.register(new FakeSource('one', ['one'], {}, [block('shared:block', 'one')]));
    registry.register(new FakeSource('two', ['two'], {}, [block('shared:block', 'two')]));
    const catalog: BlockCatalog = registry.catalog();
    expect(catalog.get('shared:block')?.sourceId).toBe('one');
    expect(catalog.conflicts()).toEqual([{ id: 'shared:block', sourceIds: ['one', 'two'] }]);
  });

  it('keeps catalog diagnostics current across repeated reads and source replacement', () => {
    const registry = new ContentSourceRegistry();
    registry.register(new FakeSource('one', ['one'], {}, [block('shared:block', 'one')]));
    registry.register(new FakeSource('two', ['two'], {}, [block('shared:block', 'two')]));
    expect(registry.catalogConflicts()).toEqual([{ id: 'shared:block', sourceIds: ['one', 'two'] }]);
    expect(registry.catalogConflicts()).toEqual([{ id: 'shared:block', sourceIds: ['one', 'two'] }]);
    registry.remove('two');
    expect(registry.catalogConflicts()).toEqual([]);
  });

  it('exposes independent item evidence from every active content source', () => {
    const registry = new ContentSourceRegistry();
    const vanilla = new FakeSource('vanilla', ['minecraft'], {}); vanilla.items = [{ itemId: 'minecraft:stone', referencedModels: [], referencedResources: [], sourceFormat: 'authoritative-registry' }];
    const external = new FakeSource('example', ['example'], {}); external.items = [{ itemId: 'example:gem', referencedModels: [], referencedResources: [], sourceFormat: 'modern-item-definition' }];
    registry.register(vanilla); registry.register(external);
    expect(registry.itemEvidenceSources().flatMap((source) => source.items.map((item) => item.itemId))).toEqual(['minecraft:stone', 'example:gem']);
  });
});
