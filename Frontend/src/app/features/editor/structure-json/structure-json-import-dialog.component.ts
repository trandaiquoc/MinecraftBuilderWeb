import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideCheck, LucideX } from '@lucide/angular';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import { normalizeExternalAiContentLimits } from '../../../core/persistence/structure-json/external-ai-content-limits';
import type { ExternalAiContentLimits } from '../../../core/persistence/structure-json/external-ai-content-limits';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { ExternalAiWorkspaceComponent } from './external-ai-workspace.component';
import { StructureJsonImportWorkspaceComponent } from './structure-json-import-workspace.component';

type ImportDialogTab = 'import' | 'ai';

@Component({
  selector: 'app-structure-json-import-dialog',
  imports: [CdkTrapFocus, LucideCheck, LucideX, UiTooltipDirective, ExternalAiWorkspaceComponent, StructureJsonImportWorkspaceComponent],
  templateUrl: './structure-json-import-dialog.component.html',
  styleUrl: './structure-json-import-dialog.component.scss',
  host: { '(document:keydown.escape)': 'onEscape($event)', '(document:pointerdown)': 'onDocumentPointerDown($event)' },
})
export class StructureJsonImportDialogComponent {
  protected readonly i18n = inject(I18nService);
  private readonly library = inject(BlockLibraryService);
  protected readonly preferences = inject(UiPreferencesService);
  readonly project = input.required<ProjectDocument>();
  readonly closed = output<void>();
  protected readonly activeTab = signal<ImportDialogTab>('import');
  protected readonly tabs: readonly ImportDialogTab[] = ['import', 'ai'];
  protected readonly importWorkspace = viewChild(StructureJsonImportWorkspaceComponent);
  protected readonly placeableItems = computed(() => this.library.allPlaceableItems());
  protected readonly contentLimits = computed<ExternalAiContentLimits>(() => normalizeExternalAiContentLimits(this.preferences.preferences().externalAiContentLimits, this.placeableItems()));
  protected readonly contentLimitsEnabled = computed(() => this.preferences.preferences().externalAiContentLimitsEnabled);

  protected close(): void {
    this.importWorkspace()?.cancelPendingWork();
    this.closed.emit();
  }

  protected onEscape(event: Event): void {
    const closedSelector = this.aiWorkspace()?.closeContentSelector();
    if (closedSelector) { event.stopPropagation(); return; }
    this.close();
  }

  protected onDocumentPointerDown(event: Event): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.ai-mod-content-selector')) return;
    this.aiWorkspace()?.closeContentSelector();
  }

  protected setTab(tab: ImportDialogTab): void { this.activeTab.set(tab); }
  protected applyImport(): void { void this.importWorkspace()?.applyImport(); }

  private readonly aiWorkspace = viewChild(ExternalAiWorkspaceComponent);
}
