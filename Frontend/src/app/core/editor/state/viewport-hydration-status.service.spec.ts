import { describe, expect, it, vi } from 'vitest';
import { ViewportHydrationStatusService } from './viewport-hydration-status.service';
import type { ViewportHydrationProgress } from '../../renderer/engine/three-viewport-engine';

function progress(overrides: Partial<ViewportHydrationProgress> = {}): ViewportHydrationProgress {
  return { generation: 1, status: 'hydrating', completed: 15, total: 20, blocksCompleted: 15, blocksTotal: 20, decorationsCompleted: 0, decorationsTotal: 0, percent: 75, ...overrides };
}

describe('ViewportHydrationStatusService', () => {
  it('publishes meaningful progress with the requested activity and real counts', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.markNextActivity('import');
    service.publish(owner, progress({ total: 20_000, completed: 15_080, percent: 75.4 }));
    expect(service.status()).toMatchObject({ activity: 'import', progress: { completed: 15_080, total: 20_000, percent: 75.4 } });
  });

  it('does not flash tiny work, then exposes it only after the short delay', () => {
    vi.useFakeTimers();
    try {
      const service = new ViewportHydrationStatusService();
      const owner = service.claim();
      service.publish(owner, progress({ total: 1, completed: 0, percent: 0 }));
      expect(service.status()).toBeUndefined();
      vi.advanceTimersByTime(179);
      expect(service.status()).toBeUndefined();
      vi.advanceTimersByTime(1);
      expect(service.status()?.progress.total).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears completion and ignores stale owners after a viewport switch', () => {
    const service = new ViewportHydrationStatusService();
    const first = service.claim();
    service.publish(first, progress({ total: 100 }));
    const second = service.claim();
    expect(service.status()).toBeUndefined();
    service.publish(first, progress({ generation: 2, total: 100, completed: 90, percent: 90 }));
    expect(service.status()).toBeUndefined();
    service.publish(second, progress({ total: 100, completed: 60, percent: 60 }));
    expect(service.status()?.progress.percent).toBe(60);
    service.publish(second, progress({ status: 'complete', completed: 100, total: 100, percent: 100 }));
    expect(service.status()).toBeUndefined();
  });

  it('uses generic build activity after an import generation is consumed', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.markNextActivity('import');
    service.publish(owner, progress({ total: 100 }));
    expect(service.status()?.activity).toBe('import');
    service.publish(owner, progress({ generation: 2, total: 100, percent: 10, completed: 10, blocksCompleted: 10 }));
    expect(service.status()?.activity).toBe('build');
  });
});
