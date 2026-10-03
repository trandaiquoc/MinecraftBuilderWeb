import { describe, expect, it, vi } from 'vitest';
import { InteractiveResolutionController } from './interactive-resolution-controller';

describe('InteractiveResolutionController', () => {
  it('enters once and restores after the interaction grace period', () => {
    vi.useFakeTimers();
    try {
      const controller = new InteractiveResolutionController();
      const applied: string[] = [];
      let restored = false;
      expect(controller.enter({ staticRatio: 2, interactiveRatio: 1 }, () => applied.push('interactive'), () => undefined)).toBe(true);
      expect(controller.enter({ staticRatio: 2, interactiveRatio: 1 }, () => applied.push('duplicate'), () => undefined)).toBe(false);
      controller.scheduleRestore({ interactionUntil: performance.now(), isInteractionActive: () => false, applyStatic: () => applied.push('static'), onRestored: () => restored = true });
      vi.runAllTimers();
      expect(applied).toEqual(['interactive', 'static']);
      expect(restored).toBe(true);
      expect(controller.isActive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
