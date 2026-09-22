import { describe, expect, it } from 'vitest';
import { evaluateMinecraftRequirement } from './minecraft-version-predicate';

describe('Minecraft compatibility predicates', () => {
  it('supports exact, wildcard, comparison, tilde and caret predicates', () => {
    expect(evaluateMinecraftRequirement('1.21.1', '1.21.1').status).toBe('compatible');
    expect(evaluateMinecraftRequirement('1.21.x', '1.21.1').status).toBe('compatible');
    expect(evaluateMinecraftRequirement('>=1.20 <1.22', '1.21.1').status).toBe('compatible');
    expect(evaluateMinecraftRequirement('~1.21', '1.21.9').status).toBe('compatible');
    expect(evaluateMinecraftRequirement('^1.20.5', '1.21.1').status).toBe('compatible');
    expect(evaluateMinecraftRequirement('1.20.1', '1.21.1').status).toBe('incompatible');
  });

  it('uses OR semantics for arrays and blocks missing/unknown versions', () => {
    expect(evaluateMinecraftRequirement(['1.20.x', '1.21.x'], '1.21.1').status).toBe('compatible');
    expect(evaluateMinecraftRequirement(undefined, '1.21.1')).toMatchObject({ status: 'unknown', reason: 'missing-minecraft-dependency' });
    expect(evaluateMinecraftRequirement('1.21.1', '1.21-pre1').status).toBe('unknown');
  });
});
