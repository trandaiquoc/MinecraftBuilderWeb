import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideCopy, LucideDownload, LucideX } from '@lucide/angular';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { sanitizeFilename } from '../../../core/persistence/file-name';
import { createStructureJsonExample, serializeStructureJson, serializeStructureJsonValue } from '../../../core/persistence/structure-json/structure-json';
import { ProjectDocument } from '../../../core/domain/project.types';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';

type CopyFeedback = 'success' | 'error' | undefined;

@Component({
  selector: 'app-structure-json-export-dialog',
  imports: [CdkTrapFocus, LucideCopy, LucideDownload, LucideX, UiTooltipDirective],
  templateUrl: './structure-json-export-dialog.component.html',
  styleUrl: './structure-json-export-dialog.component.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class StructureJsonExportDialogComponent {
  protected readonly i18n = inject(I18nService);
  readonly project = input.required<ProjectDocument>();
  readonly closed = output<void>();
  protected readonly serialized = signal('');
  protected readonly feedback = signal<CopyFeedback>(undefined);
  protected readonly preview = computed(() => {
    const value = this.serialized();
    return value.length > 6000 ? `${value.slice(0, 6000)}\n…` : value;
  });
  protected readonly aiInstructions = computed(() => this.i18n.t('structureJsonAiInstructions'));

  ngOnInit(): void { this.serialized.set(serializeStructureJson(this.project())); }

  protected close(): void { this.closed.emit(); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  protected projectName(): string { return this.project().metadata.name; }
  protected blockCount(): number { return this.project().blocks.length; }
  protected async copyJson(): Promise<void> { await this.copy(this.serialized()); }
  protected async copyExample(): Promise<void> { await this.copy(serializeStructureJsonValue(createStructureJsonExample())); }
  protected async copyInstructions(): Promise<void> { await this.copy(this.aiInstructions()); }
  protected download(): void {
    const url = URL.createObjectURL(new Blob([this.serialized()], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFilename(this.project().metadata.name)}.structure.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async copy(value: string): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      this.feedback.set('success');
    } catch {
      this.feedback.set('error');
    }
  }
}
