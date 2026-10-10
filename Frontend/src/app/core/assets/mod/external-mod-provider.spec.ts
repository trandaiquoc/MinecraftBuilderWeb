import { describe, expect, it } from 'vitest';
import { CooperativeWorkBudget } from '../cooperative-yield';
import { ExternalModProvider } from './external-mod-provider';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import { BlockRuleEngine } from '../../block-behavior/rules/block-rule-engine';

const blockstate = {
  variants: {
    'powered=false': { model: 'example:block/widget' },
    'powered=true': { model: 'example:block/widget' },
  },
};

describe('ExternalModProvider', () => {
  it('parses Fabric metadata and keeps source identity separate from namespaces', () => {
    const provider = ExternalModProvider.create({
      metadata: {
        id: 'example',
        name: 'Example Mod',
        version: '1.2.3',
        depends: { minecraft: '1.21.x' },
      },
      json: new Map<string, unknown>([
        ['assets/example/blockstates/widget.json', blockstate],
        ['assets/example_compat/models/block/widget.json', { parent: 'minecraft:block/cube_all' }],
        ['assets/example/lang/en_us.json', { 'block.example.widget': 'Widget' }],
      ]),
      resources: new Map(),
    });
    expect(provider.source.id).toBe('mod:example');
    expect(provider.source.namespaces).toEqual(['example', 'example_compat']);
    expect(provider.catalog().blocks).toMatchObject([
      {
        id: 'example:widget',
        displayName: 'Widget',
        behaviorSupport: 'unknown',
        defaultStateSource: 'resource-derived',
      },
    ]);
    expect(provider.catalog().blocks[0]?.stateDefinitions).toEqual([
      { name: 'powered', values: ['false', 'true'] },
    ]);
  });

  it('requires blockstate evidence and does not infer vanilla behavior from names', () => {
    const resourcesOnly = ExternalModProvider.create({
      metadata: { id: 'resources-only', version: '1.0.0' },
      json: new Map<string, unknown>([
        ['assets/resources_only/models/block/ghost.json', {}],
        ['assets/resources_only/lang/en_us.json', {}],
      ]),
      resources: new Map(),
    });
    expect(resourcesOnly.catalog().blocks).toHaveLength(0);
    const provider = ExternalModProvider.create({
      metadata: { id: 'lookalike', version: '1.0.0' },
      json: new Map([
        ['assets/lookalike/models/block/fake_sign.json', {}],
        ['assets/lookalike/textures/block/fake_sign.png', {}],
        [
          'assets/lookalike/blockstates/fake_sign.json',
          { variants: { '': { model: 'lookalike:block/fake_sign' } } },
        ],
      ]),
      resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(provider.catalog().blocks).toHaveLength(1);
    expect(definition.id).toBe('lookalike:fake_sign');
    expect(definition.behavior).toBeUndefined();
    expect(definition.behaviorSupport).toBe('unknown');
  });

  it('classifies and materializes a neutral external door from its complete schema', () => {
    const variants = Object.fromEntries(
      [
        'facing=north,half=lower,hinge=left,open=false',
        'facing=east,half=upper,hinge=right,open=true',
        'facing=south,half=lower,hinge=left,open=true',
        'facing=west,half=upper,hinge=right,open=false',
      ].map((key) => [key, { model: 'example:block/panel' }]),
    );
    const provider = ExternalModProvider.create({
      metadata: { id: 'neutral-door', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([['assets/example/blockstates/panel.json', { variants }]]),
      resources: new Map(),
    });
    const source = provider.catalog();
    expect(source.blocks[0]?.behavior).toMatchObject({
      kind: 'double-height',
      halfProperty: 'half',
    });
    const catalog = new BlockCatalog();
    catalog.load(source);
    const definition = catalog.get('example:panel')!;
    expect(definition.stateDefinitions.map((state) => state.name)).not.toContain('powered');
    expect(definition.defaultState).not.toHaveProperty('powered');
    expect(definition.logicalPlacement).toMatchObject({
      layout: 'vertical-two-part',
      identityProperty: 'half',
    });
    const engine = new BlockRuleEngine((id) => catalog.get(id));
    const project = {
      schemaVersion: 2 as const,
      id: 'neutral-door',
      metadata: { name: 'Neutral Door', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
      size: { x: 4, y: 4, z: 4 },
      structureMode: 'vanilla-structure-block' as const,
      blocks: [],
      groups: [],
      editorSettings: {
        currentY: 1,
        layerVisibility: 'current-only' as const,
        referenceLayerOpacity: 0.28,
      },
    };
    const placed = engine.place(project, {
      kind: 'resolved',
      id: 'example:panel',
      namespace: 'example',
      position: { x: 1, y: 0, z: 1 },
      state: definition.defaultState,
    });
    expect(placed.validation.status).toBe('valid');
    expect(
      placed.project?.blocks
        .filter((block) => block.id === 'example:panel')
        .map((block) => block.state['half']),
    ).toEqual(['lower', 'upper']);
  });

  it('uses a trusted wooden_doors tag with the observable schema without inventing powered', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'cobblemon-like', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/apricorn_door.json',
          {
            variants: {
              'facing=north,half=lower,hinge=left,open=false': {
                model: 'example:block/apricorn_door',
              },
              'facing=east,half=upper,hinge=right,open=true': {
                model: 'example:block/apricorn_door',
              },
              'facing=south,half=lower,hinge=right,open=true': {
                model: 'example:block/apricorn_door',
              },
              'facing=west,half=upper,hinge=left,open=false': {
                model: 'example:block/apricorn_door',
              },
            },
          },
        ],
        [
          'data/minecraft/tags/block/wooden_doors.json',
          { replace: false, values: ['example:apricorn_door'] },
        ],
      ]),
      resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(definition.behavior).toMatchObject({ kind: 'double-height', halfProperty: 'half' });
    expect(definition.stateDefinitions.map((state) => state.name)).not.toContain('powered');
    expect(definition.defaultState).not.toHaveProperty('powered');
  });

  it('fails closed for a trusted door tag when the observable schema conflicts', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'bad-door', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/not_door.json',
          {
            variants: {
              'facing=north,half=lower,hinge=center,open=false': {
                model: 'example:block/not_door',
              },
            },
          },
        ],
        [
          'data/minecraft/tags/block/wooden_doors.json',
          { replace: false, values: ['example:not_door'] },
        ],
      ]),
      resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(definition.behavior).toBeUndefined();
    expect(definition.behaviorSupport).toBe('unknown');
  });

  it('serializes and restores normalized resources', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'roundtrip', version: '1.0.0' },
      json: new Map([['assets/roundtrip/blockstates/a.json', { variants: {} }]]),
      resources: new Map([['assets/roundtrip/textures/block/a.png', new Uint8Array([1, 2, 3])]]),
    });
    const restored = ExternalModProvider.deserialize(provider.serialize());
    expect(restored.source.id).toBe(provider.source.id);
    expect(restored.readJson('assets/roundtrip/blockstates/a.json')).toEqual({ variants: {} });
    expect([...restored.readBinary('assets/roundtrip/textures/block/a.png')!]).toEqual([1, 2, 3]);
  });

  it('serializes retained binaries cooperatively for cache writes', async () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'async-cache', version: '1.0.0' },
      json: new Map([['assets/async_cache/blockstates/a.json', { variants: {} }]]),
      resources: new Map([['assets/async_cache/textures/block/a.png', new Uint8Array([4, 5])]]),
    });
    const progress: number[] = [];
    const serialized = await provider.serializeForCacheAsync((value) =>
      progress.push(value.processed),
    );
    expect(serialized.binary).toHaveLength(1);
    expect(progress).toEqual([1]);
  });

  it('discovers modern and legacy Items independently from Blocks', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'content', version: '1.0.0', depends: { minecraft: '>=1.20 <1.22' } },
      json: new Map([
        [
          'assets/content/blockstates/marble.json',
          { variants: { '': { model: 'content:block/marble' } } },
        ],
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
    expect(
      source.targetItems?.find((entry) => entry.itemId === 'content:gem')?.explicitBlockPlacement,
    ).toBeUndefined();
    expect(
      source.targetItems?.find((entry) => entry.itemId === 'content:marble')
        ?.explicitBlockPlacement,
    ).toEqual({ blockId: 'content:marble' });
    expect(provider.readJson('assets/content/models/item/gem.json')).toEqual({
      parent: 'minecraft:item/generated',
    });
  });

  it('uses trusted additive tags for common behavior and fails closed for lookalikes', () => {
    const make = (id: string, tagged: boolean) =>
      ExternalModProvider.create({
        metadata: {
          id: tagged ? 'tagged' : 'lookalike',
          version: '1.0.0',
          depends: { minecraft: '1.21.1' },
        },
        json: new Map([
          [
            `assets/${id.split(':')[0]}/blockstates/${id.split(':')[1]}.json`,
            {
              multipart: [
                {
                  when: { north: 'true' },
                  apply: { model: `${id.split(':')[0]}:block/${id.split(':')[1]}` },
                },
              ],
              variants: {
                'north=false,east=false,south=false,west=false': {
                  model: `${id.split(':')[0]}:block/${id.split(':')[1]}`,
                },
              },
            },
          ],
          ...(tagged
            ? [['data/minecraft/tags/block/fences.json', { replace: false, values: [id] }] as const]
            : []),
        ]),
        resources: new Map(),
      });
    const tagged = make('example:maple_fence', true).catalog().blocks[0]!;
    const lookalike = make('example:fake_fence', false).catalog().blocks[0]!;
    expect(tagged.behavior?.kind).toBe('horizontal-connect');
    expect(lookalike.behavior).toBeUndefined();
  });

  it('keeps an external wall isolated and defaults every connection to none', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'wall-evidence', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/tumblestone.json',
          {
            variants: {
              'north=none,east=none,south=none,west=none,up=true': {
                model: 'example:block/tumblestone',
              },
              'north=low,east=none,south=none,west=none,up=true': {
                model: 'example:block/tumblestone',
              },
              'north=tall,east=none,south=none,west=none,up=false': {
                model: 'example:block/tumblestone',
              },
              'north=none,east=low,south=none,west=none,up=true': {
                model: 'example:block/tumblestone',
              },
              'north=none,east=tall,south=none,west=none,up=false': {
                model: 'example:block/tumblestone',
              },
              'north=none,east=none,south=low,west=none,up=true': {
                model: 'example:block/tumblestone',
              },
              'north=none,east=none,south=tall,west=none,up=false': {
                model: 'example:block/tumblestone',
              },
              'north=none,east=none,south=none,west=low,up=true': {
                model: 'example:block/tumblestone',
              },
              'north=none,east=none,south=none,west=tall,up=false': {
                model: 'example:block/tumblestone',
              },
            },
          },
        ],
      ]),
      resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(definition.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'wall' });
    expect(definition.defaultState).toMatchObject({
      north: 'none',
      east: 'none',
      south: 'none',
      west: 'none',
      up: 'true',
    });
  });

  it('reuses the attached six-face contract for an external cross-model fingerprint', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'attached-content', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/crystal.json',
          {
            variants: Object.fromEntries(
              ['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [
                `facing=${facing}`,
                { model: 'example:block/crystal' },
              ]),
            ),
          },
        ],
        ['assets/example/models/block/crystal.json', { parent: 'minecraft:block/cross' }],
      ]),
      resources: new Map(),
    });
    expect(provider.catalog().blocks[0]?.behavior).toMatchObject({
      kind: 'attached-six-face-placement',
      facingProperty: 'facing',
    });
  });

  it('does not classify an external six-direction cube as an attached block', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'directional-content', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/cube.json',
          {
            variants: Object.fromEntries(
              ['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [
                `facing=${facing}`,
                { model: 'example:block/cube' },
              ]),
            ),
          },
        ],
        ['assets/example/models/block/cube.json', { parent: 'minecraft:block/cube_all' }],
      ]),
      resources: new Map(),
    });
    expect(provider.catalog().blocks[0]?.behavior).toBeUndefined();
  });

  it('derives external sign variants from standard tags and unambiguous entity textures', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'sign-evidence', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/maple_sign.json',
          { variants: { 'rotation=0': { model: 'example:block/maple_sign' } } },
        ],
        [
          'assets/example/blockstates/maple_wall_sign.json',
          { variants: { 'facing=north': { model: 'example:block/maple_wall_sign' } } },
        ],
        ['data/minecraft/tags/block/standing_signs.json', { values: ['example:maple_sign'] }],
        ['data/minecraft/tags/block/wall_signs.json', { values: ['example:maple_wall_sign'] }],
      ]),
      resources: new Map([
        ['assets/minecraft/textures/entity/signs/maple.png', new Uint8Array([1])],
      ]),
    });
    const entries = provider.catalog().blocks;
    expect(entries.find((entry) => entry.id === 'example:maple_sign')?.specialVisual).toMatchObject(
      {
        contractId: 'common-sign',
        variant: 'standing',
        resources: { default: 'minecraft:entity/signs/maple' },
      },
    );
    expect(
      entries.find((entry) => entry.id === 'example:maple_wall_sign')?.specialVisual,
    ).toMatchObject({ contractId: 'common-sign', variant: 'wall' });
    expect(entries.find((entry) => entry.id === 'example:maple_sign')?.placementVariants).toEqual({
      standing: 'example:maple_sign',
      wall: 'example:maple_wall_sign',
    });
  });

  it('supplies the common sign state contract for model-only blockstates and nested tags', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'model-only-sign', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/example/blockstates/example_hanging_sign.json',
          { variants: { '': { model: 'example:block/example_hanging_sign' } } },
        ],
        [
          'data/minecraft/tags/block/ceiling_hanging_signs.json',
          { values: ['#example:hanging_signs'] },
        ],
        [
          'data/example/tags/block/hanging_signs.json',
          { values: ['example:example_hanging_sign'] },
        ],
      ]),
      resources: new Map([
        ['assets/minecraft/textures/entity/signs/hanging/example.png', new Uint8Array([1])],
      ]),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(definition.behavior?.kind).toBe('hanging-sign');
    expect(definition.defaultState).toMatchObject({
      rotation: '0',
      attached: 'false',
      waterlogged: 'false',
    });
    expect(definition.stateDefinitions.map((entry) => entry.name)).toEqual([
      'attached',
      'rotation',
      'waterlogged',
    ]);
    expect(definition.specialVisual).toMatchObject({ variant: 'hanging' });
  });

  it('discovers data-driven painting variants and placeable tag state', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'paintings', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'data/example/painting_variant/poster.json',
          { width: 2, height: 1, asset_id: 'example:poster' },
        ],
        [
          'data/minecraft/tags/painting_variant/placeable.json',
          { replace: false, values: ['example:poster'] },
        ],
      ]),
      resources: new Map(),
    });
    expect(provider.catalog().paintingVariants).toEqual([
      {
        id: 'example:poster',
        width: 2,
        height: 1,
        assetPath: 'example:painting/poster',
        placeable: true,
        sourceId: 'mod:paintings',
        sourceName: 'paintings',
      },
    ]);
  });
  it('preserves nested painting asset paths during normalization', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'nested-paintings', version: '1.0.0' },
      json: new Map([
        [
          'data/example/painting_variant/gallery.json',
          { width: 1, height: 1, asset_id: 'example:gallery/poster' },
        ],
      ]),
      resources: new Map(),
    });
    expect(provider.catalog().paintingVariants?.[0]?.assetPath).toBe(
      'example:painting/gallery/poster',
    );
  });
  it('connects a generic semantic manifest to the external catalog descriptor', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'semantic', version: '1.0.0', depends: { minecraft: '1.21.1' } },
      json: new Map([
        [
          'assets/semantic/blockstates/showcase.json',
          { variants: { 'facing=north': { model: 'semantic:block/showcase' } } },
        ],
        [
          'data/minecraftbuilder/semantic-manifest.json',
          {
            schemaVersion: 1,
            content: {
              'semantic:showcase': {
                properties: {
                  slot: { values: ['0'], defaultValue: '0', effects: { itemDisplay: true } },
                },
                capabilities: [
                  { kind: 'item-storage-display', slotCount: 1, evidence: 'verified' },
                ],
                specialVisual: {
                  contractId: 'common-sign',
                  resources: { default: 'semantic:entity/signs/maple' },
                  stateDependencies: ['facing'],
                },
              },
            },
          },
        ],
      ]),
      resources: new Map(),
    });
    const definition = provider.catalog().blocks[0]!;
    expect(definition.contentDescriptor?.properties.map((property) => property.name)).toContain(
      'slot',
    );
    expect(definition.capabilities).toContainEqual({
      kind: 'item-storage-display',
      slotCount: 1,
      evidence: 'verified',
    });
    expect(definition.specialVisual?.contractId).toBe('common-sign');
  });

  it('reevaluates a normalized cache entry for a different project version', () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'range', version: '1.0.0', depends: { minecraft: '>=1.20 <1.22' } },
      json: new Map([['assets/range/blockstates/a.json', { variants: {} }]]),
      resources: new Map(),
      minecraftVersion: '1.21.1',
    });
    const restored = ExternalModProvider.deserialize(provider.serialize(), '1.20.6');
    expect(restored.report.compatibility?.status).toBe('compatible');
    expect(restored.source.minecraftVersion).toBe('1.20.6');
    expect('minecraftVersion' in restored.serialize()).toBe(false);
    expect('projectMinecraftVersion' in restored.serialize().report).toBe(false);
  });

  it('counts only warning-severity diagnostics and reuses an asynchronously prepared catalog', async () => {
    const provider = ExternalModProvider.create({
      metadata: { id: 'diagnostics', version: '1.0.0' },
      json: new Map([
        [
          'assets/diagnostics/blockstates/one.json',
          { variants: { '': { model: 'diagnostics:block/one' } } },
        ],
        [
          'assets/diagnostics/blockstates/two.json',
          { variants: { '': { model: 'diagnostics:block/two' } } },
        ],
      ]),
      resources: new Map(),
      diagnostics: [
        {
          severity: 'info',
          category: 'info',
          code: 'nested-jar-skipped',
          message: 'Nested archive skipped.',
        },
        {
          severity: 'warning',
          category: 'warning',
          code: 'custom-model-loader',
          message: 'Custom loader retained.',
        },
      ],
    });
    expect(provider.report.warnings.map((diagnostic) => diagnostic.code)).toEqual([
      'custom-model-loader',
      'missing-minecraft-dependency',
    ]);
    expect(
      provider.report.warnings.some((diagnostic) => diagnostic.code === 'nested-jar-skipped'),
    ).toBe(false);
    const progress: number[] = [];
    const prepared = await provider.prepareCatalog((value) => progress.push(value.processed));
    expect(prepared).toBe(provider.catalog());
    expect(progress.at(-1)).toBe(2);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(
      true,
    );
  });

  it('cooperatively yields while preparing a large synthetic catalog', async () => {
    const json = new Map<string, unknown>();
    for (let index = 0; index < 65; index++)
      json.set(`assets/large/blockstates/block_${index}.json`, {
        variants: { '': { model: `large:block/block_${index}` } },
      });
    const provider = ExternalModProvider.create({
      metadata: { id: 'large', version: '1.0.0' },
      json,
      resources: new Map(),
    });
    const progress: number[] = [];
    await provider.prepareCatalog((value) => progress.push(value.processed));
    expect(progress.at(-1)).toBe(65);
    const budget = new CooperativeWorkBudget(10, 32);
    expect(budget.shouldYield(31)).toBe(false);
    expect(budget.shouldYield(32)).toBe(true);
  });

  it('does not publish a partial catalog when preparation is aborted', async () => {
    const json = new Map<string, unknown>();
    for (let index = 0; index < 65; index++)
      json.set(`assets/abort/blockstates/block_${index}.json`, {
        variants: { '': { model: `abort:block/block_${index}` } },
      });
    const provider = ExternalModProvider.create({
      metadata: { id: 'abort', version: '1.0.0' },
      json,
      resources: new Map(),
    });
    const controller = new AbortController();
    await expect(
      provider.prepareCatalog((progress) => {
        if (progress.processed === 1) controller.abort();
      }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const catalog = await provider.prepareCatalog(undefined, new AbortController().signal);
    expect(catalog.blocks).toHaveLength(65);
  });

  it('stops serialization before returning a partial cache payload', async () => {
    const binary = new Map<string, Uint8Array>();
    for (let index = 0; index < 65; index++)
      binary.set(`assets/abort/${index}.png`, new Uint8Array([index]));
    const provider = ExternalModProvider.create({
      metadata: { id: 'serialize-abort', version: '1.0.0' },
      json: new Map(),
      resources: binary,
    });
    const controller = new AbortController();
    await expect(
      provider.serializeForCacheAsync((progress) => {
        if (progress.processed === 1) controller.abort();
      }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
