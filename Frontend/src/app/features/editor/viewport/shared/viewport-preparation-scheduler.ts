import { Injectable } from '@angular/core';

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

interface PreparationTask {
  readonly id: string;
  readonly ready: boolean;
  readonly priority: number;
  readonly prepare: () => void | boolean;
}

/** Coordinates one active-first preparation queue across both retained viewports. */
@Injectable({ providedIn: 'root' })
export class ViewportPreparationScheduler {
  private scope?: ViewportPreparationScope;
  private readonly tasks = new Map<string, PreparationTask>();
  private readonly completed = new Set<string>();
  private readonly deferred = new Set<string>();
  private generation = 0;
  private scheduled = false;
  private scheduledTaskId?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private idleWindow?: IdleWindow;
  private idleHandle?: number;

  update(
    id: string,
    scope: ViewportPreparationScope | undefined,
    ready: boolean,
    priority: number,
    prepare: () => void | boolean,
  ): void {
    if (!scope) {
      this.tasks.delete(id);
      this.deferred.delete(id);
      this.releaseScopeIfUnused();
      this.scheduleNext();
      return;
    }
    if (!sameScope(this.scope, scope)) {
      this.cancelPending();
      this.scope = scope;
      this.completed.clear();
      this.deferred.clear();
    }
    this.deferred.delete(id);
    this.tasks.set(id, { id, ready, priority, prepare });
    this.scheduleNext();
  }

  unregister(id: string): void {
    this.tasks.delete(id);
    this.completed.delete(id);
    this.deferred.delete(id);
    this.releaseScopeIfUnused();
    this.scheduleNext();
  }

  dispose(): void {
    this.cancelPending();
    this.scope = undefined;
    this.tasks.clear();
    this.completed.clear();
    this.deferred.clear();
  }

  private scheduleNext(): void {
    const next = [...this.tasks.values()]
      .filter((task) => task.ready && !this.completed.has(task.id))
      .filter((task) => !this.deferred.has(task.id))
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))[0];
    if (!next) {
      if (this.scheduled) this.cancelPending();
      return;
    }
    if (this.scheduled && this.scheduledTaskId === next.id) return;
    if (this.scheduled) {
      this.cancelPending();
    }

    this.scheduled = true;
    this.scheduledTaskId = next.id;
    const token = this.generation;
    const expectedScope = this.scope;
    const run = (): void => {
      this.clearScheduledHandles();
      const current = this.tasks.get(next.id);
      if (token !== this.generation || !sameScope(this.scope, expectedScope) || !current?.ready)
        return;
      if (current.prepare() === false) this.deferred.add(current.id);
      else this.completed.add(current.id);
      this.scheduleNext();
    };

    const idleWindow =
      typeof window === 'undefined' ? undefined : (window as unknown as IdleWindow);
    if (typeof idleWindow?.requestIdleCallback === 'function') {
      this.idleWindow = idleWindow;
      this.idleHandle = idleWindow.requestIdleCallback(run, { timeout: 1500 });
    } else {
      this.timer = setTimeout(run, 0);
    }
  }

  private cancelPending(): void {
    this.generation += 1;
    this.clearScheduledHandles();
  }

  private releaseScopeIfUnused(): void {
    if (this.tasks.size > 0) return;
    this.cancelPending();
    this.scope = undefined;
    this.completed.clear();
    this.deferred.clear();
  }

  private clearScheduledHandles(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.idleHandle !== undefined) this.idleWindow?.cancelIdleCallback?.(this.idleHandle);
    this.timer = undefined;
    this.idleHandle = undefined;
    this.idleWindow = undefined;
    this.scheduled = false;
    this.scheduledTaskId = undefined;
  }
}

function sameScope(
  left: ViewportPreparationScope | undefined,
  right: ViewportPreparationScope | undefined,
): boolean {
  return (
    !!left &&
    !!right &&
    left.projectId === right.projectId &&
    left.project === right.project &&
    left.blocks === right.blocks &&
    left.decorations === right.decorations &&
    left.provider === right.provider &&
    left.providerGeneration === right.providerGeneration &&
    left.visualRevision === right.visualRevision
  );
}
