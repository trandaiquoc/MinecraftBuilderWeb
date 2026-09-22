import { Injectable, signal } from '@angular/core';
import { allPaintingVariants, PAINTING_VARIANTS, PaintingVariant, registerPaintingVariants, unregisterPaintingVariants } from '../decoration.types';

@Injectable({ providedIn: 'root' })
export class PaintingVariantCatalogService {
  private readonly entries = signal<readonly PaintingVariant[]>(PAINTING_VARIANTS.map(normalizeVariant));
  readonly variants = this.entries.asReadonly();
  replaceSource(sourceId: string, variants: readonly PaintingVariant[]): void {
    unregisterPaintingVariants(sourceId);
    if (sourceId !== 'vanilla') registerPaintingVariants(variants);
    const existing = this.entries().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId);
    this.entries.set([...existing, ...variants.map(normalizeVariant)]);
  }
  removeSource(sourceId: string): void { unregisterPaintingVariants(sourceId); this.entries.update((entries) => entries.filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId)); }
  all(): readonly PaintingVariant[] { return this.entries().length ? this.entries() : allPaintingVariants().map(normalizeVariant); }
  placeable(sourceId = '__minecraftbuilder_all__'): readonly PaintingVariant[] { return this.entries().filter((entry) => entry.placeable !== false && (sourceId === '__minecraftbuilder_all__' || (entry.sourceId ?? 'vanilla') === sourceId)); }
  get(id: string | undefined): PaintingVariant | undefined { if (!id) return undefined; return this.entries().find((entry) => entry.id === id || `minecraft:${entry.id}` === id); }
}

function normalizeVariant(entry: PaintingVariant): PaintingVariant { return { ...entry, sourceId: entry.sourceId ?? 'vanilla', sourceName: entry.sourceName ?? (entry.sourceId === 'vanilla' || !entry.sourceId ? 'Vanilla' : entry.sourceId) }; }
