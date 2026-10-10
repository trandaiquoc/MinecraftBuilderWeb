import { Injectable, computed, signal } from '@angular/core';
import { allPaintingVariants, PAINTING_VARIANTS, PaintingVariant, setActivePaintingVariants } from '../decoration.types';

@Injectable({ providedIn: 'root' })
export class PaintingVariantCatalogService {
  private readonly revision = signal(0);
  readonly variants = computed(() => {
    this.revision();
    return allPaintingVariants();
  });

  constructor() {
    setActivePaintingVariants(PAINTING_VARIANTS.map(normalizeVariant));
  }

  replaceSource(sourceId: string, variants: readonly PaintingVariant[]): void {
    const existing = this.variants().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId);
    this.publish([...existing, ...variants.map(normalizeVariant)]);
  }

  replaceSources(entries: readonly { readonly sourceId: string; readonly variants: readonly PaintingVariant[] }[]): void {
    if (!entries.length) return;
    const sourceIds = new Set(entries.map((entry) => entry.sourceId));
    const existing = this.variants().filter((entry) => !sourceIds.has(entry.sourceId ?? 'vanilla'));
    this.publish([...existing, ...entries.flatMap((entry) => entry.variants.map(normalizeVariant))]);
  }

  removeSource(sourceId: string): void {
    this.publish(this.variants().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId));
  }

  all(): readonly PaintingVariant[] {
    return this.variants();
  }

  placeable(sourceId = '__minecraftbuilder_all__'): readonly PaintingVariant[] {
    return this.variants().filter((entry) => entry.placeable !== false && (sourceId === '__minecraftbuilder_all__' || (entry.sourceId ?? 'vanilla') === sourceId));
  }

  get(id: string | undefined): PaintingVariant | undefined {
    if (!id) return undefined;
    return this.variants().find((entry) => entry.id === id || `minecraft:${entry.id}` === id);
  }

  private publish(entries: readonly PaintingVariant[]): void {
    setActivePaintingVariants(entries);
    this.revision.update((value) => value + 1);
  }
}

function normalizeVariant(entry: PaintingVariant): PaintingVariant { return { ...entry, sourceId: entry.sourceId ?? 'vanilla', sourceName: entry.sourceName ?? (entry.sourceId === 'vanilla' || !entry.sourceId ? 'Vanilla' : entry.sourceId) }; }
