import type {
  HydrationFinalizationSnapshot,
  HydrationProgressSnapshot,
} from '../../renderer/scheduling/hydration-progress-tracker';

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
  readonly work?: ViewportFinalizationWork;
  readonly renderingFailureCount?: number;
}

export interface ViewportFinalizationWork {
  readonly blockQueued: number;
  readonly blockRunning: number;
  readonly decorationQueued: number;
  readonly terrainPending: number;
  readonly fluidPending: number;
  readonly projectionPending: boolean;
}

export type ViewportFinalizationIssue =
  'incomplete-ownership' | 'rendering-failure' | 'stalled-work';

export interface ViewportFinalizationState {
  readonly phase: ViewportFinalizationPhase;
  readonly loading: boolean;
  readonly ready: boolean;
  readonly warning: boolean;
  readonly indeterminate: boolean;
  readonly issue?: ViewportFinalizationIssue;
  readonly progress?: HydrationProgressSnapshot;
  readonly finalization?: HydrationFinalizationSnapshot;
}

export interface ViewportFinalizationAudit {
  readonly input: ViewportFinalizationInput;
  readonly ownershipComplete?: boolean;
}

const emptyState: ViewportFinalizationState = {
  phase: 'idle',
  loading: false,
  ready: false,
  warning: false,
  indeterminate: false,
};

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
  private updateRevision = 0;
  private latestInput?: ViewportFinalizationInput;
  private stallTimer?: ReturnType<typeof setTimeout>;
  private audit?: (includeOwnership: boolean) => ViewportFinalizationAudit | undefined;
  private reconcile?: () => void;
  private readonly listeners = new Set<(state: ViewportFinalizationState) => void>();

  state(): ViewportFinalizationState {
    return this.current;
  }

  onState(listener: (state: ViewportFinalizationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setAuditHooks(
    audit: ((includeOwnership: boolean) => ViewportFinalizationAudit | undefined) | undefined,
    reconcile: (() => void) | undefined,
  ): void {
    this.audit = audit;
    this.reconcile = reconcile;
    if (!audit) {
      this.cancelStallAudit();
      return;
    }
    if (this.current.loading && this.stallTimer === undefined) this.scheduleStallAudit();
  }

  update(input: ViewportFinalizationInput, now = performance.now()): ViewportFinalizationState {
    this.updateRevision += 1;
    this.latestInput = input;
    const signature = progressSignature(input);
    const signatureChanged = signature !== this.lastProgressSignature;
    const retainedIssue =
      !signatureChanged && !this.current.loading ? this.current.issue : undefined;
    this.setState(deriveViewportFinalizationState(input, retainedIssue));
    if (signatureChanged) {
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
    this.audit = undefined;
    this.reconcile = undefined;
    this.setState(emptyState);
    this.lastProgressSignature = '';
    this.lastProgressAt = 0;
    this.stallStage = 0;
    this.latestInput = undefined;
  }

  dispose(): void {
    this.reset();
  }

  private scheduleStallAudit(): void {
    this.cancelStallAudit();
    if (!this.current.loading) return;
    this.stallTimer = setTimeout(() => this.runStallAudit(), 3000);
  }

  private runStallAudit(): void {
    this.stallTimer = undefined;
    if (!this.current.loading) return;
    if (!this.audit) {
      if (performance.now() - this.lastProgressAt >= MAX_SILENT_WORK_MS && this.latestInput) {
        this.setState(deriveViewportFinalizationState(this.latestInput, 'stalled-work'));
        return;
      }
      this.stallTimer = setTimeout(() => this.runStallAudit(), 3000);
      return;
    }
    this.stallStage += 1;
    const inspectOwnership = this.stallStage >= 2;
    const result = this.audit(inspectOwnership);
    if (result) this.latestInput = result.input;
    if (result && inspectOwnership) {
      const runnable = hasRunnableWork(result.input);
      const terminalSource =
        result.input.sourceRestoreTerminal && !result.input.sourceRestorePending;
      if (!runnable && terminalSource) {
        const revisionBeforeReconcile = this.updateRevision;
        this.reconcile?.();
        const reconciliationPublished = this.updateRevision !== revisionBeforeReconcile;
        const reconciledInput = this.latestInput ?? result.input;
        if (reconciliationPublished && !this.current.loading) return;
        if (reconciliationPublished && hasRunnableWork(reconciledInput)) return;
        if (
          reconciliationPublished &&
          (!reconciledInput.sourceRestoreTerminal || reconciledInput.sourceRestorePending)
        )
          return;
        const reconciledAudit = this.audit(true);
        const latestInput = reconciledAudit?.input ?? this.latestInput ?? result.input;
        if (reconciledAudit?.ownershipComplete ?? result.ownershipComplete) {
          this.setState(deriveViewportFinalizationState(latestInput));
        } else {
          const issue =
            (latestInput.renderingFailureCount ?? 0) > 0
              ? 'rendering-failure'
              : 'incomplete-ownership';
          this.setState(deriveViewportFinalizationState(latestInput, issue));
        }
      } else {
        this.setState(deriveViewportFinalizationState(result.input));
      }
    } else if (result) {
      this.setState(deriveViewportFinalizationState(result.input));
    }
    if (!this.current.loading) return;
    if (performance.now() - this.lastProgressAt >= MAX_SILENT_WORK_MS && this.latestInput) {
      this.setState(deriveViewportFinalizationState(this.latestInput, 'stalled-work'));
      return;
    }
    this.stallTimer = setTimeout(() => this.runStallAudit(), 3000);
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

export function deriveViewportFinalizationState(
  input: ViewportFinalizationInput,
  issue?: ViewportFinalizationIssue,
): ViewportFinalizationState {
  const progress = input.progress;
  const finalization = progress?.finalization ?? fallbackFinalization(progress);
  const providerPlanning = input.providerRefreshPlanning === true;
  const providerWork =
    (input.providerRefreshQueued ?? 0) > 0 || (input.providerRefreshRunning ?? 0) > 0;
  const terrainWork = (input.terrainPending ?? 0) > 0 || (input.work?.terrainPending ?? 0) > 0;
  const queuedWork = input.work ? input.work.blockQueued + input.work.decorationQueued : 0;
  const runningWork = input.work ? input.work.blockRunning : 0;
  const fluidWork = (input.work?.fluidPending ?? 0) > 0;
  const projectionWork = input.work?.projectionPending === true;
  const structuralWork =
    progress?.status === 'hydrating' &&
    progress.total > 0 &&
    (progress.lane ?? 'structural') !== 'local';
  const unresolvedPending =
    finalization.pendingBlocks > 0 || finalization.provisionalMissingBlocks > 0;
  const sourcePending = !input.sourceRestoreTerminal || input.sourceRestorePending;
  const missingWarning =
    finalization.permanentMissingBlocks > 0 || input.sourceRestoreFailed === true;
  const renderingWarning = (input.renderingFailureCount ?? 0) > 0;
  const terminalIssue =
    issue === 'incomplete-ownership' || issue === 'rendering-failure' || issue === 'stalled-work';
  const loading =
    !terminalIssue &&
    (providerPlanning ||
      providerWork ||
      terrainWork ||
      queuedWork > 0 ||
      runningWork > 0 ||
      fluidWork ||
      projectionWork ||
      structuralWork ||
      unresolvedPending ||
      sourcePending);
  const ownershipTerminal =
    finalization.finalReadyBlocks + finalization.permanentMissingBlocks >=
    finalization.expectedBlocks;
  const warning = missingWarning || renderingWarning || issue !== undefined;
  const ready =
    !loading && !warning && input.sourceRestoreTerminal && ownershipTerminal && !!progress;
  const phase: ViewportFinalizationPhase = ready
    ? 'ready'
    : warning && !loading
      ? 'warning'
      : loading
        ? (progress?.lane ?? 'structural') === 'content' || providerPlanning || providerWork
          ? 'updating'
          : 'building'
        : 'idle';
  return { phase, loading, ready, warning, indeterminate: true, issue, progress, finalization };
}

function fallbackFinalization(
  progress: HydrationProgressSnapshot | undefined,
): HydrationFinalizationSnapshot {
  const expectedBlocks = progress?.blocksTotal ?? 0;
  const finalReadyBlocks = progress?.blocksCompleted ?? 0;
  return {
    expectedBlocks,
    finalReadyBlocks,
    provisionalMissingBlocks: 0,
    permanentMissingBlocks: 0,
    pendingBlocks: Math.max(0, expectedBlocks - finalReadyBlocks),
  };
}

function progressSignature(input: ViewportFinalizationInput): string {
  const p = input.progress;
  const f = p?.finalization;
  const work = input.work;
  return [
    p?.generation ?? 0,
    p?.lane ?? 'none',
    p?.completed ?? 0,
    p?.total ?? 0,
    f?.finalReadyBlocks ?? p?.blocksCompleted ?? 0,
    f?.pendingBlocks ?? 0,
    f?.provisionalMissingBlocks ?? 0,
    f?.permanentMissingBlocks ?? 0,
    input.sourceRestoreTerminal,
    input.sourceRestorePending,
    input.providerRefreshPlanning,
    input.providerRefreshQueued ?? 0,
    input.providerRefreshRunning ?? 0,
    input.terrainPending ?? 0,
    work?.blockQueued ?? 0,
    work?.blockRunning ?? 0,
    work?.decorationQueued ?? 0,
    work?.fluidPending ?? 0,
    work?.projectionPending ?? false,
    input.renderingFailureCount ?? 0,
  ].join('|');
}

function hasRunnableWork(input: ViewportFinalizationInput): boolean {
  const work = input.work;
  return (
    input.providerRefreshPlanning === true ||
    (input.providerRefreshQueued ?? 0) > 0 ||
    (input.providerRefreshRunning ?? 0) > 0 ||
    (input.terrainPending ?? 0) > 0 ||
    (!!work &&
      (work.blockQueued > 0 ||
        work.blockRunning > 0 ||
        work.decorationQueued > 0 ||
        work.terrainPending > 0 ||
        work.fluidPending > 0 ||
        work.projectionPending))
  );
}

const MAX_SILENT_WORK_MS = 30_000;
