import { describe, expect, it } from 'vitest';
import { stableValueKey } from './stable-value-key';

describe('stableValueKey', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(stableValueKey({ z: 1, a: { y: 2, b: 3 }, list: [2, 1] }))
      .toBe('{"a":{"b":3,"y":2},"list":[2,1],"z":1}');
  });

  it('preserves the established array serialization of undefined entries', () => {
    expect(stableValueKey([undefined, 1])).toBe('[,1]');
  });
});
