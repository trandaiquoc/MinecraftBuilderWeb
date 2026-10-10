import { describe, expect, it, vi } from 'vitest';
import { yieldToBrowser } from './cooperative-yield';

describe('yieldToBrowser', () => {
  it('uses scheduler.yield when available', async () => {
    const previous = (globalThis as typeof globalThis & { scheduler?: unknown }).scheduler;
    const scheduler = { yield: vi.fn(async () => undefined) };
    Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: scheduler });
    try {
      await yieldToBrowser();
      expect(scheduler.yield).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: previous });
    }
  });

  it('falls back when scheduler.yield is unavailable', async () => {
    const previous = (globalThis as typeof globalThis & { scheduler?: unknown }).scheduler;
    Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: undefined });
    try {
      await yieldToBrowser();
    } finally {
      Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: previous });
    }
  });
});
