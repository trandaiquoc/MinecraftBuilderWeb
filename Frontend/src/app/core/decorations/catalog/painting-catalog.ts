import { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import type { PaintingVariant } from '../decoration.types';

export function paintingTextureResource(assetId: string, fallbackNamespace = 'minecraft'): string {
  const value = assetId.includes(':') ? assetId : `${fallbackNamespace}:${assetId}`;
  const [namespace, path = ''] = value.split(':', 2);
  return `${namespace}:${path.startsWith('painting/') ? path : `painting/${path}`}`;
}

export const PAINTING_VARIANTS: readonly PaintingVariant[] = [
  ...['kebab', 'aztec', 'alban', 'aztec2', 'bomb', 'plant', 'wasteland', 'meditative'].map(
    (id) => ({ id, width: 1, height: 1 }),
  ),
  ...['pool', 'courbet', 'sea', 'sunset', 'creebet'].map((id) => ({ id, width: 2, height: 1 })),
  ...['wanderer', 'graham', 'prairie_ride'].map((id) => ({ id, width: 1, height: 2 })),
  ...['match', 'bust', 'stage', 'void', 'skull_and_roses', 'wither', 'baroque', 'humble'].map(
    (id) => ({ id, width: 2, height: 2 }),
  ),
  ...['fighters', 'changing', 'finding', 'lowmist', 'passage'].map((id) => ({
    id,
    width: 4,
    height: 2,
  })),
  ...['pointer', 'pigscene', 'burning_skull', 'unpacked', 'orb'].map((id) => ({
    id,
    width: 4,
    height: 4,
  })),
  ...['skeleton', 'donkey_kong'].map((id) => ({ id, width: 4, height: 3 })),
  ...['backyard', 'pond'].map((id) => ({ id, width: 3, height: 4 })),
  ...['bouquet', 'cavebird', 'cotan', 'endboss', 'fern', 'owlemons', 'sunflowers', 'tides'].map(
    (id) => ({ id, width: 3, height: 3 }),
  ),
  ...['earth', 'wind', 'water', 'fire'].map((id) => ({
    id,
    width: 2,
    height: 2,
    placeable: false,
  })),
].map((variant) => ({ ...variant, assetPath: paintingTextureResource(variant.id) }));

let activePaintingVariants: readonly PaintingVariant[] = PAINTING_VARIANTS;

/** The catalog service publishes the active source snapshot read by core helpers. */
export function setActivePaintingVariants(entries: readonly PaintingVariant[]): void {
  activePaintingVariants = entries.map((entry) => ({ ...entry }));
}

export function allPaintingVariants(): readonly PaintingVariant[] {
  return activePaintingVariants;
}

export function paintingVariant(id: string | undefined): PaintingVariant | undefined {
  return allPaintingVariants().find((entry) => entry.id === id || `minecraft:${entry.id}` === id);
}

export function placeablePaintingVariants(): readonly PaintingVariant[] {
  return allPaintingVariants().filter((entry) => entry.placeable !== false);
}

export function chooseRandomPaintingVariant(
  width: number,
  height: number,
  random = Math.random,
): PaintingVariant | undefined {
  const candidates = placeablePaintingVariants().filter(
    (entry) => entry.width <= width && entry.height <= height,
  );
  if (!candidates.length) return undefined;
  const largestArea = Math.max(...candidates.map((entry) => entry.width * entry.height));
  const largest = candidates.filter((entry) => entry.width * entry.height === largestArea);
  return largest[Math.floor(Math.max(0, Math.min(0.999999, random())) * largest.length)];
}

/** Parses painting variants and their placeable tag from one resource provider. */
export function loadPaintingVariants(
  provider: AssetResourceProvider & { paths?: () => readonly string[] },
  sourceId = 'vanilla',
  sourceName = 'Vanilla',
): readonly PaintingVariant[] {
  const paths = provider.paths?.() ?? [];
  const placeable = new Set<string>();
  for (const path of paths.filter((value) =>
    /^data\/[^/]+\/tags\/painting_variant\/placeable\.json$/.test(value),
  )) {
    const raw = provider.readJson(path);
    const values =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)['values']
        : undefined;
    if (Array.isArray(values))
      for (const value of values)
        if (typeof value === 'string' && !value.startsWith('#'))
          placeable.add(value.includes(':') ? value : `minecraft:${value}`);
  }
  const loaded = paths
    .filter((path) => /^data\/[^/]+\/painting_variant\/.+\.json$/.test(path))
    .map((path): PaintingVariant | undefined => {
      const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path)!;
      const raw = provider.readJson(path);
      const value =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const width = Number(value['width']);
      const height = Number(value['height']);
      const asset =
        typeof value['asset_id'] === 'string' ? value['asset_id'] : `${match[1]}:${match[2]}`;
      const id = `${match[1]}:${match[2]}`;
      return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
        ? {
            id,
            width,
            height,
            assetPath: paintingTextureResource(asset, match[1]),
            ...(placeable.size ? { placeable: placeable.has(id) } : {}),
            sourceId,
            sourceName,
          }
        : undefined;
    })
    .filter((entry): entry is PaintingVariant => !!entry);
  return loaded.length ? loaded : sourceId === 'vanilla' ? PAINTING_VARIANTS : [];
}
