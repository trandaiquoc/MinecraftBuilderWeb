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

  it('keeps undefined array entries distinct from missing entries', () => {
    expect(stableValueKey([undefined, 1])).toBe('[undefined,1]');
    expect(stableValueKey([undefined])).not.toBe(stableValueKey([]));
    expect(stableValueKey(Array(1))).not.toBe(stableValueKey([]));
    expect(stableValueKey(Array(1))).not.toBe(stableValueKey([undefined]));
  });
});
