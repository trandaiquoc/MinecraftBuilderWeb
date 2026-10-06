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

  it('runs audits at three seconds and again at six seconds without forcing completion', () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ViewportFinalizationCoordinator();
      const audit = vi.fn(() => ({ input: { progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80 }), sourceRestoreTerminal: true, sourceRestorePending: false }, ownershipComplete: false }));
      coordinator.setAuditHooks(audit, vi.fn());
      coordinator.update({ progress: progress({ status: 'hydrating', completed: 80, total: 100, blocksCompleted: 80, blocksTotal: 100, percent: 80 }), sourceRestoreTerminal: true, sourceRestorePending: false }, 0);
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(3000);
      expect(audit).toHaveBeenCalledTimes(2);
      expect(coordinator.state().loading).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
