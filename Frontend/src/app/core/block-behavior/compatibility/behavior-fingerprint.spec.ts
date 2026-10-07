import { describe, expect, it } from 'vitest';
import type { AssetBlockRecord, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import { extractBehaviorFingerprint, matchVanillaBehaviorCandidates } from './behavior-fingerprint';

function record(id: string, definitions: readonly BlockStateDefinition[], model: string, blockstate: unknown): AssetBlockRecord {
  const [namespace, path] = id.split(':');
  return { id, displayName: id, defaultState: {}, stateDefinitions: definitions, resources: { blockstate: `assets/${namespace}/blockstates/${path}.json`, model, textures: [] }, behaviorEvidenceRequired: true };
}

describe('generic behavior fingerprint candidates', () => {
  it('normalizes a wall schema whose resource omits none/false default branches', () => {
    const definitions = (['north', 'east', 'south', 'west'] as const).map((name) => ({ name, values: ['low', 'tall'] }));
    const blockstate = { multipart: [
      { when: { up: 'true' }, apply: { model: 'example:block/post' } },
      { when: { north: 'low' }, apply: { model: 'example:block/side' } },
      { when: { east: 'low' }, apply: { model: 'example:block/side' } },
      { when: { south: 'low' }, apply: { model: 'example:block/side' } },
      { when: { west: 'low' }, apply: { model: 'example:block/side' } },
    ] };
    const value = record('example:stone_wall', [...definitions, { name: 'up', values: ['true'] }], 'example:block/post', blockstate);
    const fingerprint = extractBehaviorFingerprint(value, { readJson: (path) => path.includes('/blockstates/') ? blockstate : { parent: path.includes('post') ? 'minecraft:block/template_wall_post' : 'minecraft:block/template_wall_side' } });
    const result = matchVanillaBehaviorCandidates({ ...fingerprint, trustedFamilies: ['wall'], tags: ['minecraft:walls'], modelParents: ['block/template_wall_post', 'block/template_wall_side'] });
    expect(result.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'wall' });
    expect(result.defaults).toEqual({ east: 'none', north: 'none', south: 'none', up: 'true', west: 'none' });
    expect(result.stateDefinitions?.find((definition) => definition.name === 'north')?.values).toEqual(['low', 'tall', 'none']);
  });

  it('requires face-attachment evidence for six-face behavior', () => {
    const variants = Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map((facing) => [`facing=${facing}`, { model: 'example:block/model' }]));
    const definitions = [{ name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] }];
    const attached = extractBehaviorFingerprint(record('example:crystal', definitions, 'example:block/model', { variants }), { readJson: (path) => path.includes('/models/') ? { parent: 'minecraft:block/cross' } : { variants } });
    expect(matchVanillaBehaviorCandidates(attached).behavior).toMatchObject({ kind: 'attached-six-face-placement' });

    const directional = extractBehaviorFingerprint(record('example:directional', definitions, 'example:block/model', { variants }), { readJson: (path) => path.includes('/models/') ? { parent: 'minecraft:block/cube_all' } : { variants } });
    expect(matchVanillaBehaviorCandidates(directional).behavior).toBeUndefined();
  });

  it('does not create a candidate from a registry name alone', () => {
    const fingerprint = extractBehaviorFingerprint(record('example:wall', [{ name: 'north', values: ['true', 'false'] }], 'example:block/cube', { variants: { '': { model: 'example:block/cube' } } }));
    expect(matchVanillaBehaviorCandidates(fingerprint).behavior).toBeUndefined();
  });
});
