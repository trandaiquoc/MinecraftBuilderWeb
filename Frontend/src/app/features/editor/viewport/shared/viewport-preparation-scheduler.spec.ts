import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewportPreparationScheduler, type ViewportPreparationScope } from './viewport-preparation-scheduler';

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

  it('waits for ready content and runs once for an unchanged scope', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn();
    const current = scope();

    scheduler.schedule(current, false, prepare);
    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();
    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('cancels stale pending work when project or provider scope changes', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepareOld = vi.fn();
    const prepareNew = vi.fn();
    const original = scope();

    scheduler.schedule(original, true, prepareOld);
    scheduler.schedule({ ...original, providerGeneration: 2 }, true, prepareNew);
    vi.runAllTimers();

    expect(prepareOld).not.toHaveBeenCalled();
    expect(prepareNew).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('repeats preparation when project metadata changes without replacing block arrays', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn();
    const original = scope();

    scheduler.schedule(original, true, prepare);
    vi.runAllTimers();
    scheduler.schedule({ ...original, project: {} }, true, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('cancels pending background work when the viewport becomes active and retries when inactive', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn();
    const current = scope();

    scheduler.schedule(current, true, prepare);
    scheduler.schedule(current, false, prepare);
    vi.runAllTimers();
    expect(prepare).not.toHaveBeenCalled();

    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('retries preparation if the idle callback finds the viewport active', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn<() => boolean>(() => false);
    const current = scope();

    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();
    prepare.mockImplementation(() => true);
    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('does not rerun completed preparation for an unchanged content scope', () => {
    vi.useFakeTimers();
    const scheduler = new ViewportPreparationScheduler();
    const prepare = vi.fn();
    const current = scope();

    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();
    scheduler.schedule(current, true, prepare);
    vi.runAllTimers();

    expect(prepare).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
});
