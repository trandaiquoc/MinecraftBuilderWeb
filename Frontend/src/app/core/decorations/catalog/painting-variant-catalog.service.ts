import { Injectable, computed, signal } from '@angular/core';
import type { PaintingVariant } from '../decoration.types';
import {
  allPaintingVariants,
  findPaintingVariant,
  PAINTING_VARIANTS,
  setActivePaintingVariants,
} from './painting-catalog';

@Injectable({ providedIn: 'root' })
export class PaintingVariantCatalogService {
  private readonly revision = signal(0);
  readonly variants = computed(() => {
    this.revision();
    return allPaintingVariants();
  });

  constructor() {
    setActivePaintingVariants(PAINTING_VARIANTS.map((entry) => normalizeVariant(entry, 'vanilla')));
  }

  replaceSource(sourceId: string, variants: readonly PaintingVariant[]): void {
    const existing = this.variants().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId);
    this.publish([...existing, ...variants.map((entry) => normalizeVariant(entry, sourceId))]);
  }

  replaceSources(
    entries: readonly {
      readonly sourceId: string;
      readonly variants: readonly PaintingVariant[];
    }[],
  ): void {
    if (!entries.length) return;
    const sourceIds = new Set(entries.map((entry) => entry.sourceId));
    const existing = this.variants().filter((entry) => !sourceIds.has(entry.sourceId ?? 'vanilla'));
    this.publish([
      ...existing,
      ...entries.flatMap(({ sourceId, variants }) =>
        variants.map((entry) => normalizeVariant(entry, sourceId)),
      ),
    ]);
  }

  removeSource(sourceId: string): void {
    this.publish(this.variants().filter((entry) => (entry.sourceId ?? 'vanilla') !== sourceId));
  }

  all(): readonly PaintingVariant[] {
    return this.variants();
  }

  placeable(sourceId = '__minecraftbuilder_all__'): readonly PaintingVariant[] {
    return this.variants().filter(
      (entry) =>
        entry.placeable !== false &&
        (sourceId === '__minecraftbuilder_all__' || (entry.sourceId ?? 'vanilla') === sourceId),
    );
  }

  get(id: string | undefined): PaintingVariant | undefined {
    return findPaintingVariant(this.variants(), id);
  }

  private publish(entries: readonly PaintingVariant[]): void {
    setActivePaintingVariants(entries);
    this.revision.update((value) => value + 1);
  }
}

function normalizeVariant(entry: PaintingVariant, sourceId: string): PaintingVariant {
  return {
    ...entry,
    sourceId,
    sourceName: entry.sourceName ?? (sourceId === 'vanilla' ? 'Vanilla' : sourceId),
  };
}
