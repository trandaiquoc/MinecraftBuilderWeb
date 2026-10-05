import { describe, expect, it } from 'vitest';
import { ProviderConvergenceTracker } from './provider-convergence-tracker';

describe('ProviderConvergenceTracker', () => {
  it('keeps provider visual convergence separate from structural progress', () => {
    const tracker = new ProviderConvergenceTracker();
    tracker.begin(2, 3);
    tracker.started();
    tracker.completed();
    expect(tracker.snapshot()).toMatchObject({ generation: 2, phase: 'converging', completed: 1, total: 3 });
    tracker.completed(2);
    expect(tracker.snapshot()).toMatchObject({ phase: 'ready', completed: 3, queued: 0, running: 0 });
  });
});
