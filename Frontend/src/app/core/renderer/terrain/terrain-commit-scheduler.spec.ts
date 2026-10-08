import { describe, expect, it, vi } from 'vitest';
import { TerrainCommitScheduler } from './terrain-commit-scheduler';

describe('terrain commit scheduler', () => {
  it('commits queued chunks in bounded asynchronous frames', async () => {
    vi.useFakeTimers();
    const scheduler = new TerrainCommitScheduler(2, 5);
    const committed: number[] = [];
    scheduler.enqueue(() => committed.push(1));
    scheduler.enqueue(() => committed.push(2));
    expect(committed).toEqual([]);
    await vi.advanceTimersByTimeAsync(10);
    expect(committed).toEqual([1, 2]);
    expect(scheduler.evidence().terrainCommitCount).toBe(2);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('prioritizes local commit jobs over background work', async () => {
    vi.useFakeTimers();
    const scheduler = new TerrainCommitScheduler();
    const order: string[] = [];
    scheduler.enqueue(() => order.push('background'), 0);
    scheduler.enqueue(() => order.push('local'), 1);
    await vi.advanceTimersByTimeAsync(10);
    expect(order[0]).toBe('local');
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('clears the scheduled commit callback on terminal disposal', () => {
    vi.useFakeTimers();
    const scheduler = new TerrainCommitScheduler();
    const committed: number[] = [];
    scheduler.enqueue(() => committed.push(1));

    scheduler.dispose();
    scheduler.dispose();
    vi.runAllTimers();

    expect(committed).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
