import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  ContentSourceSelectorComponent,
  horizontalScrollState,
  horizontalScrollTarget,
  shouldConsumeHorizontalWheel,
} from './content-source-selector.component';

describe('ContentSourceSelectorComponent navigation', () => {
  it('renders source buttons and emits source/manage actions', async () => {
    await TestBed.configureTestingModule({ imports: [ContentSourceSelectorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ContentSourceSelectorComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('sources', [{ id: 'all', label: 'All' }, { id: 'vanilla', label: 'Vanilla' }]);
    fixture.detectChanges();

    const selected: string[] = [];
    let managed = false;
    component.selectionChange.subscribe((id) => selected.push(id));
    component.manageRequested.subscribe(() => { managed = true; });
    const sourceButtons = fixture.nativeElement.querySelectorAll('.source-option');
    expect(sourceButtons).toHaveLength(2);
    sourceButtons[1].click();
    fixture.nativeElement.querySelector('.source-manage').click();
    expect(selected).toEqual(['vanilla']);
    expect(managed).toBe(true);
  });

  it('calculates overflow state and bounded navigation targets', () => {
    expect(horizontalScrollState(0, 100, 100)).toEqual({ canScrollLeft: false, canScrollRight: false });
    expect(horizontalScrollState(0, 100, 300)).toEqual({ canScrollLeft: false, canScrollRight: true });
    expect(horizontalScrollState(100, 100, 300)).toEqual({ canScrollLeft: true, canScrollRight: true });
    expect(horizontalScrollState(200, 100, 300)).toEqual({ canScrollLeft: true, canScrollRight: false });
    expect(horizontalScrollTarget(0, 100, 300, 'right')).toBe(96);
    expect(horizontalScrollTarget(200, 100, 300, 'right')).toBe(200);
    expect(horizontalScrollTarget(0, 100, 300, 'left')).toBe(0);
  });

  it('keeps both arrow controls visible in the DOM while toggling disabled state', async () => {
    await TestBed.configureTestingModule({ imports: [ContentSourceSelectorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ContentSourceSelectorComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('sources', [{ id: 'all', label: 'All' }]);
    fixture.detectChanges();
    const arrows = fixture.nativeElement.querySelectorAll('.source-scroll');
    expect(arrows).toHaveLength(2);
    expect(arrows[0].disabled).toBe(true);
    expect(arrows[1].disabled).toBe(true);
    const strip = fixture.nativeElement.querySelector('.source-options') as HTMLElement;
    Object.defineProperties(strip, { clientWidth: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 300 } });
    component['updateScrollState']();
    fixture.detectChanges();
    expect(arrows[0].disabled).toBe(true);
    expect(arrows[1].disabled).toBe(false);
  });

  it('reveals the selected source without changing selection semantics', async () => {
    await TestBed.configureTestingModule({ imports: [ContentSourceSelectorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ContentSourceSelectorComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('sources', [{ id: 'all', label: 'All' }, { id: 'mod', label: 'Mod' }]);
    fixture.componentRef.setInput('selectedId', 'mod');
    fixture.detectChanges();
    const selected = fixture.nativeElement.querySelector('[data-source-id="mod"]') as HTMLElement;
    const scrollIntoView = vi.fn();
    selected.scrollIntoView = scrollIntoView;
    component['revealSelected']();
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' });
  });

  it('consumes wheel movement only when horizontal content can move', () => {
    expect(shouldConsumeHorizontalWheel(0, 20, 0, 100, 300)).toBe(true);
    expect(shouldConsumeHorizontalWheel(0, -20, 100, 100, 300)).toBe(true);
    expect(shouldConsumeHorizontalWheel(0, -20, 0, 100, 300)).toBe(false);
    expect(shouldConsumeHorizontalWheel(0, 20, 200, 100, 300)).toBe(false);
    expect(shouldConsumeHorizontalWheel(12, 20, 0, 100, 300)).toBe(true);
  });
});
