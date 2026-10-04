import { describe, expect, it } from 'vitest';
import { CameraInteractionController } from './camera-interaction-controller';

describe('CameraInteractionController', () => {
  it('keeps normal gesture and keyboard activity alive through idle grace', () => {
    let now = 100;
    const controller = new CameraInteractionController({ idleGraceMs: 20, now: () => now });
    controller.beginGesture();
    expect(controller.isActive()).toBe(true);
    controller.endGesture();
    controller.press('move-forward');
    expect(controller.pressedActions).toEqual(new Set(['move-forward']));
    controller.release('move-forward');
    expect(controller.isActive()).toBe(true);
    now = 121;
    expect(controller.isActive()).toBe(false);
    controller.cancelAll();
    expect(controller.pressedActions.size).toBe(0);
  });

  it('cancels gesture, actions, and idle grace immediately', () => {
    let now = 100;
    const controller = new CameraInteractionController({ idleGraceMs: 20, now: () => now });
    controller.beginGesture(); controller.press('move-forward'); controller.mark();
    controller.cancelAll();
    now = 101;
    expect(controller.isActive()).toBe(false);
    expect(controller.gestureInProgress).toBe(false);
    expect(controller.pressedActions).toEqual(new Set());
    expect(controller.idleUntil).toBe(0);
  });

  it('does not shorten a marked idle deadline', () => {
    let now = 100;
    const controller = new CameraInteractionController({ idleGraceMs: 20, now: () => now });
    controller.mark(); now = 105; const first = controller.idleUntil; controller.mark();
    expect(controller.idleUntil).toBeGreaterThanOrEqual(first);
  });

  it('tolerates repeated gesture lifecycle calls', () => {
    const controller = new CameraInteractionController({ idleGraceMs: 20, now: () => 100 });
    controller.beginGesture(); controller.beginGesture(); controller.endGesture(); controller.endGesture();
    expect(controller.gestureInProgress).toBe(false);
    expect(controller.isActive()).toBe(true);
  });
});
