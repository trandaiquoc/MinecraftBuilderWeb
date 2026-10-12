/** Verified painting and item-frame entity mappings. */

import { isValidNamespacedResourceLocation } from '../../../content/resources/resource-location';
import {
  decorationAabb,
  paintingEntityPosition,
} from '../../../decorations/placement/decoration-placement';
import {
  decorationEntityTypeId,
  type DecorationFacing,
  type PlacedDecoration,
} from '../../../decorations/decoration.types';
import { paintingVariant } from '../../../decorations/catalog/painting-catalog';
import type { MinecraftNbtCompound, MinecraftNbtTag } from '../codec/minecraft-structure-types';
import { type ItemMaxStackResolver } from '../../../items/item-stack-validation';
import { failure, hasUnknownRaw } from './minecraft-structure-semantic-mapping-result';
import type { SemanticMappingResult } from './minecraft-structure-semantic-mapping-result';
import {
  byteTag,
  compound,
  coordinateTuple,
  doubleList,
  floatTag,
  intTag,
  stringTag,
} from '../codec/minecraft-structure-nbt-primitives';
import { mapItemStack } from './minecraft-structure-item-stack-mapper';

const horizontalPaintingFacing: Readonly<Record<'north' | 'south' | 'west' | 'east', number>> = {
  south: 0,
  west: 1,
  north: 2,
  east: 3,
};

const entityFacing: Readonly<Record<DecorationFacing, number>> = {
  down: 0,
  up: 1,
  north: 2,
  south: 3,
  west: 4,
  east: 5,
};

export function mapDecoration(
  decoration: PlacedDecoration,
  index: number,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<{
  readonly pos: readonly [number, number, number];
  readonly blockPos: readonly [number, number, number];
  readonly nbt: MinecraftNbtCompound;
}> {
  if (hasUnknownRaw(decoration.raw))
    return failure(
      'unsupported-raw-nbt',
      'Decoration raw data is outside the verified semantic mapper.',
      `decorations.${index}.raw`,
    );
  const expectedEntityType = decorationEntityTypeId(decoration.kind);
  if (decoration.entityTypeId !== expectedEntityType)
    return failure(
      'invalid-decoration',
      'Decoration kind and entityTypeId do not describe the same Minecraft entity.',
      `decorations.${index}.entityTypeId`,
    );
  if (decoration.kind === 'painting') return mapPainting(decoration, index);
  return mapItemFrame(decoration, index, resolveMaxStackSize);
}

function mapPainting(
  decoration: PlacedDecoration,
  index: number,
): SemanticMappingResult<{
  readonly pos: readonly [number, number, number];
  readonly blockPos: readonly [number, number, number];
  readonly nbt: MinecraftNbtCompound;
}> {
  if (!decoration.variantId || !isHorizontal(decoration.facing))
    return failure(
      'invalid-decoration',
      'Painting requires a known horizontal facing and variant.',
      `decorations.${index}`,
    );
  const variant = paintingVariant(decoration.variantId);
  if (!variant)
    return failure(
      'unknown-painting-variant',
      'Painting variant dimensions are unavailable.',
      `decorations.${index}.variantId`,
    );
  const resourceId = namespaced(decoration.variantId);
  if (!resourceId || horizontalPaintingFacing[decoration.facing] === undefined)
    return failure(
      'invalid-decoration',
      'Painting variant or facing is invalid.',
      `decorations.${index}`,
    );
  const position = paintingEntityPosition(decoration.anchor, decoration.facing, variant);
  return {
    ok: true,
    value: {
      pos: coordinateTuple(position.x, position.y, position.z),
      blockPos: coordinateTuple(decoration.anchor.x, decoration.anchor.y, decoration.anchor.z),
      nbt: compound({
        id: stringTag(decorationEntityTypeId('painting')),
        Pos: doubleList(position),
        TileX: intTag(decoration.anchor.x),
        TileY: intTag(decoration.anchor.y),
        TileZ: intTag(decoration.anchor.z),
        variant: stringTag(resourceId),
        facing: byteTag(horizontalPaintingFacing[decoration.facing]),
      }),
    },
  };
}

function mapItemFrame(
  decoration: PlacedDecoration,
  index: number,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<{
  readonly pos: readonly [number, number, number];
  readonly blockPos: readonly [number, number, number];
  readonly nbt: MinecraftNbtCompound;
}> {
  if (entityFacing[decoration.facing] === undefined)
    return failure(
      'invalid-decoration',
      'Item Frame requires a supported facing.',
      `decorations.${index}.facing`,
    );
  if (
    decoration.rotation !== undefined &&
    (!Number.isInteger(decoration.rotation) || decoration.rotation < 0 || decoration.rotation > 7)
  )
    return failure(
      'invalid-decoration',
      'Item Frame rotation must be an integer from 0 to 7.',
      `decorations.${index}.rotation`,
    );
  if (
    decoration.itemDropChance !== undefined &&
    (!Number.isFinite(decoration.itemDropChance) ||
      decoration.itemDropChance < 0 ||
      decoration.itemDropChance > 1)
  )
    return failure(
      'invalid-decoration',
      'Item Frame drop chance must be between 0 and 1.',
      `decorations.${index}.itemDropChance`,
    );
  const bounds = decorationAabb(decoration);
  const position = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const fields: Record<string, MinecraftNbtTag> = {
    id: stringTag(decoration.entityTypeId),
    Pos: doubleList(position),
    TileX: intTag(decoration.anchor.x),
    TileY: intTag(decoration.anchor.y),
    TileZ: intTag(decoration.anchor.z),
    Facing: byteTag(entityFacing[decoration.facing]),
    ItemRotation: byteTag(decoration.rotation ?? 0),
    ItemDropChance: floatTag(decoration.itemDropChance ?? 1),
    Fixed: byteTag(decoration.fixed === true),
    Invisible: byteTag(decoration.invisible === true),
  };
  if (decoration.item !== undefined) {
    const item = mapItemStack(
      decoration.item,
      `decorations.${index}.item`,
      undefined,
      resolveMaxStackSize,
    );
    if (!item.ok) return item;
    fields['Item'] = item.value;
  }
  return {
    ok: true,
    value: {
      pos: coordinateTuple(position.x, position.y, position.z),
      blockPos: coordinateTuple(decoration.anchor.x, decoration.anchor.y, decoration.anchor.z),
      nbt: compound(fields),
    },
  };
}

function isHorizontal(value: DecorationFacing): value is 'north' | 'south' | 'west' | 'east' {
  return value === 'north' || value === 'south' || value === 'west' || value === 'east';
}

function namespaced(value: string): string | undefined {
  const candidate = value.includes(':') ? value : `minecraft:${value}`;
  return isValidNamespacedResourceLocation(candidate) ? candidate : undefined;
}
