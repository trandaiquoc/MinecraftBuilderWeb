import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhaseWatchdog,
  MOD_IMPORT_PHASE_TIMEOUTS,
  ModImportTimeoutError,
} from './mod-import-phase-watchdog';

describe('Mod import phase watchdog', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the configured phase timeout policy', () => {
    expect(MOD_IMPORT_PHASE_TIMEOUTS).toEqual({
      'opening-archive': 60_000,
      'reading-metadata': 30_000,
      'checking-compatibility': 30_000,
      'indexing-resources': 60_000,
      'extracting-resources': 60_000,
      'discovering-blocks': 60_000,
      'discovering-items': 60_000,
      'discovering-decorations': 60_000,
      'evaluating-behavior': 60_000,
      'checking-conflicts': 60_000,
      'saving-cache': 90_000,
      'finalizing-cache': 90_000,
      activating: 15_000,
    });
  });

  it('aborts a stalled phase with the typed phase timeout', () => {
    vi.useFakeTimers();
    const watchdog = createPhaseWatchdog('checking-conflicts', undefined, 1000);
    vi.advanceTimersByTime(1001);
    expect(watchdog.signal.aborted).toBe(true);
    expect(watchdog.signal.reason).toBeInstanceOf(ModImportTimeoutError);
    expect(watchdog.signal.reason).toMatchObject({
      name: 'ModImportTimeoutError',
      message: 'Mod import phase timed out: checking-conflicts',
      phase: 'checking-conflicts',
      timeoutMs: 1000,
    });
    watchdog.stop();
  });

  it('resets the stall window when measurable progress advances', () => {
    vi.useFakeTimers();
    const watchdog = createPhaseWatchdog('discovering-blocks', undefined, 1000);
    vi.advanceTimersByTime(900);
    watchdog.progress();
    vi.advanceTimersByTime(900);
    expect(watchdog.signal.aborted).toBe(false);
    vi.advanceTimersByTime(101);
    expect(watchdog.signal.aborted).toBe(true);
    watchdog.stop();
  });

  it('forwards parent cancellation reason and removes the listener on stop', () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const reason = new Error('parent cancelled');
    const removeSpy = vi.spyOn(parent.signal, 'removeEventListener');
    const watchdog = createPhaseWatchdog('reading-metadata', parent.signal, 1000);
    parent.abort(reason);
    expect(watchdog.signal.aborted).toBe(true);
    expect(watchdog.signal.reason).toBe(reason);
    watchdog.stop();
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
