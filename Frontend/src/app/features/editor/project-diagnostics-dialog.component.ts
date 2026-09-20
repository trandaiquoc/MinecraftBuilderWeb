import { Component, computed, inject, OnDestroy, output, signal } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { auditVanillaAssets, VanillaAssetCoverageReport, VanillaAssetAuditRecord } from '../../core/assets/vanilla-asset-audit';
import { VanillaAssetsService } from '../../core/assets/vanilla-assets.service';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { I18nService } from '../../core/ui/i18n.service';
import { UiTooltipDirective } from '../../shared/ui-tooltip.directive';

type DiagnosticSeverity = 'error' | 'warning' | 'info';
interface ProjectIssue { readonly severity: DiagnosticSeverity; readonly title: string; readonly detail: string; readonly id?: string; }

@Component({ selector: 'app-project-diagnostics-dialog', imports: [LucideX, UiTooltipDirective], templateUrl: './project-diagnostics-dialog.component.html', styleUrl: './project-diagnostics-dialog.component.scss' })
export class ProjectDiagnosticsDialogComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  private readonly workspace = inject(WorkspaceStateService);
  private readonly library = inject(BlockLibraryService);
  protected readonly assets = inject(VanillaAssetsService);
  readonly closed = output<void>();
  protected readonly query = signal('');
  protected readonly audit = signal<VanillaAssetCoverageReport | undefined>(undefined);
  protected readonly auditProgress = signal(0);
  protected readonly auditing = signal(false);
  private controller?: AbortController;
  ngOnDestroy(): void { this.controller?.abort(); }
  protected readonly issues = computed<readonly ProjectIssue[]>(() => {
    const project = this.workspace.project();
    const result: ProjectIssue[] = [];
    if (project) for (const block of project.blocks) {
      const definition = this.library.get(block.id);
      if (block.kind === 'missing') result.push({ severity: 'error', title: this.i18n.t('diagnosticsMissingContent'), detail: this.i18n.t('diagnosticsMissingText'), id: block.id });
      else if (!definition) result.push({ severity: 'error', title: this.i18n.t('diagnosticsMissingContent'), detail: this.i18n.t('diagnosticsUnresolvedText'), id: block.id });
      else {
        if (definition.visualSupport !== 'real') result.push({ severity: 'warning', title: this.i18n.t('diagnosticsVisualSupport'), detail: this.i18n.t('diagnosticsPartialVisualText'), id: block.id });
        if (definition.behaviorSupport !== 'full') result.push({ severity: 'warning', title: this.i18n.t('diagnosticsBehaviorSupport'), detail: this.i18n.t('diagnosticsPartialBehaviorText'), id: block.id });
      }
    }
    if (this.assets.status() !== 'ready') result.push({ severity: 'warning', title: this.i18n.t('diagnosticsAssetProblem'), detail: this.i18n.t('diagnosticsAssetUnavailableText') });
    const q = this.query().trim().toLocaleLowerCase();
    return q ? result.filter((item) => `${item.title} ${item.detail} ${item.id ?? ''}`.toLocaleLowerCase().includes(q)) : result;
  });
  protected setQuery(event: Event): void { this.query.set((event.target as HTMLInputElement).value); }
  protected severityLabel(severity: DiagnosticSeverity): string { return severity === 'error' ? this.i18n.t('error') : severity === 'warning' ? this.i18n.t('warning') : this.i18n.t('info'); }
  protected recordMatches(record: VanillaAssetAuditRecord): boolean { const q = this.query().trim().toLocaleLowerCase(); return !q || `${record.registryId} ${record.catalog.displayName} ${record.render.reasons.join(' ')}`.toLocaleLowerCase().includes(q); }
  protected async runAudit(): Promise<void> {
    const provider = this.assets.provider();
    if (!provider || this.auditing()) return;
    this.controller?.abort(); this.controller = new AbortController(); this.auditing.set(true); this.auditProgress.set(0);
    try { this.audit.set(await auditVanillaAssets(provider, { signal: this.controller.signal, onProgress: (done, total) => this.auditProgress.set(total ? done / total : 1) })); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) this.audit.set(undefined); }
    finally { this.auditing.set(false); }
  }
  protected cancelAudit(): void { this.controller?.abort(); }
}
