import { describe, expect, it } from 'vitest';
import { DOM_DELTA_LINE, DOM_DELTA_PAGE, normalizeWheelDelta, wheelZoomDistance } from './camera-wheel-zoom';

describe('camera wheel zoom', () => {
  it('normalizes pixel, line, and page deltas', () => {
    expect(normalizeWheelDelta({ deltaY: 2 })).toBe(2);
    expect(normalizeWheelDelta({ deltaY: 2, deltaMode: DOM_DELTA_LINE })).toBe(32);
    expect(normalizeWheelDelta({ deltaY: 1, deltaMode: DOM_DELTA_PAGE, pageSize: 600 })).toBe(600);
  });

  it('keeps direction, sensitivity, and bounds in the pure distance math', () => {
    expect(wheelZoomDistance(10, { deltaY: -100 }, { action: 'zoom-in', sensitivity: 2, minDistance: 2, maxDistance: 20 })).toBeLessThan(10);
    expect(wheelZoomDistance(10, { deltaY: 100 }, { action: 'zoom-out', sensitivity: 2, minDistance: 2, maxDistance: 20 })).toBeGreaterThan(10);
    expect(wheelZoomDistance(10, { deltaY: 100_000 }, { action: 'zoom-out', sensitivity: 2, minDistance: 2, maxDistance: 11 })).toBe(11);
    expect(wheelZoomDistance(10, { deltaY: 100_000 }, { action: 'zoom-in', sensitivity: 2, minDistance: 9, maxDistance: 20 })).toBe(9);
  });

  it('does not turn many tiny trackpad deltas into full notches', () => {
    let tiny = 10;
    for (let index = 0; index < 10; index += 1) tiny = wheelZoomDistance(tiny, { deltaY: 2 }, { action: 'zoom-out', sensitivity: 2, minDistance: 1, maxDistance: 100 });
    let full = 10;
    for (let index = 0; index < 10; index += 1) full = wheelZoomDistance(full, { deltaY: 100 }, { action: 'zoom-out', sensitivity: 2, minDistance: 1, maxDistance: 100 });
    expect(tiny).toBeLessThan(full);
  });
});
