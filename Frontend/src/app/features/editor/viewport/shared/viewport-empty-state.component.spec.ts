import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ViewportEmptyStateComponent } from './viewport-empty-state.component';

describe('ViewportEmptyStateComponent', () => {
  let fixture: ComponentFixture<ViewportEmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewportEmptyStateComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => key } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ViewportEmptyStateComponent);
  });

  it('shows a politely announced starter card with a visual build cue', () => {
    fixture.componentRef.setInput('project', { blocks: [], decorations: [] });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const status = host.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-atomic')).toBe('true');
    expect(status?.getAttribute('data-guidance')).toBe('choose');
    expect(status?.textContent).toContain('viewportEmptyTitle');
    expect(status?.textContent).toContain('viewportEmptyChooseBlockHint');
    expect(status?.textContent).toContain('viewportEmptyNextChoose');
    expect(host.querySelector('.starter-art[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('updates the next step for the selected item, decoration support, and Select tool', () => {
    fixture.componentRef.setInput('project', { blocks: [], decorations: [] });
    fixture.componentRef.setInput('hasActiveBlock', true);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent,
    ).toContain('viewportEmptyNextPlace');

    fixture.componentRef.setInput('hasActiveDecoration', true);
    fixture.detectChanges();
    const supportState = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
    expect(supportState?.getAttribute('data-guidance')).toBe('support');
    expect(supportState?.textContent).toContain('viewportEmptySupportHint');
    expect(supportState?.textContent).toContain('viewportEmptyNextSupport');

    fixture.componentRef.setInput('tool', 'select');
    fixture.detectChanges();
    const selectState = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
    expect(selectState?.getAttribute('data-guidance')).toBe('select');
    expect(selectState?.textContent).toContain('viewportEmptySelectHint');
    expect(selectState?.textContent).toContain('viewportEmptyNextSwitch');
  });

  it('stays out of the way once blocks or decorations are present', () => {
    fixture.componentRef.setInput('project', { blocks: [{} as never], decorations: [] });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')).toBeNull();

    fixture.componentRef.setInput('project', { blocks: [], decorations: [{} as never] });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')).toBeNull();
  });
});
