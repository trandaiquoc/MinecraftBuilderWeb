import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { PaintingVariantCatalogService } from './painting-variant-catalog.service';
import { PaintingVariantCatalog } from './painting-catalog';

describe('PaintingVariantCatalogService', () => {
  it('normalizes legacy vanilla variants and filters external paintings by source', () => {
    const catalog = new PaintingVariantCatalogService();
    expect(catalog.placeable('vanilla').length).toBeGreaterThan(0);
    catalog.replaceSource('example-paintings', [{ id: 'example:poster', width: 2, height: 1, assetPath: 'example:painting/poster', sourceId: 'example-paintings', sourceName: 'Example Paintings' }]);
    expect(catalog.placeable('example-paintings').map((entry) => entry.id)).toEqual(['example:poster']);
    expect(catalog.placeable('vanilla').some((entry) => entry.id === 'example:poster')).toBe(false);
    expect(catalog.placeable().some((entry) => entry.id === 'example:poster')).toBe(true);
    catalog.removeSource('example-paintings');
    expect(catalog.placeable().some((entry) => entry.id === 'example:poster')).toBe(false);
  });

  it('canonicalizes asset ids when loading a source catalog', () => {
    const catalog = new PaintingVariantCatalog();
    catalog.load({
      paths: () => ['data/example/painting_variant/gallery.json'],
      readJson: () => ({ width: 1, height: 1, asset_id: 'example:gallery/poster' }),
    }, 'example-source', 'Example');
    expect(catalog.get('example:gallery')).toMatchObject({ assetPath: 'example:painting/gallery/poster' });
  });

  it('makes painting lookups reactive for renderer refreshes', () => {
    const catalog = new PaintingVariantCatalogService();
    const assetPath = computed(() => catalog.get('example:poster')?.assetPath);
    expect(assetPath()).toBeUndefined();
    catalog.replaceSource('example-paintings', [{ id: 'example:poster', width: 1, height: 1, assetPath: 'example:painting/poster', sourceId: 'example-paintings' }]);
    expect(assetPath()).toBe('example:painting/poster');
  });
});
