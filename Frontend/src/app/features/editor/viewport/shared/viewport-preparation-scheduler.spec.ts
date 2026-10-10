import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ViewportPreparationScheduler,
  type ViewportPreparationScope,
} from './viewport-preparation-scheduler';

const scope = (): ViewportPreparationScope => ({
  projectId: 'project',
  project: {},
  blocks: {},
  decorations: {},
  provider: {},
  providerGeneration: 1,
  visualRevision: 1,
});

describe('ViewportPreparationScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for readiness and prepares an unchanged task once', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn(() => 'completed' as const);
    const current = scope();

    scheduler.update('3d-inactive', current, false, 1, prepare);
    scheduler.update('3d-inactive', current, true, 1, prepare);
    vi.runAllTimers();
    scheduler.update('3d-inactive', current, true, 1, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('cancels stale tasks and resets completion when provider scope changes', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepareOld = vi.fn(() => 'completed' as const);
    const prepareNew = vi.fn(() => 'completed' as const);
    const original = scope();

    scheduler.update('y-layer', original, true, 0, prepareOld);
    scheduler.update('y-layer', { ...original, providerGeneration: 2 }, true, 0, prepareNew);
    vi.runAllTimers();

    expect(prepareOld).not.toHaveBeenCalled();
    expect(prepareNew).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('resets task completion when project identity changes without replacing block arrays', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn(() => 'completed' as const);
    const original = scope();

    scheduler.update('y-layer', original, true, 0, prepare);
    vi.runAllTimers();
    scheduler.update('y-layer', { ...original, project: {} }, true, 0, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('runs active Y-layer preparation before inactive 3D preparation on one queue', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const order: string[] = [];

    scheduler.update('3d-inactive', current, true, 1, () => {
      order.push('3d');
      return 'completed';
    });
    scheduler.update('y-layer', current, true, 0, () => {
      order.push('y-layer');
      return 'completed';
    });
    vi.runAllTimers();

    expect(order).toEqual(['y-layer', '3d']);
    scheduler.dispose();
  });

  it('cancels pending preparation when the task is no longer ready', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn(() => 'completed' as const);
    const current = scope();

    scheduler.update('3d-inactive', current, true, 1, prepare);
    scheduler.update('3d-inactive', current, false, 1, prepare);
    vi.runAllTimers();

    expect(prepare).not.toHaveBeenCalled();
    scheduler.dispose();
  });

  it('retries accepted preparation only after an owner readiness notification', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn<() => 'completed' | 'accepted'>(() => 'accepted');
    const current = scope();

    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    expect(prepare).toHaveBeenCalledTimes(1);

    prepare.mockImplementation(() => 'completed');
    scheduler.retry('y-layer');
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('defers an incomplete task without spinning or starving another viewport', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const order: string[] = [];

    scheduler.update('y-layer', current, true, 0, () => {
      order.push('y-layer');
      return 'in-progress';
    });
    scheduler.update('3d-inactive', current, true, 1, () => {
      order.push('3d');
      return 'completed';
    });
    vi.runAllTimers();

    expect(order).toEqual(['y-layer', '3d']);
    expect(vi.getTimerCount()).toBe(0);
    scheduler.dispose();
  });

  it('does not restart a completed task for an unchanged scope', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn(() => 'completed' as const);
    const current = scope();

    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('releases the project scope after the last viewport unregisters', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const internals = scheduler as unknown as { scope?: ViewportPreparationScope };

    scheduler.update('y-layer', current, false, 0, () => 'rejected');
    expect(internals.scope).toBe(current);

    scheduler.unregister('y-layer');

    expect(internals.scope).toBeUndefined();
    scheduler.dispose();
  });

  it('clears a removed task completion before re-registering the same id and scope', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const prepare = vi.fn(() => 'completed' as const);

    scheduler.update('y-layer', current, true, 0, prepare);
    scheduler.update('3d-inactive', current, false, 1, () => 'rejected');
    vi.runAllTimers();
    scheduler.update('y-layer', undefined, false, 0, () => 'rejected');
    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('cancels an unregistered task callback without blocking another task', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const removed = vi.fn(() => 'completed' as const);
    const retained = vi.fn(() => 'completed' as const);

    scheduler.update('y-layer', current, true, 0, removed);
    scheduler.update('3d-inactive', current, true, 1, retained);
    scheduler.unregister('y-layer');
    vi.runAllTimers();

    expect(removed).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('does not complete accepted or in-progress work until an owner reports completion', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const prepare = vi
      .fn<() => 'accepted' | 'in-progress' | 'completed'>()
      .mockReturnValueOnce('accepted')
      .mockReturnValueOnce('in-progress')
      .mockReturnValueOnce('completed');

    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    expect(prepare).toHaveBeenCalledTimes(1);

    scheduler.retry('y-layer');
    vi.runAllTimers();
    scheduler.retry('y-layer');
    vi.runAllTimers();
    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(3);
    scheduler.dispose();
  });

  it('coalesces a readiness notification raised during an attempt without spinning', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    let attempts = 0;
    const prepare = vi.fn(() => {
      attempts += 1;
      scheduler.retry('y-layer');
      return attempts === 1 ? ('in-progress' as const) : ('completed' as const);
    });

    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    scheduler.dispose();
  });

  it('retries a rejected task after a readiness transition but not while it remains unready', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const prepare = vi
      .fn<() => 'rejected' | 'completed'>()
      .mockReturnValueOnce('rejected')
      .mockReturnValueOnce('completed');

    scheduler.update('3d-inactive', current, true, 1, prepare);
    vi.runAllTimers();
    scheduler.update('3d-inactive', current, false, 1, prepare);
    scheduler.update('3d-inactive', current, false, 1, prepare);
    vi.runAllTimers();
    expect(prepare).toHaveBeenCalledTimes(1);

    scheduler.update('3d-inactive', current, true, 1, prepare);
    vi.runAllTimers();
    expect(prepare).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('does not retry a rejected task for repeated updates with unchanged readiness and scope', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const prepare = vi.fn(() => 'rejected' as const);

    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    scheduler.update('y-layer', current, true, 0, prepare);
    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    scheduler.dispose();
  });

  it('ignores retry notifications after task removal or scope invalidation', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const current = scope();
    const stalePrepare = vi.fn(() => 'accepted' as const);
    const nextPrepare = vi.fn(() => 'completed' as const);

    scheduler.update('y-layer', current, true, 0, stalePrepare);
    vi.runAllTimers();
    scheduler.update('y-layer', undefined, false, 0, () => 'rejected');
    scheduler.retry('y-layer');
    scheduler.update('y-layer', { ...current, providerGeneration: 2 }, true, 0, nextPrepare);
    scheduler.retry('y-layer');
    vi.runAllTimers();

    expect(stalePrepare).toHaveBeenCalledTimes(1);
    expect(nextPrepare).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
});
