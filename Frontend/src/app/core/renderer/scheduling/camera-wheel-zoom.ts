export type WheelZoomAction = 'zoom-in' | 'zoom-out';

export interface WheelZoomInput {
  readonly distance: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly action: WheelZoomAction;
  readonly sensitivity: number;
  readonly minDistance: number;
  readonly maxDistance: number;
}

/** Converts DOM wheel units into a small, bounded exponential distance change. */
export function wheelMagnitude(deltaY: number, deltaMode: number): number {
  const magnitude = Math.abs(Number.isFinite(deltaY) ? deltaY : 0);
  if (deltaMode === 1) return magnitude / 3;
  if (deltaMode === 2) return magnitude;
  return magnitude / 100;
}

export function nextCameraDistanceFromWheel(input: WheelZoomInput): number {
  const min = Math.max(0, Math.min(input.minDistance, input.maxDistance));
  const max = Math.max(min, input.maxDistance);
  const distance = Math.max(min, Math.min(max, input.distance));
  const magnitude = Math.min(4, wheelMagnitude(input.deltaY, input.deltaMode));
  const exponent = magnitude * Math.max(0, input.sensitivity) * 0.05;
  const factor = input.action === 'zoom-in' ? Math.exp(-exponent) : Math.exp(exponent);
  return Math.max(min, Math.min(max, distance * factor));
}
