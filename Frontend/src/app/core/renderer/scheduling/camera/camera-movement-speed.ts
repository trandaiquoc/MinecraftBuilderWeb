export interface CameraMovementSpeedOptions {
  readonly referenceDistance: number;
  readonly minScale: number;
  readonly maxScale: number;
}

export const DEFAULT_CAMERA_MOVEMENT_SPEED_OPTIONS: CameraMovementSpeedOptions = {
  referenceDistance: 16,
  minScale: 0.35,
  maxScale: 2.5,
};

/** Keeps horizontal movement visually consistent as the orbit distance changes. */
export function cameraMovementScale(
  distance: number,
  options: CameraMovementSpeedOptions = DEFAULT_CAMERA_MOVEMENT_SPEED_OPTIONS,
): number {
  const reference = Math.max(Number.EPSILON, options.referenceDistance);
  const min = Math.min(options.minScale, options.maxScale);
  const max = Math.max(options.minScale, options.maxScale);
  const normalizedDistance = Number.isFinite(distance) ? Math.max(0, distance) / reference : 1;
  return Math.min(max, Math.max(min, normalizedDistance));
}

export function effectiveCameraMovementSpeed(
  baseSpeed: number,
  distance: number,
  options: CameraMovementSpeedOptions = DEFAULT_CAMERA_MOVEMENT_SPEED_OPTIONS,
): number {
  return Math.max(0, baseSpeed) * cameraMovementScale(distance, options);
}
