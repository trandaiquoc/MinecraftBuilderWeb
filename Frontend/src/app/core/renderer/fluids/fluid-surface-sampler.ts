export type FluidSideUv = readonly (readonly [number, number])[];

export interface FluidCornerHeights {
  readonly northWest: number;
  readonly northEast: number;
  readonly southWest: number;
  readonly southEast: number;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

/** Maps a side's two top heights to the animated fluid atlas vertical range. */
export function fluidSideUv(topLeftHeight: number, topRightHeight: number): FluidSideUv {
  return [[0, 1], [1, 1], [1, 1 - clamp01(topRightHeight)], [0, 1 - clamp01(topLeftHeight)]];
}

export function calculateFluidHeight(heights: readonly number[]): number {
  let sum = 0;
  let weight = 0;
  for (const height of heights) {
    if (height >= .8) { sum += height * 10; weight += 10; }
    else if (height >= 0) { sum += height; weight += 1; }
  }
  return weight ? sum / weight : 0;
}

export function sampleFluidCornerHeights(current: number, sample: (dx: number, dz: number) => number): FluidCornerHeights {
  const north = sample(0, -1);
  const south = sample(0, 1);
  const west = sample(-1, 0);
  const east = sample(1, 0);
  if (current >= 1) return { northWest: 1, northEast: 1, southWest: 1, southEast: 1 };
  const diagonalSamples = [sample(-1, -1), sample(1, -1), sample(-1, 1), sample(1, 1)];
  if ([north, south, west, east, ...diagonalSamples].every((height) => height === 0)) return { northWest: current, northEast: current, southWest: current, southEast: current };
  return {
    northWest: calculateFluidHeight([current, north, west, diagonalSamples[0]]),
    northEast: calculateFluidHeight([current, north, east, diagonalSamples[1]]),
    southWest: calculateFluidHeight([current, south, west, diagonalSamples[2]]),
    southEast: calculateFluidHeight([current, south, east, diagonalSamples[3]]),
  };
}

export function fluidHorizontalVelocity(current: number, sample: (dx: number, dz: number) => number): { readonly x: number; readonly z: number } {
  let x = 0;
  let z = 0;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    const neighbor = sample(dx, dz);
    if (neighbor >= 0) { const difference = current - neighbor; x += dx * difference; z += dz * difference; }
  }
  const length = Math.hypot(x, z);
  return length ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}
