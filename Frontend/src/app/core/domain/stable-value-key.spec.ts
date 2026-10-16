import { describe, expect, it } from 'vitest';
import { stableValueKey } from './stable-value-key';

describe('stableValueKey', () => {
  it('returns a string for an undefined root value', () => {
    expect(stableValueKey(undefined)).toBe('undefined');
  });

  it('sorts object keys recursively while preserving array order', () => {
    expect(stableValueKey({ z: 1, a: { y: 2, b: 3 }, list: [2, 1] })).toBe(
      '{"a":{"b":3,"y":2},"list":[2,1],"z":1}',
    );
  });

  it('keeps delimiter-bearing nested strings distinct from sibling fields', () => {
    expect(stableValueKey({ outer: { a: 'x,b=y' } })).not.toBe(
      stableValueKey({ outer: { a: 'x', b: 'y' } }),
    );
    expect(stableValueKey({ outer: { b: 'y', a: 'x' } })).toBe(
      stableValueKey({ outer: { a: 'x', b: 'y' } }),
    );
  });

  it('distinguishes supported JSON values and preserves their current encoding', () => {
    expect(stableValueKey(null)).toBe('null');
    expect(stableValueKey(false)).toBe('false');
    expect(stableValueKey(0)).toBe('0');
    expect(stableValueKey('null')).toBe('"null"');
    expect(stableValueKey({ value: null })).not.toBe(stableValueKey({}));
    expect(stableValueKey({ value: [1, null] })).not.toBe(stableValueKey({ value: [1] }));
    expect(stableValueKey({ value: { a: 1, b: 2 } })).toBe(
      stableValueKey({ value: { b: 2, a: 1 } }),
    );
  });

  it('does not alias parsed non-finite numbers to null', () => {
    expect(stableValueKey(Infinity)).not.toBe(stableValueKey(null));
    expect(stableValueKey(-Infinity)).not.toBe(stableValueKey(Infinity));
    expect(stableValueKey(NaN)).not.toBe(stableValueKey(null));
    expect(stableValueKey(JSON.parse('1e400'))).not.toBe(stableValueKey(null));
    expect(stableValueKey({ nested: [JSON.parse('1e400')] })).not.toBe(
      stableValueKey({ nested: [null] }),
    );
  });

  it('preserves negative zero from valid JSON numeric values', () => {
    expect(stableValueKey(JSON.parse('-0'))).not.toBe(stableValueKey(0));
    expect(stableValueKey({ value: JSON.parse('-0') })).not.toBe(stableValueKey({ value: 0 }));
  });

  it('keeps undefined array entries distinct from missing entries', () => {
    expect(stableValueKey([undefined, 1])).toBe('[undefined,1]');
    expect(stableValueKey([undefined])).not.toBe(stableValueKey([]));
    expect(stableValueKey(Array(1))).not.toBe(stableValueKey([]));
    expect(stableValueKey(Array(1))).not.toBe(stableValueKey([undefined]));
  });
});
