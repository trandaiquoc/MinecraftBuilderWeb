import { Component, inject, input, output } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { LucideX } from '@lucide/angular';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import type { MissingProjectContentSummary } from '../../../../core/editor/state/missing-project-content-summary';

@Component({
  selector: 'app-missing-assets-dialog',
  imports: [CdkTrapFocus, LucideX],
  templateUrl: './missing-assets-dialog.component.html',
  styleUrl: './missing-assets-dialog.component.scss',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class MissingAssetsDialogComponent {
  protected readonly i18n = inject(I18nService);
  readonly summary = input.required<MissingProjectContentSummary>();
  readonly closed = output<void>();
}
