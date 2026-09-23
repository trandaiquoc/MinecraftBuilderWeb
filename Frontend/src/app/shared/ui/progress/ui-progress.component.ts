import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-ui-progress',
  template: `
    <div class="ui-progress" [class.is-indeterminate]="indeterminate()" [class.is-complete]="complete()" [class.is-compact]="compact()" role="progressbar"
      [attr.aria-label]="label() || null"
      [attr.aria-valuemin]="indeterminate() ? null : 0"
      [attr.aria-valuemax]="indeterminate() ? null : 100"
      [attr.aria-valuenow]="indeterminate() ? null : normalizedValue()">
      <div class="ui-progress__track"><span class="ui-progress__fill" [style.width.%]="indeterminate() ? null : normalizedValue()"></span></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiProgressComponent {
  readonly value = input<number | undefined>(undefined);
  readonly max = input(100);
  readonly indeterminate = input(false);
  readonly complete = input(false);
  readonly compact = input(false);
  readonly label = input('');

  protected normalizedValue(): number {
    const max = this.max();
    const value = this.value();
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    return Math.min(100, Math.max(0, (value! / max) * 100));
  }
}
