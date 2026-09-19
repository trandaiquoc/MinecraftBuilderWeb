import { describe, expect, it } from 'vitest';
import { decorationAabb, decorationAnchorFromSupport, decorationInBounds, supportsDecoration } from './decoration-placement';
import { decorationToNbt, toStructureDecorationEntityInfo } from './decoration-nbt';
import { PAINTING_VARIANTS, chooseRandomPaintingVariant } from './decoration.types';

describe('decorations domain', () => {
  it('keeps the verified painting catalog and chooses the largest fitting placeable variant', () => {
    expect(PAINTING_VARIANTS).toHaveLength(50);
    expect(chooseRandomPaintingVariant(4, 4, () => 0)?.id).toBe('pointer');
    expect(chooseRandomPaintingVariant(2, 2, () => 0)?.id).toBe('match');
    expect(chooseRandomPaintingVariant(1, 1, () => 0)?.id).toBe('kebab');
    expect(chooseRandomPaintingVariant(2, 2, () => 0)?.placeable).not.toBe(false);
  });

  it('uses the attached air cell as anchor and validates project bounds', () => {
    expect(decorationAnchorFromSupport({ x: 2, y: 3, z: 4 }, 'north')).toEqual({ x: 2, y: 3, z: 3 });
    expect(decorationInBounds({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 })).toBe(true);
    expect(decorationInBounds({ x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 4 })).toBe(false);
    expect(supportsDecoration('painting', 'up', true)).toBe(false);
    expect(supportsDecoration('painting', 'north', true)).toBe(true);
  });

  it('produces frame dimensions and vanilla direction NBT', () => {
    const frame = { instanceId: 'frame', kind: 'item-frame' as const, entityTypeId: 'minecraft:item_frame' as const, anchor: { x: 2, y: 3, z: 4 }, facing: 'north' as const, rotation: 0, fixed: false };
    const bounds = decorationAabb(frame);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(.0625);
    expect(decorationToNbt(frame)).toMatchObject({ id: 'minecraft:item_frame', Facing: 2, TileX: 2, TileY: 3, TileZ: 4 });
    const painting = { instanceId: 'painting', kind: 'painting' as const, entityTypeId: 'minecraft:painting' as const, anchor: { x: 1, y: 2, z: 3 }, facing: 'south' as const, variantId: 'pool' };
    expect(decorationToNbt(painting)).toMatchObject({ variant: 'minecraft:pool', facing: 0 });
    expect(toStructureDecorationEntityInfo(painting).blockPos).toEqual([1, 2, 3]);
  });
});
