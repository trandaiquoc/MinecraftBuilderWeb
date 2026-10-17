import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ViewportOverlayStackComponent } from './viewport-overlay-stack.component';

describe('ViewportOverlayStackComponent', () => {
  let fixture: ComponentFixture<ViewportOverlayStackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewportOverlayStackComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => key } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ViewportOverlayStackComponent);
  });

  it('places placement feedback after empty-project guidance in the same overlay stack', () => {
    fixture.componentRef.setInput('project', { blocks: [], decorations: [] });
    fixture.componentRef.setInput('hasActiveBlock', true);
    fixture.componentRef.setInput('placementStatus', 'valid');
    fixture.componentRef.setInput('target', '2, 0, 3');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const stack = host.querySelector('.viewport-overlay-stack');
    const emptyState = host.querySelector('app-viewport-empty-state');
    const guidance = host.querySelector('app-viewport-empty-state .viewport-starter');
    const status = host.querySelector('.viewport-status');

    expect(stack).not.toBeNull();
    expect(guidance?.getAttribute('data-guidance')).toBe('place');
    expect(status?.getAttribute('data-status')).toBe('valid');
    expect(status?.textContent).toContain('2, 0, 3');
    expect(emptyState?.parentElement).toBe(stack);
    expect(status?.parentElement).toBe(stack);
    expect(emptyState?.compareDocumentPosition(status!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('keeps placement feedback when a populated project has no starter card', () => {
    fixture.componentRef.setInput('project', { blocks: [{} as never], decorations: [] });
    fixture.componentRef.setInput('placementStatus', 'warning');
    fixture.componentRef.setInput('placementReason', 'Needs support');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const status = host.querySelector('.viewport-status');
    expect(host.querySelector('.viewport-starter')).toBeNull();
    expect(status?.getAttribute('data-status')).toBe('warning');
    expect(status?.textContent).toContain('warning');
    expect(status?.textContent).toContain('Needs support');
  });

  it('shows target-only hover details without inventing a placement result', () => {
    fixture.componentRef.setInput('target', '1, 0, 1');
    fixture.detectChanges();

    const status = (fixture.nativeElement as HTMLElement).querySelector('.viewport-status');
    expect(status?.hasAttribute('data-status')).toBe(false);
    expect(status?.textContent).toContain('1, 0, 1');
    expect(status?.textContent).not.toContain('invalid');
  });
});
