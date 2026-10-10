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
    const prepare = vi.fn();
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
    const prepareOld = vi.fn();
    const prepareNew = vi.fn();
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
    const prepare = vi.fn();
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
    });
    scheduler.update('y-layer', current, true, 0, () => {
      order.push('y-layer');
    });
    vi.runAllTimers();

    expect(order).toEqual(['y-layer', '3d']);
    scheduler.dispose();
  });

  it('cancels pending preparation when the task is no longer ready', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn();
    const current = scope();

    scheduler.update('3d-inactive', current, true, 1, prepare);
    scheduler.update('3d-inactive', current, false, 1, prepare);
    vi.runAllTimers();

    expect(prepare).not.toHaveBeenCalled();
    scheduler.dispose();
  });

  it('retries preparation when an idle callback cannot complete it', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn<() => boolean>(() => false);
    const current = scope();

    scheduler.update('y-layer', current, true, 0, prepare);
    vi.runAllTimers();
    prepare.mockImplementation(() => true);
    scheduler.update('y-layer', current, true, 0, prepare);
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
      return false;
    });
    scheduler.update('3d-inactive', current, true, 1, () => {
      order.push('3d');
    });
    vi.runAllTimers();

    expect(order).toEqual(['y-layer', '3d']);
    expect(vi.getTimerCount()).toBe(0);
    scheduler.dispose();
  });

  it('does not restart a completed task for an unchanged scope', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn();
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

    scheduler.update('y-layer', current, false, 0, () => undefined);
    expect(internals.scope).toBe(current);

    scheduler.unregister('y-layer');

    expect(internals.scope).toBeUndefined();
    scheduler.dispose();
  });
});
