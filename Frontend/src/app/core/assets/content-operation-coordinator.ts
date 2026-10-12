import { combineAbortSignals, createAbortError } from './asset-operation-cancellation';

export type ContentOperationPriority = 'background' | 'foreground';

interface QueuedOperation {
  readonly priority: ContentOperationPriority;
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  readonly callerSignal?: AbortSignal;
  readonly disposeSignal: () => void;
  readonly onCallerAbort: () => void;
  start: () => void;
  cancelWaiting: () => void;
  state: 'queued' | 'running' | 'settled';
}

/** Owns single-writer execution and priority ordering for content/source writes. */
export class ContentOperationCoordinator {
  private active?: QueuedOperation;
  private readonly waiting: QueuedOperation[] = [];

  run<T>(
    priority: ContentOperationPriority,
    work: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    if (callerSignal?.aborted) return Promise.reject(callerSignal.reason ?? createAbortError());

    const controller = new AbortController();
    const combined = combineAbortSignals(controller.signal, callerSignal);
    const signal = combined.signal ?? controller.signal;

    return new Promise<T>((resolve, reject) => {
      let operation!: QueuedOperation;
      const finish = (complete: () => void): void => {
        if (operation.state === 'settled') return;
        const wasActive = operation.state === 'running';
        operation.state = 'settled';
        operation.callerSignal?.removeEventListener('abort', operation.onCallerAbort);
        operation.disposeSignal();
        if (wasActive && this.active === operation) this.active = undefined;
        complete();
        if (wasActive) this.pump();
      };
      operation = {
        priority,
        controller,
        signal,
        callerSignal,
        disposeSignal: combined.dispose,
        onCallerAbort: () => {
          operation.cancelWaiting();
          this.pump();
        },
        state: 'queued',
        start: () => {
          operation.state = 'running';
          this.active = operation;
          let result: Promise<T>;
          try {
            result = Promise.resolve(work(signal));
          } catch (error) {
            queueMicrotask(() => finish(() => reject(error)));
            return;
          }
          void result.then(
            (value) => finish(() => resolve(value)),
            (error: unknown) => finish(() => reject(error)),
          );
        },
        cancelWaiting: () => {
          if (operation.state !== 'queued') return;
          const index = this.waiting.indexOf(operation);
          if (index < 0) return;
          this.waiting.splice(index, 1);
          finish(() => reject(callerSignal?.reason ?? createAbortError()));
        },
      };

      callerSignal?.addEventListener('abort', operation.onCallerAbort, { once: true });
      this.enqueue(operation);
      const active = this.active;
      const backgroundWaitsForForeground =
        priority === 'background' && active?.priority === 'foreground';
      if (active && !backgroundWaitsForForeground) {
        active.controller.abort(
          createAbortError(`${priority} content operation superseded the active operation`),
        );
      }
      this.pump();
    });
  }

  abortBackground(): void {
    if (this.active?.priority === 'background')
      this.active.controller.abort(createAbortError('Foreground content work requested'));
  }

  isBusy(): boolean {
    return this.active !== undefined || this.waiting.length > 0;
  }

  private enqueue(operation: QueuedOperation): void {
    if (operation.priority === 'background') {
      this.waiting.push(operation);
      return;
    }
    const firstBackground = this.waiting.findIndex((queued) => queued.priority === 'background');
    if (firstBackground < 0) this.waiting.push(operation);
    else this.waiting.splice(firstBackground, 0, operation);
  }

  private pump(): void {
    if (this.active) return;
    while (this.waiting.length) {
      const operation = this.waiting[0];
      if (operation.state !== 'queued') {
        this.waiting.shift();
        continue;
      }
      if (operation.callerSignal?.aborted) {
        operation.cancelWaiting();
        continue;
      }
      this.waiting.shift();
      operation.start();
      if (this.active) return;
    }
  }
}
