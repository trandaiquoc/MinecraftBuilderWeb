import { describe, expect, it } from 'vitest';
import { verifiedVanillaCapabilityProfile } from './vanilla-capability-profiles';

describe('verified Vanilla capability profiles', () => {
  it('marks only the verified invisible world blocks as intentionally invisible', () => {
    for (const id of [
      'minecraft:air',
      'minecraft:cave_air',
      'minecraft:void_air',
      'minecraft:structure_void',
      'minecraft:light',
    ]) {
      expect(verifiedVanillaCapabilityProfile(id)).toContainEqual({
        kind: 'intentionally-invisible',
        evidence: 'verified',
      });
    }
    expect(verifiedVanillaCapabilityProfile('minecraft:glass')).not.toContainEqual(
      expect.objectContaining({ kind: 'intentionally-invisible' }),
    );
  });
});
