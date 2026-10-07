import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import { DEFAULT_MOUSE_BINDINGS, type MouseAction, mouseActionForEvent } from '../../editor/input/mouse-bindings';
import { CameraInteractionController } from './camera-interaction-controller';
import type { WheelZoomAction } from './camera-wheel-zoom';

export interface CameraControlConfiguration {
  readonly orbitSensitivity: number;
  readonly panSensitivity: number;
  readonly zoomSensitivity: number;
  readonly cameraMoveSpeed: number;
  readonly verticalMoveSpeed: number;
}

export interface ViewportCameraInputCallbacks {
  readonly isSuspended: () => boolean;
  readonly onControlChange: () => void;
  readonly onControlStart: () => void;
  readonly onControlEnd: () => void;
  readonly onPointerCameraStart: (button: number, action: 'orbit-camera' | 'pan-camera') => void;
  readonly onPointerCameraEnd: (button: number) => void;
  readonly onInteractionMarked: (until: number) => void;
  readonly onMovementFrame: (actions: ReadonlySet<MovementAction>, deltaSeconds: number) => void;
  readonly onWheel: (action: WheelZoomAction, deltaY: number, deltaMode: number) => void;
}

/** Camera/input ownership for a viewport. It deliberately delegates camera math to the engine. */
export class ViewportCameraInputController {
  readonly interaction: CameraInteractionController;
  private controls?: OrbitControls;
  private configuration: CameraControlConfiguration;
  private mouseBindings: Readonly<Record<MouseAction, string>> = DEFAULT_MOUSE_BINDINGS;
  private temporaryMouseButton?: { readonly key: 'LEFT' | 'MIDDLE' | 'RIGHT'; readonly previous: THREE.MOUSE | null | undefined };
  private cameraMoveFrame?: number;
  private disposed = false;

  constructor(
    private readonly getControls: () => OrbitControls | undefined,
    private readonly callbacks: ViewportCameraInputCallbacks,
    initialConfiguration: CameraControlConfiguration,
    idleGraceMs: number,
  ) {
    this.configuration = { ...initialConfiguration };
    this.interaction = new CameraInteractionController({ idleGraceMs });
  }

  get pressedActions(): Set<string> { return this.interaction.pressedActions; }
  get gestureInProgress(): boolean { return this.interaction.gestureInProgress; }
  set gestureInProgress(value: boolean) { if (value) this.interaction.beginGesture(); else this.interaction.endGesture(); }
  get movementFrame(): number | undefined { return this.cameraMoveFrame; }
  set movementFrame(value: number | undefined) { this.cameraMoveFrame = value; }
  get temporaryButton(): { readonly key: 'LEFT' | 'MIDDLE' | 'RIGHT'; readonly previous: THREE.MOUSE | null | undefined } | undefined { return this.temporaryMouseButton; }
  set temporaryButton(value: { readonly key: 'LEFT' | 'MIDDLE' | 'RIGHT'; readonly previous: THREE.MOUSE | null | undefined } | undefined) { this.temporaryMouseButton = value; }
  get controlConfiguration(): CameraControlConfiguration { return this.configuration; }
  get currentMouseBindings(): Readonly<Record<MouseAction, string>> { return this.mouseBindings; }

  attachControls(controls: OrbitControls): void {
    if (this.controls === controls) return;
    this.detachControls();
    this.controls = controls;
    controls.addEventListener('change', this.onControlChange);
    controls.addEventListener('start', this.onControlStart);
    controls.addEventListener('end', this.onControlEnd);
    this.applyControlConfiguration();
    this.applyMouseBindings();
  }

  detachControls(): void {
    if (!this.controls) return;
    this.controls.removeEventListener('change', this.onControlChange);
    this.controls.removeEventListener('start', this.onControlStart);
    this.controls.removeEventListener('end', this.onControlEnd);
    this.controls = undefined;
  }

  setControlConfiguration(configuration: CameraControlConfiguration): void {
    this.configuration = { ...configuration };
    this.applyControlConfiguration();
  }

  setMouseBindings(bindings: Readonly<Record<MouseAction, string>>): void {
    this.mouseBindings = { ...bindings };
    this.applyMouseBindings();
  }

  cameraKeyDown(action: MovementAction): void {
    if (this.disposed || this.callbacks.isSuspended()) return;
    this.interaction.press(action);
    this.callbacks.onInteractionMarked(this.interaction.idleUntil);
    this.startCameraMovement();
  }

  cameraKeyUp(action: MovementAction): void {
    if (this.disposed || this.callbacks.isSuspended()) return;
    this.interaction.release(action);
    if (!this.pressedActions.size && this.cameraMoveFrame === undefined) this.callbacks.onControlChange();
  }

  markCameraInteraction(): void {
    this.callbacks.onInteractionMarked(this.interaction.mark());
  }

  isCameraInteracting(): boolean { return this.interaction.isActive(); }

  clearInput(): void {
    this.interaction.clear();
    if (this.cameraMoveFrame !== undefined) {
      cancelViewportFrame(this.cameraMoveFrame);
      this.cameraMoveFrame = undefined;
    }
  }

  startMovement(): void { this.startCameraMovement(); }

  endEditorPointerGesture(): void { this.restoreTemporaryMouseButton(); }

  pointerDownCapture(event: PointerEvent): void {
    const controls = this.getControls();
    const action = mouseActionForEvent(event, this.mouseBindings);
    if (!action || !controls) return;
    const key = event.button === 0 ? 'LEFT' : event.button === 1 ? 'MIDDLE' : event.button === 2 ? 'RIGHT' : undefined;
    if (!key) return;
    const mapped = controls.mouseButtons[key];
    if (action === 'orbit-camera' || action === 'pan-camera') {
      this.callbacks.onPointerCameraStart(event.button, action);
      if (mapped === undefined) {
        this.temporaryMouseButton = { key, previous: mapped };
        controls.mouseButtons[key] = action === 'orbit-camera' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      }
      return;
    }
    if (action !== 'primary-action' && action !== 'delete-target') return;
    if (mapped !== undefined) {
      event.preventDefault();
      this.temporaryMouseButton = { key, previous: mapped };
      delete controls.mouseButtons[key];
    }
  }

  pointerUpCapture(event: PointerEvent): void {
    if (this.temporaryMouseButton) this.callbacks.onPointerCameraEnd(event.button);
    this.restoreTemporaryMouseButton();
  }

  wheelCapture(event: WheelEvent): void {
    const action = mouseActionForEvent(event, this.mouseBindings);
    if (action !== 'zoom-in' && action !== 'zoom-out') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.callbacks.onWheel(action, event.deltaY, event.deltaMode);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachControls();
    this.clearInput();
    this.restoreTemporaryMouseButton();
  }

  private readonly onControlChange = (): void => { this.markCameraInteraction(); this.callbacks.onControlChange(); };
  private readonly onControlStart = (): void => { this.interaction.beginGesture(); this.callbacks.onControlStart(); };
  private readonly onControlEnd = (): void => { this.interaction.endGesture(); this.callbacks.onControlEnd(); };

  private startCameraMovement(): void {
    if (this.cameraMoveFrame !== undefined) return;
    let previous = performance.now();
    const step = (now: number): void => {
      this.cameraMoveFrame = undefined;
      const rawDeltaMs = now - previous;
      const delta = Math.min(rawDeltaMs / 1000, .1);
      previous = now;
      this.callbacks.onMovementFrame(this.interaction.pressedActions as Set<MovementAction>, delta);
      if (this.pressedActions.size) this.cameraMoveFrame = requestViewportFrame(step);
    };
    this.cameraMoveFrame = requestViewportFrame(step);
  }

  private applyControlConfiguration(): void {
    if (!this.controls) return;
    this.controls.rotateSpeed = this.configuration.orbitSensitivity;
    this.controls.panSpeed = this.configuration.panSensitivity;
    this.controls.zoomSpeed = this.configuration.zoomSensitivity;
  }

  private applyMouseBindings(): void {
    const controls = this.controls;
    if (!controls) return;
    delete controls.mouseButtons.LEFT;
    delete controls.mouseButtons.MIDDLE;
    delete controls.mouseButtons.RIGHT;
    const orbit = this.unmodifiedMouseButton('orbit-camera');
    const pan = this.unmodifiedMouseButton('pan-camera');
    if (orbit === 'LeftClick') controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    if (orbit === 'MiddleClick') controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    if (orbit === 'RightClick') controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    if (pan === 'LeftClick') controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    if (pan === 'MiddleClick') controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    if (pan === 'RightClick') controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  }

  private restoreTemporaryMouseButton(): void {
    const controls = this.getControls();
    if (!controls || !this.temporaryMouseButton) return;
    const { key, previous } = this.temporaryMouseButton;
    if (previous === undefined) delete controls.mouseButtons[key];
    else controls.mouseButtons[key] = previous;
    this.temporaryMouseButton = undefined;
  }

  private unmodifiedMouseButton(action: MouseAction): string | undefined {
    return this.mouseBindings[action].split('|').find((value) => !value.includes('+'));
  }
}

export function requestViewportFrame(callback: FrameRequestCallback): number {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(() => callback(performance.now()), 0) as unknown as number;
}

export function cancelViewportFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else clearTimeout(frame as unknown as ReturnType<typeof setTimeout>);
}
