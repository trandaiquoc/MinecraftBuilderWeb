import { describe, expect, it } from 'vitest';
import { HydrationScheduler } from './hydration-scheduler';

describe('HydrationScheduler', () => {
  it('dequeues in order and avoids duplicate scheduled pumps', () => {
    const microtasks: (() => void)[] = [];
    const scheduler = new HydrationScheduler<number>({
      requestMicrotask: (callback) => microtasks.push(callback),
    });
    scheduler.enqueue([1, 2, 3]);
    expect(scheduler.queued()).toBe(3);
    expect(scheduler.dequeue()).toBe(1);
    expect(scheduler.schedule(() => undefined)).toBe(true);
    expect(scheduler.schedule(() => undefined)).toBe(false);
    microtasks[0]();
    expect(scheduler.isScheduled).toBe(false);
  });

  it('cancels queued work and advances generation', () => {
    const scheduler = new HydrationScheduler<number>();
    scheduler.enqueue([1]);
    const generation = scheduler.currentGeneration;
    scheduler.cancel();
    expect(scheduler.queued()).toBe(0);
    expect(scheduler.currentGeneration).toBe(generation + 1);
  });
});
