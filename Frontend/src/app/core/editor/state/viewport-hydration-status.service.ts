import { Injectable, signal } from '@angular/core';
import type { ViewportHydrationProgress } from '../../renderer/engine/three-viewport-engine';

export type ViewportHydrationActivity = 'import' | 'build';

export interface ViewportHydrationStatusSnapshot {
  readonly progress: ViewportHydrationProgress;
  readonly activity: ViewportHydrationActivity;
}

export const VIEWPORT_HYDRATION_STATUS_WORK_THRESHOLD = 32;
export const VIEWPORT_HYDRATION_STATUS_DELAY_MS = 180;

/** Coordinates coarse hydration status without coupling the status bar to a renderer instance. */
@Injectable({ providedIn: 'root' })
export class ViewportHydrationStatusService {
  readonly status = signal<ViewportHydrationStatusSnapshot | undefined>(undefined);

  private nextOwner = 1;
  private activeOwner?: number;
  private nextActivity: ViewportHydrationActivity = 'build';
  private generation?: number;
  private generationActivity: ViewportHydrationActivity = 'build';
  private pending?: ViewportHydrationStatusSnapshot;
  private showTimer?: ReturnType<typeof setTimeout>;

  claim(): number {
    const owner = this.nextOwner++;
    this.activeOwner = owner;
    this.clearVisibleState();
    return owner;
  }

  markNextActivity(activity: ViewportHydrationActivity): void { this.nextActivity = activity; }

  publish(owner: number, progress: ViewportHydrationProgress): void {
    if (owner !== this.activeOwner) return;
    if (progress.status !== 'hydrating' || progress.total <= 0) {
      this.clearVisibleState();
      return;
    }
    if (this.generation !== progress.generation) {
      this.generation = progress.generation;
      this.generationActivity = this.nextActivity;
      this.nextActivity = 'build';
    }
    const snapshot: ViewportHydrationStatusSnapshot = { progress, activity: this.generationActivity };
    this.pending = snapshot;
    if (progress.total >= VIEWPORT_HYDRATION_STATUS_WORK_THRESHOLD) {
      this.cancelShowTimer();
      this.status.set(snapshot);
      return;
    }
    if (this.status() || this.showTimer !== undefined) return;
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      if (this.activeOwner === owner && this.pending?.progress.generation === progress.generation) this.status.set(this.pending);
    }, VIEWPORT_HYDRATION_STATUS_DELAY_MS);
  }

  release(owner: number): void {
    if (owner !== this.activeOwner) return;
    this.activeOwner = undefined;
    this.clearVisibleState();
  }

  private clearVisibleState(): void {
    this.cancelShowTimer();
    this.pending = undefined;
    this.generation = undefined;
    this.generationActivity = 'build';
    this.status.set(undefined);
  }

  private cancelShowTimer(): void {
    if (this.showTimer === undefined) return;
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }
}
