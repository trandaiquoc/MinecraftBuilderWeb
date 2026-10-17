import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PaintingVariantCatalogService } from '../../../core/decorations/catalog/painting-variant-catalog.service';
import { PaintingPickerComponent } from './painting-picker.component';

describe('PaintingPickerComponent', () => {
  it('reacts when the source input changes after creation', async () => {
    await TestBed.configureTestingModule({
      imports: [PaintingPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PaintingPickerComponent);
    const catalog = TestBed.inject(PaintingVariantCatalogService);
    catalog.replaceSource('example-paintings', [
      {
        id: 'example:poster',
        width: 2,
        height: 1,
        assetPath: 'example:painting/poster',
        sourceId: 'example-paintings',
        sourceName: 'Example',
      },
    ]);
    fixture.componentRef.setInput('sourceId', '__theblocklaundromat_all__');
    fixture.detectChanges();
    expect(
      [...fixture.nativeElement.querySelectorAll('.painting-card')].some((card) =>
        card.textContent.includes('Poster'),
      ),
    ).toBe(true);
    fixture.componentRef.setInput('sourceId', 'example-paintings');
    fixture.detectChanges();
    const cards = [...fixture.nativeElement.querySelectorAll('.painting-card')];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain('Poster');
    catalog.removeSource('example-paintings');
  });

  it('shows an accessible empty state when a compact picker search has no matches', async () => {
    await TestBed.configureTestingModule({
      imports: [PaintingPickerComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PaintingPickerComponent);
    const catalog = TestBed.inject(PaintingVariantCatalogService);
    catalog.replaceSource('example-paintings', [
      {
        id: 'example:poster',
        width: 2,
        height: 1,
        assetPath: 'example:painting/poster',
        sourceId: 'example-paintings',
        sourceName: 'Example',
      },
    ]);
    fixture.componentRef.setInput('sourceId', 'example-paintings');
    fixture.componentRef.setInput('compact', true);
    fixture.componentRef.setInput('selectedId', 'example:poster');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.change-painting').click();
    fixture.detectChanges();
    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search.getAttribute('aria-label')).toBeTruthy();
    search.value = 'no matching artwork';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.painting-empty-state')?.textContent).toContain(
      'No paintings match your search.',
    );
    expect(fixture.nativeElement.querySelectorAll('.painting-card')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.painting-selected-preview')).toBeNull();
    catalog.removeSource('example-paintings');
  });
});
