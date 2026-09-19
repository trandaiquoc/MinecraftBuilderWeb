import { Directive, input } from '@angular/core';

/** Small CSS-backed tooltip for compact action controls. */
@Directive({
  selector: '[uiTooltip]',
  host: {
    '[attr.data-tooltip]': 'uiTooltip()',
    class: 'ui-tooltip-target',
  },
})
export class UiTooltipDirective {
  readonly uiTooltip = input.required<string>();
}
