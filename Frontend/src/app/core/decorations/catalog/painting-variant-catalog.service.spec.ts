import { describe, expect, it } from 'vitest';
import { PaintingVariantCatalogService } from './painting-variant-catalog.service';

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
});
