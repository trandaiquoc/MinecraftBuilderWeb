import { combineAbortSignals, createAbortError } from './mod/mod-import-cancellation';

export type ContentOperationPriority = 'background' | 'foreground';

interface ActiveOperation {
  readonly priority: ContentOperationPriority;
  readonly controller: AbortController;
  readonly done: Promise<void>;
  finish: () => void;
}

/** Serializes writes to the active content/source registries. */
export class ContentOperationCoordinator {
  private active?: ActiveOperation;

  async run<T>(priority: ContentOperationPriority, work: (signal: AbortSignal) => Promise<T>, callerSignal?: AbortSignal): Promise<T> {
    const previous = this.active;
    if (previous) previous.controller.abort(createAbortError(`${priority} content operation superseded the active operation`));
    if (previous) await previous.done;
    const controller = new AbortController();
    const combined = combineAbortSignals(controller.signal, callerSignal);
    let finish!: () => void;
    const done = new Promise<void>((resolve) => { finish = resolve; });
    const operation: ActiveOperation = { priority, controller, done, finish };
    this.active = operation;
    try {
      return await work(combined.signal ?? controller.signal);
    } finally {
      combined.dispose();
      if (this.active === operation) this.active = undefined;
      finish();
    }
  }

  abortBackground(): void {
    if (this.active?.priority === 'background') this.active.controller.abort(createAbortError('Foreground content work requested'));
  }

  isBusy(): boolean { return this.active !== undefined; }
}
