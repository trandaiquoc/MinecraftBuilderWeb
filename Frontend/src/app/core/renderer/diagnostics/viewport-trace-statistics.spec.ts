import { describe, expect, it } from 'vitest';
import { BoundedTraceBuffer, percentile, TraceNumericAccumulator } from './viewport-trace-statistics';

describe('viewport trace statistics', () => {
  it('bounds retained values while reporting how many were dropped', () => {
    const buffer = new BoundedTraceBuffer<number>(2);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    expect(buffer.toArray()).toEqual([2, 3]);
    expect(buffer.droppedCount).toBe(1);
  });

  it('calculates interpolated percentiles and aggregate duration statistics', () => {
    expect(percentile([1, 2, 3, 4], .5)).toBe(2.5);
    const aggregate = new TraceNumericAccumulator();
    aggregate.add(2);
    aggregate.add(6);
    expect(aggregate.summary()).toMatchObject({ observedCount: 2, totalMs: 8, minMs: 2, maxMs: 6, p50Ms: 4 });
    aggregate.reset();
    expect(aggregate.summary()).toMatchObject({ observedCount: 0, totalMs: 0 });
  });
});
