import { describe, expect, it } from 'vitest';
import { CameraInteractionController } from './camera-interaction-controller';

describe('CameraInteractionController', () => {
  it('tracks gesture, pressed actions and idle grace independently', () => {
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
    controller.clear();
    expect(controller.pressedActions.size).toBe(0);
  });
});
