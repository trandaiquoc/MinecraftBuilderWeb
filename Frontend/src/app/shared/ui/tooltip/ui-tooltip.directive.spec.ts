import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { UiTooltipDirective } from './ui-tooltip.directive';

@Component({ standalone: true, imports: [UiTooltipDirective], template: '<button type="button" uiTooltip="Settings">Settings</button>' })
class TooltipHostComponent {}

describe('UiTooltipDirective lifecycle', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('suppresses the current tooltip after activation, then allows a fresh hover/focus cycle', async () => {
    await TestBed.configureTestingModule({ imports: [TooltipHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TooltipHostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    button.dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(button.classList.contains('ui-tooltip-suppressed')).toBe(false);

    button.dispatchEvent(new PointerEvent('pointerdown'));
    button.click();
    fixture.detectChanges();
    expect(button.classList.contains('ui-tooltip-suppressed')).toBe(true);

    button.dispatchEvent(new PointerEvent('pointerleave'));
    button.dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(button.classList.contains('ui-tooltip-suppressed')).toBe(false);

    button.dispatchEvent(new FocusEvent('focusin'));
    fixture.detectChanges();
    expect(button.classList.contains('ui-tooltip-suppressed')).toBe(false);
  });
});
