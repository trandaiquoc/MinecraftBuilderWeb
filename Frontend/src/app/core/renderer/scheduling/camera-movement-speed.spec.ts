import { describe, expect, it } from 'vitest';
import { cameraMovementScale, effectiveCameraMovementSpeed } from './camera-movement-speed';

describe('camera movement speed scaling', () => {
  it('scales continuously around the reference distance', () => {
    expect(cameraMovementScale(8)).toBeCloseTo(0.5);
    expect(cameraMovementScale(16)).toBeCloseTo(1);
    expect(cameraMovementScale(24)).toBeCloseTo(1.5);
    expect(cameraMovementScale(16.1)).toBeGreaterThan(cameraMovementScale(16));
    expect(cameraMovementScale(16.1) - cameraMovementScale(16)).toBeLessThan(0.01);
  });

  it('clamps extreme distances and preserves the configured base speed', () => {
    expect(cameraMovementScale(0)).toBe(0.35);
    expect(cameraMovementScale(10_000)).toBe(2.5);
    expect(effectiveCameraMovementSpeed(15, 16)).toBe(15);
    expect(effectiveCameraMovementSpeed(15, 8)).toBeCloseTo(7.5);
    expect(effectiveCameraMovementSpeed(15, 40)).toBeCloseTo(37.5);
  });
});
