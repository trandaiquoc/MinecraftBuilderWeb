import { BlockModelResolver } from '../../blocks/resolver';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { ContentSourceRegistry } from './content-source-registry';
import { ContentSourceCleanupError } from './composite-asset-provider';
import { ContentSourceProvider } from './content-source.types';
import type { AssetBlockRecord } from '../../blocks/catalog/block-definition.types';
import { describe, expect, it } from 'vitest';

class FakeSource implements ContentSourceProvider {
  readonly source;
  private readonly json: Readonly<Record<string, unknown>>;
  private readonly binary = new Map<string, Uint8Array>();
  disposed = false;
  disposeCount = 0;
  failPaths = false;
  failCatalog = false;
  failDispose = false;
  constructor(
    id: string,
    namespaces: readonly string[],
    json: Readonly<Record<string, unknown>>,
    blocks: readonly AssetBlockRecord[] = [],
    minecraftVersion = '1.21.1',
  ) {
    this.source = {
      id,
      kind: id === 'vanilla' ? ('vanilla' as const) : ('external' as const),
      displayName: id === 'vanilla' ? 'Vanilla' : 'Example Content',
      minecraftVersion,
      namespaces,
    };
    this.json = json;
    this.blocks = blocks;
  }
  readonly blocks: readonly AssetBlockRecord[];
  readJson(path: string): unknown | undefined {
    return this.json[path];
  }
  paths(): readonly string[] {
    if (this.failPaths) throw new Error('path enumeration failed');
    return Object.keys(this.json);
  }
  readBinary(path: string): Uint8Array | undefined {
    return this.binary.get(path);
  }
  textureUrl(): string | undefined {
    return undefined;
  }
  catalog() {
    if (this.failCatalog) throw new Error('catalog construction failed');
    return {
      minecraftVersion: '1.21.1' as const,
      sourceId: this.source.id,
      sourceName: this.source.displayName,
      blocks: this.blocks,
      targetItems: this.items,
      itemEvidenceAvailable: this.items.length > 0,
      paintingVariants: this.paintings,
    };
  }
  items: readonly import('../../blocks/catalog/block-definition.types').CatalogItemEvidence[] = [];
  paintings: readonly import('../../decorations/decoration.types').PaintingVariant[] = [];
  dispose(): void {
    this.disposed = true;
    this.disposeCount += 1;
    if (this.failDispose) throw new Error('provider cleanup failed');
  }
}

const block = (id: string, sourceId: string) => ({
  id,
  displayName: id,
  defaultState: {},
  stateDefinitions: [],
  resources: {
    blockstate: `assets/${id.split(':')[0]}/blockstates/${id.split(':')[1]}.json`,
    model: `assets/${id.split(':')[0]}/models/block/${id.split(':')[1]}.json`,
    textures: [],
  },
  support: 'full' as const,
  visualSupport: 'real' as const,
  behaviorSupport: 'unknown' as const,
  defaultStateSource: 'unknown' as const,
  sourceId,
});

describe('ContentSourceRegistry', () => {
  it('routes namespaces explicitly and resolves a cross-source parent', () => {
    const vanilla = new FakeSource(
      'vanilla',
      ['minecraft'],
      {
        'assets/minecraft/models/block/cube_all.json': {
          elements: [],
          textures: { all: 'minecraft:block/stone' },
        },
        'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all' },
      },
      [block('minecraft:stone', 'vanilla')],
    );
    const external = new FakeSource(
      'example',
      ['examplemod', 'examplemod_compat'],
      {
        'assets/examplemod/blockstates/test.json': {
          variants: { '': { model: 'examplemod:block/test' } },
        },
        'assets/examplemod/models/block/test.json': {
          parent: 'minecraft:block/cube_all',
          textures: { all: 'examplemod:block/test' },
        },
      },
      [block('examplemod:test', 'example')],
    );
    const registry = new ContentSourceRegistry();
    registry.register(vanilla);
    registry.register(external);
    expect(registry.sources().map((source) => source.id)).toEqual(['vanilla', 'example']);
    expect(registry.resources.readJson('assets/examplemod/models/block/test.json')).toBeDefined();
    const resolved = new BlockModelResolver(registry.resources).resolve('examplemod:test');
    expect(resolved.parts[0]?.model).toBe('examplemod:block/test');
    expect(resolved.trace.parentResources).toContain('assets/minecraft/models/block/cube_all.json');
    const catalog = registry.catalog();
    expect(catalog.get('minecraft:stone')?.sourceId).toBe('vanilla');
    expect(catalog.get('examplemod:test')?.sourceId).toBe('example');
  });

  it('allows additive namespace contributions and disposes only removed source', () => {
    const registry = new ContentSourceRegistry();
    const first = new FakeSource('first', ['examplemod'], {});
    const second = new FakeSource('second', ['examplemod'], {});
    registry.register(first);
    registry.register(second);
    expect(registry.resources.providersForNamespace('examplemod')).toHaveLength(2);
    expect(registry.remove('first')).toBe(true);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(false);
  });

  it('accepts additive foreign-namespace paths but rejects exact collisions', () => {
    const registry = new ContentSourceRegistry();
    const vanilla = new FakeSource('vanilla', ['minecraft'], {
      'assets/minecraft/textures/block/stone.png': {},
    });
    registry.register(vanilla);
    registry.register(
      new FakeSource('mod', ['minecraft'], {
        'assets/minecraft/textures/entity/signs/example.png': {},
      }),
    );
    expect(
      registry.resources.readJson('assets/minecraft/textures/entity/signs/example.png'),
    ).toEqual({});
    const generation = registry.generation;
    expect(() =>
      registry.register(
        new FakeSource('other', ['minecraft'], { 'assets/minecraft/textures/block/stone.png': {} }),
      ),
    ).toThrow(/Resource collision/);
    expect(registry.sources().map(({ id }) => id)).toEqual(['vanilla', 'mod']);
    expect(registry.resources.readJson('assets/minecraft/textures/block/stone.png')).toEqual({});
    expect(registry.resources.paths()).toEqual([
      'assets/minecraft/textures/block/stone.png',
      'assets/minecraft/textures/entity/signs/example.png',
    ]);
    expect(registry.generation).toBe(generation);
    expect(vanilla.disposeCount).toBe(0);
  });

  it('merges additive tag values and blocks replace=true', () => {
    const registry = new ContentSourceRegistry();
    registry.register(
      new FakeSource('vanilla', ['minecraft'], {
        'data/minecraft/tags/block/fences.json': {
          replace: false,
          values: ['minecraft:oak_fence'],
        },
      }),
    );
    registry.register(
      new FakeSource('mod', ['example'], {
        'data/minecraft/tags/block/fences.json': {
          replace: false,
          values: ['example:maple_fence'],
        },
      }),
    );
    expect(registry.resources.readJson('data/minecraft/tags/block/fences.json')).toEqual({
      replace: false,
      values: ['minecraft:oak_fence', 'example:maple_fence'],
    });
    const generation = registry.generation;
    expect(() =>
      registry.register(
        new FakeSource('replace', ['other'], {
          'data/minecraft/tags/block/fences.json': { replace: true, values: [] },
        }),
      ),
    ).toThrow(/Tag replacement/);
    expect(registry.generation).toBe(generation);
    expect(registry.sources().map(({ id }) => id)).toEqual(['vanilla', 'mod']);
    expect(registry.resources.readJson('data/minecraft/tags/block/fences.json')).toEqual({
      replace: false,
      values: ['minecraft:oak_fence', 'example:maple_fence'],
    });
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
    expect(registry.catalogConflicts()).toEqual([
      { id: 'shared:block', sourceIds: ['one', 'two'] },
    ]);
    expect(registry.catalogConflicts()).toEqual([
      { id: 'shared:block', sourceIds: ['one', 'two'] },
    ]);
    registry.remove('two');
    expect(registry.catalogConflicts()).toEqual([]);
  });

  it('prepares replacement catalog before publication and preserves the old provider on failure', () => {
    const registry = new ContentSourceRegistry();
    const previous = new FakeSource('replaceable', ['example'], {}, [
      block('example:old', 'replaceable'),
    ]);
    registry.register(previous);
    const replacement = new FakeSource('replaceable', ['example'], {}, [
      block('example:new', 'replaceable'),
    ]);
    replacement.failCatalog = true;

    expect(() => registry.replace(replacement)).toThrow('catalog construction failed');
    expect(registry.providerForSource('replaceable')).toBe(previous);
    expect(previous.disposed).toBe(false);
    expect(previous.disposeCount).toBe(0);
    expect(
      registry
        .catalog()
        .all()
        .map((entry) => entry.id),
    ).toEqual(['example:old']);
    expect(registry.generation).toBe(1);
  });

  it('disposes a provider exactly once when its registration is replaced or removed', () => {
    const registry = new ContentSourceRegistry();
    const first = new FakeSource('replaceable', ['example'], {});
    const second = new FakeSource('replaceable', ['example'], {});
    registry.register(first);
    registry.replace(second);
    expect(first.disposeCount).toBe(1);
    registry.remove('replaceable');
    expect(second.disposeCount).toBe(1);
  });

  it('self-replacement republishes catalog without disposing or advancing resource generation', () => {
    const registry = new ContentSourceRegistry();
    const source = new FakeSource('same', ['same'], {}, [block('same:block', 'same')]);
    source.paintings = [
      { id: 'same:painting', width: 1, height: 1, assetPath: 'same:painting', sourceId: 'same' },
    ];
    registry.register(source);
    const generation = registry.generation;
    source.failPaths = true;

    registry.replace(source);

    expect(registry.providerForSource('same')).toBe(source);
    expect(source.disposeCount).toBe(0);
    expect(registry.generation).toBe(generation);
    expect(registry.catalog().get('same:block')).toBeDefined();
    expect(registry.paintingVariants().map(({ id }) => id)).toEqual(['same:painting']);
  });

  it('keeps provider and all contributions unchanged when path preparation fails', () => {
    const registry = new ContentSourceRegistry();
    const previous = new FakeSource('replaceable', ['example'], {}, [
      block('example:old', 'replaceable'),
    ]);
    previous.paintings = [
      {
        id: 'example:old_painting',
        width: 1,
        height: 1,
        assetPath: 'old',
        sourceId: 'replaceable',
      },
    ];
    registry.register(previous);
    const replacement = new FakeSource('replaceable', ['example'], {}, [
      block('example:new', 'replaceable'),
    ]);
    replacement.failPaths = true;
    const generation = registry.generation;

    expect(() => registry.replace(replacement)).toThrow('path enumeration failed');
    expect(registry.providerForSource('replaceable')).toBe(previous);
    expect(
      registry
        .catalog()
        .all()
        .map(({ id }) => id),
    ).toEqual(['example:old']);
    expect(registry.paintingVariants().map(({ id }) => id)).toEqual(['example:old_painting']);
    expect(registry.resources.paths()).toEqual([]);
    expect(registry.generation).toBe(generation);
    expect(previous.disposeCount).toBe(0);
  });

  it('reports old-provider cleanup failure after replacement publication without rollback', () => {
    const registry = new ContentSourceRegistry();
    const previous = new FakeSource('replaceable', ['example'], { 'assets/example/old.json': {} }, [
      block('example:old', 'replaceable'),
    ]);
    previous.paintings = [
      {
        id: 'example:old_painting',
        width: 1,
        height: 1,
        assetPath: 'old',
        sourceId: 'replaceable',
      },
    ];
    previous.failDispose = true;
    registry.register(previous);
    const replacement = new FakeSource(
      'replaceable',
      ['example'],
      { 'assets/example/new.json': {} },
      [block('example:new', 'replaceable')],
    );
    replacement.paintings = [
      {
        id: 'example:new_painting',
        width: 1,
        height: 1,
        assetPath: 'new',
        sourceId: 'replaceable',
      },
    ];

    let failure: unknown;
    try {
      registry.replace(replacement);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ContentSourceCleanupError);
    expect(failure).toMatchObject({ committed: true, failures: [{ sourceId: 'replaceable' }] });
    expect(registry.providerForSource('replaceable')).toBe(replacement);
    expect(registry.resources.readJson('assets/example/new.json')).toEqual({});
    expect(registry.resources.readJson('assets/example/old.json')).toBeUndefined();
    expect(registry.resources.paths()).toEqual(['assets/example/new.json']);
    expect(
      registry
        .catalog()
        .all()
        .map(({ id }) => id),
    ).toEqual(['example:new']);
    expect(registry.paintingVariants().map(({ id }) => id)).toEqual(['example:new_painting']);
    expect(registry.generation).toBe(2);
    expect(previous.disposeCount).toBe(1);
  });

  it('does not publish a source when catalog preparation fails', () => {
    const registry = new ContentSourceRegistry();
    const source = new FakeSource('broken', ['broken'], { 'assets/broken/a.json': {} });
    source.failCatalog = true;
    expect(() => registry.register(source)).toThrow('catalog construction failed');
    expect(registry.providerForSource('broken')).toBeUndefined();
    expect(registry.resources.paths()).toEqual([]);
    expect(registry.generation).toBe(0);
  });

  it('publishes removal and clears contributions before reporting disposal failure', () => {
    const registry = new ContentSourceRegistry();
    const source = new FakeSource('removable', ['removable'], { 'assets/removable/a.json': {} }, [
      block('removable:block', 'removable'),
    ]);
    source.failDispose = true;
    registry.register(source);

    expect(() => registry.remove('removable')).toThrow(ContentSourceCleanupError);
    expect(registry.providerForSource('removable')).toBeUndefined();
    expect(registry.catalog().all()).toEqual([]);
    expect(registry.paintingVariants()).toEqual([]);
    expect(registry.resources.paths()).toEqual([]);
    expect(registry.generation).toBe(2);
    expect(source.disposeCount).toBe(1);
  });

  it('prepares the whole replacement batch before publication and commits all entries before cleanup errors surface', () => {
    const registry = new ContentSourceRegistry();
    const old = new FakeSource('first', ['first'], { 'assets/first/old.json': {} }, [
      block('first:old', 'first'),
    ]);
    old.failDispose = true;
    registry.register(old);
    const replacement = new FakeSource('first', ['first'], { 'assets/first/new.json': {} }, [
      block('first:new', 'first'),
    ]);
    const added = new FakeSource('second', ['second'], { 'assets/second/new.json': {} }, [
      block('second:new', 'second'),
    ]);
    const failingPreparation = new FakeSource('third', ['third'], {});
    failingPreparation.failPaths = true;

    expect(() =>
      registry.commitBatch([
        { provider: replacement, catalog: replacement.catalog(), replaceExisting: true },
        { provider: added, catalog: added.catalog() },
        { provider: failingPreparation, catalog: failingPreparation.catalog() },
      ]),
    ).toThrow('path enumeration failed');
    expect(registry.sources().map(({ id }) => id)).toEqual(['first']);
    expect(
      registry
        .catalog()
        .all()
        .map(({ id }) => id),
    ).toEqual(['first:old']);
    expect(registry.generation).toBe(1);

    expect(() =>
      registry.commitBatch([
        { provider: replacement, catalog: replacement.catalog(), replaceExisting: true },
        { provider: added, catalog: added.catalog() },
      ]),
    ).toThrow(ContentSourceCleanupError);
    expect(registry.sources().map(({ id }) => id)).toEqual(['first', 'second']);
    expect(registry.resources.paths()).toEqual(['assets/first/new.json', 'assets/second/new.json']);
    expect(
      registry
        .catalog()
        .all()
        .map(({ id }) => id),
    ).toEqual(['first:new', 'second:new']);
    expect(registry.providerForSource('first')).toBe(replacement);
    expect(registry.providerForSource('second')).toBe(added);
    expect(registry.generation).toBe(3);
  });

  it('exposes independent item evidence from every active content source', () => {
    const registry = new ContentSourceRegistry();
    const vanilla = new FakeSource('vanilla', ['minecraft'], {});
    vanilla.items = [
      {
        itemId: 'minecraft:stone',
        referencedModels: [],
        referencedResources: [],
        sourceFormat: 'authoritative-registry',
      },
    ];
    const external = new FakeSource('example', ['example'], {});
    external.items = [
      {
        itemId: 'example:gem',
        referencedModels: [],
        referencedResources: [],
        sourceFormat: 'modern-item-definition',
      },
    ];
    registry.register(vanilla);
    registry.register(external);
    expect(
      registry.itemEvidenceSources().flatMap((source) => source.items.map((item) => item.itemId)),
    ).toEqual(['minecraft:stone', 'example:gem']);
  });

  it('exposes an external source with painting contributions in the decoration picker', () => {
    const registry = new ContentSourceRegistry();
    const source = new FakeSource('paintings', ['example'], {});
    source.paintings = [
      {
        id: 'example:poster',
        width: 2,
        height: 1,
        assetPath: 'example:painting/poster',
        sourceId: 'paintings',
        sourceName: 'Paintings',
      },
    ];
    registry.register(source);
    expect(registry.decorationSources().map((entry) => entry.id)).toEqual(['paintings']);
  });

  it('keeps a prepared batch invisible until all sources validate and commit', () => {
    const registry = new ContentSourceRegistry();
    const first = new FakeSource('first', ['first'], {}, [block('first:stone', 'first')]);
    const second = new FakeSource('second', ['second'], {}, [block('second:stone', 'second')]);
    const firstCatalog = first.catalog();
    const secondCatalog = second.catalog();
    expect(registry.sources()).toEqual([]);
    expect(registry.catalog().all()).toEqual([]);
    expect(registry.resources.providerForSource('first')).toBeUndefined();
    registry.commitBatch([
      { provider: first, catalog: firstCatalog },
      { provider: second, catalog: secondCatalog },
    ]);
    expect(registry.sources().map((source) => source.id)).toEqual(['first', 'second']);
    expect(
      registry
        .catalog()
        .all()
        .map((entry) => entry.id),
    ).toEqual(['first:stone', 'second:stone']);
  });

  it('does not partially activate a batch when a staged catalog conflicts', () => {
    const registry = new ContentSourceRegistry();
    const first = new FakeSource('first', ['first'], {}, [block('shared:block', 'first')]);
    const second = new FakeSource('second', ['second'], {}, [block('shared:block', 'second')]);
    expect(() =>
      registry.commitBatch([
        { provider: first, catalog: first.catalog() },
        { provider: second, catalog: second.catalog() },
      ]),
    ).toThrow(/Catalog block-id conflict/);
    expect(registry.sources()).toEqual([]);
    expect(registry.catalog().all()).toEqual([]);
  });

  it('does not partially publish a batch when a later provider has a resource collision', () => {
    const registry = new ContentSourceRegistry();
    registry.register(
      new FakeSource('active', ['shared'], { 'assets/shared/occupied.json': { owner: 'active' } }),
    );
    const generation = registry.generation;
    const first = new FakeSource('first', ['first'], { 'assets/first/valid.json': {} }, [
      block('first:valid', 'first'),
    ]);
    const second = new FakeSource('second', ['shared'], { 'assets/shared/occupied.json': {} }, [
      block('second:valid', 'second'),
    ]);

    expect(() =>
      registry.commitBatch([
        { provider: first, catalog: first.catalog() },
        { provider: second, catalog: second.catalog() },
      ]),
    ).toThrow(/Resource collision/);
    expect(registry.sources().map(({ id }) => id)).toEqual(['active']);
    expect(registry.resources.paths()).toEqual(['assets/shared/occupied.json']);
    expect(registry.resources.readJson('assets/shared/occupied.json')).toEqual({ owner: 'active' });
    expect(registry.catalog().all()).toEqual([]);
    expect(registry.generation).toBe(generation);
    expect(first.disposeCount).toBe(0);
    expect(second.disposeCount).toBe(0);
  });
});
