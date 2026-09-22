import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { PaintingPickerComponent } from './painting-picker.component';

describe('PaintingPickerComponent', () => {
  it('reacts when the source input changes after creation', async () => {
    await TestBed.configureTestingModule({ imports: [PaintingPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PaintingPickerComponent);
    const catalog = TestBed.inject(PaintingVariantCatalogService);
    catalog.replaceSource('example-paintings', [{ id: 'example:poster', width: 2, height: 1, assetPath: 'example:painting/poster', sourceId: 'example-paintings', sourceName: 'Example' }]);
    fixture.componentRef.setInput('sourceId', '__minecraftbuilder_all__');
    fixture.detectChanges();
    expect([...fixture.nativeElement.querySelectorAll('.painting-card')].some((card) => card.textContent.includes('Poster'))).toBe(true);
    fixture.componentRef.setInput('sourceId', 'example-paintings');
    fixture.detectChanges();
    const cards = [...fixture.nativeElement.querySelectorAll('.painting-card')];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain('Poster');
    catalog.removeSource('example-paintings');
  });
});
