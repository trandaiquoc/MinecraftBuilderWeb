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
import { buildExternalAiPrompt, externalAiInstructionSections, resolveModSelections, selectedExternalAiTotals } from '../../../core/persistence/structure-json/external-ai-prompt-builder';
import type { ExternalAiModContentCategory, ExternalAiModContentSelection, ExternalAiPromptLocale, ExternalAiPromptOptions } from '../../../core/persistence/structure-json/external-ai-prompt-builder';
import { createStructureJsonExample, serializeStructureJsonValue } from '../../../core/persistence/structure-json/structure-json';
import { ReadonlyCodeViewerComponent } from '../../../shared/ui/readonly-code-viewer/readonly-code-viewer.component';

type OversizedImportChoice = 'resize' | 'keep' | 'cancel';
type ImportDialogTab = 'import' | 'ai';
type AiWorkspaceTab = 'description' | 'content' | 'guidance' | 'example';

@Component({
  selector: 'app-structure-json-import-dialog',
  imports: [CdkTrapFocus, LucideCheck, LucideCheckCircle2, LucideCircleHelp, LucideCircleX, LucideCopy, LucideTriangleAlert, LucideUpload, LucideX, UiTooltipDirective, ReadonlyCodeViewerComponent],
  templateUrl: './structure-json-import-dialog.component.html',
  styleUrl: './structure-json-import-dialog.component.scss',
  host: { '(document:keydown.escape)': 'onEscape($event)', '(document:pointerdown)': 'onDocumentPointerDown($event)' },
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
  protected readonly activeAiTab = signal<AiWorkspaceTab>('description');
  protected readonly aiDescription = signal('');
  protected readonly aiSnapshot = computed(() => this.aiContext.snapshot(this.project()));
  protected readonly hasExternalContent = computed(() => this.aiSnapshot().mods.some((mod) => mod.blocks.length > 0 || mod.items.length > 0 || mod.decorations.length > 0));
  protected readonly includeAiGuidance = signal(true);
  protected readonly includeAvailableContentOverride = signal<boolean | undefined>(undefined);
  protected readonly includeJsonExample = signal(false);
  protected readonly modSelections = signal<readonly ExternalAiModContentSelection[]>([]);
  protected readonly modContentOpen = signal(false);
  protected readonly includeAvailableContent = computed(() => this.includeAvailableContentOverride() ?? this.hasExternalContent());
  protected readonly effectiveModSelections = computed(() => resolveModSelections(this.aiSnapshot(), this.modSelections()));
  protected readonly selectedTotals = computed(() => selectedExternalAiTotals(this.aiSnapshot(), this.modSelections()));
  protected readonly aiPromptOptions = computed<ExternalAiPromptOptions>(() => ({
    locale: this.currentAiLocale(),
    includeGuidance: this.includeAiGuidance(),
    includeAvailableContent: this.includeAvailableContent(),
    includeExample: this.includeJsonExample(),
    modSelections: this.modSelections(),
  }));
  protected readonly aiPrompt = computed(() => buildExternalAiPrompt(this.aiDescription(), this.aiSnapshot(), this.aiPromptOptions()));
  protected readonly aiExample = computed(() => serializeStructureJsonValue(createStructureJsonExample()));
  protected readonly aiGuidance = computed(() => externalAiInstructionSections(this.aiSnapshot().minecraftVersion, this.currentAiLocale(), this.aiSnapshot().projectContext));
  protected readonly aiCopyStatus = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly aiDescriptionInvalid = signal(false);
  protected readonly tabs: readonly ImportDialogTab[] = ['import', 'ai'];
  protected readonly aiTabs: readonly AiWorkspaceTab[] = ['description', 'content', 'guidance', 'example'];
  protected readonly modCategories: readonly ExternalAiModContentCategory[] = ['blocks', 'items', 'decorations'];
  private validationGeneration = 0;
  private readonly modePlanCache = new Map<StructureJsonImportMode, StructureJsonImportPlan>();

  protected close(): void { this.validationGeneration += 1; this.modContentOpen.set(false); this.closed.emit(); }
  protected onEscape(event: Event): void { if (this.modContentOpen()) { event.stopPropagation(); this.modContentOpen.set(false); return; } this.close(); }
  protected onDocumentPointerDown(event: Event): void {
    if (!this.modContentOpen()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.ai-mod-content-selector')) return;
    this.modContentOpen.set(false);
  }
  protected setTab(tab: ImportDialogTab): void { this.activeTab.set(tab); }
  protected setAiTab(tab: AiWorkspaceTab): void { this.activeAiTab.set(tab); }
  protected aiTabLabel(tab: AiWorkspaceTab): string { return this.i18n.t(({ description: 'structureJsonAiTabDescription', content: 'structureJsonAiTabContent', guidance: 'structureJsonAiTabGuidance', example: 'structureJsonAiTabExample' } as const)[tab]); }
  protected aiGuidanceLines(section: { readonly lines: readonly string[] }): readonly string[] { return section.lines; }
  protected onAiTabKeydown(event: KeyboardEvent): void {
    const current = this.aiTabs.indexOf(this.activeAiTab());
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (current + 1) % this.aiTabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (current - 1 + this.aiTabs.length) % this.aiTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? this.aiTabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); this.setAiTab(this.aiTabs[next]);
  }
  protected setAiDescription(value: string): void { this.aiDescription.set(value); this.aiCopyStatus.set('idle'); this.aiDescriptionInvalid.set(false); }
  protected setIncludeGuidance(value: boolean): void { this.includeAiGuidance.set(value); this.aiCopyStatus.set('idle'); }
  protected setIncludeAvailableContent(value: boolean): void { this.includeAvailableContentOverride.set(value); this.aiCopyStatus.set('idle'); }
  protected setIncludeJsonExample(value: boolean): void { this.includeJsonExample.set(value); this.aiCopyStatus.set('idle'); }
  protected toggleModContent(): void { if (this.hasExternalContent() && this.includeAvailableContent()) this.modContentOpen.update((open) => !open); }
  protected modSelection(sourceId: string): ExternalAiModContentSelection {
    return this.effectiveModSelections().find((selection) => selection.sourceId === sourceId) ?? { sourceId, includeBlocks: false, includeItems: false, includeDecorations: false };
  }
  protected categoryKey(category: ExternalAiModContentCategory): 'includeBlocks' | 'includeItems' | 'includeDecorations' { return categoryKey(category); }
  protected setModCategory(sourceId: string, category: ExternalAiModContentCategory, value: boolean): void {
    const selections = this.effectiveModSelections().map((selection) => selection.sourceId === sourceId ? { ...selection, [categoryKey(category)]: value } : selection);
    this.modSelections.set(selections); this.aiCopyStatus.set('idle');
  }
  protected selectAllModContent(): void {
    this.modSelections.set(this.aiSnapshot().mods.map((mod) => ({ sourceId: mod.sourceId, includeBlocks: mod.blocks.length > 0, includeItems: mod.items.length > 0, includeDecorations: mod.decorations.length > 0 })));
    this.aiCopyStatus.set('idle');
  }
  protected clearAllModContent(): void {
    this.modSelections.set(this.aiSnapshot().mods.map((mod) => ({ sourceId: mod.sourceId, includeBlocks: false, includeItems: false, includeDecorations: false })));
    this.aiCopyStatus.set('idle');
  }
  protected modContentSummary(): string {
    const totals = this.selectedTotals();
    if (!totals.mods) return this.i18n.t('structureJsonAiNoContentSelected');
    const names = this.aiSnapshot().mods.filter((mod) => this.modSelection(mod.sourceId).includeBlocks || this.modSelection(mod.sourceId).includeItems || this.modSelection(mod.sourceId).includeDecorations).map((mod) => mod.name);
    const label = names.length <= 2 ? names.join(' · ') : `${names[0]} +${names.length - 1}`;
    const categories = [
      totals.blocks > 0 ? `${totals.blocks} ${this.i18n.t('structureJsonAiSummaryBlocks')}` : '',
      totals.items > 0 ? `${totals.items} ${this.i18n.t('structureJsonAiSummaryItems')}` : '',
      totals.decorations > 0 ? `${totals.decorations} ${this.i18n.t('structureJsonAiSummaryDecorations')}` : '',
    ].filter(Boolean).join(' · ');
    return `${label} · ${categories}`;
  }
  protected categoryCount(mod: { readonly blocks: readonly string[]; readonly items: readonly unknown[]; readonly decorations: readonly unknown[] }, category: ExternalAiModContentCategory): number { return category === 'blocks' ? mod.blocks.length : category === 'items' ? mod.items.length : mod.decorations.length; }
  protected categoryLabel(category: ExternalAiModContentCategory): string { return this.i18n.t(({ blocks: 'structureJsonAiIncludeBlocks', items: 'structureJsonAiIncludeItems', decorations: 'structureJsonAiIncludeDecorations' } as const)[category]); }
  protected modContentText(mod: { readonly blocks: readonly string[]; readonly items: readonly { readonly id: string; readonly maxStackSize?: number }[]; readonly decorations: readonly { readonly id: string; readonly kind: string }[] }): string {
    const sections: string[] = [];
    if (mod.blocks.length) sections.push(`${this.i18n.t('structureJsonAiIncludeBlocks')}\n${[...mod.blocks].sort().join('\n')}`);
    if (mod.items.length) sections.push(`${this.i18n.t('structureJsonAiIncludeItems')}\n${[...mod.items].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.maxStackSize === undefined ? item.id : `${item.id} (max ${item.maxStackSize})`).join('\n')}`);
    if (mod.decorations.length) sections.push(`${this.i18n.t('structureJsonAiIncludeDecorations')}\n${[...mod.decorations].sort((a, b) => a.id.localeCompare(b.id)).map((item) => `${item.id} [${item.kind}]`).join('\n')}`);
    return sections.join('\n\n');
  }
  protected lineCountLabel(value: string): string { return this.i18n.t('structureJsonAiLineCount').replace('{count}', String(value === '' ? 0 : value.split('\n').length)); }
  private currentAiLocale(): ExternalAiPromptLocale { return typeof this.i18n.locale === 'function' ? this.i18n.locale() : 'en'; }
  protected aiPromptSummary(): string {
    const parts = [this.i18n.t('structureJsonAiSummaryDescription')];
    if (this.includeAiGuidance()) parts.push(this.i18n.t('structureJsonAiSummaryGuidance'));
    if (this.includeAvailableContent() && this.selectedTotals().mods > 0) parts.push(this.modContentSummary());
    if (this.includeJsonExample()) parts.push(this.i18n.t('structureJsonAiSummaryExample'));
    return `${this.i18n.t('structureJsonAiIncludes')}: ${parts.join(' + ')}`;
  }
  protected async copyAiPrompt(): Promise<void> {
    if (!this.aiDescription().trim()) { this.aiDescriptionInvalid.set(true); this.aiCopyStatus.set('idle'); return; }
    this.aiDescriptionInvalid.set(false);
    await this.copyText(this.aiPrompt());
  }
  protected async copyAiExample(): Promise<void> { await this.copyText(this.aiExample()); }
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
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(value); this.aiCopyStatus.set('copied'); } catch { this.aiCopyStatus.set('failed'); }
  }
}

function categoryKey(category: ExternalAiModContentCategory): 'includeBlocks' | 'includeItems' | 'includeDecorations' {
  return category === 'blocks' ? 'includeBlocks' : category === 'items' ? 'includeItems' : 'includeDecorations';
}

function formatProjectSize(size: ProjectDocument['size']): string { return `${size.x} × ${size.y} × ${size.z}`; }
