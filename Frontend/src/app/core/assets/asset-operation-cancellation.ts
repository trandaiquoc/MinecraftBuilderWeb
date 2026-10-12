export function createAbortError(message = 'The operation was cancelled'): DOMException {
  return new DOMException(message, 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** Combines caller and session cancellation without depending on AbortSignal.any. */
export function combineAbortSignals(...signals: readonly (AbortSignal | undefined)[]): {
  readonly signal: AbortSignal | undefined;
  readonly dispose: () => void;
} {
  const active = signals.filter((signal): signal is AbortSignal => !!signal);
  if (!active.length) return { signal: undefined, dispose: () => undefined };
  if (active.length === 1) return { signal: active[0], dispose: () => undefined };
  const controller = new AbortController();
  const abort = (event: Event): void => {
    const source = event.target as AbortSignal;
    controller.abort(source.reason ?? createAbortError());
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort({ target: signal } as unknown as Event);
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => active.forEach((signal) => signal.removeEventListener('abort', abort)),
  };
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw createAbortError();
}
