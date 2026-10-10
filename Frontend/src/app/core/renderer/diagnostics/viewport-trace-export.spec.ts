import { describe, expect, it } from 'vitest';
import {
  sanitizeTraceScenario,
  stableTraceJson,
  viewportTraceFilename,
} from './viewport-trace-export';

describe('viewport trace export', () => {
  it('sanitizes scenarios and creates stable filenames', () => {
    expect(sanitizeTraceScenario(' rmb first / test ')).toBe('rmb-first-test');
    expect(viewportTraceFilename('rmb first', new Date('2026-10-04T01:02:03.004Z'))).toBe(
      'minecraftbuilder-viewport-trace-rmb-first-2026-10-04T01-02-03-004Z.json',
    );
  });

  it('serializes object keys deterministically', () => {
    const serialized = stableTraceJson({ z: 1, a: { d: true, b: false } });
    expect(serialized.indexOf('"a"')).toBeLessThan(serialized.indexOf('"z"'));
    expect(serialized.indexOf('"b"')).toBeLessThan(serialized.indexOf('"d"'));
  });
});
