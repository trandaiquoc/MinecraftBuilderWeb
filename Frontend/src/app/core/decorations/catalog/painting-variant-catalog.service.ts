import { Injectable, signal } from '@angular/core';
import { allPaintingVariants, PAINTING_VARIANTS, PaintingVariant, registerPaintingVariants, unregisterPaintingVariants } from '../decoration.types';

@Injectable({ providedIn: 'root' })
export class PaintingVariantCatalogService {
  private readonly entries = signal<readonly PaintingVariant[]>(PAINTING_VARIANTS);
  readonly variants = this.entries.asReadonly();
  replaceSource(sourceId: string, variants: readonly PaintingVariant[]): void {
    unregisterPaintingVariants(sourceId);
    if (sourceId !== 'vanilla') registerPaintingVariants(variants);
    const existing = this.entries().filter((entry) => entry.sourceId !== sourceId && !(sourceId === 'vanilla' && !entry.sourceId));
    this.entries.set([...existing, ...variants]);
  }
  removeSource(sourceId: string): void { unregisterPaintingVariants(sourceId); this.entries.update((entries) => entries.filter((entry) => entry.sourceId !== sourceId)); }
  all(): readonly PaintingVariant[] { return this.entries().length ? this.entries() : allPaintingVariants(); }
  placeable(): readonly PaintingVariant[] { return this.entries().filter((entry) => entry.placeable !== false); }
  get(id: string | undefined): PaintingVariant | undefined { if (!id) return undefined; return this.entries().find((entry) => entry.id === id || `minecraft:${entry.id}` === id); }
}
