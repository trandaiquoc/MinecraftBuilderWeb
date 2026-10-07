import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ViewportCameraInputController } from './viewport-camera-input-controller';

function fakeControls(): { mouseButtons: Record<string, THREE.MOUSE>; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; rotateSpeed: number; panSpeed: number; zoomSpeed: number } {
  return {
    mouseButtons: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    rotateSpeed: 0,
    panSpeed: 0,
    zoomSpeed: 0,
  };
}

describe('ViewportCameraInputController', () => {
  it('owns movement RAF scheduling and clears it with input state', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    try {
      const frames: number[] = [];
      const controller = new ViewportCameraInputController(
        () => fakeControls() as never,
        { onControlChange: vi.fn(), onControlStart: vi.fn(), onControlEnd: vi.fn(), onPointerCameraStart: vi.fn(), onPointerCameraEnd: vi.fn(), onInteractionMarked: vi.fn(), onMovementFrame: (_actions, delta) => frames.push(delta), onWheel: vi.fn(), isSuspended: () => false },
        { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 15 },
        20,
      );
      controller.cameraKeyDown('move-forward');
      expect(controller.pressedActions).toEqual(new Set(['move-forward']));
      const [frameId, frame] = [...callbacks.entries()][0] ?? [];
      if (frameId !== undefined) callbacks.delete(frameId);
      frame?.(performance.now() + 16);
      expect(frames).toHaveLength(1);
      controller.clearInput();
      expect(controller.pressedActions).toHaveLength(0);
      expect(callbacks.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores a temporarily captured mouse mapping', () => {
    const controls = fakeControls();
    controls.mouseButtons['LEFT'] = THREE.MOUSE.PAN;
    const controller = new ViewportCameraInputController(
      () => controls as never,
      { onControlChange: vi.fn(), onControlStart: vi.fn(), onControlEnd: vi.fn(), onPointerCameraStart: vi.fn(), onPointerCameraEnd: vi.fn(), onInteractionMarked: vi.fn(), onMovementFrame: vi.fn(), onWheel: vi.fn(), isSuspended: () => false },
      { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 15 },
      20,
    );
    controller.temporaryButton = { key: 'LEFT', previous: THREE.MOUSE.ROTATE };
    controller.endEditorPointerGesture();
    expect(controls.mouseButtons['LEFT']).toBe(THREE.MOUSE.ROTATE);
    expect(controller.temporaryButton).toBeUndefined();
  });

  it('delegates wheel zoom without allowing OrbitControls to handle the event', () => {
    const onWheel = vi.fn();
    const controller = new ViewportCameraInputController(
      () => fakeControls() as never,
      { onControlChange: vi.fn(), onControlStart: vi.fn(), onControlEnd: vi.fn(), onPointerCameraStart: vi.fn(), onPointerCameraEnd: vi.fn(), onInteractionMarked: vi.fn(), onMovementFrame: vi.fn(), onWheel, isSuspended: () => false },
      { orbitSensitivity: 1, panSensitivity: 1, zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 15 },
      20,
    );
    controller.setMouseBindings({ 'orbit-camera': 'RightClick', 'pan-camera': 'MiddleClick', 'primary-action': 'LeftClick', 'delete-target': 'Shift+LeftClick', 'pick-block': 'Alt+LeftClick', 'zoom-in': 'WheelUp', 'zoom-out': 'WheelDown' });
    const event = { deltaY: -2, deltaMode: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() } as unknown as WheelEvent;
    controller.wheelCapture(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(onWheel).toHaveBeenCalledWith('zoom-in', -2, 0);
  });
});
