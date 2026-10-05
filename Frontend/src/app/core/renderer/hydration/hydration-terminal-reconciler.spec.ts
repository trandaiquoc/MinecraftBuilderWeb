import { describe, expect, it } from 'vitest';
import { canReconcileHydrationTerminal, HydrationTerminalReconciler } from './hydration-terminal-reconciler';

describe('hydration terminal reconciliation', () => {
  it('requires every queue, pending lane and ownership proof to be idle', () => {
    const complete = { generationStable: true, regularQueued: 0, providerRefreshQueued: 0, regularRunning: 0, providerRefreshRunning: 0, terrainPending: 0, fluidPending: 0, ownershipComplete: true };
    expect(canReconcileHydrationTerminal(complete)).toBe(true);
    expect(canReconcileHydrationTerminal({ ...complete, terrainPending: 1 })).toBe(false);
    expect(canReconcileHydrationTerminal({ ...complete, ownershipComplete: false })).toBe(false);
  });

  it('is resettable and one-shot', async () => {
    let calls = 0;
    const watchdog = new HydrationTerminalReconciler(5, () => calls += 1);
    watchdog.arm(); watchdog.arm();
    await new Promise((resolve) => setTimeout(resolve, 12));
    expect(calls).toBe(1);
    watchdog.dispose();
  });
});
