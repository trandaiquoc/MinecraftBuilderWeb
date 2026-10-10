export interface ViewportPreparationScope {
  readonly projectId: string;
  readonly project: unknown;
  readonly blocks: unknown;
  readonly decorations: unknown;
  readonly provider: unknown;
  readonly providerGeneration: number;
  readonly visualRevision: number;
}

type IdleWindow = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Schedules one background preparation per project/provider content scope. */
export class ViewportPreparationScheduler {
  private scope?: ViewportPreparationScope;
  private scheduled = false;
  private completed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private idleWindow?: IdleWindow;
  private idleHandle?: number;
  private generation = 0;

  schedule(scope: ViewportPreparationScope, ready: boolean, prepare: () => void | boolean): void {
    if (!sameScope(this.scope, scope)) {
      this.cancelPending();
      this.scope = scope;
      this.completed = false;
    }
    if (!ready) {
      this.cancelPending();
      return;
    }
    if (this.scheduled || this.completed) return;

    this.scheduled = true;
    const token = this.generation;
    const run = (): void => {
      this.clearScheduledHandles();
      if (token !== this.generation || !sameScope(this.scope, scope)) return;
      this.completed = prepare() !== false;
    };

    const idleWindow = typeof window === 'undefined' ? undefined : window as unknown as IdleWindow;
    const requestIdleCallback = idleWindow?.requestIdleCallback;
    if (typeof requestIdleCallback === 'function' && idleWindow) {
      this.idleWindow = idleWindow;
      this.idleHandle = requestIdleCallback.call(idleWindow, run, { timeout: 1500 });
    } else {
      this.timer = setTimeout(run, 0);
    }
  }

  cancel(): void {
    this.cancelPending();
    this.scope = undefined;
    this.completed = false;
  }

  dispose(): void { this.cancel(); }

  private cancelPending(): void {
    this.generation += 1;
    this.clearScheduledHandles();
  }

  private clearScheduledHandles(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.idleHandle !== undefined) this.idleWindow?.cancelIdleCallback?.(this.idleHandle);
    this.timer = undefined;
    this.idleHandle = undefined;
    this.idleWindow = undefined;
    this.scheduled = false;
  }
}

function sameScope(left: ViewportPreparationScope | undefined, right: ViewportPreparationScope): boolean {
  return !!left
    && left.projectId === right.projectId
    && left.project === right.project
    && left.blocks === right.blocks
    && left.decorations === right.decorations
    && left.provider === right.provider
    && left.providerGeneration === right.providerGeneration
    && left.visualRevision === right.visualRevision;
}
