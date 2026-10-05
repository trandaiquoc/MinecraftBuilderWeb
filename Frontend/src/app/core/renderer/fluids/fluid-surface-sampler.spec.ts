import { describe, expect, it } from 'vitest';
import { calculateFluidHeight, fluidHorizontalVelocity, fluidSideUv, sampleFluidCornerHeights } from './fluid-surface-sampler';

describe('fluid surface sampler', () => {
  it('keeps vanilla weighted height averaging deterministic', () => {
    expect(calculateFluidHeight([.9, 0, 0])).toBeCloseTo(.75);
    expect(calculateFluidHeight([.5, .2, -1])).toBeCloseTo(.35);
  });

  it('samples only the corners touched by a full adjacent column', () => {
    const corners = sampleFluidCornerHeights(8 / 9, (dx, dz) => dx === 0 && dz === -1 ? 1 : 0);
    expect(corners.northWest).toBeGreaterThan(corners.southWest);
    expect(corners.northEast).toBeGreaterThan(corners.southEast);
    expect(corners.southWest).toBeLessThan(1);
  });

  it('normalizes cardinal flow and maps side texture V to the sampled height', () => {
    expect(fluidHorizontalVelocity(8 / 9, (dx, dz) => dx === 1 ? 1 / 9 : 8 / 9)).toEqual({ x: 1, z: 0 });
    const uv = fluidSideUv(8 / 9, 1 / 9);
    expect(uv[2][1]).toBeCloseTo(8 / 9);
    expect(uv[3][1]).toBeCloseTo(1 / 9);
  });
});
