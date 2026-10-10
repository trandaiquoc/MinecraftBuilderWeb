import { Component, OnChanges, inject, input, output } from '@angular/core';
import {
  LucideCheck,
  LucideCheckCircle2,
  LucideCircleHelp,
  LucideCircleX,
  LucideTriangleAlert,
  LucideUpload,
} from '@lucide/angular';
import type { PlaceableItemDefinition } from '../../../core/blocks/placement-palette/placeable-item.types';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import type { ExternalAiContentLimits } from '../../../core/persistence/structure-json/external-ai-content-limits';
import type {
  StructureJsonBlockIssue,
  StructureJsonCoordinateConflict,
  StructureJsonDecorationIssue,
} from '../../../core/persistence/structure-json/structure-json-import';
import type { StructureJsonBoundsPreflight } from '../../../core/persistence/structure-json/structure-json-bounds';
import type {
  StructureJsonImportBlocker,
  StructureJsonImportMode,
  StructureJsonImportPlan,
} from '../../../core/persistence/structure-json/structure-json-import-plan';
import {
  structureJsonBlockIssueSeverity,
  structureJsonDecorationIssueSeverity,
  structureJsonImportBlockerSeverity,
  type StructureJsonValidationSeverity,
} from '../../../core/persistence/structure-json/structure-json-validation-severity';
import type { TranslationKey } from '../../../core/ui/localization/translation-catalogs';
import {
  StructureJsonImportWorkflow,
  type StructureJsonImportProgress,
  type StructureJsonImportValidationContext,
} from './structure-json-import-workflow';

@Component({
  selector: 'app-structure-json-import-workspace',
  imports: [
    LucideCheck,
    LucideCheckCircle2,
    LucideCircleHelp,
    LucideCircleX,
    LucideTriangleAlert,
    LucideUpload,
  ],
  providers: [StructureJsonImportWorkflow],
  templateUrl: './structure-json-import-workspace.component.html',
  styleUrl: './structure-json-import-workspace.component.scss',
})
export class StructureJsonImportWorkspaceComponent implements OnChanges {
  protected readonly i18n = inject(I18nService);
  private readonly workflow = inject(StructureJsonImportWorkflow);

  readonly project = input.required<ProjectDocument>();
  readonly placeableItems = input.required<readonly PlaceableItemDefinition[]>();
  readonly contentLimits = input.required<ExternalAiContentLimits>();
  readonly contentLimitsEnabled = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly draftJson = this.workflow.draftJson;
  protected readonly preview = this.workflow.preview;
  protected readonly progress = this.workflow.progress;
  protected readonly checkingProgress = this.workflow.checkingProgress;
  protected readonly importMode = this.workflow.importMode;
  protected readonly importPlan = this.workflow.importPlan;
  protected readonly importModes = this.workflow.importModes;

  ngOnChanges(): void {
    this.workflow.setProject(this.project());
  }

  cancelPendingWork(): void {
    this.workflow.cancelPendingWork();
  }

  protected setDraft(value: string): void {
    this.workflow.setDraft(value);
  }

  protected loadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.workflow.loadFile(file);
  }

  protected validate(): Promise<void> {
    return this.workflow.validate(this.validationContext());
  }

  protected selectImportMode(mode: StructureJsonImportMode): Promise<void> {
    return this.workflow.selectImportMode(mode, this.validationContext());
  }

  hasPlan(): boolean {
    return this.workflow.hasPlan();
  }

  canApplyImport(): boolean {
    return this.workflow.canApplyImport();
  }

  async applyImport(): Promise<void> {
    if (await this.workflow.applyImport(this.validationContext())) this.closed.emit();
  }

  protected progressLabel(): string {
    const labels: Partial<Record<StructureJsonImportProgress, TranslationKey>> = {
      reading: 'structureJsonProgressReading',
      parsing: 'structureJsonProgressParsing',
      checking: 'structureJsonProgressChecking',
      planning: 'structureJsonProgressPlanning',
      ready: 'structureJsonProgressReady',
    };
    const key = labels[this.progress()];
    return key ? this.i18n.t(key) : '';
  }

  protected issueGroups(): readonly {
    readonly category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning';
    readonly label: string;
    readonly severity: StructureJsonValidationSeverity;
  }[] {
    return [
      {
        category: 'missing',
        label: this.i18n.t('structureJsonMissingBlocks'),
        severity: structureJsonBlockIssueSeverity('missing'),
      },
      {
        category: 'bounds',
        label: this.i18n.t('structureJsonOutOfBounds'),
        severity: structureJsonBlockIssueSeverity('bounds'),
      },
      {
        category: 'state',
        label: this.i18n.t('structureJsonInvalidStates'),
        severity: structureJsonBlockIssueSeverity('state'),
      },
      {
        category: 'contentLimit',
        label: this.i18n.t('structureJsonContentLimitViolations'),
        severity: structureJsonBlockIssueSeverity('content-limit'),
      },
      {
        category: 'support',
        label: this.i18n.t('structureJsonMissingSupport'),
        severity: structureJsonBlockIssueSeverity('support'),
      },
      {
        category: 'warning',
        label: this.i18n.t('structureJsonValidationWarnings'),
        severity: structureJsonBlockIssueSeverity('warning'),
      },
    ];
  }

  protected issues(
    category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning',
  ): readonly StructureJsonBlockIssue[] {
    return (this.preview()?.issues[category] ?? []).slice(0, 12);
  }

  protected duplicateConflicts(): readonly StructureJsonCoordinateConflict[] {
    return (this.preview()?.issues.duplicate ?? []).slice(0, 12);
  }

  protected issueCount(
    category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning' | 'duplicate',
  ): number {
    return this.preview()?.issues[category].length ?? 0;
  }

  protected moreIssueCount(
    category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning',
  ): number {
    return Math.max(0, this.issueCount(category) - 12);
  }

  protected moreDuplicateCount(): number {
    return Math.max(0, this.issueCount('duplicate') - 12);
  }

  protected decorationIssues(): readonly StructureJsonDecorationIssue[] {
    return (this.preview()?.decorationIssues ?? []).slice(0, 12);
  }

  protected moreDecorationIssueCount(): number {
    return Math.max(0, (this.preview()?.decorationIssues.length ?? 0) - 12);
  }

  protected blockIssueSeverity(
    category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning',
  ): StructureJsonValidationSeverity {
    return structureJsonBlockIssueSeverity(
      category === 'contentLimit' ? 'content-limit' : category,
    );
  }

  protected decorationIssueSeverity(
    category: StructureJsonDecorationIssue['category'],
  ): StructureJsonValidationSeverity {
    return structureJsonDecorationIssueSeverity(category);
  }

  protected decorationGroupSeverity(): StructureJsonValidationSeverity {
    return this.decorationIssues().some(
      (issue) => this.decorationIssueSeverity(issue.category) === 'error',
    )
      ? 'error'
      : 'warning';
  }

  protected importBlockerSeverity(
    code: StructureJsonImportBlocker['code'],
  ): StructureJsonValidationSeverity {
    return structureJsonImportBlockerSeverity(code);
  }

  protected decorationReasonLabel(issue: StructureJsonDecorationIssue): string {
    const key =
      issue.category === 'content-limit'
        ? 'structureJsonReasonContentLimit'
        : issue.reason === 'missing-painting-variant'
          ? 'structureJsonDecorationReasonMissingAsset'
          : issue.reason === 'out-of-bounds'
            ? 'structureJsonDecorationReasonOutOfBounds'
            : issue.reason === 'missing-support' || issue.reason === 'missing-painting-support'
              ? 'structureJsonDecorationReasonMissingSupport'
              : issue.reason === 'blocked-by-block' || issue.reason === 'overlap-decoration'
                ? 'structureJsonDecorationReasonConflict'
                : 'structureJsonDecorationReasonInvalid';
    return this.i18n.t(key);
  }

  protected moreIssueLabel(
    category: 'missing' | 'bounds' | 'state' | 'contentLimit' | 'support' | 'warning',
  ): string {
    return this.i18n
      .t('structureJsonMoreIssues')
      .replace('{count}', String(this.moreIssueCount(category)));
  }

  protected reasonLabel(issue: StructureJsonBlockIssue): string {
    const reason = issue.reason;
    const key =
      reason.code === 'missing-block'
        ? 'structureJsonReasonMissingBlock'
        : reason.code === 'out-of-bounds'
          ? 'structureJsonReasonOutOfBounds'
          : reason.code === 'unknown-state-property'
            ? 'structureJsonReasonUnknownStateProperty'
            : reason.code === 'invalid-block-entity'
              ? 'structureJsonReasonInvalidBlockEntity'
              : reason.code === 'content-limit'
                ? 'structureJsonReasonContentLimit'
                : reason.code === 'missing-support'
                  ? 'structureJsonReasonMissingSupport'
                  : reason.code === 'origin-offset'
                    ? 'structureJsonReasonOriginOffset'
                    : reason.code === 'possible-floating'
                      ? 'structureJsonReasonPossibleFloating'
                      : reason.code === 'tree-grounding'
                        ? 'structureJsonReasonTreeGrounding'
                        : 'structureJsonReasonUnsupportedStateValue';
    let label = this.i18n.t(key);
    if (reason.code === 'origin-offset') {
      label = label
        .replace('{axis}', reason.axis.toUpperCase())
        .replace('{value}', String(reason.value));
    }
    return label;
  }

  protected modeDescription(mode: StructureJsonImportMode): string {
    return this.i18n.t(
      (
        {
          replace: 'structureJsonImportReplaceDescription',
          merge: 'structureJsonImportMergeDescription',
          'new-group': 'structureJsonImportNewGroupDescription',
        } as const
      )[mode],
    );
  }

  protected modeLabel(mode: StructureJsonImportMode): string {
    return this.i18n.t(
      (
        {
          replace: 'structureJsonImportReplace',
          merge: 'structureJsonImportMerge',
          'new-group': 'structureJsonImportNewGroup',
        } as const
      )[mode],
    );
  }

  protected blockerLabel(blocker: StructureJsonImportBlocker): string {
    const key =
      blocker.code === 'locked-current-blocks' || blocker.code === 'locked-current-decorations'
        ? 'structureJsonImportBlockedLocked'
        : blocker.code === 'existing-coordinate-conflict' || blocker.code === 'decoration-conflict'
          ? 'structureJsonImportBlockedConflicts'
          : blocker.code === 'content-limit'
            ? 'structureJsonImportBlockedContentLimit'
            : blocker.code === 'missing-support'
              ? 'structureJsonImportBlockedSupport'
              : blocker.code === 'empty-import'
                ? 'structureJsonImportBlockedEmpty'
                : 'structureJsonImportBlockedValidation';
    return this.i18n.t(key);
  }

  protected structuralMessage(): string {
    const code = this.preview()?.structuralCode;
    const key =
      code === 'invalid-json'
        ? 'structureJsonValidationInvalidJson'
        : code === 'format'
          ? 'structureJsonValidationFormat'
          : code === 'version'
            ? 'structureJsonValidationVersion'
            : code === 'block'
              ? 'structureJsonValidationBlock'
              : 'structureJsonValidationShape';
    return this.i18n.t(key);
  }

  private validationContext(): StructureJsonImportValidationContext {
    return {
      placeableItems: this.placeableItems(),
      contentLimits: this.contentLimits(),
      contentLimitsEnabled: this.contentLimitsEnabled(),
    };
  }
}
