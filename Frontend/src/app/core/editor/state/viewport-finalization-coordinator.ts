import type { HydrationFinalizationSnapshot, HydrationProgressSnapshot } from '../../renderer/scheduling/hydration-progress-tracker';

export type ViewportFinalizationPhase = 'idle' | 'building' | 'updating' | 'warning' | 'ready';

export interface ViewportFinalizationInput {
  readonly progress?: HydrationProgressSnapshot;
  readonly sourceRestoreTerminal: boolean;
  readonly sourceRestorePending: boolean;
  readonly sourceRestoreFailed?: boolean;
  readonly providerRefreshPlanning?: boolean;
  readonly providerRefreshQueued?: number;
  readonly providerRefreshRunning?: number;
  readonly terrainPending?: number;
}

export interface ViewportFinalizationState {
  readonly phase: ViewportFinalizationPhase;
  readonly loading: boolean;
  readonly ready: boolean;
  readonly warning: boolean;
  readonly indeterminate: boolean;
  readonly progress?: HydrationProgressSnapshot;
  readonly finalization?: HydrationFinalizationSnapshot;
}

export interface ViewportFinalizationAudit {
  readonly input: ViewportFinalizationInput;
  readonly ownershipComplete: boolean;
}

const emptyState: ViewportFinalizationState = { phase: 'idle', loading: false, ready: false, warning: false, indeterminate: false };

/**
 * Small policy object for the user-facing project-finalization state. It does
 * not inspect or mutate renderer objects; the engine supplies ownership counts
 * and work counters, while the asset layer supplies source lifecycle state.
 */
export class ViewportFinalizationCoordinator {
  private current: ViewportFinalizationState = emptyState;
  private lastProgressSignature = '';
  private lastProgressAt = 0;
  private stallStage = 0;
  private stallTimer?: ReturnType<typeof setTimeout>;
  private audit?: () => ViewportFinalizationAudit | undefined;
  private reconcile?: () => void;
  private readonly listeners = new Set<(state: ViewportFinalizationState) => void>();

  state(): ViewportFinalizationState { return this.current; }

  onState(listener: (state: ViewportFinalizationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setAuditHooks(audit: (() => ViewportFinalizationAudit | undefined) | undefined, reconcile: (() => void) | undefined): void {
    this.audit = audit;
    this.reconcile = reconcile;
  }

  update(input: ViewportFinalizationInput, now = performance.now()): ViewportFinalizationState {
    const signature = progressSignature(input);
    this.setState(deriveViewportFinalizationState(input));
    if (signature !== this.lastProgressSignature) {
      this.lastProgressSignature = signature;
      this.lastProgressAt = now;
      this.stallStage = 0;
      this.scheduleStallAudit();
    }
    if (!this.current.loading) this.cancelStallAudit();
    return this.current;
  }

  reset(): void {
    this.cancelStallAudit();
    this.setState(emptyState);
    this.lastProgressSignature = '';
    this.lastProgressAt = 0;
    this.stallStage = 0;
  }

  dispose(): void { this.reset(); }

  private scheduleStallAudit(): void {
    this.cancelStallAudit();
    if (!this.current.loading) return;
    this.stallTimer = setTimeout(() => this.runStallAudit(), 3000);
  }

  private runStallAudit(): void {
    this.stallTimer = undefined;
    if (!this.current.loading || this.stallStage >= 2 || !this.audit) return;
    this.stallStage += 1;
    const result = this.audit();
    if (result) {
      if (this.stallStage === 2 && result.ownershipComplete && !hasRunnableWork(result.input)) {
        // Accounting repair is deliberately the only permitted mutation from
        // this watchdog. Scene rebuilds and queue restarts stay out of it.
        this.reconcile?.();
      }
      this.setState(deriveViewportFinalizationState(result.input));
    }
    if (this.current.loading && this.stallStage < 2) this.stallTimer = setTimeout(() => this.runStallAudit(), 3000);
  }

  private cancelStallAudit(): void {
    if (this.stallTimer === undefined) return;
    clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
  }

  private setState(state: ViewportFinalizationState): void {
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }
}

export function deriveViewportFinalizationState(input: ViewportFinalizationInput): ViewportFinalizationState {
  const progress = input.progress;
  const finalization = progress?.finalization ?? fallbackFinalization(progress);
  const providerPlanning = input.providerRefreshPlanning === true;
  const providerWork = (input.providerRefreshQueued ?? 0) > 0 || (input.providerRefreshRunning ?? 0) > 0;
  const terrainWork = (input.terrainPending ?? 0) > 0;
  const structuralWork = progress?.status === 'hydrating' && progress.total > 0 && (progress.lane ?? 'structural') !== 'local';
  const unresolvedPending = finalization.pendingBlocks > 0 || finalization.provisionalMissingBlocks > 0;
  const sourcePending = !input.sourceRestoreTerminal || input.sourceRestorePending;
  const missingWarning = finalization.permanentMissingBlocks > 0 || input.sourceRestoreFailed === true;
  const loading = providerPlanning || providerWork || terrainWork || structuralWork || unresolvedPending || sourcePending;
  const ownershipTerminal = finalization.finalReadyBlocks + finalization.permanentMissingBlocks >= finalization.expectedBlocks;
  const ready = !loading && !missingWarning && input.sourceRestoreTerminal && ownershipTerminal && !!progress;
  const phase: ViewportFinalizationPhase = ready
    ? 'ready'
    : missingWarning && !providerPlanning && !providerWork && !terrainWork && !structuralWork && !unresolvedPending && input.sourceRestoreTerminal
      ? 'warning'
      : loading
        ? ((progress?.lane ?? 'structural') === 'content' || providerPlanning || providerWork ? 'updating' : 'building')
        : 'idle';
  return { phase, loading, ready, warning: missingWarning, indeterminate: providerPlanning || !progress, progress, finalization };
}

function fallbackFinalization(progress: HydrationProgressSnapshot | undefined): HydrationFinalizationSnapshot {
  const expectedBlocks = progress?.blocksTotal ?? 0;
  const finalReadyBlocks = progress?.blocksCompleted ?? 0;
  return { expectedBlocks, finalReadyBlocks, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: Math.max(0, expectedBlocks - finalReadyBlocks) };
}

function progressSignature(input: ViewportFinalizationInput): string {
  const p = input.progress;
  const f = p?.finalization;
  return [p?.generation ?? 0, p?.lane ?? 'none', p?.completed ?? 0, p?.total ?? 0, f?.finalReadyBlocks ?? p?.blocksCompleted ?? 0, f?.pendingBlocks ?? 0, f?.provisionalMissingBlocks ?? 0, f?.permanentMissingBlocks ?? 0, input.sourceRestoreTerminal, input.sourceRestorePending, input.providerRefreshPlanning, input.providerRefreshQueued ?? 0, input.providerRefreshRunning ?? 0, input.terrainPending ?? 0].join('|');
}

function hasRunnableWork(input: ViewportFinalizationInput): boolean {
  const p = input.progress;
  return input.providerRefreshPlanning === true || (input.providerRefreshQueued ?? 0) > 0 || (input.providerRefreshRunning ?? 0) > 0 || (input.terrainPending ?? 0) > 0 || (p?.finalization?.pendingBlocks ?? 0) > 0 || !input.sourceRestoreTerminal;
}
