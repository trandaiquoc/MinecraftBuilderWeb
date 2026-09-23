import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, inject, input, output, signal } from '@angular/core';
import { LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideTriangleAlert, LucideUpload, LucideX } from '@lucide/angular';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { parseStructureJsonWithWorker, StructureJsonBlockIssue, StructureJsonCoordinateConflict, StructureJsonValidationPreview, validateParsedStructureJsonPreview } from '../../../core/persistence/structure-json/structure-json-import';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';

@Component({
  selector: 'app-structure-json-import-dialog',
  imports: [CdkTrapFocus, LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideTriangleAlert, LucideUpload, LucideX, UiTooltipDirective],
  templateUrl: './structure-json-import-dialog.component.html',
  styleUrl: './structure-json-import-dialog.component.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class StructureJsonImportDialogComponent {
  protected readonly i18n = inject(I18nService);
  private readonly library = inject(BlockLibraryService);
  readonly project = input.required<ProjectDocument>();
  readonly closed = output<void>();
  protected readonly draftJson = signal('');
  protected readonly preview = signal<StructureJsonValidationPreview | undefined>(undefined);
  protected readonly progress = signal<'idle' | 'reading' | 'parsing' | 'checking' | 'complete'>('idle');
  protected readonly fileInput = signal<HTMLInputElement | undefined>(undefined);
  private validationGeneration = 0;

  protected close(): void { this.validationGeneration += 1; this.closed.emit(); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  protected setDraft(value: string): void { this.draftJson.set(value); this.preview.set(undefined); this.progress.set('idle'); this.validationGeneration += 1; }
  protected async loadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.progress.set('reading'); this.preview.set(undefined); this.validationGeneration += 1;
    try { this.draftJson.set(await file.text()); this.progress.set('idle'); } catch { this.progress.set('idle'); }
  }
  protected async validate(): Promise<void> {
    const generation = ++this.validationGeneration;
    this.progress.set('parsing');
    const parsed = await parseStructureJsonWithWorker(this.draftJson());
    if (generation !== this.validationGeneration) return;
    if (!parsed.valid || !parsed.value) { this.preview.set({ structuralValid: false, structuralCode: parsed.code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, affectedDuplicateBlocks: 0, issues: { missing: [], bounds: [], state: [], duplicate: [] } }); this.progress.set('complete'); return; }
    this.progress.set('checking');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (generation !== this.validationGeneration) return;
    const result = validateParsedStructureJsonPreview(parsed.value, this.project().size, (id) => this.library.get(id));
    if (generation !== this.validationGeneration) return;
    this.preview.set(result); this.progress.set('complete');
  }
  protected progressLabel(): string { return this.i18n.t(`structureJsonProgress${this.progress()[0].toUpperCase()}${this.progress().slice(1)}`); }
  protected issueGroups(): readonly { readonly category: 'missing' | 'bounds' | 'state'; readonly label: string }[] { return [{ category: 'missing', label: this.i18n.t('structureJsonMissingBlocks') }, { category: 'bounds', label: this.i18n.t('structureJsonOutOfBounds') }, { category: 'state', label: this.i18n.t('structureJsonInvalidStates') }]; }
  protected issues(category: 'missing' | 'bounds' | 'state'): readonly StructureJsonBlockIssue[] { return (this.preview()?.issues[category] ?? []).slice(0, 12); }
  protected duplicateConflicts(): readonly StructureJsonCoordinateConflict[] { return (this.preview()?.issues.duplicate ?? []).slice(0, 12); }
  protected issueCount(category: 'missing' | 'bounds' | 'state' | 'duplicate'): number { return this.preview()?.issues[category].length ?? 0; }
  protected moreIssueCount(category: 'missing' | 'bounds' | 'state'): number { return Math.max(0, this.issueCount(category) - 12); }
  protected moreDuplicateCount(): number { return Math.max(0, this.issueCount('duplicate') - 12); }
  protected moreIssueLabel(category: 'missing' | 'bounds' | 'state'): string { return this.i18n.t('structureJsonMoreIssues').replace('{count}', `${this.moreIssueCount(category)}`); }
  protected reasonLabel(issue: StructureJsonBlockIssue): string { const reason = issue.reason; const key = reason.code === 'missing-block' ? 'structureJsonReasonMissingBlock' : reason.code === 'out-of-bounds' ? 'structureJsonReasonOutOfBounds' : reason.code === 'unknown-state-property' ? 'structureJsonReasonUnknownStateProperty' : 'structureJsonReasonUnsupportedStateValue'; return this.i18n.t(key); }
  protected structuralMessage(): string { const code = this.preview()?.structuralCode; const key = code === 'invalid-json' ? 'structureJsonValidationInvalidJson' : code === 'format' ? 'structureJsonValidationFormat' : code === 'version' ? 'structureJsonValidationVersion' : code === 'block' ? 'structureJsonValidationBlock' : 'structureJsonValidationShape'; return this.i18n.t(key); }
}
