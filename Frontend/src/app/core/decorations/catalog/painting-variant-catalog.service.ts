import { Injectable, signal } from '@angular/core';
import { allPaintingVariants, PAINTING_VARIANTS, PaintingVariant, setActivePaintingVariants } from '../decoration.types';

@Injectable({ providedIn: 'root' })
export class PaintingVariantCatalogService {
  private readonly entries = signal<readonly PaintingVariant[]>(PAINTING_VARIANTS.map(normalizeVariant));
  readonly variants = this.entries.asReadonly();
  constructor() { setActivePaintingVariants(this.entries()); }
  replaceSource(sourceId: string, variants: readonly PaintingVariant[]): void {
    const existing = this.entries().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId);
    const next = [...existing, ...variants.map(normalizeVariant)]; this.entries.set(next); setActivePaintingVariants(next);
  }
  removeSource(sourceId: string): void { const next = this.entries().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId); this.entries.set(next); setActivePaintingVariants(next); }
  all(): readonly PaintingVariant[] { return this.entries().length ? this.entries() : allPaintingVariants().map(normalizeVariant); }
  placeable(sourceId = '__minecraftbuilder_all__'): readonly PaintingVariant[] { return this.entries().filter((entry) => entry.placeable !== false && (sourceId === '__minecraftbuilder_all__' || (entry.sourceId ?? 'vanilla') === sourceId)); }
  get(id: string | undefined): PaintingVariant | undefined { if (!id) return undefined; this.entries(); return this.entries().find((entry) => entry.id === id || `minecraft:${entry.id}` === id); }
}

function normalizeVariant(entry: PaintingVariant): PaintingVariant { return { ...entry, sourceId: entry.sourceId ?? 'vanilla', sourceName: entry.sourceName ?? (entry.sourceId === 'vanilla' || !entry.sourceId ? 'Vanilla' : entry.sourceId) }; }
