import { describe, expect, it } from 'vitest';
import {
  combineAbortSignals,
  createAbortError,
  isAbortError,
  throwIfAborted,
} from './asset-operation-cancellation';

describe('asset operation cancellation', () => {
  it('combines caller and session cancellation and preserves abort reason', () => {
    const caller = new AbortController();
    const session = new AbortController();
    const reason = new Error('superseded');
    const combined = combineAbortSignals(caller.signal, session.signal);
    session.abort(reason);
    expect(combined.signal?.aborted).toBe(true);
    expect(combined.signal?.reason).toBe(reason);
    expect(isAbortError(new DOMException('cancelled', 'AbortError'))).toBe(true);
    combined.dispose();
  });

  it('creates and recognizes abort errors', () => {
    expect(isAbortError(createAbortError('cancelled'))).toBe(true);
    expect(isAbortError(new Error('other'))).toBe(false);
  });

  it('throws the original abort reason when a signal is aborted', () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    expect(() => throwIfAborted(controller.signal)).toThrow(reason);
  });
});
