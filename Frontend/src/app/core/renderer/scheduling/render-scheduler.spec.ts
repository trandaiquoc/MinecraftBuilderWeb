import { describe, expect, it } from 'vitest';
import { RenderScheduler } from './render-scheduler';

describe('RenderScheduler', () => {
  it('coalesces invalidations and executes one callback', () => {
    const frames: (() => void)[] = [];
    const scheduler = new RenderScheduler((callback) => { frames.push(() => callback(performance.now())); return frames.length; }, () => undefined);
    let renders = 0;
    scheduler.request(() => renders += 1);
    scheduler.request(() => renders += 1);
    expect(frames).toHaveLength(1);
    frames[0]();
    expect(renders).toBe(1);
    expect(scheduler.scheduled).toBe(false);
  });

  it('cancels a pending frame on dispose', () => {
    let cancelled = 0;
    const scheduler = new RenderScheduler(() => 7, () => cancelled += 1);
    scheduler.request(() => undefined);
    scheduler.dispose();
    expect(cancelled).toBe(1);
    expect(scheduler.scheduled).toBe(false);
  });
});
