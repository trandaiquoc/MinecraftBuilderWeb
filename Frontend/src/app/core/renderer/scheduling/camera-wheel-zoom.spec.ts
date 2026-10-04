import { describe, expect, it } from 'vitest';
import { nextCameraDistanceFromWheel, wheelMagnitude } from './camera-wheel-zoom';

describe('camera wheel zoom', () => {
  const base = { distance: 10, action: 'zoom-out' as const, sensitivity: 2, minDistance: 2, maxDistance: 40 };

  it('normalizes pixel, line and page wheel units', () => {
    expect(wheelMagnitude(100, 0)).toBe(1);
    expect(wheelMagnitude(3, 1)).toBe(1);
    expect(wheelMagnitude(1, 2)).toBe(1);
  });

  it('preserves direction and makes tiny deltas proportionally smaller', () => {
    expect(nextCameraDistanceFromWheel({ ...base, deltaY: 1, deltaMode: 0 })).toBeGreaterThan(10);
    expect(nextCameraDistanceFromWheel({ ...base, deltaY: -100, deltaMode: 0, action: 'zoom-in' })).toBeLessThan(10);
    expect(nextCameraDistanceFromWheel({ ...base, deltaY: 1, deltaMode: 0 })).toBeCloseTo(10.01, 2);
  });

  it('clamps large changes to the configured distance limits', () => {
    expect(nextCameraDistanceFromWheel({ ...base, deltaY: 100_000, deltaMode: 0 })).toBeLessThanOrEqual(40);
    expect(nextCameraDistanceFromWheel({ ...base, deltaY: -100_000, deltaMode: 0, action: 'zoom-in' })).toBeGreaterThanOrEqual(2);
  });
});
