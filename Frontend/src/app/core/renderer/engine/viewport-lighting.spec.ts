import { describe, expect, it } from 'vitest';
import { viewportLightingForBrightness } from './viewport-lighting';

describe('viewportLightingForBrightness', () => {
  it('keeps level zero usable while reducing the editor boost', () => {
    const zero = viewportLightingForBrightness(0);
    const three = viewportLightingForBrightness(3);
    expect(zero.hemisphereIntensity).toBeGreaterThan(0);
    expect(zero.hemisphereIntensity).toBeLessThan(three.hemisphereIntensity);
    expect(zero.directionalIntensity).toBeLessThan(three.directionalIntensity);
  });

  it('preserves the current lighting at the default level', () => {
    expect(viewportLightingForBrightness(3)).toEqual({ hemisphereIntensity: 2.65, directionalIntensity: 1.15 });
  });

  it('is monotonic and clamps the supported range', () => {
    const levels = Array.from({ length: 11 }, (_, level) => viewportLightingForBrightness(level));
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].hemisphereIntensity).toBeGreaterThan(levels[index - 1].hemisphereIntensity);
      expect(levels[index].directionalIntensity).toBeGreaterThan(levels[index - 1].directionalIntensity);
    }
    expect(viewportLightingForBrightness(-4)).toEqual(levels[0]);
    expect(viewportLightingForBrightness(99)).toEqual(levels[10]);
    expect(viewportLightingForBrightness(Number.NaN)).toEqual(levels[3]);
  });
});
