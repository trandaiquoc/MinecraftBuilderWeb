import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { PaintingVariantCatalogService } from './painting-variant-catalog.service';
import { allPaintingVariants, loadPaintingVariants, paintingVariant } from './painting-catalog';

describe('PaintingVariantCatalogService', () => {
  it('normalizes legacy vanilla variants and filters external paintings by source', () => {
    const catalog = new PaintingVariantCatalogService();
    expect(catalog.placeable('vanilla').length).toBeGreaterThan(0);
    catalog.replaceSource('example-paintings', [
      {
        id: 'example:poster',
        width: 2,
        height: 1,
        assetPath: 'example:painting/poster',
        sourceId: 'example-paintings',
        sourceName: 'Example Paintings',
      },
    ]);
    expect(catalog.placeable('example-paintings').map((entry) => entry.id)).toEqual([
      'example:poster',
    ]);
    expect(catalog.placeable('vanilla').some((entry) => entry.id === 'example:poster')).toBe(false);
    expect(catalog.placeable().some((entry) => entry.id === 'example:poster')).toBe(true);
    catalog.removeSource('example-paintings');
    expect(catalog.placeable().some((entry) => entry.id === 'example:poster')).toBe(false);
  });

  it('assigns replacement ownership to variants without source metadata', () => {
    const catalog = new PaintingVariantCatalogService();
    const variant = (id: string) => ({
      id,
      width: 2,
      height: 1,
      assetPath: `example:painting/${id.split(':')[1]}`,
    });

    catalog.replaceSource('example-paintings', [variant('example:first')]);
    expect(catalog.placeable('example-paintings').map((entry) => entry.id)).toEqual([
      'example:first',
    ]);
    expect(catalog.get('example:first')).toMatchObject({
      sourceId: 'example-paintings',
      sourceName: 'example-paintings',
    });

    catalog.replaceSource('example-paintings', [variant('example:second')]);
    expect(catalog.get('example:first')).toBeUndefined();
    expect(catalog.placeable('example-paintings').map((entry) => entry.id)).toEqual([
      'example:second',
    ]);

    catalog.removeSource('example-paintings');
    expect(catalog.get('example:second')).toBeUndefined();
  });

  it('canonicalizes asset ids when loading a source catalog', () => {
    const catalog = loadPaintingVariants(
      {
        paths: () => ['data/example/painting_variant/gallery.json'],
        readJson: () => ({ width: 1, height: 1, asset_id: 'example:gallery/poster' }),
      },
      'example-source',
      'Example',
    );
    expect(catalog[0]).toMatchObject({
      id: 'example:gallery',
      assetPath: 'example:painting/gallery/poster',
    });
  });

  it('makes painting lookups reactive for renderer refreshes', () => {
    const catalog = new PaintingVariantCatalogService();
    const assetPath = computed(() => catalog.get('example:poster')?.assetPath);
    expect(assetPath()).toBeUndefined();
    catalog.replaceSource('example-paintings', [
      {
        id: 'example:poster',
        width: 1,
        height: 1,
        assetPath: 'example:painting/poster',
        sourceId: 'example-paintings',
      },
    ]);
    expect(assetPath()).toBe('example:painting/poster');
    expect(catalog.variants()).toBe(allPaintingVariants());
    expect(paintingVariant('example:poster')).toBe(catalog.get('example:poster'));
    catalog.removeSource('example-paintings');
    expect(paintingVariant('example:poster')).toBeUndefined();
  });
});
