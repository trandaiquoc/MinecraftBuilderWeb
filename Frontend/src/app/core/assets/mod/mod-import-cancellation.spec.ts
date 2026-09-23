import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhaseWatchdog, ModImportTimeoutError } from './mod-import-cancellation';

describe('mod import cancellation policy', () => {
  afterEach(() => vi.useRealTimers());

  it('aborts a stalled phase with a typed timeout', () => {
    vi.useFakeTimers();
    const watchdog = createPhaseWatchdog('checking-conflicts', undefined, 1000);
    vi.advanceTimersByTime(1001);
    expect(watchdog.signal.aborted).toBe(true);
    expect(watchdog.signal.reason).toBeInstanceOf(ModImportTimeoutError);
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

  it('forwards parent cancellation', () => {
    const parent = new AbortController();
    const watchdog = createPhaseWatchdog('reading-metadata', parent.signal, 1000);
    parent.abort();
    expect(watchdog.signal.aborted).toBe(true);
    watchdog.stop();
  });
});
