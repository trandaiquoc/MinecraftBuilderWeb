import { describe, expect, it } from 'vitest';
import { decorationAabb, decorationAnchorFromSupport, decorationInBounds, planDecorationPlacement, supportsDecoration } from './placement/decoration-placement';
import { decorationToNbt, toStructureDecorationEntityInfo } from './serialization/decoration-nbt';
import { PAINTING_VARIANTS, chooseRandomPaintingVariant } from './decoration.types';
import { DecorationItemCatalog } from './catalog/decoration-item-catalog';
import { parseVanillaItemRegistry } from '../items/registry/vanilla-item-registry';

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

  it('returns a full-size invalid candidate and stable collision reasons', () => {
    const project = { schemaVersion: 3 as const, id: 'p', metadata: { name: 'p', minecraftVersion: '1.21.1' as const, createdAt: '', updatedAt: '' }, size: { x: 8, y: 8, z: 8 }, structureMode: 'vanilla-structure-block' as const, blocks: [{ kind: 'resolved' as const, id: 'minecraft:stone', namespace: 'minecraft', position: { x: 2, y: 2, z: 2 }, state: {} }], groups: [], decorations: [], editorSettings: { currentY: 2, layerVisibility: 'current-only' as const, referenceLayerOpacity: .3 } };
    const missing = planDecorationPlacement(project, { kind: 'painting', variantId: 'pool' }, { x: 2, y: 2, z: 2 }, 'south');
    expect(missing.reason).toBe('missing-support');
    expect(missing.decoration?.variantId).toBe('pool');
    expect(decorationAabb(missing.decoration!).max.x - decorationAabb(missing.decoration!).min.x).toBeCloseTo(2);
  });

  it('indexes authoritative registered items without resolving models or entity ids', () => {
    const resources: Record<string, unknown> = {
      'assets/minecraft/lang/en_us.json': { 'item.minecraft.diamond': 'Diamond', 'block.minecraft.oak_log': 'Oak Log' },
    };
    const registry = parseVanillaItemRegistry({ schemaVersion: 1, minecraftVersion: '1.21.1', source: 'test', items: [
      { id: 'minecraft:diamond' }, { id: 'minecraft:oak_log' }, { id: 'minecraft:water_bucket' }, { id: 'minecraft:zombie_spawn_egg' }, { id: 'minecraft:air' },
    ] });
    const catalog = new DecorationItemCatalog(); catalog.load({ readJson: (path) => resources[path] }, registry);
    expect(catalog.search('diamond').map((entry) => entry.id)).toContain('minecraft:diamond');
    expect(catalog.search('oak log').map((entry) => entry.id)).toContain('minecraft:oak_log');
    expect(catalog.search('spawn egg').map((entry) => entry.id)).toContain('minecraft:zombie_spawn_egg');
    expect(catalog.all().map((entry) => entry.id)).not.toContain('minecraft:zombie');
    expect(catalog.all().map((entry) => entry.id)).not.toContain('minecraft:air');
  });
});
