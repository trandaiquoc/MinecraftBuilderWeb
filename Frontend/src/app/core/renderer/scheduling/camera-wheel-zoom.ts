export type WheelZoomAction = 'zoom-in' | 'zoom-out';

export interface WheelZoomInput {
  readonly deltaY: number;
  readonly deltaMode?: number;
  readonly pageSize?: number;
  readonly maxNormalizedDelta?: number;
}

export interface WheelZoomDistanceOptions {
  readonly action: WheelZoomAction;
  readonly sensitivity: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly maxNormalizedDelta?: number;
}

export const DOM_DELTA_PIXEL = 0;
export const DOM_DELTA_LINE = 1;
export const DOM_DELTA_PAGE = 2;
const DEFAULT_PAGE_SIZE = 800;
const LINE_SIZE = 16;
const MAX_NORMALIZED_DELTA = 1000;
const SENSITIVITY_COEFFICIENT = 0.001;

/** Converts browser wheel units to bounded pixel-like magnitude. */
export function normalizeWheelDelta(input: WheelZoomInput): number {
  if (!Number.isFinite(input.deltaY) || input.deltaY === 0) return 0;
  const mode = input.deltaMode ?? DOM_DELTA_PIXEL;
  const scale = mode === DOM_DELTA_LINE ? LINE_SIZE : mode === DOM_DELTA_PAGE ? Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE) : 1;
  const magnitude = Math.abs(input.deltaY * scale);
  return Math.min(input.maxNormalizedDelta ?? MAX_NORMALIZED_DELTA, magnitude);
}

export function wheelZoomDistance(distance: number, input: WheelZoomInput, options: WheelZoomDistanceOptions): number {
  if (!Number.isFinite(distance) || distance <= 0) return Math.max(options.minDistance, 0);
  const magnitude = normalizeWheelDelta({ ...input, maxNormalizedDelta: options.maxNormalizedDelta });
  const sensitivity = Math.max(0, options.sensitivity);
  const direction = options.action === 'zoom-in' ? -1 : 1;
  const scaled = distance * Math.exp(direction * magnitude * sensitivity * SENSITIVITY_COEFFICIENT);
  return Math.min(options.maxDistance, Math.max(options.minDistance, scaled));
}
