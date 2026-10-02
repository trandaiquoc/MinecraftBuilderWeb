import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReadonlyCodeViewerComponent } from './readonly-code-viewer.component';

describe('ReadonlyCodeViewerComponent', () => {
  it('renders aligned line numbers while keeping the raw source unchanged', async () => {
    await TestBed.configureTestingModule({ imports: [ReadonlyCodeViewerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ReadonlyCodeViewerComponent);
    fixture.componentRef.setInput('value', 'alpha\nbeta\ngamma');
    fixture.componentRef.setInput('lineCountLabel', '3 lines');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.readonly-code-viewer-gutter span').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.readonly-code-viewer-gutter')?.textContent).toContain('1');
    expect(fixture.nativeElement.querySelector('.readonly-code-viewer-code')?.textContent).toBe('alpha\nbeta\ngamma');
    expect(fixture.nativeElement.textContent).toContain('3 lines');
  });
});
