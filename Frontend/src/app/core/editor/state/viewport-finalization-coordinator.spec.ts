import { describe, expect, it, vi } from 'vitest';
import { ViewportFinalizationCoordinator, deriveViewportFinalizationState } from './viewport-finalization-coordinator';

const progress = (overrides: Record<string, unknown> = {}) => ({ generation: 1, status: 'complete' as const, completed: 100, total: 100, blocksCompleted: 100, blocksTotal: 100, decorationsCompleted: 0, decorationsTotal: 0, percent: 100, finalization: { expectedBlocks: 100, finalReadyBlocks: 100, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 0 }, ...overrides });

describe('ViewportFinalizationCoordinator', () => {
  it('does not report ready while provider planning is active', () => {
    const state = deriveViewportFinalizationState({ progress: progress(), sourceRestoreTerminal: true, sourceRestorePending: false, providerRefreshPlanning: true });
    expect(state).toMatchObject({ phase: 'updating', loading: true, ready: false, indeterminate: true });
  });

  it('settles to a warning for permanent missing content without a spinner', () => {
    const state = deriveViewportFinalizationState({ progress: progress({ finalization: { expectedBlocks: 120, finalReadyBlocks: 100, provisionalMissingBlocks: 0, permanentMissingBlocks: 20, pendingBlocks: 0 }, blocksTotal: 120, blocksCompleted: 100, completed: 100, total: 120, percent: 83.3 }), sourceRestoreTerminal: true, sourceRestorePending: false });
    expect(state).toMatchObject({ phase: 'warning', loading: false, ready: false, warning: true });
  });

  it('keeps real queued work loading but does not treat pending accounting as a runnable queue', () => {
    const pending = progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80, finalization: { expectedBlocks: 100, finalReadyBlocks: 80, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 20 } });
    const runnable = deriveViewportFinalizationState({ progress: pending, sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 1, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } });
    const stranded = deriveViewportFinalizationState({ progress: pending, sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } });
    expect(runnable.loading).toBe(true);
    expect(stranded.loading).toBe(true);
    expect(stranded.ready).toBe(false);
  });

  it('terminates stranded ownership as a warning after an authoritative audit', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const input = { progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80 }), sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } };
      const audit = vi.fn((_includeOwnership: boolean) => ({ input, ownershipComplete: false }));
      const reconcile = vi.fn();
      coordinator.setAuditHooks(audit, reconcile);
      coordinator.update(input, 0);
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(3000);
      expect(audit).toHaveBeenCalledTimes(3);
      expect(audit.mock.calls.map(([includeOwnership]) => includeOwnership)).toEqual([false, true, true]);
      expect(reconcile).toHaveBeenCalledOnce();
      expect(coordinator.state()).toMatchObject({ phase: 'warning', loading: false, ready: false, warning: true, issue: 'incomplete-ownership' });
    } finally { vi.useRealTimers(); }
  });

  it('does not overwrite a synchronous reconciliation update with the stale audit snapshot', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const incomplete = { progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80, finalization: { expectedBlocks: 100, finalReadyBlocks: 80, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 20 } }), sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } };
      const complete = { progress: progress(), sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } };
      coordinator.setAuditHooks(() => ({ input: incomplete, ownershipComplete: true }), () => coordinator.update(complete));
      coordinator.update(incomplete, 0);
      vi.advanceTimersByTime(6000);
      expect(coordinator.state()).toMatchObject({ phase: 'ready', loading: false, ready: true });
    } finally { vi.useRealTimers(); }
  });

  it('restarts the watchdog when audit hooks are registered after the first timer ran', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const loading = {
        progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80 }),
        sourceRestoreTerminal: true,
        sourceRestorePending: false,
        work: { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false },
      };
      const audit = vi.fn((_includeOwnership: boolean) => ({ input: { ...loading, progress: progress() }, ownershipComplete: true }));

      coordinator.update(loading, 0);
      vi.advanceTimersByTime(3000);
      expect(coordinator.state().loading).toBe(true);

      coordinator.setAuditHooks(audit, vi.fn());
      vi.advanceTimersByTime(3000);

      expect(audit).toHaveBeenCalledOnce();
      expect(coordinator.state()).toMatchObject({ phase: 'ready', loading: false, ready: true });
    } finally { vi.useRealTimers(); }
  });

  it('drops audit callbacks owned by the previous active viewport on reset', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const previousOwnerAudit = vi.fn(() => ({ input: { progress: progress(), sourceRestoreTerminal: true, sourceRestorePending: false }, ownershipComplete: true }));
      coordinator.setAuditHooks(previousOwnerAudit, vi.fn());
      coordinator.update({ progress: progress({ status: 'hydrating', completed: 80, total: 100 }), sourceRestoreTerminal: true, sourceRestorePending: false }, 0);
      coordinator.reset();
      coordinator.update({ progress: progress({ status: 'hydrating', completed: 80, total: 100 }), sourceRestoreTerminal: true, sourceRestorePending: false }, 0);
      vi.advanceTimersByTime(3000);

      expect(previousOwnerAudit).not.toHaveBeenCalled();
      expect(coordinator.state().loading).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('continues to report provider, terrain, fluid, and projection work as active', () => {
    const progressWithPending = progress({ finalization: { expectedBlocks: 100, finalReadyBlocks: 80, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 20 } });
    for (const work of [
      { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 1, projectionPending: false },
      { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 1, fluidPending: 0, projectionPending: false },
      { blockQueued: 0, blockRunning: 0, decorationQueued: 1, terrainPending: 0, fluidPending: 0, projectionPending: false },
      { blockQueued: 0, blockRunning: 1, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false },
      { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: true },
    ]) {
      expect(deriveViewportFinalizationState({ progress: progressWithPending, sourceRestoreTerminal: true, sourceRestorePending: false, work }).loading).toBe(true);
    }
  });

  it('does not turn a rendering failure into ready', () => {
    const state = deriveViewportFinalizationState({ progress: progress(), sourceRestoreTerminal: true, sourceRestorePending: false, renderingFailureCount: 1 });
    expect(state).toMatchObject({ phase: 'warning', loading: false, ready: false, warning: true });
  });

  it('turns failed fluid ownership with no runnable work into a warning instead of a permanent spinner', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const input = {
        progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80, finalization: { expectedBlocks: 100, finalReadyBlocks: 80, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 20 } }),
        sourceRestoreTerminal: true,
        sourceRestorePending: false,
        renderingFailureCount: 1,
        work: { blockQueued: 0, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false },
      };
      coordinator.setAuditHooks(() => ({ input, ownershipComplete: false }), vi.fn());
      coordinator.update(input, 0);
      vi.advanceTimersByTime(6000);
      expect(coordinator.state()).toMatchObject({ phase: 'warning', loading: false, ready: false, issue: 'rendering-failure' });
    } finally { vi.useRealTimers(); }
  });

  it('clears a terminal issue when a newer generation starts real work', () => {
    const failed = deriveViewportFinalizationState({ progress: progress(), sourceRestoreTerminal: true, sourceRestorePending: false, renderingFailureCount: 1 });
    const next = deriveViewportFinalizationState({ progress: progress({ generation: 2, status: 'hydrating', completed: 0, total: 20, finalization: { expectedBlocks: 20, finalReadyBlocks: 0, provisionalMissingBlocks: 0, permanentMissingBlocks: 0, pendingBlocks: 20 } }), sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 2, blockRunning: 0, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } });
    expect(failed.ready).toBe(false);
    expect(next).toMatchObject({ loading: true, ready: false, issue: undefined });
  });

  it('shows a terminal stalled-work warning after prolonged silence without claiming readiness', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const input = { progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80 }), sourceRestoreTerminal: true, sourceRestorePending: false, work: { blockQueued: 0, blockRunning: 1, decorationQueued: 0, terrainPending: 0, fluidPending: 0, projectionPending: false } };
      coordinator.setAuditHooks(() => ({ input, ownershipComplete: false }), vi.fn());
      coordinator.update(input, 0);
      vi.advanceTimersByTime(30_000);
      expect(coordinator.state()).toMatchObject({ phase: 'warning', loading: false, ready: false, issue: 'stalled-work' });
    } finally { vi.useRealTimers(); }
  });
});
