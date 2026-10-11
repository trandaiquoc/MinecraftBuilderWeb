import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { LucideX } from '@lucide/angular';
import {
  auditVanillaAssets,
  VanillaAssetCoverageReport,
  VanillaAssetAuditRecord,
} from '../../../../core/assets/vanilla/vanilla-asset-audit';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import type { VanillaAssetInspectionView } from '../../../../core/assets/vanilla/vanilla-asset-provider';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { UiProgressComponent } from '../../../../shared/ui/progress/ui-progress.component';
import type { ViewportPerformanceEvidence } from '../../../../core/renderer/engine/three-viewport-engine';
import {
  collectProjectIssues,
  filterProjectIssues,
  type DiagnosticSeverity,
} from './project-diagnostics-analysis';

interface ProjectDiagnosticsAuditScope {
  readonly project: ProjectDocument | undefined;
  readonly provider: VanillaAssetInspectionView;
  readonly controller: AbortController;
  readonly generation: number;
}

@Component({
  selector: 'app-project-diagnostics-dialog',
  imports: [LucideX, UiTooltipDirective, UiProgressComponent, CdkTrapFocus],
  templateUrl: './project-diagnostics-dialog.component.html',
  styleUrl: './project-diagnostics-dialog.component.scss',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class ProjectDiagnosticsDialogComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(ContentAssetRuntimeService);
  readonly closed = output<void>();
  readonly rendererEvidence = input<ViewportPerformanceEvidence | undefined>();
  protected readonly query = signal('');
  protected readonly logicalBlockCount = computed(
    () => this.workspace.project()?.blocks.length ?? 0,
  );
  protected readonly audit = signal<VanillaAssetCoverageReport | undefined>(undefined);
  protected readonly auditProgress = signal(0);
  protected readonly auditing = signal(false);
  private controller?: AbortController;
  private auditGeneration = 0;
  private auditScope?: ProjectDiagnosticsAuditScope;
  private auditSourceInitialized = false;
  private observedAuditProject?: ProjectDocument;
  private observedAuditProvider?: VanillaAssetInspectionView;
  private readonly collectedIssues = computed(() => {
    this.library.catalogRevision();
    return collectProjectIssues(
      this.workspace.project(),
      (id) => this.library.get(id),
      this.assets.status() === 'ready',
      {
        missingContent: this.i18n.t('diagnosticsMissingContent'),
        missingText: this.i18n.t('diagnosticsMissingText'),
        unresolvedText: this.i18n.t('diagnosticsUnresolvedText'),
        visualSupport: this.i18n.t('diagnosticsVisualSupport'),
        behaviorSupport: this.i18n.t('diagnosticsBehaviorSupport'),
        partialVisualText: this.i18n.t('diagnosticsPartialVisualText'),
        partialBehaviorText: this.i18n.t('diagnosticsPartialBehaviorText'),
        assetProblem: this.i18n.t('diagnosticsAssetProblem'),
        assetUnavailableText: this.i18n.t('diagnosticsAssetUnavailableText'),
      },
    );
  });
  protected readonly issues = computed(() =>
    filterProjectIssues(this.collectedIssues(), this.query()),
  );

  constructor() {
    effect(() => {
      const project = this.workspace.project();
      const provider = this.assets.provider();
      if (!this.auditSourceInitialized) {
        this.auditSourceInitialized = true;
      } else if (project !== this.observedAuditProject || provider !== this.observedAuditProvider) {
        this.cancelAudit();
        this.audit.set(undefined);
        this.auditProgress.set(0);
      }
      this.observedAuditProject = project;
      this.observedAuditProvider = provider;
    });
  }

  ngOnDestroy(): void {
    this.cancelAudit();
  }
  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected severityLabel(severity: DiagnosticSeverity): string {
    return severity === 'error'
      ? this.i18n.t('error')
      : severity === 'warning'
        ? this.i18n.t('warning')
        : this.i18n.t('info');
  }
  protected recordMatches(record: VanillaAssetAuditRecord): boolean {
    const q = this.query().trim().toLocaleLowerCase();
    return (
      !q ||
      `${record.registryId} ${record.catalog.displayName} ${record.render.reasons.join(' ')}`
        .toLocaleLowerCase()
        .includes(q)
    );
  }
  protected async runAudit(): Promise<void> {
    const provider = this.assets.provider();
    if (!provider || this.auditing()) return;
    const controller = new AbortController();
    const scope = {
      project: this.workspace.project(),
      provider,
      controller,
      generation: ++this.auditGeneration,
    };
    this.controller = controller;
    this.auditScope = scope;
    this.auditing.set(true);
    this.auditProgress.set(0);
    try {
      const report = await auditVanillaAssets(provider, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (this.isCurrentAudit(scope)) this.auditProgress.set(total ? done / total : 1);
        },
      });
      if (this.isCurrentAudit(scope)) this.audit.set(report);
    } catch (error) {
      if (
        this.isCurrentAudit(scope) &&
        !(error instanceof DOMException && error.name === 'AbortError')
      )
        this.audit.set(undefined);
    } finally {
      if (this.auditScope === scope) {
        this.auditScope = undefined;
        this.controller = undefined;
        this.auditing.set(false);
      }
    }
  }
  protected cancelAudit(): void {
    this.auditGeneration += 1;
    this.controller?.abort();
    this.controller = undefined;
    this.auditScope = undefined;
    this.auditing.set(false);
  }
  private isCurrentAudit(scope: ProjectDiagnosticsAuditScope): boolean {
    return (
      this.auditScope === scope &&
      this.auditGeneration === scope.generation &&
      this.workspace.project() === scope.project &&
      this.assets.provider() === scope.provider &&
      !scope.controller.signal.aborted
    );
  }
}
