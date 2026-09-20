export interface ViewportLighting {
  readonly hemisphereIntensity: number;
  readonly directionalIntensity: number;
}

const VANILLA_BASELINE: ViewportLighting = { hemisphereIntensity: 1.4, directionalIntensity: 0.65 };
const CURRENT_DEFAULT: ViewportLighting = { hemisphereIntensity: 2.65, directionalIntensity: 1.15 };
const MAXIMUM: ViewportLighting = { hemisphereIntensity: 4.2, directionalIntensity: 2.1 };

export function normalizeBlockBrightness(value: number): number {
  return Number.isFinite(value) ? Math.min(10, Math.max(0, Math.round(value))) : 3;
}

/** Level 0 is a non-zero neutral baseline, not a Minecraft light simulation. */
export function viewportLightingForBrightness(value: number): ViewportLighting {
  const level = normalizeBlockBrightness(value);
  if (level <= 3) return interpolate(VANILLA_BASELINE, CURRENT_DEFAULT, level / 3);
  return interpolate(CURRENT_DEFAULT, MAXIMUM, (level - 3) / 7);
}

function interpolate(from: ViewportLighting, to: ViewportLighting, amount: number): ViewportLighting {
  return {
    hemisphereIntensity: from.hemisphereIntensity + (to.hemisphereIntensity - from.hemisphereIntensity) * amount,
    directionalIntensity: from.directionalIntensity + (to.directionalIntensity - from.directionalIntensity) * amount,
  };
}
