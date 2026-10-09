import { describe, expect, it } from 'vitest';
import { BoundedTraceBuffer, percentile, TraceNumericAccumulator, ViewportTraceStatistics } from './viewport-trace-statistics';

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

  it('owns bounded heartbeat and per-run sample aggregation, resetting between traces', () => {
    const statistics = new ViewportTraceStatistics();
    statistics.recordHeartbeat(20);
    statistics.recordHeartbeat(40);
    statistics.recordDuration('provider.create', 12);
    statistics.recordSample({ hydration: { completed: 8, generation: 2 }, counters: { actualSceneRenders: 3 }, render: { drawCalls: 4 } }, undefined, false);
    expect(statistics.heartbeatAggregate.summary()).toMatchObject({ observedCount: 2, p50Ms: 30 });
    expect(statistics.heartbeatOver16_7).toBe(2);
    expect(statistics.durationAggregates.get('provider.create')?.summary().maxMs).toBe(12);
    expect(statistics.firstCounters).toEqual({ actualSceneRenders: 3 });
    statistics.reset();
    expect(statistics.heartbeatAggregate.observedCount).toBe(0);
    expect(statistics.durationAggregates.size).toBe(0);
    expect(statistics.firstCounters).toBeUndefined();
    expect(statistics.hydrationAggregate.startCompleted).toBeUndefined();
  });
});
