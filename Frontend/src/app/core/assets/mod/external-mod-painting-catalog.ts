import type { PaintingVariant } from '../../decorations/decoration.types';
import { paintingTextureResource } from '../../decorations/decoration.types';
import { resolveResourceLocation } from '../../content/resource-location';
import { TagIndex } from '../../content/tag-index';

export function discoverPaintingVariants(json: Readonly<Record<string, unknown>>, sourceId: string, sourceName: string, tags?: TagIndex): readonly PaintingVariant[] {
  const placeable = new Set<string>();
  for (const [path, value] of Object.entries(json)) {
    if (!/^data\/[^/]+\/tags\/painting_variant\/placeable\.json$/.test(path)) continue;
    const entries = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>)['values'])
      ? (value as Record<string, unknown>)['values'] as unknown[] : [];
    entries.forEach((entry) => { if (typeof entry === 'string' && !entry.startsWith('#')) placeable.add(resolveResourceLocation(entry) ?? entry); });
  }
  return Object.entries(json).flatMap(([path, raw]) => {
    const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path);
    if (!match || !raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const value = raw as Record<string, unknown>;
    const width = Number(value['width']);
    const height = Number(value['height']);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return [];
    const id = `${match[1]}:${match[2]}`;
    const assetPath = typeof value['asset_id'] === 'string' ? paintingTextureResource(value['asset_id'], match[1]) : paintingTextureResource(match[2], match[1]);
    const tagPlaceable = tags ? (tags.hasMember('painting_variant', 'minecraft:placeable', id) || tags.hasMember('painting_variant', `${match[1]}:placeable`, id)) : undefined;
    return [{ id, width, height, assetPath, placeable: tagPlaceable ?? (placeable.size ? placeable.has(id) : true), sourceId, sourceName }];
  });
}
