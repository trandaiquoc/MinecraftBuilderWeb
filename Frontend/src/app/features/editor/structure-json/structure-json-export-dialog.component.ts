import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideCopy, LucideDownload, LucideSave, LucideX } from '@lucide/angular';
import { ProjectDocument } from '../../../core/domain/project.types';
import { sanitizeFilename } from '../../../core/persistence/file-name';
import { createStructureJsonExample, serializeStructureJson, serializeStructureJsonValue, StructureJsonValidationCode, validateStructureJsonV1 } from '../../../core/persistence/structure-json/structure-json';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';

type CopyFeedback = 'success' | 'error' | undefined;
type StructureJsonTab = 'structure' | 'example' | 'ai';

@Component({
  selector: 'app-structure-json-export-dialog',
  imports: [CdkTrapFocus, LucideCopy, LucideDownload, LucideSave, LucideX, UiTooltipDirective],
  templateUrl: './structure-json-export-dialog.component.html',
  styleUrl: './structure-json-export-dialog.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class StructureJsonExportDialogComponent {
  protected readonly i18n = inject(I18nService);
  readonly project = input.required<ProjectDocument>();
  readonly closed = output<void>();
  protected readonly tab = signal<StructureJsonTab>('structure');
  protected readonly savedJson = signal('');
  protected readonly draftJson = signal('');
  protected readonly validationError = signal<string | undefined>(undefined);
  protected readonly feedback = signal<CopyFeedback>(undefined);
  protected readonly downloadGuardOpen = signal(false);
  protected readonly dirty = computed(() => this.savedJson() !== this.draftJson());
  protected readonly exampleJson = computed(() => serializeStructureJsonValue(createStructureJsonExample()));
  protected readonly aiInstructions = computed(() => this.i18n.t('structureJsonAiInstructions'));
  protected readonly aiWorkflow = computed(() => this.i18n.t('structureJsonAiWorkflow'));
  protected readonly tabs: readonly StructureJsonTab[] = ['structure', 'example', 'ai'];

  ngOnInit(): void {
    const snapshot = serializeStructureJson(this.project());
    this.savedJson.set(snapshot);
    this.draftJson.set(snapshot);
  }

  protected onEscape(): void { if (this.downloadGuardOpen()) this.downloadGuardOpen.set(false); else this.close(); }
  protected close(): void { this.closed.emit(); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  protected projectName(): string { return this.project().metadata.name; }
  protected blockCount(): number { return this.project().blocks.length; }
  protected setTab(tab: StructureJsonTab): void { this.tab.set(tab); this.feedback.set(undefined); }
  protected handleTabKeydown(event: KeyboardEvent): void {
    const index = this.tabs.indexOf(this.tab());
    const next = event.key === 'ArrowRight' ? (index + 1) % this.tabs.length : event.key === 'ArrowLeft' ? (index + this.tabs.length - 1) % this.tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? this.tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); this.setTab(this.tabs[next]); }
  }
  protected setDraftJson(value: string): void { this.draftJson.set(value); this.validationError.set(undefined); this.feedback.set(undefined); }
  protected saveChanges(): boolean {
    const result = validateStructureJsonV1(this.draftJson());
    if (!result.valid) { this.validationError.set(this.validationMessage(result.code, result.path)); this.tab.set('structure'); return false; }
    this.savedJson.set(this.draftJson());
    this.validationError.set(undefined);
    return true;
  }
  protected discardChanges(): void { this.draftJson.set(this.savedJson()); this.validationError.set(undefined); this.feedback.set(undefined); }
  protected async copyJson(): Promise<void> { await this.copy(this.draftJson()); }
  protected async copyExample(): Promise<void> { await this.copy(this.exampleJson()); }
  protected async copyInstructions(): Promise<void> { await this.copy(this.aiInstructions()); }
  protected download(): void { if (this.dirty()) this.downloadGuardOpen.set(true); else this.downloadText(this.savedJson()); }
  protected downloadSaved(): void { this.downloadGuardOpen.set(false); this.downloadText(this.savedJson()); }
  protected saveAndDownload(): void { if (this.saveChanges()) { this.downloadGuardOpen.set(false); this.downloadText(this.savedJson()); } }
  protected tabLabel(tab: StructureJsonTab): string { return this.i18n.t(tab === 'structure' ? 'structureJsonTab' : tab === 'example' ? 'structureJsonExampleTab' : 'structureJsonAiTab'); }
  protected validationMessage(code: StructureJsonValidationCode | undefined, path?: string): string {
    const key = code === 'invalid-json' ? 'structureJsonValidationInvalidJson' : code === 'format' ? 'structureJsonValidationFormat' : code === 'version' ? 'structureJsonValidationVersion' : code === 'minecraft-version' ? 'structureJsonValidationMinecraftVersion' : code === 'blocks' ? 'structureJsonValidationBlocks' : code === 'block' ? 'structureJsonValidationBlock' : 'structureJsonValidationShape';
    return `${this.i18n.t(key)}${path ? ` (${path})` : ''}`;
  }
  private downloadText(value: string): void {
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${sanitizeFilename(this.project().metadata.name)}.structure.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  private async copy(value: string): Promise<void> {
    try { if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(value); this.feedback.set('success'); } catch { this.feedback.set('error'); }
  }
}
