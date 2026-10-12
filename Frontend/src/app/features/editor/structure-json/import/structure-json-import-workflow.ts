import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { PlaceableItemDefinition } from '../../../../core/blocks/placement-palette/placeable-item.types';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import { HistoryService } from '../../../../core/editor/history/history.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import type { ExternalAiContentLimits } from '../../../../core/persistence/structure-json/external-ai/external-ai-content-limits';
import {
  clipStructureJsonToBounds,
  inspectStructureJsonBounds,
  resizeProjectForStructureJsonImport,
} from '../../../../core/persistence/structure-json/structure-json-bounds';
import type { StructureJson } from '../../../../core/persistence/structure-json/structure-json';
import {
  parseStructureJsonWithWorker,
  validateParsedStructureJsonPreviewAsync,
} from '../../../../core/persistence/structure-json/import/structure-json-import';
import type {
  StructureJsonValidationOptions,
  StructureJsonValidationPreview,
} from '../../../../core/persistence/structure-json/import/structure-json-import';
import {
  buildStructureJsonImportPlanAsync,
  prepareStructureJsonImportPlan,
} from '../../../../core/persistence/structure-json/import/structure-json-import-plan';
import type {
  StructureJsonImportMode,
  StructureJsonImportPlan,
} from '../../../../core/persistence/structure-json/import/structure-json-import-plan';
import type { StructureJsonBoundsPreflight } from '../../../../core/persistence/structure-json/structure-json-bounds';

export type StructureJsonImportProgress =
  'idle' | 'reading' | 'parsing' | 'checking' | 'planning' | 'ready' | 'complete';

export interface StructureJsonImportValidationContext {
  readonly placeableItems: readonly PlaceableItemDefinition[];
  readonly contentLimits: ExternalAiContentLimits;
  readonly contentLimitsEnabled: boolean;
}

type OversizedImportChoice = 'resize' | 'keep' | 'cancel';

@Injectable()
export class StructureJsonImportWorkflow implements OnDestroy {
  private readonly library = inject(BlockLibraryService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly dialogs = inject(DialogService);
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  private readonly i18n = inject(I18nService);

  private readonly draftJsonState = signal('');
  private readonly previewState = signal<StructureJsonValidationPreview | undefined>(undefined);
  private readonly progressState = signal<StructureJsonImportProgress>('idle');
  private readonly checkingProgressState = signal({ completed: 0, total: 0 });
  private readonly importModeState = signal<StructureJsonImportMode>('replace');
  private readonly importPlanState = signal<StructureJsonImportPlan | undefined>(undefined);
  readonly draftJson = this.draftJsonState.asReadonly();
  readonly preview = this.previewState.asReadonly();
  readonly progress = this.progressState.asReadonly();
  readonly checkingProgress = this.checkingProgressState.asReadonly();
  readonly importMode = this.importModeState.asReadonly();
  readonly importPlan = this.importPlanState.asReadonly();
  readonly importModes: readonly StructureJsonImportMode[] = ['replace', 'merge', 'new-group'];

  private currentProject?: ProjectDocument;
  private generation = 0;
  private disposed = false;
  private readonly modePlanCache = new Map<StructureJsonImportMode, StructureJsonImportPlan>();

  setProject(project: ProjectDocument): void {
    if (this.currentProject === project) return;
    const changed = this.currentProject !== undefined;
    this.currentProject = project;
    this.invalidateWork();
    if (!changed) return;
    this.previewState.set(undefined);
    this.importPlanState.set(undefined);
    this.modePlanCache.clear();
    this.importModeState.set('replace');
    this.progressState.set('idle');
    this.checkingProgressState.set({ completed: 0, total: 0 });
  }

  cancelPendingWork(): void {
    this.invalidateWork();
  }

  setDraft(value: string): void {
    this.draftJsonState.set(value);
    this.previewState.set(undefined);
    this.importPlanState.set(undefined);
    this.modePlanCache.clear();
    this.importModeState.set('replace');
    this.progressState.set('idle');
    this.checkingProgressState.set({ completed: 0, total: 0 });
    this.invalidateWork();
  }

  async loadFile(file: File): Promise<void> {
    const generation = this.beginWork('reading');
    this.previewState.set(undefined);
    this.importPlanState.set(undefined);
    this.modePlanCache.clear();
    this.importModeState.set('replace');
    this.checkingProgressState.set({ completed: 0, total: 0 });
    try {
      const text = await file.text();
      if (!this.isCurrent(generation)) return;
      this.draftJsonState.set(text);
      this.progressState.set('idle');
    } catch {
      if (this.isCurrent(generation)) this.progressState.set('idle');
    }
  }

  async validate(context: StructureJsonImportValidationContext): Promise<void> {
    const project = this.currentProject;
    if (!project) return;
    const generation = this.beginWork('parsing');
    this.checkingProgressState.set({ completed: 0, total: 0 });

    const parsed = await parseStructureJsonWithWorker(this.draftJson(), {
      isCancelled: () => !this.isCurrent(generation, project),
    });
    if (!this.isCurrent(generation, project)) return;

    if (!parsed.valid || !parsed.value) {
      this.importPlanState.set(undefined);
      this.previewState.set(emptyInvalidPreview(parsed.code));
      this.progressState.set('complete');
      return;
    }

    this.progressState.set('checking');
    const result = await validateParsedStructureJsonPreviewAsync(
      parsed.value,
      project.size,
      (id) => this.library.get(id),
      (completed, total) => {
        if (this.isCurrent(generation, project))
          this.checkingProgressState.set({ completed, total });
      },
      { isCancelled: () => !this.isCurrent(generation, project) },
      project,
      (id) => this.library.maxStackSizeFor(id),
      this.validationOptions(context),
    );
    if (!this.isCurrent(generation, project) || !result) return;

    this.modePlanCache.clear();
    this.progressState.set('planning');
    const plan = await this.buildPlan(result, 'replace', generation, project, context);
    if (!this.isCurrent(generation, project) || !plan) return;

    this.modePlanCache.set('replace', plan);
    this.previewState.set(this.previewForPlan(result, plan));
    this.importModeState.set('replace');
    this.importPlanState.set(plan);
    this.progressState.set('ready');
  }

  async selectImportMode(
    mode: StructureJsonImportMode,
    context: StructureJsonImportValidationContext,
  ): Promise<void> {
    const result = this.preview();
    const project = this.currentProject;
    if (!result?.parsed || !project) return;

    const generation = this.beginWork('planning');
    this.importModeState.set(mode);
    const cached = this.modePlanCache.get(mode);
    if (cached && cached.source === result.parsed && cached.baseProject === project) {
      this.previewState.set(this.previewForPlan(result, cached));
      this.importPlanState.set(cached);
      this.progressState.set('ready');
      return;
    }

    const plan = await this.buildPlan(result, mode, generation, project, context);
    if (!this.isCurrent(generation, project) || !plan) return;
    this.modePlanCache.set(mode, plan);
    this.previewState.set(this.previewForPlan(result, plan));
    this.importPlanState.set(plan);
    this.progressState.set('ready');
  }

  hasPlan(): boolean {
    return this.importPlan()?.baseProject === this.currentProject;
  }

  canApplyImport(): boolean {
    const plan = this.importPlan();
    return (
      !!plan &&
      plan.baseProject === this.currentProject &&
      (plan.applicable || isBoundsOnlyPlan(plan))
    );
  }

  async applyImport(context: StructureJsonImportValidationContext): Promise<boolean> {
    const plan = this.importPlan();
    const baseProject = this.currentProject;
    const generation = this.generation;
    if (!plan || !baseProject || plan.baseProject !== baseProject) return false;

    const bounds = inspectStructureJsonBounds(plan.source, baseProject.size);
    let effectivePlan = plan;
    let targetProject = baseProject;
    let clipped = false;

    if (isBoundsOnlyPlan(plan) && bounds.hasNegativeCoordinates) {
      await this.dialogs.warning(
        this.i18n.t('structureJsonImportResizeUnavailable'),
        this.i18n.t('structureJsonImportNegativeCoordinates'),
      );
      return false;
    }

    if (bounds.exceedsCurrent && isBoundsOnlyPlan(plan)) {
      const choice = await this.dialogs.choice<OversizedImportChoice>({
        title: this.i18n.t('structureJsonOversizedImportTitle'),
        text: oversizedImportText(this.i18n, baseProject, bounds),
        icon: 'warning',
        options: [
          {
            id: 'resize',
            label: this.i18n.t('structureJsonImportResizeAndImport'),
            value: 'resize',
            kind: 'primary',
          },
          {
            id: 'keep',
            label: this.i18n.t('structureJsonImportKeepCurrentSize'),
            value: 'keep',
            kind: 'secondary',
          },
          {
            id: 'cancel',
            label: this.i18n.t('structureJsonImportCancel'),
            value: 'cancel',
            kind: 'secondary',
          },
        ],
      });
      if (!this.isCurrent(generation, baseProject) || choice === undefined || choice === 'cancel')
        return false;

      if (choice === 'keep') {
        this.progressState.set('planning');
        const clippedPlan = await this.buildPlanForSource(
          clipStructureJsonToBounds(plan.source, baseProject.size),
          baseProject,
          plan.mode,
          generation,
          baseProject,
          context,
        );
        if (!clippedPlan || !this.isCurrent(generation, baseProject)) return false;
        effectivePlan = clippedPlan;
        clipped = true;
      } else {
        const resized = resizeProjectForStructureJsonImport(baseProject, bounds);
        if (!resized) {
          await this.dialogs.warning(this.i18n.t('structureJsonImportResizeUnavailable'));
          return false;
        }
        targetProject = resized;
        this.progressState.set('planning');
        const resizedPlan = await this.buildPlanForSource(
          plan.source,
          targetProject,
          plan.mode,
          generation,
          baseProject,
          context,
        );
        if (!resizedPlan || !this.isCurrent(generation, baseProject)) return false;
        effectivePlan = resizedPlan;
      }
      if (!effectivePlan.applicable) {
        await this.dialogs.warning(this.i18n.t('structureJsonImportResizeUnavailable'));
        return false;
      }
    } else {
      if (!plan.applicable) return false;
      const confirmed = await this.dialogs.confirm({
        title: this.i18n.t('structureJsonApplyImportTitle'),
        text: confirmationText(this.i18n, baseProject, plan),
        confirmButtonText: this.i18n.t('structureJsonApplyImport'),
        cancelButtonText: this.i18n.t('cancel'),
        icon: plan.mode === 'replace' ? 'warning' : 'question',
        destructive: plan.mode === 'replace',
      });
      if (!confirmed || !this.isCurrent(generation, baseProject)) return false;
    }

    if (
      effectivePlan.emptyImport &&
      effectivePlan.mode === 'replace' &&
      baseProject.blocks.length === 0 &&
      (baseProject.decorations ?? []).length === 0 &&
      targetProject === baseProject
    ) {
      this.selection.clear();
      return true;
    }

    const prepared = prepareStructureJsonImportPlan(targetProject, effectivePlan);
    if (!prepared) {
      await this.dialogs.warning(this.i18n.t('structureJsonImportStale'));
      return false;
    }

    if (!this.isCurrent(generation, baseProject)) return false;
    this.hydrationStatus.markNextActivity('import');
    const changed = this.history.execute('Import Structure JSON', (current) =>
      current === baseProject ? prepared : undefined,
    );
    if (!changed) {
      this.hydrationStatus.markNextActivity('build');
      await this.dialogs.warning(this.i18n.t('structureJsonImportStale'));
      return false;
    }

    this.selection.clear();
    if (clipped) {
      await this.dialogs.warning(
        this.i18n.t('structureJsonImportClippedTitle'),
        this.i18n
          .t('structureJsonImportClippedText')
          .replace('{blocks}', String(bounds.blocksOutsideBounds))
          .replace('{decorations}', String(bounds.decorationsOutsideBounds)),
      );
    }
    return true;
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.invalidateWork();
    this.modePlanCache.clear();
  }

  private beginWork(progress: StructureJsonImportProgress): number {
    const generation = ++this.generation;
    this.progressState.set(progress);
    return generation;
  }

  private invalidateWork(): void {
    this.generation += 1;
  }

  private isCurrent(generation: number, project = this.currentProject): boolean {
    return (
      !this.disposed &&
      generation === this.generation &&
      project !== undefined &&
      project === this.currentProject
    );
  }

  private validationOptions(
    context: StructureJsonImportValidationContext,
  ): StructureJsonValidationOptions {
    return {
      contentLimitsEnabled: context.contentLimitsEnabled,
      contentLimits: context.contentLimits,
      placeableItems: context.placeableItems,
    };
  }

  private async buildPlan(
    result: StructureJsonValidationPreview,
    mode: StructureJsonImportMode,
    generation: number,
    project: ProjectDocument,
    context: StructureJsonImportValidationContext,
  ): Promise<StructureJsonImportPlan | undefined> {
    if (!result.parsed) return undefined;
    return buildStructureJsonImportPlanAsync(
      result.parsed,
      result,
      project,
      (id) => this.library.get(id),
      mode,
      this.i18n.t('structureJsonImportedGroupFallback'),
      this.validationOptions(context),
      {
        cancellation: { isCancelled: () => !this.isCurrent(generation, project) },
        onProgress: (_stage, completed, total) => {
          if (this.isCurrent(generation, project))
            this.checkingProgressState.set({ completed, total });
        },
      },
    );
  }

  private async buildPlanForSource(
    source: StructureJson,
    project: ProjectDocument,
    mode: StructureJsonImportMode,
    generation: number,
    expectedProject: ProjectDocument,
    context: StructureJsonImportValidationContext,
  ): Promise<StructureJsonImportPlan | undefined> {
    const options = this.validationOptions(context);
    const validation = await validateParsedStructureJsonPreviewAsync(
      source,
      project.size,
      (id) => this.library.get(id),
      (completed, total) => {
        if (this.isCurrent(generation, expectedProject))
          this.checkingProgressState.set({ completed, total });
      },
      { isCancelled: () => !this.isCurrent(generation, expectedProject) },
      project,
      (id) => this.library.maxStackSizeFor(id),
      options,
    );
    if (!validation || !this.isCurrent(generation, expectedProject)) return undefined;
    return buildStructureJsonImportPlanAsync(
      source,
      validation,
      project,
      (id) => this.library.get(id),
      mode,
      this.i18n.t('structureJsonImportedGroupFallback'),
      options,
      { cancellation: { isCancelled: () => !this.isCurrent(generation, expectedProject) } },
    );
  }

  private previewForPlan(
    result: StructureJsonValidationPreview,
    plan: StructureJsonImportPlan,
  ): StructureJsonValidationPreview {
    return {
      ...result,
      totalDecorations: plan.importedDecorationCount,
      validDecorations: plan.validDecorationCount,
      missingDecorationAssets: plan.missingDecorationAssetCount,
      invalidDecorations: plan.decorationIssues.filter(
        (issue) => issue.category !== 'missing-asset',
      ).length,
      decorationIssues: plan.decorationIssues,
    };
  }
}

function emptyInvalidPreview(
  code: StructureJsonValidationPreview['structuralCode'],
): StructureJsonValidationPreview {
  return {
    structuralValid: false,
    structuralCode: code,
    totalBlocks: 0,
    validBlocks: 0,
    missingBlocks: 0,
    outOfBounds: 0,
    invalidStates: 0,
    duplicateCoordinates: 0,
    affectedDuplicateBlocks: 0,
    issues: {
      missing: [],
      bounds: [],
      state: [],
      duplicate: [],
      contentLimit: [],
      support: [],
      warning: [],
    },
    totalDecorations: 0,
    validDecorations: 0,
    missingDecorationAssets: 0,
    invalidDecorations: 0,
    decorationIssues: [],
  };
}

function isBoundsOnlyPlan(plan: StructureJsonImportPlan): boolean {
  if (!plan.blockingIssues.length) return false;
  return (
    plan.blockingIssues.every(
      (blocker) => blocker.code === 'out-of-bounds' || blocker.code === 'invalid-decoration',
    ) &&
    plan.decorationIssues
      .filter((issue) => issue.category !== 'missing-asset')
      .every((issue) => issue.category === 'bounds' && issue.reason === 'out-of-bounds')
  );
}

function confirmationText(
  i18n: I18nService,
  project: ProjectDocument,
  plan: StructureJsonImportPlan,
): string {
  const template =
    plan.mode === 'replace'
      ? 'structureJsonReplaceConfirm'
      : plan.mode === 'merge'
        ? 'structureJsonMergeConfirm'
        : 'structureJsonNewGroupConfirm';
  let text = i18n
    .t(template)
    .replace('{current}', String(project.blocks.length))
    .replace('{imported}', String(plan.importedBlockCount))
    .replace('{name}', plan.newGroup?.name ?? '');
  text += `\n${i18n.t('structureJsonCurrentDecorations')}: ${project.decorations?.length ?? 0} · ${i18n.t('structureJsonImportedDecorations')}: ${plan.importedDecorationCount}`;
  if (plan.missingBlockCount > 0) {
    text += `\n\n${i18n.t('structureJsonMissingPlaceholderNotice').replace('{count}', String(plan.missingBlockCount))}`;
  }
  return text;
}

function oversizedImportText(
  i18n: I18nService,
  project: ProjectDocument,
  bounds: StructureJsonBoundsPreflight,
): string {
  let text = i18n
    .t('structureJsonOversizedImportText')
    .replace('{current}', formatProjectSize(project.size))
    .replace('{required}', formatProjectSize(bounds.requiredSize));
  const resized = resizeProjectForStructureJsonImport(project, bounds);
  if (
    resized?.structureMode === 'huge-structure-blocks' &&
    project.structureMode !== 'huge-structure-blocks'
  ) {
    text += `\n\n${i18n.t('structureJsonImportResizeHugeNotice')}`;
  }
  if (!resized && !bounds.hasNegativeCoordinates)
    text += `\n\n${i18n.t('structureJsonImportResizeUnavailable')}`;
  if (bounds.hasNegativeCoordinates)
    text += `\n\n${i18n.t('structureJsonImportNegativeCoordinates')}`;
  return text;
}

function formatProjectSize(size: ProjectDocument['size']): string {
  return `${size.x} × ${size.y} × ${size.z}`;
}
