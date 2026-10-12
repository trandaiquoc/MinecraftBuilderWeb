import { describe, expect, it } from 'vitest';
import type { BlockDefinition } from '../../../blocks/catalog/block-definition.types';
import { isStructureJsonSignHost } from './structure-json-block-entity-host';

describe('Structure JSON sign host recognition', () => {
  it('reuses the canonical vanilla sign identity predicate', () => {
    expect(isStructureJsonSignHost('minecraft:oak_sign')).toBe(true);
    expect(isStructureJsonSignHost('minecraft:oak_wall_hanging_sign')).toBe(true);
    expect(isStructureJsonSignHost('example:oak_sign')).toBe(false);
  });

  it('accepts an external sign capability without relying on its registry name', () => {
    const definition = {
      capabilities: [{ kind: 'block-entity', entityKind: 'sign', evidence: 'verified' }],
    } as unknown as BlockDefinition;
    expect(isStructureJsonSignHost('example:signal_plate', definition)).toBe(true);
  });
});
