import { Component, inject, input, output, signal } from '@angular/core';
import { LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideTriangleAlert, LucideUpload } from '@lucide/angular';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import type { PlaceableItemDefinition } from '../../../core/blocks/placement-palette/placeable-item.types';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { HistoryService } from '../../../core/editor/history/history.service';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { parseStructureJsonWithWorker, StructureJsonBlockIssue, StructureJsonCoordinateConflict, StructureJsonDecorationIssue, StructureJsonValidationOptions, StructureJsonValidationPreview, validateParsedStructureJsonPreviewAsync } from '../../../core/persistence/structure-json/structure-json-import';
import { buildStructureJsonImportPlanAsync, prepareStructureJsonImportPlan, StructureJsonImportBlocker, StructureJsonImportMode, StructureJsonImportPlan } from '../../../core/persistence/structure-json/structure-json-import-plan';
import { structureJsonBlockIssueSeverity, structureJsonDecorationIssueSeverity, structureJsonImportBlockerSeverity, StructureJsonValidationSeverity } from '../../../core/persistence/structure-json/structure-json-validation-severity';
import { clipStructureJsonToBounds, inspectStructureJsonBounds, resizeProjectForStructureJsonImport, StructureJsonBoundsPreflight } from '../../../core/persistence/structure-json/structure-json-bounds';
import type { StructureJson } from '../../../core/persistence/structure-json/structure-json';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ViewportHydrationStatusService } from '../../../core/editor/state/viewport-hydration-status.service';
import type { ExternalAiContentLimits } from '../../../core/persistence/structure-json/external-ai-content-limits';
import type { TranslationKey } from '../../../core/ui/localization/translation-catalogs';

type OversizedImportChoice = 'resize' | 'keep' | 'cancel';

@Component({
  selector: 'app-structure-json-import-workspace',
  imports: [LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideTriangleAlert, LucideUpload],
  templateUrl: './structure-json-import-workspace.component.html',
  styleUrl: './structure-json-import-workspace.component.scss',
})
export class StructureJsonImportWorkspaceComponent {
  protected readonly i18n = inject(I18nService);
  private readonly library = inject(BlockLibraryService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly dialogs = inject(DialogService);
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  readonly project = input.required<ProjectDocument>();
  readonly placeableItems = input.required<readonly PlaceableItemDefinition[]>();
  readonly contentLimits = input.required<ExternalAiContentLimits>();
  readonly contentLimitsEnabled = input.required<boolean>();
  readonly closed = output<void>();
  protected readonly draftJson = signal('');
  protected readonly preview = signal<StructureJsonValidationPreview | undefined>(undefined);
  protected readonly progress = signal<'idle' | 'reading' | 'parsing' | 'checking' | 'planning' | 'ready' | 'complete'>('idle');
  protected readonly checkingProgress = signal({ completed: 0, total: 0 });
  protected readonly importMode = signal<StructureJsonImportMode>('replace');
  protected readonly importPlan = signal<StructureJsonImportPlan | undefined>(undefined);
  protected readonly importModes: readonly StructureJsonImportMode[] = ['replace', 'merge', 'new-group'];
  private validationGeneration = 0;
  private readonly modePlanCache = new Map<StructureJsonImportMode, StructureJsonImportPlan>();

  cancelPendingWork(): void { this.validationGeneration += 1; }
  protected setDraft(value: string): void { this.draftJson.set(value); this.preview.set(undefined); this.importPlan.set(undefined); this.modePlanCache.clear(); this.importMode.set('replace'); this.progress.set('idle'); this.checkingProgress.set({ completed: 0, total: 0 }); this.validationGeneration += 1; }
  protected async loadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.progress.set('reading'); this.preview.set(undefined); this.importPlan.set(undefined); this.modePlanCache.clear(); this.importMode.set('replace'); this.checkingProgress.set({ completed: 0, total: 0 }); this.validationGeneration += 1;
    try { this.draftJson.set(await file.text()); this.progress.set('idle'); } catch { this.progress.set('idle'); }
  }
  protected async validate(): Promise<void> {
    const generation = ++this.validationGeneration;
    const baseProject = this.project();
    this.progress.set('parsing');
    this.checkingProgress.set({ completed: 0, total: 0 });
    const parsed = await parseStructureJsonWithWorker(this.draftJson(), { isCancelled: () => generation !== this.validationGeneration });
    if (generation !== this.validationGeneration) return;
    if (!parsed.valid || !parsed.value) { this.importPlan.set(undefined); this.preview.set({ structuralValid: false, structuralCode: parsed.code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, affectedDuplicateBlocks: 0, issues: { missing: [], bounds: [], state: [], duplicate: [], contentLimit: [], support: [], warning: [] }, totalDecorations: 0, validDecorations: 0, missingDecorationAssets: 0, invalidDecorations: 0, decorationIssues: [] }); this.progress.set('complete'); return; }
    this.progress.set('checking');
    const result = await validateParsedStructureJsonPreviewAsync(parsed.value, baseProject.size, (id) => this.library.get(id), (completed, total) => {
      if (generation === this.validationGeneration) this.checkingProgress.set({ completed, total });
    }, { isCancelled: () => generation !== this.validationGeneration || this.project() !== baseProject }, baseProject, (id) => this.library.maxStackSizeFor(id), this.validationOptions());
    if (generation !== this.validationGeneration || this.project() !== baseProject || !result) return;
    this.modePlanCache.clear();
    this.progress.set('planning');
    const plan = await this.buildPlanAsync(result, 'replace', generation, baseProject);
    if (generation !== this.validationGeneration || this.project() !== baseProject || !plan) return;
    this.modePlanCache.set('replace', plan);
    this.preview.set(this.previewForPlan(result, plan)); this.importMode.set('replace'); this.importPlan.set(plan); this.progress.set('ready');
  }
  protected progressLabel(): string {
    const labels: Partial<Record<'idle' | 'reading' | 'parsing' | 'checking' | 'planning' | 'ready' | 'complete', TranslationKey>> = { reading: 'structureJsonProgressReading', parsing: 'structureJsonProgressParsing', checking: 'structureJsonProgressChecking', planning: 'structureJsonProgressPlanning', ready: 'structureJsonProgressReady' };
    const key = labels[this.progress()];
    return key ? this.i18n.t(key) : '';
  }
  protected issueGroups(): readonly { readonly category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning'; readonly label: string; readonly severity: StructureJsonValidationSeverity }[] { return [{ category: 'missing', label: this.i18n.t('structureJsonMissingBlocks'), severity: structureJsonBlockIssueSeverity('missing') }, { category: 'bounds', label: this.i18n.t('structureJsonOutOfBounds'), severity: structureJsonBlockIssueSeverity('bounds') }, { category: 'state', label: this.i18n.t('structureJsonInvalidStates'), severity: structureJsonBlockIssueSeverity('state') }, { category: 'contentLimit', label: this.i18n.t('structureJsonContentLimitViolations'), severity: structureJsonBlockIssueSeverity('content-limit') }, { category: 'support', label: this.i18n.t('structureJsonMissingSupport'), severity: structureJsonBlockIssueSeverity('support') }, { category: 'warning', label: this.i18n.t('structureJsonValidationWarnings'), severity: structureJsonBlockIssueSeverity('warning') }]; }
  protected issues(category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning'): readonly StructureJsonBlockIssue[] { return (this.preview()?.issues[category] ?? []).slice(0, 12); }
  protected duplicateConflicts(): readonly StructureJsonCoordinateConflict[] { return (this.preview()?.issues.duplicate ?? []).slice(0, 12); }
  protected issueCount(category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning' | 'duplicate'): number { return this.preview()?.issues[category].length ?? 0; }
  protected moreIssueCount(category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning'): number { return Math.max(0, this.issueCount(category) - 12); }
  protected moreDuplicateCount(): number { return Math.max(0, this.issueCount('duplicate') - 12); }
  protected decorationIssues(): readonly StructureJsonDecorationIssue[] { return (this.preview()?.decorationIssues ?? []).slice(0, 12); }
  protected moreDecorationIssueCount(): number { return Math.max(0, (this.preview()?.decorationIssues.length ?? 0) - 12); }
  protected blockIssueSeverity(category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning'): StructureJsonValidationSeverity { return structureJsonBlockIssueSeverity(category === 'contentLimit' ? 'content-limit' : category); }
  protected decorationIssueSeverity(category: StructureJsonDecorationIssue['category']): StructureJsonValidationSeverity { return structureJsonDecorationIssueSeverity(category); }
  protected decorationGroupSeverity(): StructureJsonValidationSeverity { return this.decorationIssues().some((issue) => this.decorationIssueSeverity(issue.category) === 'error') ? 'error' : 'warning'; }
  protected importBlockerSeverity(code: StructureJsonImportBlocker['code']): StructureJsonValidationSeverity { return structureJsonImportBlockerSeverity(code); }
  hasPlan(): boolean { return this.importPlan() !== undefined; }
  canApplyImport(): boolean { const plan = this.importPlan(); return !!plan && (plan.applicable || this.isBoundsOnlyPlan(plan)); }
  protected decorationReasonLabel(issue: StructureJsonDecorationIssue): string {
    const key = issue.category === 'content-limit' ? 'structureJsonReasonContentLimit' : issue.reason === 'missing-painting-variant' ? 'structureJsonDecorationReasonMissingAsset' : issue.reason === 'out-of-bounds' ? 'structureJsonDecorationReasonOutOfBounds' : issue.reason === 'missing-support' || issue.reason === 'missing-painting-support' ? 'structureJsonDecorationReasonMissingSupport' : issue.reason === 'blocked-by-block' || issue.reason === 'overlap-decoration' ? 'structureJsonDecorationReasonConflict' : 'structureJsonDecorationReasonInvalid';
    return this.i18n.t(key);
  }
  protected moreIssueLabel(category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning'): string { return this.i18n.t('structureJsonMoreIssues').replace('{count}', `${this.moreIssueCount(category)}`); }
  protected reasonLabel(issue: StructureJsonBlockIssue): string { const reason = issue.reason; const key = reason.code === 'missing-block' ? 'structureJsonReasonMissingBlock' : reason.code === 'out-of-bounds' ? 'structureJsonReasonOutOfBounds' : reason.code === 'unknown-state-property' ? 'structureJsonReasonUnknownStateProperty' : reason.code === 'invalid-block-entity' ? 'structureJsonReasonInvalidBlockEntity' : reason.code === 'content-limit' ? 'structureJsonReasonContentLimit' : reason.code === 'missing-support' ? 'structureJsonReasonMissingSupport' : reason.code === 'origin-offset' ? 'structureJsonReasonOriginOffset' : reason.code === 'possible-floating' ? 'structureJsonReasonPossibleFloating' : reason.code === 'tree-grounding' ? 'structureJsonReasonTreeGrounding' : 'structureJsonReasonUnsupportedStateValue'; let label = this.i18n.t(key); if (reason.code === 'origin-offset') label = label.replace('{axis}', reason.axis.toUpperCase()).replace('{value}', String(reason.value)); return label; }
  protected async selectImportMode(mode: StructureJsonImportMode): Promise<void> {
    const result = this.preview();
    if (!result?.parsed) return;
    const generation = ++this.validationGeneration;
    const baseProject = this.project();
    this.importMode.set(mode);
    const cached = this.modePlanCache.get(mode);
    if (cached && cached.source === result.parsed && cached.baseProject === baseProject) { this.preview.set(this.previewForPlan(result, cached)); this.importPlan.set(cached); this.progress.set('ready'); return; }
    this.progress.set('planning');
    const plan = await this.buildPlanAsync(result, mode, generation, baseProject);
    if (generation !== this.validationGeneration || this.project() !== baseProject || !plan) return;
    this.modePlanCache.set(mode, plan); this.preview.set(this.previewForPlan(result, plan)); this.importPlan.set(plan); this.progress.set('ready');
  }
  protected modeDescription(mode: StructureJsonImportMode): string { return this.i18n.t(({ replace: 'structureJsonImportReplaceDescription', merge: 'structureJsonImportMergeDescription', 'new-group': 'structureJsonImportNewGroupDescription' } as const)[mode]); }
  protected modeLabel(mode: StructureJsonImportMode): string { return this.i18n.t(({ replace: 'structureJsonImportReplace', merge: 'structureJsonImportMerge', 'new-group': 'structureJsonImportNewGroup' } as const)[mode]); }
  protected blockerLabel(blocker: StructureJsonImportBlocker): string {
    const key = blocker.code === 'locked-current-blocks' || blocker.code === 'locked-current-decorations' ? 'structureJsonImportBlockedLocked' : blocker.code === 'existing-coordinate-conflict' || blocker.code === 'decoration-conflict' ? 'structureJsonImportBlockedConflicts' : blocker.code === 'content-limit' ? 'structureJsonImportBlockedContentLimit' : blocker.code === 'missing-support' ? 'structureJsonImportBlockedSupport' : blocker.code === 'empty-import' ? 'structureJsonImportBlockedEmpty' : 'structureJsonImportBlockedValidation';
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
  async applyImport(): Promise<void> {
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
        this.progress.set('planning');
        const clippedPlan = await this.buildPlanForSourceAsync(clipStructureJsonToBounds(plan.source, baseProject.size), baseProject, plan.mode, this.validationGeneration, baseProject);
        if (!clippedPlan || this.project() !== baseProject) return;
        effectivePlan = clippedPlan;
        clipped = true;
      } else {
        const resized = resizeProjectForStructureJsonImport(baseProject, bounds);
        if (!resized) { await this.dialogs.warning(this.i18n.t('structureJsonImportResizeUnavailable')); return; }
        targetProject = resized;
        this.progress.set('planning');
        const resizedPlan = await this.buildPlanForSourceAsync(plan.source, targetProject, plan.mode, this.validationGeneration, baseProject);
        if (!resizedPlan || this.project() !== baseProject) return;
        effectivePlan = resizedPlan;
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
  private previewForPlan(result: StructureJsonValidationPreview, plan: StructureJsonImportPlan): StructureJsonValidationPreview { return { ...result, totalDecorations: plan.importedDecorationCount, validDecorations: plan.validDecorationCount, missingDecorationAssets: plan.missingDecorationAssetCount, invalidDecorations: plan.decorationIssues.filter((issue) => issue.category !== 'missing-asset').length, decorationIssues: plan.decorationIssues }; }
  private isBoundsOnlyPlan(plan: StructureJsonImportPlan): boolean {
    if (!plan.blockingIssues.length) return false;
    return plan.blockingIssues.every((blocker) => blocker.code === 'out-of-bounds' || blocker.code === 'invalid-decoration')
      && plan.decorationIssues.filter((issue) => issue.category !== 'missing-asset').every((issue) => issue.category === 'bounds' && issue.reason === 'out-of-bounds');
  }
  private async buildPlanAsync(result: StructureJsonValidationPreview, mode: StructureJsonImportMode, generation: number, baseProject: ProjectDocument): Promise<StructureJsonImportPlan | undefined> {
    if (!result.parsed) return undefined;
    return buildStructureJsonImportPlanAsync(result.parsed, result, baseProject, (id) => this.library.get(id), mode, this.i18n.t('structureJsonImportedGroupFallback'), this.validationOptions(), { cancellation: { isCancelled: () => generation !== this.validationGeneration || this.project() !== baseProject }, onProgress: (_stage, completed, total) => { if (generation === this.validationGeneration && this.project() === baseProject) this.checkingProgress.set({ completed, total }); } });
  }
  private async buildPlanForSourceAsync(source: StructureJson, project: ProjectDocument, mode: StructureJsonImportMode, generation: number, expectedProject: ProjectDocument): Promise<StructureJsonImportPlan | undefined> {
    const validation = await validateParsedStructureJsonPreviewAsync(source, project.size, (id) => this.library.get(id), (completed, total) => { if (generation === this.validationGeneration && this.project() === expectedProject) this.checkingProgress.set({ completed, total }); }, { isCancelled: () => generation !== this.validationGeneration || this.project() !== expectedProject }, project, (id) => this.library.maxStackSizeFor(id), this.validationOptions());
    if (!validation || generation !== this.validationGeneration || this.project() !== expectedProject) return undefined;
    return buildStructureJsonImportPlanAsync(source, validation, project, (id) => this.library.get(id), mode, this.i18n.t('structureJsonImportedGroupFallback'), this.validationOptions(), { cancellation: { isCancelled: () => generation !== this.validationGeneration || this.project() !== expectedProject } });
  }
  private validationOptions(): StructureJsonValidationOptions { return { contentLimitsEnabled: this.contentLimitsEnabled(), contentLimits: this.contentLimits(), placeableItems: this.placeableItems() }; }
}
function formatProjectSize(size: ProjectDocument['size']): string { return `${size.x} × ${size.y} × ${size.z}`; }
