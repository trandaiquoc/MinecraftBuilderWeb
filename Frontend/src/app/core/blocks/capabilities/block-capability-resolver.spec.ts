import { describe, expect, it } from 'vitest';
import { deriveBlockCapabilities, blockCapability, hasBlockCapability, validateCapabilityProfile } from './block-capability-resolver';

describe('block capability resolver', () => {
  it('derives orthogonal verified capabilities from behavior', () => {
    const profile = deriveBlockCapabilities({
      behavior: { kind: 'wall-sign', facingProperty: 'facing' },
      visualClassification: 'special-renderer-required',
      stateDefinitions: [{ name: 'waterlogged', values: ['true', 'false'] }],
    });
    expect(hasBlockCapability(profile, 'special-renderer')).toBe(true);
    expect(blockCapability(profile, 'directional')).toMatchObject({ mode: 'horizontal', evidence: 'verified' });
    expect(blockCapability(profile, 'attachment')).toMatchObject({ surfaces: ['wall'] });
    expect(blockCapability(profile, 'block-entity')).toMatchObject({ entityKind: 'sign' });
    expect(blockCapability(profile, 'waterloggable')).toMatchObject({ evidence: 'inferred' });
  });

  it('keeps unknown external content conservative', () => {
    const profile = deriveBlockCapabilities({ visualClassification: 'standard-json', stateDefinitions: [{ name: 'facing', values: ['north', 'east'] }] });
    expect(profile).toEqual([{ kind: 'standard-json-render', evidence: 'inferred' }]);
    expect(deriveBlockCapabilities({ stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] })).toEqual([{ kind: 'directional', mode: 'horizontal', evidence: 'inferred' }]);
    expect(deriveBlockCapabilities({ stateDefinitions: [{ name: 'waterlogged', values: ['true', 'false'] }] })).toEqual([{ kind: 'waterloggable', evidence: 'inferred' }]);
    expect(deriveBlockCapabilities({ explicit: [{ kind: 'attachment', surfaces: ['wall'], evidence: 'inferred' }] })).toEqual([]);
    expect(deriveBlockCapabilities({})).toEqual([]);
  });

  it('rejects contradictory explicit profiles', () => {
    expect(() => validateCapabilityProfile([
      { kind: 'directional', mode: 'horizontal', evidence: 'verified' },
      { kind: 'directional', mode: 'six-face', evidence: 'verified' },
    ])).toThrow('conflicting directional modes');
    expect(() => validateCapabilityProfile([
      { kind: 'standard-json-render', evidence: 'inferred' },
      { kind: 'special-renderer', evidence: 'verified' },
    ])).toThrow('conflicting render classifications');
    expect(() => validateCapabilityProfile([{ kind: 'attachment', surfaces: ['wall'], evidence: 'inferred' }])).toThrow('requires verified evidence');
  });

  it('does not infer multi-block from a half property', () => {
    expect(deriveBlockCapabilities({ stateDefinitions: [{ name: 'half', values: ['top', 'bottom'] }] })).toEqual([]);
  });
});
