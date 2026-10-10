import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MovementAction } from '../../editor/input/keyboard-bindings';
import { cameraMovementScale, effectiveCameraMovementSpeed } from './camera-movement-speed';
import {
  nextCameraDistanceFromWheel,
  wheelMagnitude,
  type WheelZoomAction,
} from './camera-wheel-zoom';
import { cameraActionMovementDelta } from './viewport-camera-geometry';
import type { CameraControlConfiguration } from './viewport-camera-input-controller';

export interface ViewportCameraMotionCallbacks {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: () => OrbitControls | undefined;
  readonly configuration: () => CameraControlConfiguration;
  readonly markInteraction: () => void;
  readonly requestRender: () => void;
  readonly onMovementStart?: () => void;
  readonly onMovementEnd?: () => void;
  readonly recordTrace?: (event: string, details: Readonly<Record<string, unknown>>) => void;
  readonly recordMetric?: (name: string, delta?: number) => void;
}

/** Owns camera translation and wheel-distance math; input ownership remains in ViewportCameraInputController. */
export class ViewportCameraMotionController {
  constructor(private readonly callbacks: ViewportCameraMotionCallbacks) {}

  applyWheelZoom(action: WheelZoomAction, deltaY: number, deltaMode: number): void {
    const controls = this.callbacks.controls();
    if (!controls) return;
    const camera = this.callbacks.camera;
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length();
    const configuration = this.callbacks.configuration();
    const nextDistance = nextCameraDistanceFromWheel({
      distance,
      deltaY,
      deltaMode,
      action,
      sensitivity: configuration.zoomSensitivity,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
    });
    this.callbacks.recordTrace?.('wheel', {
      action,
      deltaY,
      deltaMode,
      magnitude: wheelMagnitude(deltaY, deltaMode),
      sensitivity: configuration.zoomSensitivity,
      distanceBefore: distance,
      distanceAfter: nextDistance,
    });
    if (distance > 0)
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance));
    controls.update();
    this.callbacks.requestRender();
  }

  moveCamera(keys: ReadonlySet<MovementAction>, delta: number): void {
    const controls = this.callbacks.controls();
    if (!controls || !keys.size) return;
    this.callbacks.onMovementStart?.();
    let moved = false;
    try {
      this.callbacks.markInteraction();
      const camera = this.callbacks.camera;
      const cameraDistance = camera.position.distanceTo(controls.target);
      const configuration = this.callbacks.configuration();
      const horizontalSpeed = effectiveCameraMovementSpeed(
        configuration.cameraMoveSpeed,
        cameraDistance,
      );
      const direction = cameraActionMovementDelta(keys, camera, horizontalSpeed, delta);
      if (!direction.lengthSq()) return;
      camera.position.add(direction);
      controls.target.add(direction);
      moved = true;
      this.callbacks.recordMetric?.('cameraMovementFrames');
      this.callbacks.recordTrace?.('movement-frame', {
        actions: [...keys],
        deltaSeconds: delta,
        configuredHorizontalSpeed: configuration.cameraMoveSpeed,
        configuredVerticalSpeed: configuration.verticalMoveSpeed,
        distance: cameraDistance,
        movementScale: cameraMovementScale(cameraDistance),
        effectiveHorizontalSpeed: horizontalSpeed,
        effectiveVerticalSpeed: horizontalSpeed,
      });
      controls.update();
    } finally {
      if (moved) {
        this.callbacks.recordMetric?.('cameraMovementRenderCalls');
        this.callbacks.requestRender();
      }
      this.callbacks.onMovementEnd?.();
    }
  }
}
