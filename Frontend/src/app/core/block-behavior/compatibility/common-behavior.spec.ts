import { describe, expect, it } from 'vitest';
import { AssetBlockRecord, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import { evaluateCommonBehavior } from './common-behavior';

function record(id: string, definitions: readonly BlockStateDefinition[], model = `${id.replace(':', '/')}`): AssetBlockRecord {
  return {
    id,
    displayName: id,
    defaultState: {},
    stateDefinitions: definitions,
    resources: { blockstate: `assets/${id.replace(':', '/')}.json`, model, textures: [] },
  };
}

describe('common resource behavior evaluation', () => {
  it('reuses a complete door contract and derives canonical defaults', () => {
    const result = evaluateCommonBehavior(record('example:door', [
      { name: 'facing', values: ['north', 'east', 'south', 'west'] },
      { name: 'half', values: ['lower', 'upper'] },
      { name: 'hinge', values: ['left', 'right'] },
      { name: 'open', values: ['true', 'false'] },
      { name: 'powered', values: ['true', 'false'] },
    ]));
    expect(result.behavior).toMatchObject({ kind: 'double-height', halfProperty: 'half' });
    expect(result.defaultState).toMatchObject({ facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' });
    expect(result.defaultStateSource).toBe('compatible-common');
  });

  it('reuses the common button contract without an ID whitelist', () => {
    const result = evaluateCommonBehavior(record('example:stone_button', [
      { name: 'face', values: ['floor', 'wall', 'ceiling'] },
      { name: 'facing', values: ['north', 'east', 'south', 'west'] },
      { name: 'powered', values: ['true', 'false'] },
    ]));
    expect(result.behavior).toMatchObject({ kind: 'button' });
    expect(result.defaultState).toEqual({ face: 'floor', facing: 'north', powered: 'false' });
  });

  it('reports a changed contract instead of applying a partial door rule', () => {
    const result = evaluateCommonBehavior(record('example:door', [
      { name: 'facing', values: ['north', 'east', 'south', 'west'] },
      { name: 'half', values: ['lower', 'upper'] },
      { name: 'open', values: ['true', 'false'] },
    ]));
    expect(result.behavior).toBeUndefined();
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('missing');
  });

  it('does not infer a connection family without resource evidence', () => {
    const result = evaluateCommonBehavior(record('example:unknown', [
      ...(['north', 'east', 'south', 'west'] as const).map((name) => ({ name, values: ['true', 'false'] })),
    ]));
    expect(result.behavior).toBeUndefined();
    expect(result.compatible).toBe(false);
  });

  it('recognizes a wall contract from wall model evidence', () => {
    const result = evaluateCommonBehavior(record('example:custom', [
      ...(['north', 'east', 'south', 'west'] as const).map((name) => ({ name, values: ['none', 'low', 'tall'] })),
      { name: 'up', values: ['true', 'false'] },
    ], 'example:block/custom_wall_post'));
    expect(result.behavior).toMatchObject({ kind: 'horizontal-connect', family: 'wall' });
  });
});
