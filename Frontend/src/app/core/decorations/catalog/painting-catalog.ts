import { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import { PaintingVariant, PAINTING_VARIANTS } from '../decoration.types';

export class PaintingVariantCatalog {
  private entries: readonly PaintingVariant[] = PAINTING_VARIANTS;
  load(provider: AssetResourceProvider & { paths?: () => readonly string[] }): void {
    const paths = provider.paths?.() ?? [];
    const loaded = paths.filter((path) => /^data\/[^/]+\/painting_variant\/[^/]+\.json$/.test(path)).map((path) => {
      const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path)!;
      const raw = provider.readJson(path); const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const width = Number(value['width']); const height = Number(value['height']); const asset = typeof value['asset_id'] === 'string' ? value['asset_id'] : `${match[1]}:${match[2]}`;
      return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 ? { id: `${match[1]}:${match[2]}`, width, height, assetPath: asset } : undefined;
    }).filter((entry): entry is PaintingVariant => !!entry);
    if (loaded.length) this.entries = loaded;
  }
  all(): readonly PaintingVariant[] { return this.entries; }
  placeable(): readonly PaintingVariant[] { return this.entries.filter((entry) => entry.placeable !== false); }
  get(id: string): PaintingVariant | undefined { return this.entries.find((entry) => entry.id === id || `${entry.id}` === id || `minecraft:${entry.id}` === id); }
}
