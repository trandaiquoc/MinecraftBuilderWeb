import { describe, expect, it } from 'vitest';
import type {
  AssetBlockRecord,
  BlockStateDefinition,
} from '../../blocks/catalog/block-definition.types';
import { extractBehaviorFingerprint } from './behavior-fingerprint';
import { matchVanillaBehaviorCandidates } from './behavior-classifier';
import { generateBehaviorCandidates } from './behavior-candidate-generator';
import { inferBehaviorTraits } from './behavior-traits';

function record(
  id: string,
  definitions: readonly BlockStateDefinition[],
  model: string,
  blockstate: unknown,
): AssetBlockRecord {
  const [namespace, path] = id.split(':');
  return {
    id,
    displayName: id,
    defaultState: {},
    stateDefinitions: definitions,
    resources: { blockstate: `assets/${namespace}/blockstates/${path}.json`, model, textures: [] },
    behaviorEvidenceRequired: true,
  };
}

describe('generic behavior fingerprint candidates', () => {
  it('infers orientation separately from attachment semantics', () => {
    const directional = extractBehaviorFingerprint(
      record(
        'example:directional',
        [{ name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] }],
        'example:block/model',
        { variants: {} },
      ),
    );
    expect(inferBehaviorTraits(directional)).toContain('six-face-orientation');
    expect(inferBehaviorTraits(directional)).not.toContain('face-attachment');
  });

  it('normalizes a wall schema whose resource omits none/false default branches', () => {
    const definitions = (['north', 'east', 'south', 'west'] as const).map((name) => ({
      name,
      values: ['low', 'tall'],
    }));
    const blockstate = {
      multipart: [
        { when: { up: 'true' }, apply: { model: 'example:block/post' } },
        { when: { north: 'low' }, apply: { model: 'example:block/side' } },
        { when: { east: 'low' }, apply: { model: 'example:block/side' } },
        { when: { south: 'low' }, apply: { model: 'example:block/side' } },
        { when: { west: 'low' }, apply: { model: 'example:block/side' } },
      ],
    };
    const value = record(
      'example:stone_wall',
      [...definitions, { name: 'up', values: ['true'] }],
      'example:block/post',
      blockstate,
    );
    const fingerprint = extractBehaviorFingerprint(value, {
      readJson: (path) =>
        path.includes('/blockstates/')
          ? blockstate
          : {
              parent: path.includes('post')
                ? 'minecraft:block/template_wall_post'
                : 'minecraft:block/template_wall_side',
            },
    });
    const result = matchVanillaBehaviorCandidates({
      ...fingerprint,
      trustedFamilies: ['wall'],
      tags: ['minecraft:walls'],
      modelParents: ['block/template_wall_post', 'block/template_wall_side'],
    });
    expect(result.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'wall' });
    expect(result.classification.selectionReason).toBe('evidence');
    expect(result.defaults).toEqual({
      east: 'none',
      north: 'none',
      south: 'none',
      up: 'true',
      west: 'none',
    });
    expect(
      result.stateDefinitions?.find((definition) => definition.name === 'north')?.values,
    ).toEqual(['low', 'tall', 'none']);
  });

  it('requires face-attachment evidence for six-face behavior', () => {
    const variants = Object.fromEntries(
      ['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [
        `facing=${facing}`,
        { model: 'example:block/model' },
      ]),
    );
    const definitions = [
      { name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] },
    ];
    const attached = extractBehaviorFingerprint(
      record('example:crystal', definitions, 'example:block/model', { variants }),
      {
        readJson: (path) =>
          path.includes('/models/') ? { parent: 'minecraft:block/cross' } : { variants },
      },
    );
    expect(matchVanillaBehaviorCandidates(attached).behavior).toMatchObject({
      kind: 'attached-six-face-placement',
    });
    expect(matchVanillaBehaviorCandidates(attached).classification.selectionReason).toBe(
      'evidence',
    );

    const directional = extractBehaviorFingerprint(
      record('example:directional', definitions, 'example:block/model', { variants }),
      {
        readJson: (path) =>
          path.includes('/models/') ? { parent: 'minecraft:block/cube_all' } : { variants },
      },
    );
    expect(matchVanillaBehaviorCandidates(directional).behavior).toBeUndefined();
  });

  it('does not treat generic support evidence as proof of face attachment', () => {
    const variants = Object.fromEntries(
      ['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [
        `facing=${facing}`,
        { model: 'example:block/cube' },
      ]),
    );
    const value = {
      ...record(
        'example:directional_support',
        [{ name: 'facing', values: [...['down', 'up', 'north', 'south', 'west', 'east']] }],
        'example:block/cube',
        { variants },
      ),
      supportContracts: ['floor'],
    };
    const fingerprint = extractBehaviorFingerprint(value, {
      readJson: (path) =>
        path.includes('/models/') ? { parent: 'minecraft:block/cube_all' } : { variants },
    });
    expect(matchVanillaBehaviorCandidates(fingerprint).behavior).toBeUndefined();
  });

  it('uses a name alias only to resolve an evidence tie between existing candidates', () => {
    const fingerprint = extractBehaviorFingerprint(
      {
        ...record('example:hanging_sign', [], 'example:block/sign', {
          variants: { '': { model: 'example:block/sign' } },
        }),
        trustedBehaviorFamilies: ['standing-sign', 'hanging-sign'],
      },
      { readJson: () => ({ variants: { '': { model: 'example:block/sign' } } }) },
    );
    const result = matchVanillaBehaviorCandidates(fingerprint);
    expect(result.behavior?.kind).toBe('hanging-sign');
    expect(result.classification.selectionReason).toBe('name-tie-break');
    expect(result.classification.nameTieBreak).toContain('hanging-sign');
  });

  it('does not create a candidate from a registry name alone', () => {
    const fingerprint = extractBehaviorFingerprint(
      record('example:wall', [{ name: 'north', values: ['true', 'false'] }], 'example:block/cube', {
        variants: { '': { model: 'example:block/cube' } },
      }),
    );
    expect(matchVanillaBehaviorCandidates(fingerprint).behavior).toBeUndefined();
  });

  it('keeps candidate generation separate from classification and scoring', () => {
    const definitions = [
      { name: 'facing', values: ['north', 'east', 'south', 'west'] },
      { name: 'half', values: ['top', 'bottom'] },
      {
        name: 'shape',
        values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'],
      },
    ];
    const variants = Object.fromEntries(
      ['north', 'east', 'south', 'west'].flatMap((facing) =>
        ['top', 'bottom'].flatMap((half) =>
          ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'].map((shape) => [
            `facing=${facing},half=${half},shape=${shape}`,
            { model: 'example:block/stairs' },
          ]),
        ),
      ),
    );
    const fingerprint = extractBehaviorFingerprint(
      record('example:cut_stairs', definitions, 'example:block/stairs', { variants }),
      { readJson: (path) => (path.includes('/blockstates/') ? { variants } : undefined) },
    );
    expect(generateBehaviorCandidates(fingerprint).map((candidate) => candidate.family)).toContain(
      'stairs',
    );
    expect(matchVanillaBehaviorCandidates(fingerprint).behavior).toMatchObject({ kind: 'stairs' });
  });
});
