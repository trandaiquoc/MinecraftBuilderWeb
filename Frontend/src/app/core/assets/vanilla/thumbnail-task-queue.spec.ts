import { describe, expect, it, vi } from 'vitest';
import { ThumbnailTaskQueue } from './thumbnail-task-queue';

const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('ThumbnailTaskQueue', () => {
  it('bounds concurrency, deduplicates keys, and continues after failures', async () => {
    const queue = new ThumbnailTaskQueue(2);
    let active = 0;
    let maximum = 0;
    let completed = 0;
    const jobs = Array.from({ length: 6 }, (_, index) => vi.fn(async () => {
      active += 1; maximum = Math.max(maximum, active);
      await wait();
      active -= 1; completed += 1;
      if (index === 1) throw new Error('expected fixture failure');
    }));
    jobs.forEach((job, index) => queue.enqueue(`item-${index}`, index === 5 ? 'visible' : 'prefetch', job));
    queue.enqueue('item-0', 'visible', jobs[0]);
    for (let attempt = 0; attempt < 20 && completed < 6; attempt++) await wait();
    expect(maximum).toBe(2);
    expect(completed).toBe(6);
    expect(jobs[0]).toHaveBeenCalledTimes(1);
  });

  it('drops stale queued work without interrupting active jobs', async () => {
    const queue = new ThumbnailTaskQueue(1);
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    const stale = vi.fn(async () => undefined);
    const fresh = vi.fn(async () => undefined);
    queue.enqueue('active', 'prefetch', () => active);
    queue.enqueue('stale', 'prefetch', stale);
    queue.invalidate();
    queue.enqueue('fresh', 'visible', fresh);
    expect(stale).not.toHaveBeenCalled();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('promotes a queued prefetch when its card becomes visible', async () => {
    const queue = new ThumbnailTaskQueue(1);
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    const prefetch = vi.fn(async () => undefined);
    const visible = vi.fn(async () => undefined);
    queue.enqueue('active', 'visible', () => active);
    queue.enqueue('prefetch', 'prefetch', prefetch);
    queue.enqueue('prefetch', 'visible', visible);
    release();
    for (let attempt = 0; attempt < 10 && !visible.mock.calls.length; attempt++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(visible).toHaveBeenCalledTimes(1);
    expect(prefetch).not.toHaveBeenCalled();
  });
});
