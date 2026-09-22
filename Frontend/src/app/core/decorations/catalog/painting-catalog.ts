import { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import { PaintingVariant, PAINTING_VARIANTS } from '../decoration.types';

/** Source-aware catalog shared by Vanilla and external resource providers. */
export class PaintingVariantCatalog {
  private readonly contributions = new Map<string, readonly PaintingVariant[]>([['vanilla', PAINTING_VARIANTS]]);

  load(provider: AssetResourceProvider & { paths?: () => readonly string[] }, sourceId = 'vanilla', sourceName = 'Vanilla'): void {
    const paths = provider.paths?.() ?? [];
    const loaded = paths.filter((path) => /^data\/[^/]+\/painting_variant\/.+\.json$/.test(path)).map((path): PaintingVariant | undefined => {
      const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path)!;
      const raw = provider.readJson(path); const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const width = Number(value['width']); const height = Number(value['height']); const asset = typeof value['asset_id'] === 'string' ? value['asset_id'] : `${match[1]}:${match[2]}`;
      return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 ? { id: `${match[1]}:${match[2]}`, width, height, assetPath: asset, sourceId, sourceName } : undefined;
    }).filter((entry): entry is PaintingVariant => !!entry);
    this.contributions.set(sourceId, loaded.length ? loaded : sourceId === 'vanilla' ? PAINTING_VARIANTS : []);
  }
  replaceSource(sourceId: string, entries: readonly PaintingVariant[]): void { this.contributions.set(sourceId, entries); }
  removeSource(sourceId: string): void { if (sourceId !== 'vanilla') this.contributions.delete(sourceId); }
  all(): readonly PaintingVariant[] { return [...this.contributions.values()].flat(); }
  placeable(): readonly PaintingVariant[] { return this.all().filter((entry) => entry.placeable !== false); }
  get(id: string): PaintingVariant | undefined { return this.all().find((entry) => entry.id === id || `minecraft:${entry.id}` === id); }
}
