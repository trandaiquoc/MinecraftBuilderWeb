export class ModImportTimeoutError extends Error {
  override readonly name = 'ModImportTimeoutError';
  constructor(readonly phase: string, readonly timeoutMs: number) {
    super(`Mod import phase timed out: ${phase}`);
  }
}

export function createAbortError(message = 'The operation was cancelled'): DOMException {
  return new DOMException(message, 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';
}

/** Combines caller and session cancellation without depending on AbortSignal.any. */
export function combineAbortSignals(...signals: readonly (AbortSignal | undefined)[]): { readonly signal: AbortSignal | undefined; readonly dispose: () => void } {
  const active = signals.filter((signal): signal is AbortSignal => !!signal);
  if (!active.length) return { signal: undefined, dispose: () => undefined };
  if (active.length === 1) return { signal: active[0], dispose: () => undefined };
  const controller = new AbortController();
  const abort = (event: Event): void => {
    const source = event.target as AbortSignal;
    controller.abort(source.reason ?? createAbortError());
  };
  for (const signal of active) {
    if (signal.aborted) { abort({ target: signal } as unknown as Event); break; }
    signal.addEventListener('abort', abort, { once: true });
  }
  return { signal: controller.signal, dispose: () => active.forEach((signal) => signal.removeEventListener('abort', abort)) };
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw createAbortError();
}

export const MOD_IMPORT_PHASE_TIMEOUTS: Readonly<Record<string, number>> = {
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
};

export interface PhaseWatchdog {
  readonly signal: AbortSignal;
  progress(): void;
  stop(): void;
}

export function createPhaseWatchdog(phase: string, parent: AbortSignal | undefined, timeoutMs = MOD_IMPORT_PHASE_TIMEOUTS[phase] ?? 60_000): PhaseWatchdog {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new ModImportTimeoutError(phase, timeoutMs)), timeoutMs);
  };
  const forwardAbort = (): void => controller.abort(parent?.reason ?? createAbortError());
  if (parent?.aborted) forwardAbort();
  else parent?.addEventListener('abort', forwardAbort, { once: true });
  reset();
  return {
    signal: controller.signal,
    progress: reset,
    stop: () => {
      if (timer !== undefined) clearTimeout(timer);
      parent?.removeEventListener('abort', forwardAbort);
    },
  };
}
