import { describe, expect, it, vi } from 'vitest';
import { HydrationProgressTracker } from './hydration-progress-tracker';

describe('HydrationProgressTracker', () => {
  it('tracks block and decoration scopes without double counting', () => {
    const updates: number[] = [];
    const tracker = new HydrationProgressTracker(undefined, (progress) => updates.push(progress.completed));
    tracker.setBlockScope(['a', 'b']);
    tracker.setDecorationScope(['d']);
    tracker.begin(4);
    tracker.complete(4, 'block', 'a');
    tracker.complete(4, 'block', 'a');
    expect(tracker.snapshot()).toMatchObject({ generation: 4, total: 3, completed: 1 });
    expect(tracker.snapshot().percent).toBeCloseTo(100 / 3);
    tracker.complete(4, 'decoration', 'd');
    tracker.complete(4, 'block', 'b');
    expect(tracker.snapshot()).toMatchObject({ status: 'complete', completed: 3, percent: 100 });
    expect(updates).toEqual([0, 1, 1, 2, 3]);
  });

  it('ignores stale generation completion and keeps same-generation progress monotonic', () => {
    const regressions = vi.fn();
    const tracker = new HydrationProgressTracker(regressions);
    tracker.setBlockScope(['a', 'b']);
    tracker.begin(2);
    tracker.complete(2, 'block', 'a');
    tracker.publish({ generation: 2, status: 'hydrating', completed: 0, total: 2, blocksCompleted: 0, blocksTotal: 2, decorationsCompleted: 0, decorationsTotal: 0, percent: 0 });
    expect(tracker.snapshot().completed).toBe(1);
    tracker.complete(1, 'block', 'b');
    expect(tracker.snapshot().completed).toBe(1);
    expect(regressions).toHaveBeenCalledTimes(1);
  });

  it('resets a generation while retaining the new scope', () => {
    const tracker = new HydrationProgressTracker();
    tracker.setBlockScope(['a']);
    tracker.complete(0, 'block', 'a');
    tracker.reset(1);
    expect(tracker.snapshot()).toMatchObject({ generation: 1, status: 'idle', completed: 0, total: 0 });
    tracker.begin(1);
    expect(tracker.snapshot()).toMatchObject({ status: 'hydrating', total: 1 });
  });

  it('completes a fluid batch once after its committed representation is ready', () => {
    const tracker = new HydrationProgressTracker();
    tracker.setBlockScope(['fluid-a', 'fluid-b', 'solid']);
    tracker.begin(8);
    tracker.complete(8, 'block', 'solid');
    tracker.completeBatch(8, 'block', ['fluid-a', 'fluid-b']);
    expect(tracker.snapshot()).toMatchObject({ status: 'complete', completed: 3, total: 3, percent: 100 });
  });

  it('does not republish unchanged chunk members for a one-key local edit', () => {
    const updates: number[] = [];
    const tracker = new HydrationProgressTracker(undefined, (progress) => updates.push(progress.completed));
    tracker.setBlockScope(['changed', 'unchanged-a', 'unchanged-b']);
    tracker.begin(1);
    tracker.completeBatch(1, 'block', ['changed', 'unchanged-a', 'unchanged-b']);
    const before = updates.length;
    tracker.completeBatch(1, 'block', ['changed']);
    expect(updates).toHaveLength(before + 1);
    expect(tracker.snapshot().completed).toBe(3);
  });

  it('adds new local keys without invalidating already completed neighbors', () => {
    const tracker = new HydrationProgressTracker();
    tracker.setBlockScope(['existing']);
    tracker.begin(1);
    tracker.complete(1, 'block', 'existing');
    tracker.addBlockKey('new');
    expect(tracker.snapshot().completed).toBe(1);
    tracker.begin(1);
    expect(tracker.snapshot()).toMatchObject({ total: 2, completed: 1 });
    tracker.removeBlockKey('new');
    expect(tracker.snapshot().completed).toBe(1);
  });

  it('adopts committed renderer ownership into a fresh generation', () => {
    const tracker = new HydrationProgressTracker();
    tracker.setBlockScope(['committed', 'pending']);
    tracker.reset(2);
    tracker.begin(2);
    tracker.adoptBlockKeys(2, ['committed']);
    expect(tracker.snapshot()).toMatchObject({ generation: 2, total: 2, completed: 1, status: 'hydrating' });
    tracker.adoptBlockKeys(2, ['pending']);
    expect(tracker.snapshot()).toMatchObject({ completed: 2, status: 'complete' });
  });

  it('keeps local edit progress distinct from structural hydration', () => {
    const tracker = new HydrationProgressTracker();
    tracker.setBlockScope(['changed']);
    tracker.begin(3, 'local');
    expect(tracker.snapshot()).toMatchObject({ lane: 'local', status: 'hydrating' });
    tracker.complete(3, 'block', 'changed');
    expect(tracker.snapshot()).toMatchObject({ lane: 'local', status: 'complete' });
  });

  it('keeps provisional and permanent missing blocks out of final-ready counts', () => {
    const tracker = new HydrationProgressTracker();
    tracker.setBlockScope(['known', 'pending', 'missing']);
    tracker.setMissingBlockState('pending', 'provisional');
    tracker.setMissingBlockState('missing', 'permanent');
    tracker.begin(4);
    tracker.complete(4, 'block', 'known');
    expect(tracker.snapshot()).toMatchObject({ status: 'hydrating', completed: 1, blocksCompleted: 1, finalization: { expectedBlocks: 3, finalReadyBlocks: 1, provisionalMissingBlocks: 1, permanentMissingBlocks: 1, pendingBlocks: 0 } });
  });
});
