import { DecorationFacing, PlacedDecoration } from './decoration.types';
import { decorationAabb, paintingEntityPosition } from './decoration-placement';
import { paintingVariant } from './decoration.types';

const facingId: Record<DecorationFacing, number> = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };
const paintingFacingId: Record<'north' | 'south' | 'west' | 'east', number> = { south: 0, west: 1, north: 2, east: 3 };

export interface DecorationNbtEntity { readonly id: string; readonly Pos: readonly [number, number, number]; readonly TileX?: number; readonly TileY?: number; readonly TileZ?: number; readonly Facing?: number; readonly facing?: number; readonly variant?: string; readonly Item?: Readonly<Record<string, unknown>>; readonly ItemRotation?: number; readonly ItemDropChance?: number; readonly Fixed?: boolean; readonly Invisible?: boolean; }

export function decorationToNbt(decoration: PlacedDecoration): DecorationNbtEntity {
  const id = decoration.entityTypeId;
  if (decoration.kind === 'painting') { const variant = paintingVariant(decoration.variantId) ?? { width: 1, height: 1 }; const pos = paintingEntityPosition(decoration.anchor, decoration.facing, variant); return { id, Pos: [pos.x, pos.y, pos.z], variant: `minecraft:${decoration.variantId ?? 'kebab'}`, facing: paintingFacingId[decoration.facing as 'north' | 'south' | 'west' | 'east'] }; }
  const frameBounds = decorationAabb(decoration); const entity: DecorationNbtEntity = { id, Pos: [(frameBounds.min.x + frameBounds.max.x) / 2, (frameBounds.min.y + frameBounds.max.y) / 2, (frameBounds.min.z + frameBounds.max.z) / 2], TileX: decoration.anchor.x, TileY: decoration.anchor.y, TileZ: decoration.anchor.z, Facing: facingId[decoration.facing], Fixed: decoration.fixed ?? false, Invisible: decoration.invisible ?? false };
  if (decoration.item) return { ...entity, Item: { id: decoration.item.id, count: decoration.item.count, ...(decoration.item.components ? { components: decoration.item.components } : {}) }, ItemRotation: decoration.rotation ?? 0, ItemDropChance: decoration.itemDropChance ?? 1 };
  return entity;
}

export interface StructureDecorationEntityInfo { readonly pos: readonly [number, number, number]; readonly blockPos: readonly [number, number, number]; readonly nbt: DecorationNbtEntity; }

export function toStructureDecorationEntityInfo(decoration: PlacedDecoration): StructureDecorationEntityInfo {
  const nbt = decorationToNbt(decoration);
  return { pos: nbt.Pos, blockPos: [decoration.anchor.x, decoration.anchor.y, decoration.anchor.z], nbt };
}
