import type { VoxelCoordinate } from '../domain/voxel-coordinate.types';
import type { ItemStackData } from '../items/item-stack.types';

export type DecorationKind = 'painting' | 'item-frame' | 'glow-item-frame';
export type DecorationFacing = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/** Browser/catalog source metadata; this does not become placed-decoration data. */
export interface DecorationBrowserSource {
  readonly id: string;
}
export const DECORATION_BROWSER_SOURCES: readonly DecorationBrowserSource[] = [{ id: 'vanilla' }];

/** @deprecated Item stacks are shared domain data; keep this alias for persisted/API compatibility. */
export type DecorationItemStack = ItemStackData;

export interface PlacedDecoration {
  readonly instanceId: string;
  readonly kind: DecorationKind;
  readonly entityTypeId:
    'minecraft:painting' | 'minecraft:item_frame' | 'minecraft:glow_item_frame';
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
