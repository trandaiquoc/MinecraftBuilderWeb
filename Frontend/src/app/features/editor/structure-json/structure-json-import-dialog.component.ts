import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, inject, input, output, signal } from '@angular/core';
import { LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideTriangleAlert, LucideUpload, LucideX } from '@lucide/angular';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { HistoryService } from '../../../core/editor/history/history.service';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { parseStructureJsonWithWorker, StructureJsonBlockIssue, StructureJsonCoordinateConflict, StructureJsonValidationPreview, validateParsedStructureJsonPreviewAsync } from '../../../core/persistence/structure-json/structure-json-import';
import { applyStructureJsonImportPlan, buildStructureJsonImportPlan, StructureJsonImportBlocker, StructureJsonImportMode, StructureJsonImportPlan } from '../../../core/persistence/structure-json/structure-json-import-plan';
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
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly dialogs = inject(DialogService);
  readonly project = input.required<ProjectDocument>();
  readonly closed = output<void>();
  protected readonly draftJson = signal('');
  protected readonly preview = signal<StructureJsonValidationPreview | undefined>(undefined);
  protected readonly progress = signal<'idle' | 'reading' | 'parsing' | 'checking' | 'complete'>('idle');
  protected readonly checkingProgress = signal({ completed: 0, total: 0 });
  protected readonly importMode = signal<StructureJsonImportMode>('replace');
  protected readonly importPlan = signal<StructureJsonImportPlan | undefined>(undefined);
  protected readonly importModes: readonly StructureJsonImportMode[] = ['replace', 'merge', 'new-group'];
  protected readonly fileInput = signal<HTMLInputElement | undefined>(undefined);
  private validationGeneration = 0;

  protected close(): void { this.validationGeneration += 1; this.closed.emit(); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  protected setDraft(value: string): void { this.draftJson.set(value); this.preview.set(undefined); this.importPlan.set(undefined); this.importMode.set('replace'); this.progress.set('idle'); this.checkingProgress.set({ completed: 0, total: 0 }); this.validationGeneration += 1; }
  protected async loadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.progress.set('reading'); this.preview.set(undefined); this.importPlan.set(undefined); this.importMode.set('replace'); this.checkingProgress.set({ completed: 0, total: 0 }); this.validationGeneration += 1;
    try { this.draftJson.set(await file.text()); this.progress.set('idle'); } catch { this.progress.set('idle'); }
  }
  protected async validate(): Promise<void> {
    const generation = ++this.validationGeneration;
    this.progress.set('parsing');
    this.checkingProgress.set({ completed: 0, total: 0 });
    const parsed = await parseStructureJsonWithWorker(this.draftJson());
    if (generation !== this.validationGeneration) return;
    if (!parsed.valid || !parsed.value) { this.importPlan.set(undefined); this.preview.set({ structuralValid: false, structuralCode: parsed.code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, affectedDuplicateBlocks: 0, issues: { missing: [], bounds: [], state: [], duplicate: [] } }); this.progress.set('complete'); return; }
    this.progress.set('checking');
    const result = await validateParsedStructureJsonPreviewAsync(parsed.value, this.project().size, (id) => this.library.get(id), (completed, total) => {
      if (generation === this.validationGeneration) this.checkingProgress.set({ completed, total });
    }, { isCancelled: () => generation !== this.validationGeneration });
    if (generation !== this.validationGeneration || !result) return;
    this.preview.set(result); this.importMode.set('replace'); this.refreshPlan(result, 'replace'); this.progress.set('complete');
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
  protected selectImportMode(mode: StructureJsonImportMode): void { this.importMode.set(mode); this.refreshPlan(this.preview(), mode); }
  protected modeDescription(mode: StructureJsonImportMode): string { return this.i18n.t(({ replace: 'structureJsonImportReplaceDescription', merge: 'structureJsonImportMergeDescription', 'new-group': 'structureJsonImportNewGroupDescription' } as const)[mode]); }
  protected modeLabel(mode: StructureJsonImportMode): string { return this.i18n.t(({ replace: 'structureJsonImportReplace', merge: 'structureJsonImportMerge', 'new-group': 'structureJsonImportNewGroup' } as const)[mode]); }
  protected blockerLabel(blocker: StructureJsonImportBlocker): string {
    const key = blocker.code === 'locked-current-blocks' ? 'structureJsonImportBlockedLocked' : blocker.code === 'existing-coordinate-conflict' ? 'structureJsonImportBlockedConflicts' : blocker.code === 'empty-import' ? 'structureJsonImportBlockedEmpty' : 'structureJsonImportBlockedValidation';
    return this.i18n.t(key);
  }
  protected confirmationText(plan: StructureJsonImportPlan): string {
    const template = plan.mode === 'replace' ? 'structureJsonReplaceConfirm' : plan.mode === 'merge' ? 'structureJsonMergeConfirm' : 'structureJsonNewGroupConfirm';
    let text = this.i18n.t(template).replace('{current}', String(this.project().blocks.length)).replace('{imported}', String(plan.importedBlockCount)).replace('{name}', plan.newGroup?.name ?? '');
    if (plan.missingBlockCount > 0) text += `\n\n${this.i18n.t('structureJsonMissingPlaceholderNotice').replace('{count}', String(plan.missingBlockCount))}`;
    return text;
  }
  protected async applyImport(): Promise<void> {
    const plan = this.importPlan();
    if (!plan?.applicable) return;
    const confirmed = await this.dialogs.confirm({ title: this.i18n.t('structureJsonApplyImportTitle'), text: this.confirmationText(plan), confirmButtonText: this.i18n.t('structureJsonApplyImport'), cancelButtonText: this.i18n.t('cancel'), icon: plan.mode === 'replace' ? 'warning' : 'question', destructive: plan.mode === 'replace' });
    if (!confirmed) return;
    if (plan.mode === 'replace' && plan.importedBlockCount === 0 && this.project().blocks.length === 0) { this.selection.clear(); this.closed.emit(); return; }
    const changed = this.history.execute('Import Structure JSON', (current) => applyStructureJsonImportPlan(current, plan, (id) => this.library.get(id), this.i18n.t('structureJsonImportedGroupFallback')));
    if (!changed) { await this.dialogs.warning(this.i18n.t('structureJsonImportStale')); return; }
    this.selection.clear();
    this.closed.emit();
  }
  protected structuralMessage(): string { const code = this.preview()?.structuralCode; const key = code === 'invalid-json' ? 'structureJsonValidationInvalidJson' : code === 'format' ? 'structureJsonValidationFormat' : code === 'version' ? 'structureJsonValidationVersion' : code === 'block' ? 'structureJsonValidationBlock' : 'structureJsonValidationShape'; return this.i18n.t(key); }
  private refreshPlan(result: StructureJsonValidationPreview | undefined, mode: StructureJsonImportMode): void {
    const source = result?.parsed;
    const project = this.project();
    this.importPlan.set(source && result && project ? buildStructureJsonImportPlan(source, result, project, (id) => this.library.get(id), mode, this.i18n.t('structureJsonImportedGroupFallback')) : undefined);
  }
}
