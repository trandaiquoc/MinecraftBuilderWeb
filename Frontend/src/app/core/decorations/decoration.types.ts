import type { VoxelCoordinate } from '../domain/voxel-coordinate.types';
import type { ItemStackData } from '../items/item-stack.types';

export type DecorationKind = 'painting' | 'item-frame' | 'glow-item-frame';
export const DECORATION_ENTITY_TYPE_IDS = {
  painting: 'minecraft:painting',
  'item-frame': 'minecraft:item_frame',
  'glow-item-frame': 'minecraft:glow_item_frame',
} as const satisfies Record<DecorationKind, string>;
export type DecorationEntityTypeId = (typeof DECORATION_ENTITY_TYPE_IDS)[DecorationKind];

export function decorationEntityTypeId(kind: DecorationKind): DecorationEntityTypeId {
  return DECORATION_ENTITY_TYPE_IDS[kind];
}

export type DecorationFacing = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/** Browser/catalog source metadata; this does not become placed-decoration data. */
export interface DecorationBrowserSource {
  readonly id: string;
}
export const DECORATION_BROWSER_SOURCES: readonly DecorationBrowserSource[] = [{ id: 'vanilla' }];

/** Domain name for the item stack attached to a placed decoration. */
export type DecorationItemStack = ItemStackData;

export interface PlacedDecoration {
  readonly instanceId: string;
  readonly kind: DecorationKind;
  readonly entityTypeId: DecorationEntityTypeId;
  /** The empty voxel immediately in front of the supporting block. */
  readonly anchor: VoxelCoordinate;
  readonly facing: DecorationFacing;
  readonly variantId?: string;
  readonly item?: DecorationItemStack;
  readonly rotation?: number;
  readonly invisible?: boolean;
  readonly fixed?: boolean;
  readonly itemDropChance?: number;
  readonly groupIds?: readonly string[];
  readonly raw?: Readonly<Record<string, unknown>>;
}

export interface PaintingVariant {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Canonical namespaced texture resource, not the raw asset_id from a data file. */
  readonly assetPath: string;
  readonly placeable?: boolean;
  readonly sourceId?: string;
  readonly sourceName?: string;
}
