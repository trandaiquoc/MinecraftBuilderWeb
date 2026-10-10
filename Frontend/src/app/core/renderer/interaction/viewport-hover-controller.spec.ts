import { describe, expect, it, vi } from 'vitest';
import { ViewportHoverController } from './viewport-hover-controller';

describe('ViewportHoverController', () => {
  it('coalesces pointer requests to the latest frame', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
      const id = ++next;
      callbacks.set(id, frame);
      return id;
    });
    try {
      const hit = vi.fn((request: { clientX: number }) => ({ x: request.clientX }));
      const listener = vi.fn();
      const controller = new ViewportHoverController({
        isSuspended: () => false,
        cameraGestureInProgress: () => false,
        record: vi.fn(),
        hit,
      });
      controller.hover({
        clientX: 1,
        clientY: 0,
        project: undefined,
        active: undefined,
        planeY: undefined,
        showGhost: true,
        listener,
      });
      controller.hover({
        clientX: 2,
        clientY: 0,
        project: undefined,
        active: undefined,
        planeY: undefined,
        showGhost: true,
        listener,
      });
      [...callbacks.values()][0]?.(0);
      expect(hit).toHaveBeenCalledTimes(1);
      expect(hit).toHaveBeenCalledWith(expect.objectContaining({ clientX: 2 }));
      expect(listener).toHaveBeenCalledWith({ x: 2 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
