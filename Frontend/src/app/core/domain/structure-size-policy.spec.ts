import { describe, expect, it } from 'vitest';
import {
  canonicalStructureModeForSize,
  effectiveStructureModeForSize,
  evaluateStructureSize,
  isStructureCreationAllowed,
  normalizeStructureModeForSize,
} from './structure-size-policy';

const size = (x: number, y: number, z: number) => ({ x, y, z });

describe('evaluateStructureSize', () => {
  it.each([
    [16, 16, 16],
    [48, 48, 48],
    [48, 10, 48],
  ])('accepts %i × %i × %i in Vanilla mode', (x, y, z) => {
    const result = evaluateStructureSize(size(x, y, z), 'vanilla-structure-block');
    expect(result.selectedModeValid).toBe(true);
    expect(result.fitsVanilla).toBe(true);
  });

  it.each([
    [49, 48, 48, ['x']],
    [48, 49, 48, ['y']],
    [48, 48, 49, ['z']],
  ])('identifies the Vanilla axis over 48 for %i × %i × %i', (x, y, z, axes) => {
    const result = evaluateStructureSize(size(x, y, z), 'vanilla-structure-block');
    expect(result.exceedsVanilla).toBe(true);
    expect(result.selectedModeValid).toBe(false);
    expect(result.selectedModeExceededAxes).toEqual(axes);
  });

  it('recommends Huge Structure Blocks for 64 × 18 × 64 without accepting it in Vanilla mode', () => {
    const vanilla = evaluateStructureSize(size(64, 18, 64), 'vanilla-structure-block');
    expect(vanilla.selectedModeValid).toBe(false);
    expect(vanilla.fitsHugeStructureBlocks).toBe(true);
    expect(vanilla.recommendedMode).toBe('huge-structure-blocks');

    const huge = evaluateStructureSize(size(64, 18, 64), 'huge-structure-blocks');
    expect(huge.selectedModeValid).toBe(true);
  });

  it('accepts the Huge Structure Blocks maximum and rejects every axis above it', () => {
    expect(
      evaluateStructureSize(size(512, 512, 512), 'huge-structure-blocks').selectedModeValid,
    ).toBe(true);
    for (const oversized of [size(513, 1, 1), size(1, 513, 1), size(1, 1, 513)]) {
      expect(evaluateStructureSize(oversized, 'huge-structure-blocks').selectedModeValid).toBe(
        false,
      );
    }
  });

  it.each([
    size(0, 1, 1),
    size(-1, 1, 1),
    size(1.5, 1, 1),
    size(Number.NaN, 1, 1),
    size(Number.POSITIVE_INFINITY, 1, 1),
  ])('rejects invalid form dimensions %j', (dimensions) => {
    expect(evaluateStructureSize(dimensions, 'vanilla-structure-block').dimensionsValid).toBe(
      false,
    );
    expect(evaluateStructureSize(dimensions, 'vanilla-structure-block').selectedModeValid).toBe(
      false,
    );
  });
});

describe('canonical structure mode policy', () => {
  it.each([
    [16, 16, 16],
    [48, 48, 48],
  ])('uses Vanilla for %i × %i × %i', (x, y, z) => {
    expect(canonicalStructureModeForSize(size(x, y, z))).toBe('vanilla-structure-block');
  });

  it('requires an explicit Huge confirmation once an axis exceeds 48', () => {
    const oversized = size(49, 48, 48);
    expect(canonicalStructureModeForSize(oversized)).toBe('huge-structure-blocks');
    expect(isStructureCreationAllowed(oversized, 'vanilla-structure-block')).toBe(false);
    expect(isStructureCreationAllowed(oversized, 'huge-structure-blocks')).toBe(true);
  });

  it('does not treat sizes above 512 as supported', () => {
    const unsupported = size(513, 18, 64);
    expect(canonicalStructureModeForSize(unsupported)).toBeUndefined();
    expect(isStructureCreationAllowed(unsupported, 'huge-structure-blocks')).toBe(false);
    expect(normalizeStructureModeForSize(unsupported, 'huge-structure-blocks')).toBe(
      'huge-structure-blocks',
    );
  });

  it('normalizes legacy mode metadata to the size-compatible mode', () => {
    expect(normalizeStructureModeForSize(size(32, 32, 32), 'huge-structure-blocks')).toBe(
      'vanilla-structure-block',
    );
    expect(normalizeStructureModeForSize(size(64, 18, 64), 'vanilla-structure-block')).toBe(
      'huge-structure-blocks',
    );
  });

  it('uses the optional automatic Huge mode only for supported oversized sizes', () => {
    expect(effectiveStructureModeForSize(size(49, 48, 48), 'vanilla-structure-block', false)).toBe(
      'vanilla-structure-block',
    );
    expect(effectiveStructureModeForSize(size(49, 48, 48), 'vanilla-structure-block', true)).toBe(
      'huge-structure-blocks',
    );
    expect(effectiveStructureModeForSize(size(48, 48, 48), 'huge-structure-blocks', true)).toBe(
      'vanilla-structure-block',
    );
    expect(effectiveStructureModeForSize(size(513, 18, 64), 'vanilla-structure-block', true)).toBe(
      'vanilla-structure-block',
    );
  });
});
