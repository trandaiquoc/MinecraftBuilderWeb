import { describe, expect, it, vi } from 'vitest';
import { VIEWPORT_HYDRATION_STATUS_DELAY_MS, ViewportHydrationStatusService } from './viewport-hydration-status.service';
import type { ViewportHydrationProgress } from '../../renderer/engine/three-viewport-engine';

function progress(overrides: Partial<ViewportHydrationProgress> = {}): ViewportHydrationProgress {
  return { generation: 1, status: 'hydrating', completed: 15, total: 20, blocksCompleted: 15, blocksTotal: 20, decorationsCompleted: 0, decorationsTotal: 0, percent: 75, ...overrides };
}

describe('ViewportHydrationStatusService', () => {
  it('publishes meaningful progress with the requested activity and real counts', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.activate(owner);
    service.markNextActivity('import');
    service.publish(owner, progress({ total: 20_000, completed: 15_080, percent: 75.4 }));
    expect(service.status()).toMatchObject({ activity: 'import', progress: { completed: 15_080, total: 20_000, percent: 75.4 } });
  });

  it('does not flash tiny work, then exposes it only after the short delay', () => {
    vi.useFakeTimers();
    try {
      const service = new ViewportHydrationStatusService();
      const owner = service.claim();
      service.activate(owner);
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

  it('cancels a delayed loading surface when work completes before it appears', () => {
    vi.useFakeTimers();
    try {
      const service = new ViewportHydrationStatusService();
      const owner = service.claim();
      service.activate(owner);
      service.publish(owner, progress({ total: 1, completed: 0, percent: 0 }));
      service.publish(owner, progress({ status: 'complete', completed: 1, total: 1, blocksCompleted: 1, blocksTotal: 1, percent: 100, finalization: { expectedBlocks: 1, finalReadyBlocks: 1, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 0 } }));
      vi.advanceTimersByTime(VIEWPORT_HYDRATION_STATUS_DELAY_MS + 1);
      expect(service.status()).toBeUndefined();
      expect(service.finalization()).toMatchObject({ loading: false, ready: true });
    } finally { vi.useRealTimers(); }
  });

  it('clears completion and ignores stale owners after a viewport switch', () => {
    const service = new ViewportHydrationStatusService();
    const first = service.claim();
    service.activate(first);
    service.publish(first, progress({ total: 100 }));
    const second = service.claim();
    expect(service.status()).toMatchObject({ progress: { total: 100 } });
    service.activate(second);
    expect(service.status()).toBeUndefined();
    service.publish(first, progress({ generation: 2, total: 100, completed: 90, percent: 90 }));
    expect(service.status()).toBeUndefined();
    service.publish(second, progress({ total: 100, completed: 60, percent: 60 }));
    expect(service.status()?.progress.percent).toBe(60);
    service.publish(second, progress({ status: 'complete', completed: 100, total: 100, percent: 100 }));
    expect(service.status()).toBeUndefined();
  });

  it('can reactivate a retained viewport owner after a mode switch', () => {
    const service = new ViewportHydrationStatusService();
    const first = service.claim();
    const second = service.claim();
    service.activate(first);
    service.publish(first, progress({ total: 100, completed: 25, percent: 25 }));
    expect(service.status()?.progress.completed).toBe(25);
    service.publish(second, progress({ total: 100, completed: 90, percent: 90 }));
    expect(service.status()?.progress.completed).toBe(25);
  });

  it('does not let an inactive viewport claim clear the active viewport loading state', () => {
    const service = new ViewportHydrationStatusService();
    const active = service.claim();
    service.activate(active);
    service.publish(active, progress({ total: 200, completed: 50 }));

    service.claim();

    expect(service.status()?.progress).toMatchObject({ total: 200, completed: 50 });
    expect(service.finalization()?.loading).toBe(true);
  });

  it('uses generic build activity after an import generation is consumed', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.activate(owner);
    service.markNextActivity('import');
    service.publish(owner, progress({ total: 100 }));
    expect(service.status()?.activity).toBe('import');
    service.publish(owner, progress({ generation: 2, total: 100, percent: 10, completed: 10, blocksCompleted: 10 }));
    expect(service.status()?.activity).toBe('build');
  });

  it('does not allow an old owner or generation timer to resurrect loading', () => {
    vi.useFakeTimers();
    try {
      const service = new ViewportHydrationStatusService();
      const oldOwner = service.claim();
      service.activate(oldOwner);
      service.publish(oldOwner, progress({ generation: 1, total: 1, completed: 0, percent: 0 }));
      const currentOwner = service.claim();
      service.activate(currentOwner);
      service.publish(currentOwner, progress({ generation: 2, status: 'complete', completed: 1, total: 1, blocksCompleted: 1, blocksTotal: 1, percent: 100, finalization: { expectedBlocks: 1, finalReadyBlocks: 1, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 0 } }));
      vi.advanceTimersByTime(VIEWPORT_HYDRATION_STATUS_DELAY_MS + 1);
      expect(service.status()).toBeUndefined();
      service.publish(oldOwner, progress({ generation: 1, total: 1, completed: 1, percent: 100 }));
      expect(service.status()).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it('does not expose local edit hydration as global loading', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.activate(owner);
    service.publish(owner, progress({ lane: 'local', total: 20, completed: 1, percent: 5 }));
    expect(service.status()).toBeUndefined();
  });

  it('labels content reconciliation as block asset work', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.activate(owner);
    service.publish(owner, progress({ lane: 'content', total: 40, completed: 1, percent: 2.5 }));
    expect(service.status()).toMatchObject({ activity: 'content', progress: { lane: 'content' } });
  });

  it('switches an existing generation to content activity for provider finalization', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.activate(owner);
    service.publish(owner, progress({ total: 200, completed: 20, percent: 10 }));
    service.publish(owner, progress({ lane: 'content', total: 40, completed: 0, percent: 0 }));
    expect(service.status()).toMatchObject({ activity: 'content', progress: { total: 40, completed: 0 } });
  });

  it('settles unresolved blocks as a warning and reopens when content arrives', () => {
    const service = new ViewportHydrationStatusService();
    const owner = service.claim();
    service.activate(owner);
    service.setSourceRestoreState(owner, { terminal: true, pending: false });
    service.publish(owner, progress({ status: 'complete', completed: 100, total: 120, blocksCompleted: 100, blocksTotal: 120, percent: 83.3, finalization: { expectedBlocks: 120, finalReadyBlocks: 100, provisionalMissingBlocks: 0, permanentMissingBlocks: 20, pendingBlocks: 0 } }));
    expect(service.status()).toBeUndefined();
    expect(service.finalization()).toMatchObject({ phase: 'warning', loading: false, warning: true });

    service.publish(owner, progress({ lane: 'content', completed: 100, total: 20, blocksCompleted: 100, blocksTotal: 20, percent: 0, finalization: { expectedBlocks: 120, finalReadyBlocks: 100, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 20 } }));
    expect(service.finalization()).toMatchObject({ phase: 'updating', loading: true });
    expect(service.status()?.progress.lane).toBe('content');
    service.publish(owner, progress({ lane: 'content', status: 'complete', completed: 20, total: 20, blocksCompleted: 20, blocksTotal: 20, percent: 100, finalization: { expectedBlocks: 120, finalReadyBlocks: 120, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 0 } }));
    expect(service.finalization()).toMatchObject({ phase: 'ready', loading: false, ready: true });
  });
});
