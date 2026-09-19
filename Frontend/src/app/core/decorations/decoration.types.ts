import { VoxelCoordinate } from '../domain/project.types';

export type DecorationKind = 'painting' | 'item-frame' | 'glow-item-frame';
export type DecorationFacing = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

export interface DecorationItemStack {
  readonly id: string;
  readonly count: number;
  readonly components?: Readonly<Record<string, unknown>>;
}

export interface PlacedDecoration {
  readonly instanceId: string;
  readonly kind: DecorationKind;
  readonly entityTypeId: 'minecraft:painting' | 'minecraft:item_frame' | 'minecraft:glow_item_frame';
  /** The empty voxel immediately in front of the supporting block. */
  readonly anchor: VoxelCoordinate;
  readonly facing: DecorationFacing;
  readonly variantId?: string;
  readonly item?: DecorationItemStack;
  readonly rotation?: number;
  readonly invisible?: boolean;
  readonly fixed?: boolean;
  readonly itemDropChance?: number;
  readonly raw?: Readonly<Record<string, unknown>>;
}

export type PlacedPainting = PlacedDecoration & { readonly kind: 'painting'; readonly entityTypeId: 'minecraft:painting'; readonly variantId: string };
export type PlacedItemFrame = PlacedDecoration & { readonly kind: 'item-frame' | 'glow-item-frame'; readonly entityTypeId: 'minecraft:item_frame' | 'minecraft:glow_item_frame'; readonly rotation: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly invisible: boolean; readonly fixed: boolean; readonly itemDropChance: number };

export interface PaintingVariant {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly assetPath: string;
  readonly placeable?: boolean;
}

export const PAINTING_VARIANTS: readonly PaintingVariant[] = [
  ...['kebab', 'aztec', 'alban', 'aztec2', 'bomb', 'plant', 'wasteland', 'meditative'].map((id) => ({ id, width: 1, height: 1 })),
  ...['pool', 'courbet', 'sea', 'sunset', 'creebet'].map((id) => ({ id, width: 2, height: 1 })),
  ...['wanderer', 'graham', 'prairie_ride'].map((id) => ({ id, width: 1, height: 2 })),
  ...['match', 'bust', 'stage', 'void', 'skull_and_roses', 'wither', 'baroque', 'humble'].map((id) => ({ id, width: 2, height: 2 })),
  ...['fighters', 'changing', 'finding', 'lowmist', 'passage'].map((id) => ({ id, width: 4, height: 2 })),
  ...['pointer', 'pigscene', 'burning_skull', 'unpacked', 'orb'].map((id) => ({ id, width: 4, height: 4 })),
  ...['skeleton', 'donkey_kong'].map((id) => ({ id, width: 4, height: 3 })),
  ...['backyard', 'pond'].map((id) => ({ id, width: 3, height: 4 })),
  ...['bouquet', 'cavebird', 'cotan', 'endboss', 'fern', 'owlemons', 'sunflowers', 'tides'].map((id) => ({ id, width: 3, height: 3 })),
  ...['earth', 'wind', 'water', 'fire'].map((id) => ({ id, width: 2, height: 2, placeable: false })),
].map((variant) => ({ ...variant, assetPath: `minecraft:painting/${variant.id}` }));

export function paintingVariant(id: string | undefined): PaintingVariant | undefined {
  return PAINTING_VARIANTS.find((entry) => entry.id === id);
}

export function placeablePaintingVariants(): readonly PaintingVariant[] {
  return PAINTING_VARIANTS.filter((entry) => entry.placeable !== false);
}

export function chooseRandomPaintingVariant(width: number, height: number, random = Math.random): PaintingVariant | undefined {
  const candidates = placeablePaintingVariants().filter((entry) => entry.width <= width && entry.height <= height);
  if (!candidates.length) return undefined;
  const largestArea = Math.max(...candidates.map((entry) => entry.width * entry.height));
  const largest = candidates.filter((entry) => entry.width * entry.height === largestArea);
  return largest[Math.floor(Math.max(0, Math.min(.999999, random())) * largest.length)];
}
