import { describe, expect, it } from 'vitest';
import { PAINTING_VARIANTS, chooseRandomPaintingVariant } from './decoration.types';

describe('decoration types and catalog', () => {
  it('keeps the verified painting catalog and chooses the largest fitting placeable variant', () => {
    expect(PAINTING_VARIANTS).toHaveLength(50);
    expect(chooseRandomPaintingVariant(4, 4, () => 0)?.id).toBe('pointer');
    expect(chooseRandomPaintingVariant(2, 2, () => 0)?.id).toBe('match');
    expect(chooseRandomPaintingVariant(1, 1, () => 0)?.id).toBe('kebab');
    expect(chooseRandomPaintingVariant(2, 2, () => 0)?.placeable).not.toBe(false);
  });
});
