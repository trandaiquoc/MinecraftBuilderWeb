import { Injectable, signal, untracked } from '@angular/core';
import type { ViewportHydrationProgress } from '../../renderer/engine/three-viewport-engine';
import { ViewportFinalizationCoordinator, ViewportFinalizationState, ViewportFinalizationAudit } from './viewport-finalization-coordinator';

export type ViewportHydrationActivity = 'import' | 'build' | 'content';

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
  readonly finalization = signal<ViewportFinalizationState | undefined>(undefined);

  private nextOwner = 1;
  private activeOwner?: number;
  private nextActivity: ViewportHydrationActivity = 'build';
  private generation?: number;
  private generationActivity: ViewportHydrationActivity = 'build';
  private pending?: ViewportHydrationStatusSnapshot;
  private showTimer?: ReturnType<typeof setTimeout>;
  private readonly finalizationCoordinator = new ViewportFinalizationCoordinator();
  private lastProgress?: ViewportHydrationProgress;
  private sourceRestoreTerminal = true;
  private sourceRestorePending = false;
  private sourceRestoreFailed = false;

  constructor() {
    this.finalizationCoordinator.onState((state) => this.finalization.set(state));
  }

  claim(): number {
    return this.nextOwner++;
  }

  /** Makes a retained viewport the sole owner of the visible hydration status. */
  activate(owner: number): void {
    if (owner === this.activeOwner) return;
    this.activeOwner = owner;
    this.clearVisibleState();
    this.finalizationCoordinator.reset();
    this.finalization.set(undefined);
    this.lastProgress = undefined;
    this.sourceRestoreTerminal = true;
    this.sourceRestorePending = false;
    this.sourceRestoreFailed = false;
  }

  markNextActivity(activity: ViewportHydrationActivity): void { this.nextActivity = activity; }

  setSourceRestoreState(owner: number, state: { readonly terminal: boolean; readonly pending: boolean; readonly failed?: boolean }): void {
    if (owner !== this.activeOwner) return;
    this.sourceRestoreTerminal = state.terminal;
    this.sourceRestorePending = state.pending;
    this.sourceRestoreFailed = state.failed === true;
    this.refreshFinalization();
  }

  setFinalizationAuditHooks(owner: number, audit: ((includeOwnership: boolean) => ViewportFinalizationAudit | undefined) | undefined, reconcile: (() => void) | undefined): void {
    if (owner !== this.activeOwner) return;
    // Keep the renderer-specific audit seam in the viewport component; the
    // status service only owns policy and watchdog timing.
    this.finalizationCoordinator.setAuditHooks(audit, reconcile);
  }

  /** Re-evaluates the latest authoritative producer state without forcing readiness. */
  settleIfTerminal(): void {
    if (this.activeOwner === undefined || !this.lastProgress) return;
    untracked(() => {
      this.refreshFinalization();
      if (!this.finalization()?.loading && this.lastProgress?.status !== 'hydrating') this.clearVisibleState();
    });
  }

  publish(owner: number, progress: ViewportHydrationProgress): void {
    if (owner !== this.activeOwner) return;
    // Local edits use the renderer's progress accounting for completion, but
    // must not reopen the global initial-load/import status surface.
    if (progress.lane === 'local') return;
    this.lastProgress = progress;
    this.refreshFinalization();
    if (progress.status !== 'hydrating' || progress.total <= 0) {
      if (!progress.finalization || !this.finalization()?.loading) this.clearVisibleState();
      return;
    }
    if (this.generation !== progress.generation) {
      this.generation = progress.generation;
      this.generationActivity = progress.lane === 'content' ? 'content' : this.nextActivity;
      this.nextActivity = 'build';
    }
    // A provider handoff can start content finalization within an existing
    // renderer generation. Its lane is still authoritative for the status
    // surface, even though no structural generation was restarted.
    if (progress.lane === 'content') this.generationActivity = 'content';
    const snapshot: ViewportHydrationStatusSnapshot = { progress, activity: this.generationActivity };
    this.pending = snapshot;
    if (progress.total >= VIEWPORT_HYDRATION_STATUS_WORK_THRESHOLD || (progress.finalization && this.finalization()?.loading && progress.lane === 'content')) {
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
    this.finalizationCoordinator.reset();
    this.finalization.set(undefined);
  }

  private clearVisibleState(): void {
    this.cancelShowTimer();
    this.pending = undefined;
    this.generation = undefined;
    this.generationActivity = 'build';
    this.status.set(undefined);
  }

  private refreshFinalization(): void {
    if (!this.lastProgress && !this.sourceRestoreTerminal) return;
    const state = this.finalizationCoordinator.update({
      progress: this.lastProgress,
      sourceRestoreTerminal: this.sourceRestoreTerminal,
      sourceRestorePending: this.sourceRestorePending,
      sourceRestoreFailed: this.sourceRestoreFailed,
      providerRefreshPlanning: this.lastProgress?.providerRefreshPlanning,
      providerRefreshQueued: this.lastProgress?.providerRefreshQueued,
      providerRefreshRunning: this.lastProgress?.providerRefreshRunning,
      terrainPending: this.lastProgress?.terrainPending,
      work: this.lastProgress?.work,
      renderingFailureCount: this.lastProgress?.renderingFailureCount,
    });
    this.finalization.set(state);
  }

  private cancelShowTimer(): void {
    if (this.showTimer === undefined) return;
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }
}
