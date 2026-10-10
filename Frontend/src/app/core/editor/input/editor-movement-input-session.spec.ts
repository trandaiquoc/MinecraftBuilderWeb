import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorMovementInputSession,
  AMBIGUOUS_RELEASE_GRACE_MS,
} from './editor-movement-input-session';

describe('EditorMovementInputSession', () => {
  afterEach(() => vi.useRealTimers());

  it('dispatches one movement edge while multiple physical keys own the same action', () => {
    const callbacks = { movementDown: vi.fn(), movementUp: vi.fn(), clearMovement: vi.fn() };
    const session = new EditorMovementInputSession(callbacks);
    session.keyDown('move-forward', 'KeyW');
    session.keyDown('move-forward', 'ArrowUp');
    session.keyUp('KeyW');
    expect(callbacks.movementDown).toHaveBeenCalledOnce();
    expect(callbacks.movementDown).toHaveBeenCalledWith('move-forward');
    expect(callbacks.movementUp).not.toHaveBeenCalled();
    session.keyUp('ArrowUp');
    expect(callbacks.movementUp).toHaveBeenCalledOnce();
    expect(callbacks.movementUp).toHaveBeenCalledWith('move-forward');
    expect(session.ownerCount()).toBe(0);
  });

  it('reconciles ambiguous releases after the grace period and cancels on a known event', () => {
    vi.useFakeTimers();
    const callbacks = { movementDown: vi.fn(), movementUp: vi.fn(), clearMovement: vi.fn() };
    const session = new EditorMovementInputSession(callbacks);
    session.keyDown('move-left', 'KeyA');
    session.keyUp(undefined);
    expect(session.shouldSuppressDestructiveAction()).toBe(true);
    vi.advanceTimersByTime(AMBIGUOUS_RELEASE_GRACE_MS - 1);
    expect(callbacks.clearMovement).not.toHaveBeenCalled();
    session.keyDown('move-left', 'KeyA');
    vi.advanceTimersByTime(AMBIGUOUS_RELEASE_GRACE_MS);
    expect(callbacks.clearMovement).not.toHaveBeenCalled();
    session.keyUp('KeyA');
    expect(callbacks.movementUp).toHaveBeenCalledOnce();
    expect(callbacks.movementUp).toHaveBeenCalledWith('move-left');
  });

  it('invalidates ownership on unidentified movement input and clears on disposal', () => {
    const callbacks = { movementDown: vi.fn(), movementUp: vi.fn(), clearMovement: vi.fn() };
    const session = new EditorMovementInputSession(callbacks);
    session.keyDown('move-right', 'KeyD');
    session.keyDown('move-right', undefined);
    expect(session.ownerCount()).toBe(0);
    expect(session.shouldSuppressDestructiveAction()).toBe(true);
    expect(callbacks.clearMovement).toHaveBeenCalledOnce();
    session.dispose();
    expect(session.shouldSuppressDestructiveAction()).toBe(false);
    expect(callbacks.clearMovement).toHaveBeenCalledTimes(2);
  });
});
