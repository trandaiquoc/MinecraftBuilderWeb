import { describe, expect, it } from 'vitest';
import { evaluateStructureSize } from './structure-size-policy';

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
    expect(evaluateStructureSize(size(512, 512, 512), 'huge-structure-blocks').selectedModeValid).toBe(true);
    for (const oversized of [size(513, 1, 1), size(1, 513, 1), size(1, 1, 513)]) {
      expect(evaluateStructureSize(oversized, 'huge-structure-blocks').selectedModeValid).toBe(false);
    }
  });

  it.each([
    size(0, 1, 1),
    size(-1, 1, 1),
    size(1.5, 1, 1),
    size(Number.NaN, 1, 1),
    size(Number.POSITIVE_INFINITY, 1, 1),
  ])('rejects invalid form dimensions %j', (dimensions) => {
    expect(evaluateStructureSize(dimensions, 'vanilla-structure-block').dimensionsValid).toBe(false);
    expect(evaluateStructureSize(dimensions, 'vanilla-structure-block').selectedModeValid).toBe(false);
  });
});
