import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideCopy, LucideTriangleAlert, LucideUpload, LucideX } from '@lucide/angular';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { HistoryService } from '../../../core/editor/history/history.service';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { parseStructureJsonWithWorker, StructureJsonBlockIssue, StructureJsonCoordinateConflict, StructureJsonDecorationIssue, StructureJsonValidationPreview, validateParsedStructureJsonPreview, validateParsedStructureJsonPreviewAsync } from '../../../core/persistence/structure-json/structure-json-import';
import { buildStructureJsonImportPlan, prepareStructureJsonImportPlan, StructureJsonImportBlocker, StructureJsonImportMode, StructureJsonImportPlan } from '../../../core/persistence/structure-json/structure-json-import-plan';
import { clipStructureJsonToBounds, inspectStructureJsonBounds, resizeProjectForStructureJsonImport, StructureJsonBoundsPreflight } from '../../../core/persistence/structure-json/structure-json-bounds';
import type { StructureJson } from '../../../core/persistence/structure-json/structure-json';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { ViewportHydrationStatusService } from '../../../core/editor/state/viewport-hydration-status.service';
import { ExternalAiPromptContextService } from '../../../core/persistence/structure-json/external-ai-prompt-context.service';
import { buildContentContextText, buildExternalAiPrompt } from '../../../core/persistence/structure-json/external-ai-prompt-builder';
import { createStructureJsonExample, serializeStructureJsonValue } from '../../../core/persistence/structure-json/structure-json';

type OversizedImportChoice = 'resize' | 'keep' | 'cancel';
type ImportDialogTab = 'import' | 'ai';

@Component({
  selector: 'app-structure-json-import-dialog',
  imports: [CdkTrapFocus, LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideCopy, LucideTriangleAlert, LucideUpload, LucideX, UiTooltipDirective],
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
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  private readonly aiContext = inject(ExternalAiPromptContextService);
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
  protected readonly activeTab = signal<ImportDialogTab>('import');
  protected readonly aiDescription = signal('');
  protected readonly aiPrompt = computed(() => buildExternalAiPrompt(this.aiDescription(), this.aiContext.snapshot(this.project())));
  protected readonly aiContextText = computed(() => buildContentContextText(this.aiContext.snapshot(this.project())));
  protected readonly aiExample = computed(() => serializeStructureJsonValue(createStructureJsonExample()));
  protected readonly tabs: readonly ImportDialogTab[] = ['import', 'ai'];
  private validationGeneration = 0;
  private readonly modePlanCache = new Map<StructureJsonImportMode, StructureJsonImportPlan>();

  protected close(): void { this.validationGeneration += 1; this.closed.emit(); }
  protected setTab(tab: ImportDialogTab): void { this.activeTab.set(tab); }
  protected setAiDescription(value: string): void { this.aiDescription.set(value); }
  protected async copyAiPrompt(): Promise<void> { await this.copyText(this.aiPrompt()); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  protected setDraft(value: string): void { this.draftJson.set(value); this.preview.set(undefined); this.importPlan.set(undefined); this.modePlanCache.clear(); this.importMode.set('replace'); this.progress.set('idle'); this.checkingProgress.set({ completed: 0, total: 0 }); this.validationGeneration += 1; }
  protected async loadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.progress.set('reading'); this.preview.set(undefined); this.importPlan.set(undefined); this.modePlanCache.clear(); this.importMode.set('replace'); this.checkingProgress.set({ completed: 0, total: 0 }); this.validationGeneration += 1;
    try { this.draftJson.set(await file.text()); this.progress.set('idle'); } catch { this.progress.set('idle'); }
  }
  protected async validate(): Promise<void> {
    const generation = ++this.validationGeneration;
    this.progress.set('parsing');
    this.checkingProgress.set({ completed: 0, total: 0 });
    const parsed = await parseStructureJsonWithWorker(this.draftJson());
    if (generation !== this.validationGeneration) return;
    if (!parsed.valid || !parsed.value) { this.importPlan.set(undefined); this.preview.set({ structuralValid: false, structuralCode: parsed.code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, affectedDuplicateBlocks: 0, issues: { missing: [], bounds: [], state: [], duplicate: [] }, totalDecorations: 0, validDecorations: 0, missingDecorationAssets: 0, invalidDecorations: 0, decorationIssues: [] }); this.progress.set('complete'); return; }
    this.progress.set('checking');
    const result = await validateParsedStructureJsonPreviewAsync(parsed.value, this.project().size, (id) => this.library.get(id), (completed, total) => {
      if (generation === this.validationGeneration) this.checkingProgress.set({ completed, total });
    }, { isCancelled: () => generation !== this.validationGeneration }, this.project(), (id) => this.library.maxStackSizeFor(id));
    if (generation !== this.validationGeneration || !result) return;
    this.modePlanCache.clear(); const finalResult = this.previewForMode(result, 'replace'); this.preview.set(finalResult); this.importMode.set('replace'); this.refreshPlan(finalResult, 'replace'); this.progress.set('complete');
  }
  protected progressLabel(): string { return this.i18n.t(`structureJsonProgress${this.progress()[0].toUpperCase()}${this.progress().slice(1)}`); }
  protected issueGroups(): readonly { readonly category: 'missing' | 'bounds' | 'state'; readonly label: string }[] { return [{ category: 'missing', label: this.i18n.t('structureJsonMissingBlocks') }, { category: 'bounds', label: this.i18n.t('structureJsonOutOfBounds') }, { category: 'state', label: this.i18n.t('structureJsonInvalidStates') }]; }
  protected issues(category: 'missing' | 'bounds' | 'state'): readonly StructureJsonBlockIssue[] { return (this.preview()?.issues[category] ?? []).slice(0, 12); }
  protected duplicateConflicts(): readonly StructureJsonCoordinateConflict[] { return (this.preview()?.issues.duplicate ?? []).slice(0, 12); }
  protected issueCount(category: 'missing' | 'bounds' | 'state' | 'duplicate'): number { return this.preview()?.issues[category].length ?? 0; }
  protected moreIssueCount(category: 'missing' | 'bounds' | 'state'): number { return Math.max(0, this.issueCount(category) - 12); }
  protected moreDuplicateCount(): number { return Math.max(0, this.issueCount('duplicate') - 12); }
  protected decorationIssues(): readonly StructureJsonDecorationIssue[] { return (this.preview()?.decorationIssues ?? []).slice(0, 12); }
  protected moreDecorationIssueCount(): number { return Math.max(0, (this.preview()?.decorationIssues.length ?? 0) - 12); }
  protected canApplyImport(): boolean { const plan = this.importPlan(); return !!plan && (plan.applicable || this.isBoundsOnlyPlan(plan)); }
  protected decorationReasonLabel(issue: StructureJsonDecorationIssue): string {
    const key = issue.reason === 'missing-painting-variant' ? 'structureJsonDecorationReasonMissingAsset' : issue.reason === 'out-of-bounds' ? 'structureJsonDecorationReasonOutOfBounds' : issue.reason === 'missing-support' || issue.reason === 'missing-painting-support' ? 'structureJsonDecorationReasonMissingSupport' : issue.reason === 'blocked-by-block' || issue.reason === 'overlap-decoration' ? 'structureJsonDecorationReasonConflict' : 'structureJsonDecorationReasonInvalid';
    return this.i18n.t(key);
  }
  protected moreIssueLabel(category: 'missing' | 'bounds' | 'state'): string { return this.i18n.t('structureJsonMoreIssues').replace('{count}', `${this.moreIssueCount(category)}`); }
  protected reasonLabel(issue: StructureJsonBlockIssue): string { const reason = issue.reason; const key = reason.code === 'missing-block' ? 'structureJsonReasonMissingBlock' : reason.code === 'out-of-bounds' ? 'structureJsonReasonOutOfBounds' : reason.code === 'unknown-state-property' ? 'structureJsonReasonUnknownStateProperty' : reason.code === 'invalid-block-entity' ? 'structureJsonReasonInvalidBlockEntity' : 'structureJsonReasonUnsupportedStateValue'; return this.i18n.t(key); }
  protected selectImportMode(mode: StructureJsonImportMode): void { const result = this.previewForMode(this.preview(), mode); this.preview.set(result); this.importMode.set(mode); this.refreshPlan(result, mode); }
  protected modeDescription(mode: StructureJsonImportMode): string { return this.i18n.t(({ replace: 'structureJsonImportReplaceDescription', merge: 'structureJsonImportMergeDescription', 'new-group': 'structureJsonImportNewGroupDescription' } as const)[mode]); }
  protected modeLabel(mode: StructureJsonImportMode): string { return this.i18n.t(({ replace: 'structureJsonImportReplace', merge: 'structureJsonImportMerge', 'new-group': 'structureJsonImportNewGroup' } as const)[mode]); }
  protected blockerLabel(blocker: StructureJsonImportBlocker): string {
    const key = blocker.code === 'locked-current-blocks' || blocker.code === 'locked-current-decorations' ? 'structureJsonImportBlockedLocked' : blocker.code === 'existing-coordinate-conflict' || blocker.code === 'decoration-conflict' ? 'structureJsonImportBlockedConflicts' : blocker.code === 'empty-import' ? 'structureJsonImportBlockedEmpty' : 'structureJsonImportBlockedValidation';
    return this.i18n.t(key);
  }
  protected confirmationText(plan: StructureJsonImportPlan): string {
    const template = plan.mode === 'replace' ? 'structureJsonReplaceConfirm' : plan.mode === 'merge' ? 'structureJsonMergeConfirm' : 'structureJsonNewGroupConfirm';
    let text = this.i18n.t(template).replace('{current}', String(this.project().blocks.length)).replace('{imported}', String(plan.importedBlockCount)).replace('{name}', plan.newGroup?.name ?? '');
    text += `\n${this.i18n.t('structureJsonCurrentDecorations')}: ${this.project().decorations?.length ?? 0} · ${this.i18n.t('structureJsonImportedDecorations')}: ${plan.importedDecorationCount}`;
    if (plan.missingBlockCount > 0) text += `\n\n${this.i18n.t('structureJsonMissingPlaceholderNotice').replace('{count}', String(plan.missingBlockCount))}`;
    return text;
  }
  protected oversizedImportText(bounds: StructureJsonBoundsPreflight): string {
    const current = formatProjectSize(this.project().size);
    const required = formatProjectSize(bounds.requiredSize);
    let text = this.i18n.t('structureJsonOversizedImportText').replace('{current}', current).replace('{required}', required);
    const resized = resizeProjectForStructureJsonImport(this.project(), bounds);
    if (resized?.structureMode === 'huge-structure-blocks' && this.project().structureMode !== 'huge-structure-blocks') text += `\n\n${this.i18n.t('structureJsonImportResizeHugeNotice')}`;
    if (!resized && !bounds.hasNegativeCoordinates) text += `\n\n${this.i18n.t('structureJsonImportResizeUnavailable')}`;
    if (bounds.hasNegativeCoordinates) text += `\n\n${this.i18n.t('structureJsonImportNegativeCoordinates')}`;
    return text;
  }
  protected async applyImport(): Promise<void> {
    const plan = this.importPlan();
    if (!plan) return;
    const baseProject = this.project();
    const bounds = inspectStructureJsonBounds(plan.source, baseProject.size);
    let effectivePlan = plan;
    let targetProject = baseProject;
    let clipped = false;
    if (this.isBoundsOnlyPlan(plan) && bounds.hasNegativeCoordinates) {
      await this.dialogs.warning(this.i18n.t('structureJsonImportResizeUnavailable'), this.i18n.t('structureJsonImportNegativeCoordinates')); return;
    }
    if (bounds.exceedsCurrent && this.isBoundsOnlyPlan(plan)) {
      const choice = await this.dialogs.choice<OversizedImportChoice>({
        title: this.i18n.t('structureJsonOversizedImportTitle'),
        text: this.oversizedImportText(bounds),
        icon: 'warning',
        options: [
          { id: 'resize', label: this.i18n.t('structureJsonImportResizeAndImport'), value: 'resize', kind: 'primary' },
          { id: 'keep', label: this.i18n.t('structureJsonImportKeepCurrentSize'), value: 'keep', kind: 'secondary' },
          { id: 'cancel', label: this.i18n.t('structureJsonImportCancel'), value: 'cancel', kind: 'secondary' },
        ],
      });
      if (this.project() !== baseProject || choice === undefined || choice === 'cancel') return;
      if (choice === 'keep') {
        effectivePlan = this.buildPlanForSource(clipStructureJsonToBounds(plan.source, baseProject.size), baseProject, plan.mode);
        clipped = true;
      } else {
        const resized = resizeProjectForStructureJsonImport(baseProject, bounds);
        if (!resized) { await this.dialogs.warning(this.i18n.t('structureJsonImportResizeUnavailable')); return; }
        targetProject = resized;
        effectivePlan = this.buildPlanForSource(plan.source, targetProject, plan.mode);
      }
      if (!effectivePlan?.applicable) { await this.dialogs.warning(this.i18n.t('structureJsonImportResizeUnavailable')); return; }
    } else {
      if (!plan.applicable) return;
      const confirmed = await this.dialogs.confirm({ title: this.i18n.t('structureJsonApplyImportTitle'), text: this.confirmationText(plan), confirmButtonText: this.i18n.t('structureJsonApplyImport'), cancelButtonText: this.i18n.t('cancel'), icon: plan.mode === 'replace' ? 'warning' : 'question', destructive: plan.mode === 'replace' });
      if (!confirmed || this.project() !== baseProject) return;
    }
    if (effectivePlan.emptyImport && effectivePlan.mode === 'replace' && baseProject.blocks.length === 0 && (baseProject.decorations ?? []).length === 0 && targetProject === baseProject) { this.selection.clear(); this.closed.emit(); return; }
    const prepared = prepareStructureJsonImportPlan(targetProject, effectivePlan, this.i18n.t('structureJsonImportedGroupFallback'));
    if (!prepared) { await this.dialogs.warning(this.i18n.t('structureJsonImportStale')); return; }
    this.hydrationStatus.markNextActivity('import');
    const changed = this.history.execute('Import Structure JSON', (current) => current === baseProject ? prepared : undefined);
    if (!changed) { this.hydrationStatus.markNextActivity('build'); await this.dialogs.warning(this.i18n.t('structureJsonImportStale')); return; }
    this.selection.clear();
    if (clipped) await this.dialogs.warning(this.i18n.t('structureJsonImportClippedTitle'), this.i18n.t('structureJsonImportClippedText').replace('{blocks}', String(bounds.blocksOutsideBounds)).replace('{decorations}', String(bounds.decorationsOutsideBounds)));
    this.closed.emit();
  }
  protected structuralMessage(): string { const code = this.preview()?.structuralCode; const key = code === 'invalid-json' ? 'structureJsonValidationInvalidJson' : code === 'format' ? 'structureJsonValidationFormat' : code === 'version' ? 'structureJsonValidationVersion' : code === 'block' ? 'structureJsonValidationBlock' : 'structureJsonValidationShape'; return this.i18n.t(key); }
  private refreshPlan(result: StructureJsonValidationPreview | undefined, mode: StructureJsonImportMode): void { this.importPlan.set(result ? this.modePlan(result, mode) : undefined); }
  private previewForMode(result: StructureJsonValidationPreview | undefined, mode: StructureJsonImportMode): StructureJsonValidationPreview | undefined {
    if (!result) return result;
    const plan = this.modePlan(result, mode);
    return { ...result, totalDecorations: plan.importedDecorationCount, validDecorations: plan.validDecorationCount, missingDecorationAssets: plan.missingDecorationAssetCount, invalidDecorations: plan.decorationIssues.filter((issue) => issue.category !== 'missing-asset').length, decorationIssues: plan.decorationIssues };
  }
  private modePlan(result: StructureJsonValidationPreview, mode: StructureJsonImportMode): StructureJsonImportPlan {
    const cached = this.modePlanCache.get(mode);
    if (cached && cached.source === result.parsed && cached.baseProject === this.project()) return cached;
    const source = result.parsed;
    if (!source) throw new Error('Cannot build an import plan without parsed structure data');
    const plan = buildStructureJsonImportPlan(source, result, this.project(), (id) => this.library.get(id), mode, this.i18n.t('structureJsonImportedGroupFallback'));
    this.modePlanCache.set(mode, plan);
    return plan;
  }
  private isBoundsOnlyPlan(plan: StructureJsonImportPlan): boolean {
    if (!plan.blockingIssues.length) return false;
    return plan.blockingIssues.every((blocker) => blocker.code === 'out-of-bounds' || blocker.code === 'invalid-decoration')
      && plan.decorationIssues.filter((issue) => issue.category !== 'missing-asset').every((issue) => issue.category === 'bounds' && issue.reason === 'out-of-bounds');
  }
  private buildPlanForSource(source: StructureJson, project: ProjectDocument, mode: StructureJsonImportMode): StructureJsonImportPlan {
    const validation = validateParsedStructureJsonPreview(source, project.size, (id) => this.library.get(id), undefined, project, (id) => this.library.maxStackSizeFor(id));
    return buildStructureJsonImportPlan(source, validation, project, (id) => this.library.get(id), mode, this.i18n.t('structureJsonImportedGroupFallback'));
  }
  private async copyText(value: string): Promise<void> {
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(value); } catch { /* The prompt remains visible for manual copy. */ }
  }
}

function formatProjectSize(size: ProjectDocument['size']): string { return `${size.x} × ${size.y} × ${size.z}`; }
