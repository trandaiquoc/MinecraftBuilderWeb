import { describe, expect, it } from 'vitest';
import { blockStatePredicates, invalidPredicateReasons, normalizeBlockStateScalar, normalizePredicate, predicateMatches, stateDefinitionsFromBlockstate, variantKeyMatches } from './normalized-predicate';

describe('normalized blockstate predicates', () => {
  it('normalizes string, numeric and boolean scalar values', () => {
    expect(normalizeBlockStateScalar('north')).toBe('north');
    expect(normalizeBlockStateScalar(5)).toBe('5');
    expect(normalizeBlockStateScalar(false)).toBe('false');
    expect(normalizeBlockStateScalar({ value: 5 })).toBeUndefined();
    expect(normalizeBlockStateScalar(Number.NaN)).toBeUndefined();
  });

  it('matches normalized scalar values through nested AND/OR predicates', () => {
    const predicate = normalizePredicate({ OR: [{ AND: [{ phase: 0 }, { enabled: false }] }, { AND: [{ phase: 2 }, { enabled: true }] }] });
    expect(predicateMatches(predicate, { phase: '0', enabled: 'false' })).toBe(true);
    expect(predicateMatches(predicate, { phase: '2', enabled: 'true' })).toBe(true);
    expect(predicateMatches(predicate, { phase: '1', enabled: 'false' })).toBe(false);
  });

  it('fails closed for unsupported explicit conditions but keeps missing when unconditional', () => {
    expect(predicateMatches(normalizePredicate({ stage: { value: 1 } }), { stage: '1' })).toBe(false);
    expect(predicateMatches(normalizePredicate({}), {})).toBe(true);
    expect(predicateMatches(normalizePredicate(undefined), {})).toBe(false);
    expect(invalidPredicateReasons(blockStatePredicates({ multipart: [{ when: { stage: { value: 1 } }, apply: {} }, { apply: {} }] }))).toEqual(['Unsupported predicate value for stage.']);
  });

  it('keeps variant alternatives and discovers numeric/boolean state definitions', () => {
    expect(variantKeyMatches('facing=north|south,half=lower', { facing: 'south', half: 'lower' })).toBe(true);
    const definitions = stateDefinitionsFromBlockstate({ multipart: [{ when: { AND: [{ stage: 0 }, { anchored: false }] }, apply: {} }, { when: { mode: 'active' }, apply: {} }] });
    expect(definitions).toEqual([{ name: 'anchored', values: ['false'] }, { name: 'mode', values: ['active'] }, { name: 'stage', values: ['0'] }]);
    expect(blockStatePredicates({ multipart: [{ apply: {} }] })).toEqual([]);
  });
});
