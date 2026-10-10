import { Directive, input, signal } from '@angular/core';

/** Small CSS-backed tooltip for compact action controls. */
@Directive({
  selector: '[uiTooltip]',
  host: {
    '[attr.data-tooltip]': 'uiTooltip()',
    class: 'ui-tooltip-target',
    '[class.ui-tooltip-suppressed]': 'suppressed()',
    '(pointerenter)': 'handlePointerEnter()',
    '(pointerleave)': 'handlePointerLeave()',
    '(pointerdown)': 'handlePointerDown()',
    '(focusin)': 'handleFocusIn()',
    '(blur)': 'handleBlur()',
    '(click)': 'handleActivation()',
  },
})
export class UiTooltipDirective {
  readonly uiTooltip = input.required<string>();
  protected readonly suppressed = signal(false);
  private pointerInside = false;

  protected handlePointerEnter(): void {
    this.pointerInside = true;
    this.suppressed.set(false);
  }
  protected handlePointerLeave(): void {
    this.pointerInside = false;
    this.suppressed.set(false);
  }
  protected handlePointerDown(): void {
    this.pointerInside = true;
    this.suppressed.set(true);
  }
  protected handleFocusIn(): void {
    if (!this.pointerInside) this.suppressed.set(false);
  }
  protected handleBlur(): void {
    if (!this.pointerInside) this.suppressed.set(false);
  }
  protected handleActivation(): void {
    this.suppressed.set(true);
  }
}
