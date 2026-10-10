import { Injectable } from '@angular/core';
import type { ViewportPreparationAttempt } from '../../../../core/renderer/engine/viewport-engine-contracts';

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
  ready: boolean;
  priority: number;
  prepare: () => ViewportPreparationAttempt;
  state: 'queued' | 'running' | ViewportPreparationAttempt;
  retryAfterAttempt: boolean;
}

/** Coordinates one active-first preparation queue across both retained viewports. */
@Injectable({ providedIn: 'root' })
export class ViewportPreparationScheduler {
  private scope?: ViewportPreparationScope;
  private readonly tasks = new Map<string, PreparationTask>();
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
    prepare: () => ViewportPreparationAttempt,
  ): void {
    if (!scope) {
      this.tasks.delete(id);
      this.releaseScopeIfUnused();
      this.scheduleNext();
      return;
    }
    if (!sameScope(this.scope, scope)) {
      this.cancelPending();
      this.scope = scope;
      for (const task of this.tasks.values()) {
        task.state = 'queued';
        task.retryAfterAttempt = false;
      }
    }
    const existing = this.tasks.get(id);
    if (existing) {
      const wasReady = existing.ready;
      existing.ready = ready;
      existing.priority = priority;
      existing.prepare = prepare;
      if (
        existing.state === 'rejected' ||
        (!wasReady && ready && (existing.state === 'accepted' || existing.state === 'in-progress'))
      ) {
        existing.state = 'queued';
      }
    } else {
      this.tasks.set(id, {
        id,
        ready,
        priority,
        prepare,
        state: 'queued',
        retryAfterAttempt: false,
      });
    }
    this.scheduleNext();
  }

  unregister(id: string): void {
    this.tasks.delete(id);
    this.releaseScopeIfUnused();
    this.scheduleNext();
  }

  /** Reconsiders a waiting task after an owner reports a meaningful state transition. */
  retry(id: string): void {
    const task = this.tasks.get(id);
    if (!task || task.state === 'completed' || task.state === 'queued') return;
    if (task.state === 'running') {
      task.retryAfterAttempt = true;
      return;
    }
    task.state = 'queued';
    this.scheduleNext();
  }

  dispose(): void {
    this.cancelPending();
    this.scope = undefined;
    this.tasks.clear();
  }

  private scheduleNext(): void {
    const next = [...this.tasks.values()]
      .filter((task) => task.ready && task.state === 'queued')
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
    const expectedTask = next;
    const run = (): void => {
      this.clearScheduledHandles();
      const current = this.tasks.get(next.id);
      if (
        token !== this.generation ||
        !sameScope(this.scope, expectedScope) ||
        current !== expectedTask ||
        !current.ready ||
        current.state !== 'queued'
      )
        return;
      current.state = 'running';
      let result: ViewportPreparationAttempt;
      try {
        result = current.prepare();
      } catch (error) {
        if (this.tasks.get(current.id) === current && token === this.generation)
          current.state = 'rejected';
        this.scheduleNext();
        throw error;
      }
      if (
        token === this.generation &&
        sameScope(this.scope, expectedScope) &&
        this.tasks.get(current.id) === current
      ) {
        current.state = current.retryAfterAttempt && result !== 'completed' ? 'queued' : result;
        current.retryAfterAttempt = false;
      }
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
