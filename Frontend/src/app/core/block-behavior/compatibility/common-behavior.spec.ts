import { describe, expect, it } from 'vitest';
import vanillaRegistry from '../../../../../public/assets/vanilla-block-registry-1.21.1.json';
import vanillaItemRegistry from '../../../../../public/assets/vanilla-item-registry-1.21.1.json';
import {
  AssetBlockRecord,
  BlockStateDefinition,
} from '../../blocks/catalog/block-definition.types';
import { BlockCatalog } from '../../blocks/catalog/block-catalog';
import {
  previewBlocksForItem,
  buildPlaceableItems,
} from '../../blocks/placement-palette/placeable-item';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { HistoryService } from '../../editor/history/history.service';
import { ProjectMutationHintService } from '../../editor/mutations/project-mutation-hint.service';
import { SelectionService } from '../../editor/selection/selection.service';
import { StructureEditorService } from '../../editor/structure/structure-editor.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { evaluateCommonBehavior } from './common-behavior';

function record(
  id: string,
  definitions: readonly BlockStateDefinition[],
  model = `${id.replace(':', '/')}`,
  extra: Partial<AssetBlockRecord> = {},
): AssetBlockRecord {
  return {
    id,
    sourceId: 'vanilla',
    displayName: id,
    defaultState: {},
    stateDefinitions: definitions,
    resources: { blockstate: `assets/${id.replace(':', '/')}.json`, model, textures: [] },
    ...extra,
  };
}

describe('common resource behavior evaluation', () => {
  it('does not infer Bed pairing for Vanilla schemas that only share generic facing state', () => {
    const registry = vanillaRegistry as unknown as {
      readonly blocks: readonly {
        readonly id: string;
        readonly properties: readonly BlockStateDefinition[];
        readonly defaultState: Readonly<Record<string, string>>;
      }[];
    };
    const itemIds = new Set(
      (vanillaItemRegistry as { readonly items: readonly { readonly id: string }[] }).items.map(
        (item) => item.id,
      ),
    );
    const examples = [
      'minecraft:chest',
      'minecraft:trapped_chest',
      'minecraft:ender_chest',
      'minecraft:acacia_fence_gate',
      'minecraft:birch_fence_gate',
      'minecraft:cherry_fence_gate',
      'minecraft:bell',
    ];
    const entries = examples.map((id) => {
      const source = registry.blocks.find((block) => block.id === id);
      expect(source, `official registry entry ${id}`).toBeDefined();
      const sourceRecord = record(id, source!.properties, undefined, {
        defaultState: source!.defaultState,
        itemEvidence: itemIds.has(id) ? { itemId: id, placeable: true } : undefined,
      });
      const evaluation = evaluateCommonBehavior(sourceRecord);
      return {
        ...sourceRecord,
        ...(evaluation.behavior ? { behavior: evaluation.behavior } : {}),
        defaultState: evaluation.defaultState,
        stateDefinitions: evaluation.stateDefinitions,
      };
    });

    expect(entries.map(({ id, behavior }) => [id, behavior?.kind])).toEqual(
      examples.map((id) => [id, undefined]),
    );
    expect(entries.every((entry) => !('part' in entry.defaultState))).toBe(true);

    for (const source of registry.blocks) {
      const evaluation = evaluateCommonBehavior(
        record(source.id, source.properties, undefined, {
          defaultState: source.defaultState,
          itemEvidence: itemIds.has(source.id) ? { itemId: source.id, placeable: true } : undefined,
        }),
      );
      for (const [name, value] of Object.entries(evaluation.defaultState)) {
        const property = source.properties.find((definition) => definition.name === name);
        expect(property?.values, `${source.id}.${name}`).toContain(value);
      }
      if (evaluation.behavior?.kind === 'paired-horizontal') {
        const part = source.properties.find((definition) => definition.name === 'part');
        expect(part?.values, source.id).toEqual(expect.arrayContaining(['foot', 'head']));
      }
    }

    const catalog = new BlockCatalog();
    catalog.load({ minecraftVersion: '1.21.1', sourceId: 'vanilla', blocks: entries });
    const definitions = catalog.all();
    const placeables = buildPlaceableItems(definitions);
    for (const id of examples) {
      expect(catalog.get(id)?.logicalPlacement, id).toBeUndefined();
      const item = placeables.find((candidate) => candidate.itemId === id);
      expect(item, id).toBeDefined();
      expect(
        previewBlocksForItem(item!).map((block) => block.id),
        id,
      ).toEqual([id]);
    }

    const workspace = new WorkspaceStateService();
    const active = new ActiveBlockService();
    const selection = new SelectionService();
    const hints = new ProjectMutationHintService();
    const history = new HistoryService(workspace, hints);
    const library = new BlockLibraryService(active);
    library.replaceSource({ minecraftVersion: '1.21.1', sourceId: 'minecraft', blocks: entries });
    workspace.publishProject({
      schemaVersion: 1,
      id: 'vanilla-placement-regression',
      metadata: {
        name: 'Vanilla placement regression',
        minecraftVersion: '1.21.1',
        createdAt: '',
        updatedAt: '',
      },
      size: { x: 16, y: 16, z: 16 },
      structureMode: 'vanilla-structure-block',
      blocks: [],
      groups: [],
      editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
    });
    const editor = new StructureEditorService(workspace, active, selection, history, library);
    for (const [index, id] of examples.entries()) {
      active.select(library.get(id)!);
      expect(editor.place({ x: index + 1, y: 1, z: 1 }), id).toBe(true);
      const placed = workspace.project()!.blocks.filter((block) => block.id === id);
      expect(placed, id).toHaveLength(1);
      expect(placed[0].state, id).not.toHaveProperty('part');
      expect(placed[0].state, id).not.toHaveProperty('occupied');
    }
    expect(workspace.project()!.blocks).toHaveLength(examples.length);
    expect(history.undo()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(examples.length - 1);
    expect(history.redo()).toBe(true);
    expect(workspace.project()!.blocks).toHaveLength(examples.length);

    const bed = registry.blocks.find((block) => block.id === 'minecraft:red_bed')!;
    expect(
      evaluateCommonBehavior(
        record(bed.id, bed.properties, undefined, {
          defaultState: bed.defaultState,
          itemEvidence: { itemId: bed.id, placeable: true },
        }),
      ).behavior,
    ).toMatchObject({ kind: 'paired-horizontal' });
  });

  it('keeps Bed pairing limited to schemas with the canonical part identity property', () => {
    const bed = evaluateCommonBehavior(
      record(
        'minecraft:legacy_bed_record',
        [
          { name: 'facing', values: ['north', 'east', 'south', 'west'] },
          { name: 'part', values: ['foot', 'head'] },
        ],
        undefined,
        { itemEvidence: { itemId: 'minecraft:legacy_bed_record', placeable: true } },
      ),
    );
    const chest = evaluateCommonBehavior(
      record(
        'minecraft:legacy_chest_record',
        [
          { name: 'facing', values: ['north', 'east', 'south', 'west'] },
          { name: 'type', values: ['single', 'left', 'right'] },
        ],
        undefined,
        { itemEvidence: { itemId: 'minecraft:legacy_chest_record', placeable: true } },
      ),
    );
    expect(bed.behavior).toMatchObject({ kind: 'paired-horizontal' });
    expect(chest.behavior).toBeUndefined();
    expect(chest.defaultState).not.toHaveProperty('part');
    expect(chest.defaultState).not.toHaveProperty('occupied');
  });

  it('reuses a complete door contract and derives canonical defaults', () => {
    const result = evaluateCommonBehavior(
      record('example:door', [
        { name: 'facing', values: ['north', 'east', 'south', 'west'] },
        { name: 'half', values: ['lower', 'upper'] },
        { name: 'hinge', values: ['left', 'right'] },
        { name: 'open', values: ['true', 'false'] },
        { name: 'powered', values: ['true', 'false'] },
      ]),
    );
    expect(result.behavior).toMatchObject({ kind: 'double-height', halfProperty: 'half' });
    expect(result.defaultState).toMatchObject({
      facing: 'north',
      half: 'lower',
      hinge: 'left',
      open: 'false',
      powered: 'false',
    });
    expect(result.defaultStateSource).toBe('compatible-common');
  });

  it('classifies a neutral external block with the complete door schema without name or resource evidence', () => {
    const result = evaluateCommonBehavior(
      record(
        'example:neutral_panel',
        [
          { name: 'facing', values: ['north', 'east', 'south', 'west'] },
          { name: 'half', values: ['lower', 'upper'] },
          { name: 'hinge', values: ['left', 'right'] },
          { name: 'open', values: ['true', 'false'] },
          { name: 'custom_variant', values: ['a', 'b'] },
        ],
        'example:block/panel',
        { behaviorEvidenceRequired: true },
      ),
    );
    expect(result.behavior).toMatchObject({ kind: 'double-height', halfProperty: 'half' });
    expect(result.family).toBe('doors');
    expect(result.classification?.chosenCandidate).toBe('doors');
    expect(result.classification?.selectionReason).toBe('evidence');
    expect(result.stateDefinitions.map((definition) => definition.name)).not.toContain('powered');
    expect(result.defaultState).not.toHaveProperty('powered');
  });

  it('keeps incomplete or conflicting door-like schemas unknown for external content', () => {
    const incomplete = evaluateCommonBehavior(
      record(
        'example:doorish_panel',
        [{ name: 'half', values: ['lower', 'upper'] }],
        'example:block/door_model',
        { behaviorEvidenceRequired: true },
      ),
    );
    expect(incomplete.behavior).toBeUndefined();

    const conflicting = evaluateCommonBehavior(
      record(
        'example:doorish_panel',
        [
          { name: 'facing', values: ['north', 'east', 'south', 'west'] },
          { name: 'half', values: ['lower', 'upper'] },
          { name: 'hinge', values: ['left', 'center'] },
          { name: 'open', values: ['true', 'false'] },
        ],
        'example:block/door_model',
        { behaviorEvidenceRequired: true },
      ),
    );
    expect(conflicting.behavior).toBeUndefined();
  });

  it('reuses the common button contract without an ID whitelist', () => {
    const result = evaluateCommonBehavior(
      record('example:stone_button', [
        { name: 'face', values: ['floor', 'wall', 'ceiling'] },
        { name: 'facing', values: ['north', 'east', 'south', 'west'] },
        { name: 'powered', values: ['true', 'false'] },
      ]),
    );
    expect(result.behavior).toMatchObject({ kind: 'button' });
    expect(result.defaultState).toEqual({ face: 'floor', facing: 'north', powered: 'false' });
  });

  it('reports a changed contract instead of applying a partial door rule', () => {
    const result = evaluateCommonBehavior(
      record('example:door', [
        { name: 'facing', values: ['north', 'east', 'south', 'west'] },
        { name: 'half', values: ['lower', 'upper'] },
        { name: 'open', values: ['true', 'false'] },
      ]),
    );
    expect(result.behavior).toBeUndefined();
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('missing');
  });

  it('does not infer a connection family without resource evidence', () => {
    const result = evaluateCommonBehavior(
      record('example:unknown', [
        ...(['north', 'east', 'south', 'west'] as const).map((name) => ({
          name,
          values: ['true', 'false'],
        })),
      ]),
    );
    expect(result.behavior).toBeUndefined();
    expect(result.compatible).toBe(false);
  });

  it('does not use the trusted vanilla fallback for unverified external records', () => {
    const result = evaluateCommonBehavior(
      record(
        'examplemod:oak_fence',
        [{ name: 'north', values: ['true', 'false'] }],
        'examplemod:block/oak_fence',
        { sourceId: 'examplemod' },
      ),
    );
    expect(result.behavior).toBeUndefined();
    expect(result.compatible).toBe(false);
  });

  it('completes a proven multipart connection subset with false defaults', () => {
    const result = evaluateCommonBehavior(
      record(
        'example:acacia_fence',
        [{ name: 'north', values: ['true', 'false'] }],
        'example:block/acacia_fence',
      ),
    );
    expect(result.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'fence' });
    expect(result.stateDefinitions).toEqual(
      expect.arrayContaining([
        { name: 'east', values: ['true', 'false'], derived: true },
        { name: 'south', values: ['true', 'false'], derived: true },
        { name: 'west', values: ['true', 'false'], derived: true },
      ]),
    );
    expect(result.defaultState).toMatchObject({
      north: 'false',
      east: 'false',
      south: 'false',
      west: 'false',
    });
  });

  it('recognizes a wall contract from wall model evidence', () => {
    const result = evaluateCommonBehavior(
      record(
        'example:custom',
        [
          ...(['north', 'east', 'south', 'west'] as const).map((name) => ({
            name,
            values: ['none', 'low', 'tall'],
          })),
          { name: 'up', values: ['true', 'false'] },
        ],
        'example:block/custom_wall_post',
      ),
    );
    expect(result.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'wall' });
  });

  it('recognizes an external wall only when the state and blockstate parts agree', () => {
    const definitions = [
      ...(['north', 'east', 'south', 'west'] as const).map((name) => ({
        name,
        values: ['none', 'low', 'tall'],
      })),
      { name: 'up', values: ['true', 'false'] },
    ];
    const blockstate = {
      multipart: [
        { when: { north: 'none' }, apply: { model: 'example:block/post' } },
        { when: { east: 'low' }, apply: { model: 'example:block/side' } },
        { when: { south: 'low' }, apply: { model: 'example:block/side' } },
        { when: { west: 'low' }, apply: { model: 'example:block/side' } },
        { when: { up: 'true' }, apply: { model: 'example:block/post' } },
      ],
    };
    const result = evaluateCommonBehavior(
      record('example:tumblestone', definitions, 'example:block/tumblestone', {
        behaviorEvidenceRequired: true,
      }),
      { readJson: () => blockstate },
    );
    expect(result.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'wall' });
    expect(result.defaultState).toMatchObject({
      north: 'none',
      east: 'none',
      south: 'none',
      west: 'none',
      up: 'true',
    });
  });

  it('does not infer an external wall from the schema without blockstate part evidence', () => {
    const definitions = [
      ...(['north', 'east', 'south', 'west'] as const).map((name) => ({
        name,
        values: ['none', 'low', 'tall'],
      })),
      { name: 'up', values: ['true', 'false'] },
    ];
    const result = evaluateCommonBehavior(
      record('example:decorative_block', definitions, 'example:block/decorative', {
        behaviorEvidenceRequired: true,
      }),
      { readJson: () => ({ variants: { '': { model: 'example:block/decorative' } } }) },
    );
    expect(result.behavior).toBeUndefined();
  });

  it('does not let an external name-based recognizer bypass an Unknown classification', () => {
    const result = evaluateCommonBehavior(
      record(
        'example:fake_stairs',
        [
          { name: 'facing', values: ['north', 'east', 'south', 'west'] },
          { name: 'half', values: ['top', 'bottom'] },
          {
            name: 'shape',
            values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'],
          },
        ],
        'example:block/fake_stairs',
        { behaviorEvidenceRequired: true },
      ),
    );
    expect(result.behavior).toBeUndefined();
    expect(result.classification?.selectionReason).toBe('none');
  });

  it('classifies a six-face attached resource fingerprint without relying on its registry name', () => {
    const blockstate = {
      variants: Object.fromEntries(
        ['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [
          `facing=${facing}`,
          { model: 'example:block/crystal' },
        ]),
      ),
    };
    const result = evaluateCommonBehavior(
      record(
        'example:crystal_like',
        [{ name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] }],
        'example:block/crystal_like',
        { behaviorEvidenceRequired: true },
      ),
      {
        readJson: (path) =>
          path === 'assets/example/models/block/crystal_like.json'
            ? { parent: 'minecraft:block/cross' }
            : blockstate,
      },
    );
    expect(result.behavior).toMatchObject({
      kind: 'attached-six-face-placement',
      facingProperty: 'facing',
    });
  });

  it('does not classify a six-face lookalike when the resource shape is not face-attached', () => {
    const blockstate = {
      variants: Object.fromEntries(
        ['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [
          `facing=${facing}`,
          { model: 'example:block/cube' },
        ]),
      ),
    };
    const result = evaluateCommonBehavior(
      record(
        'example:directional_cube',
        [{ name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] }],
        'example:block/cube',
        { behaviorEvidenceRequired: true },
      ),
      {
        readJson: (path) =>
          path === 'assets/example/models/block/cube.json'
            ? { parent: 'minecraft:block/cube_all' }
            : blockstate,
      },
    );
    expect(result.behavior).toBeUndefined();
  });

  it('recognizes external stairs from state schema plus shape model selection', () => {
    const definitions = [
      { name: 'facing', values: ['north', 'east', 'south', 'west'] },
      { name: 'half', values: ['top', 'bottom'] },
      {
        name: 'shape',
        values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'],
      },
    ];
    const result = evaluateCommonBehavior(
      record('example:cut_block', definitions, 'example:block/cut_block', {
        behaviorEvidenceRequired: true,
      }),
      {
        readJson: () => ({
          variants: {
            'facing=north,half=bottom,shape=straight': {
              model: 'example:block/cut_block_straight',
            },
          },
        }),
      },
    );
    expect(result.behavior).toMatchObject({ kind: 'stairs' });
  });

  it('uses the candle state contract without an ID heuristic and rejects candle-cake state', () => {
    const candle = evaluateCommonBehavior(
      record('example:custom_light', [
        { name: 'candles', values: ['1', '2', '3', '4'] },
        { name: 'lit', values: ['true', 'false'] },
        { name: 'waterlogged', values: ['true', 'false'] },
      ]),
    );
    expect(candle.behavior).toMatchObject({ kind: 'candle', maxCandles: 4 });

    const cake = evaluateCommonBehavior(
      record('example:white_candle_cake', [
        { name: 'lit', values: ['true', 'false'] },
        { name: 'waterlogged', values: ['true', 'false'] },
      ]),
    );
    expect(cake.behavior).toBeUndefined();
  });

  it('classifies the canonical water and lava identities without suffix inference', () => {
    const level = {
      name: 'level',
      values: Array.from({ length: 16 }, (_, value) => String(value)),
    };
    expect(evaluateCommonBehavior(record('minecraft:water', [level])).behavior).toMatchObject({
      kind: 'fluid',
      fluid: 'water',
    });
    expect(evaluateCommonBehavior(record('minecraft:lava', [level])).behavior).toMatchObject({
      kind: 'fluid',
      fluid: 'lava',
    });
    expect(evaluateCommonBehavior(record('example:lava', [level])).behavior).toBeUndefined();
  });

  it('labels arbitrary resource values as render fallbacks rather than semantic defaults', () => {
    const result = evaluateCommonBehavior(
      record('example:custom', [{ name: 'mode', values: ['alpha', 'beta'] }]),
    );
    expect(result.defaultState).toEqual({ mode: 'alpha' });
    expect(result.defaultStateSource).toBe('resource-render-fallback');
    expect(result.compatible).toBe(false);
  });
});
