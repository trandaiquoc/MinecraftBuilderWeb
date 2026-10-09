import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { LucideArrowLeft, LucideArrowRight, LucideCheckCircle2, LucideChevronDown, LucideChevronUp, LucideCircleX, LucideTrash2, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { ContentAssetRuntimeService, ImportedModSummary } from '../../../../core/assets/content-asset-runtime.service';
import { ModImportProgress, PreparedModImport } from '../../../../core/assets/mod/external-mod-importer';
import type { ModImportDiagnostic, ModImportReport } from '../../../../core/assets/mod/external-mod-import-contracts';
import { ModSupportCatalog, ModSupportCertification } from '../../../../core/assets/mod/mod-support-catalog';
import { SupportedModLoader } from '../../../../core/assets/mod/mod-loader';
import { AssetActivityEntry, AssetActivityProgress } from '../../../../core/assets/asset-activity.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { JarUploadValidationError, validateJarUpload } from '../../../../core/assets/mod/jar-upload-validation';
import { UiProgressComponent } from '../../../../shared/ui/progress/ui-progress.component';
import { compactContentCount, diagnosticPresentation, filterAssetActivity, importPhaseState, importStageState, importStages, phaseLabels, progressPercentForProgress, type ImportOperationStatus, type ImportStage, type ImportStageState, type ImportStageStateContext } from './asset-manager-mod-presentation';
import { AssetManagerModDetailsComponent } from './asset-manager-mod-details.component';
import { AssetManagerModImportWorkflow } from './asset-manager-mod-import-workflow';

type AssetManagerTab = 'vanilla' | 'mods';
type DiagnosticDialogState = { readonly modName: string; readonly kind: 'warning' | 'blocking'; readonly diagnostics: readonly ModImportDiagnostic[] };
const phases: readonly ModImportProgress['phase'][] = importStages.flatMap(({ phases }) => phases);
@Component({ selector: 'app-asset-manager-dialog', imports: [LucideArrowLeft, LucideCheckCircle2, LucideChevronDown, LucideChevronUp, LucideCircleX, LucideTrash2, LucideTriangleAlert, LucideX, CdkTrapFocus, CdkConnectedOverlay, CdkOverlayOrigin, UiProgressComponent, AssetManagerModDetailsComponent], providers: [AssetManagerModImportWorkflow], templateUrl: './asset-manager-dialog.component.html', styleUrl: './asset-manager-dialog.component.scss', host: { '(document:keydown.escape)': 'closeFromEscape()' } })
export class AssetManagerDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly assets = inject(ContentAssetRuntimeService);
  private readonly dialog = inject(DialogService);
  private readonly supportCatalog = inject(ModSupportCatalog);
  protected readonly modImport = inject(AssetManagerModImportWorkflow);
  readonly closed = output<void>();
  protected readonly tab = signal<AssetManagerTab>('vanilla');
  private readonly vanillaActionRunning = signal(false);
  protected readonly importing = computed(() => this.vanillaActionRunning() || this.modImport.importing());
  protected readonly vanillaError = signal('');
  protected readonly removing = signal<string | undefined>(undefined);
  protected readonly modSearch = signal('');
  protected readonly helpOpen = signal(false);
  protected readonly detailsSourceId = signal<string | undefined>(undefined);
  protected readonly technicalProgressOpen = signal(false);
  protected readonly diagnosticDialog = signal<DiagnosticDialogState | undefined>(undefined);
  protected readonly confirming = signal(false);
  protected readonly phaseOrder = phases;
  protected readonly stageOrder = importStages;
  protected readonly centeredOverlayPositions = [{ originX: 'center' as const, originY: 'center' as const, overlayX: 'center' as const, overlayY: 'center' as const }];
  private detailsRestoreTarget: HTMLElement | undefined;
  private diagnosticRestoreTarget: HTMLElement | undefined;
  protected readonly filteredMods = computed(() => { const query = this.modSearch().trim().toLocaleLowerCase(); return this.assets.importedMods().filter((mod) => !query || [mod.displayName, mod.modId, mod.version, mod.report.loader].some((value) => value.toLocaleLowerCase().includes(query))); });
  protected readonly vanillaActivity = computed(() => filterAssetActivity(this.assets.activity.entries(), 'vanilla'));
  protected readonly modActivity = computed(() => filterAssetActivity(this.assets.activity.entries(), 'mods'));
  protected readonly currentVanillaActivity = computed(() => { const current = this.assets.activity.current(); return current && (current.category === 'vanilla' || current.category === 'cache') ? this.withActivityProgress(current) : undefined; });
  protected readonly currentModActivity = computed(() => { const current = this.assets.activity.current(); return current?.category === 'mod' ? this.withActivityProgress(current) : undefined; });
  protected readonly selectedDetails = computed(() => this.assets.importedMods().find((mod) => mod.sourceId === this.detailsSourceId()));
  private readonly detailsFocusEffect = effect(() => {
    const selected = this.selectedDetails();
    if (selected && !this.detailsRestoreTarget && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) this.detailsRestoreTarget = document.activeElement;
    if (!selected && this.detailsRestoreTarget) { const target = this.detailsRestoreTarget; this.detailsRestoreTarget = undefined; queueMicrotask(() => target.focus()); }
  });
  private readonly diagnosticFocusEffect = effect(() => {
    const dialog = this.diagnosticDialog();
    if (dialog && !this.diagnosticRestoreTarget && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) this.diagnosticRestoreTarget = document.activeElement;
    if (!dialog && this.diagnosticRestoreTarget) { const target = this.diagnosticRestoreTarget; this.diagnosticRestoreTarget = undefined; queueMicrotask(() => target.focus()); }
  });

  protected closeFromEscape(): void { if (this.helpOpen()) { this.closeHelp(); return; } if (this.diagnosticDialog()) { this.closeDiagnostics(); return; } if (this.selectedDetails()) { this.closeDetails(); return; } this.cancelPreflight(); this.closed.emit(); }
  ngOnDestroy(): void { this.modImport.dispose(); }
  protected setTab(tab: AssetManagerTab): void { this.tab.set(tab); }
  protected closeDetails(): void { const target = this.detailsRestoreTarget; this.detailsRestoreTarget = undefined; this.detailsSourceId.set(undefined); queueMicrotask(() => target?.focus()); }
  protected openDetails(sourceId: string): void { this.detailsSourceId.set(sourceId); }
  protected openHelp(): void { this.helpOpen.set(true); }
  protected toggleHelp(): void { this.helpOpen.update((open) => !open); }
  protected closeHelp(): void { this.helpOpen.set(false); }
  protected openJarPicker(input: HTMLInputElement): void { if (this.importing() || this.assets.status() === 'importing') return; input.value = ''; const picker = input as HTMLInputElement & { showPicker?: () => void }; if (typeof picker.showPicker === 'function') { try { picker.showPicker(); return; } catch { /* native click fallback */ } } input.click(); }
  protected async importJar(event: Event): Promise<void> { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { validateJarUpload(file); } catch (error) { this.vanillaError.set(this.jarValidationMessage(error)); input.value = ''; return; } const confirmed = await this.dialog.confirm({ title: this.i18n.t('assetManagerManualImportConfirmTitle'), text: this.i18n.t('assetManagerManualImportConfirmText').replace('{version}', this.assets.activeVersion()), confirmButtonText: this.i18n.t('assetManagerImport'), cancelButtonText: this.i18n.t('cancel') }); if (!confirmed) { input.value = ''; return; } this.vanillaActionRunning.set(true); try { await this.assets.importJar(file); } finally { this.vanillaActionRunning.set(false); input.value = ''; } }
  protected async inspectMod(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.modImport.inspect(file);
      input.value = '';
    }
  }
  private jarValidationMessage(error: unknown): string { if (error instanceof JarUploadValidationError) return this.i18n.t(error.code === 'jar-extension' ? 'assetManagerJarOnly' : 'assetManagerJarTooLarge'); return error instanceof Error ? error.message : this.i18n.t('assetManagerImportError'); }
  protected async confirmModImport(): Promise<void> {
    if (await this.modImport.confirm()) this.modSearch.set('');
  }
  protected cancelPreflight(): void { this.modImport.cancel(); }
  protected cancelActiveOperation(): void { this.cancelPreflight(); }
  protected canRetryPreflight(): boolean { return this.modImport.canRetry(); }
  protected retryPreflight(): void { this.modImport.retry(); }
  protected async removeMod(mod: ImportedModSummary): Promise<void> { if (this.removing()) return; this.confirming.set(true); let confirmed = false; try { confirmed = await this.dialog.confirm({ title: this.i18n.t('assetManagerRemoveModTitle'), text: this.i18n.t('assetManagerRemoveModText').replace('{name}', mod.displayName), confirmButtonText: this.i18n.t('remove'), cancelButtonText: this.i18n.t('cancel'), destructive: true }); } finally { this.confirming.set(false); } if (!confirmed) return; this.removing.set(mod.sourceId); try { await this.assets.removeMod(mod.sourceId); if (this.detailsSourceId() === mod.sourceId) this.closeDetails(); } finally { this.removing.set(undefined); } }
  protected openDiagnostics(report: ModImportReport | undefined, modName: string, kind: 'warning' | 'blocking' = 'warning'): void { if (!report) return; const diagnostics = report.diagnostics.filter((diagnostic) => kind === 'warning' ? diagnostic.severity === 'warning' : diagnostic.severity === 'error' || diagnostic.category === 'blocking'); if (diagnostics.length) this.diagnosticDialog.set({ modName, kind, diagnostics }); }
  protected closeDiagnostics(): void { this.diagnosticDialog.set(undefined); }
  protected async redownload(): Promise<void> { if (!this.importing()) { this.vanillaActionRunning.set(true); try { await this.assets.redownload(); } finally { this.vanillaActionRunning.set(false); } } }
  protected async removeCached(): Promise<void> { if (!this.importing()) { this.vanillaActionRunning.set(true); try { await this.assets.removeCachedVersion(); } finally { this.vanillaActionRunning.set(false); } } }
  protected exportCompatibilityReport(): void { this.assets.exportCompatibilityReport(); }
  protected formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }
  private withActivityProgress(entry: AssetActivityEntry): AssetActivityEntry { const phase = phases.includes(entry.message as ModImportProgress['phase']) ? this.phaseLabel(entry.message as ModImportProgress['phase']) : entry.message; return { ...entry, message: entry.progress ? `${phase} · ${this.activityProgressLabel(entry.progress, entry.message === 'opening-archive')}` : phase }; }
  private activityProgressLabel(progress: AssetActivityProgress, bytes: boolean): string { const loaded = progress.total !== undefined && progress.total > 0 ? `${bytes ? this.formatBytes(progress.loaded) : progress.loaded} / ${bytes ? this.formatBytes(progress.total) : progress.total}` : `${progress.loaded}`; return progress.total !== undefined && progress.total > 0 ? `${loaded} (${Math.round(progress.loaded / progress.total * 100)}%)` : loaded; }
  protected progressPercent(progress: ModImportProgress): number | undefined { return progressPercentForProgress(progress); }
  protected progressDetail(progress: ModImportProgress): string { return progress.processed !== undefined && progress.total !== undefined ? `${progress.phase === 'opening-archive' ? `${this.formatBytes(progress.processed)} / ${this.formatBytes(progress.total)}` : `${progress.processed} / ${progress.total}`} · ${this.progressPercent(progress)?.toFixed(0) ?? 0}%` : this.i18n.t('assetManagerWorking'); }
  protected operationTaskLabel(): string { const phase = this.modImport.preflightProgress()?.phase; return phase ? this.phaseLabel(phase) : this.i18n.t('assetManagerReadingJar'); }
  protected operationDetail(): string { const progress = this.modImport.preflightProgress(); return progress ? this.progressDetail(progress) : this.i18n.t('assetManagerWorking'); }
  protected formatTime(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp); }
  protected statusLabel(): string { const status = this.assets.status(); return status === 'ready' ? this.i18n.t('assetsReady') : status === 'importing' || status === 'downloading' || status === 'loading-cache' ? this.i18n.t('loadingAssets') : status === 'offline' ? this.i18n.t('assetsOffline') : status === 'unsupported-format' ? this.i18n.t('assetsUnsupportedFormat') : status === 'no-assets' ? this.i18n.t('noAssets') : this.i18n.t('importRequired'); }
  protected phaseLabel(phase: ModImportProgress['phase']): string { return this.i18n.t(phaseLabels[phase]); }
  protected phaseState(phase: ModImportProgress['phase']): 'pending' | 'active' | 'complete' { return importPhaseState(phase, this.stageStateContext()); }
  protected stageLabel(stage: ImportStage): string { return this.i18n.t(importStages.find((candidate) => candidate.id === stage)?.label ?? 'assetManagerImportStage'); }
  protected stageState(stage: ImportStage): ImportStageState { return importStageState(stage, this.stageStateContext()); }
  protected stageStateContext(): ImportStageStateContext { const prepared = this.modImport.preflight(); return { operationKind: this.modImport.operationKind(), operationStatus: this.modImport.operationStatus(), prepared: !!prepared, canActivate: prepared?.canActivate ?? false, progressPhase: this.modImport.preflightProgress()?.phase }; }
  protected preflightIsAwaitingImport(): boolean { return !!this.modImport.preflight() && this.stageState('import') === 'awaiting-user'; }
  protected preflightGuidance(): string { return this.i18n.t('assetManagerReadyToImportHint'); }
  protected loaderLabel(loader: SupportedModLoader): string { return loader === 'unknown' ? this.i18n.t('assetManagerUnknownLoader') : loader[0].toUpperCase() + loader.slice(1); }
  protected compatibilityStatus(status: string | undefined): string { return status === 'compatible' ? this.i18n.t('assetManagerCompatible') : status === 'incompatible' ? this.i18n.t('assetManagerIncompatible') : this.i18n.t('assetManagerCannotVerify'); }
  protected compatibilityClass(status: string | undefined): string { return status === 'compatible' ? 'status-ok' : 'status-blocked'; }
  protected certification(value: ImportedModSummary | PreparedModImport): ModSupportCertification | undefined { const normalized = 'report' in value ? value.report?.normalizedMetadata : value.normalizedMetadata; if (!normalized) return undefined; return this.supportCatalog.certificationFor({ metadata: normalized, minecraftVersion: this.assets.activeVersion(), fingerprint: value.fingerprint }); }
  protected importedCertification(mod: ImportedModSummary): ModSupportCertification | undefined { return this.certification(mod); }
  protected warningCount(report: PreparedModImport['report'] | ImportedModSummary['report'] | undefined): number { return report?.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length ?? 0; }
  protected blockingCount(report: PreparedModImport['report'] | ImportedModSummary['report'] | undefined): number { return report?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error' || diagnostic.category === 'blocking').length ?? 0; }
  protected compactCount(imported: number, detected: number, label: string): string { return compactContentCount(imported, detected, label); }
  protected warningLabel(report: ImportedModSummary['report']): string { const count = this.warningCount(report); return count ? `${count} ${this.i18n.t('assetManagerWarnings')}` : ''; }
  protected hasDiagnostics(report: ImportedModSummary['report'], kind: 'blocking' | 'warning' | 'info'): boolean { return report.diagnostics.some((diagnostic) => diagnostic.category === kind || (kind === 'warning' && diagnostic.severity === 'warning') || (kind === 'info' && diagnostic.severity === 'info')); }
  protected diagnosticCount(report: ImportedModSummary['report'], kind: 'blocking' | 'warning' | 'info'): number { return report.diagnostics.filter((diagnostic) => diagnostic.category === kind || (kind === 'warning' && diagnostic.severity === 'warning') || (kind === 'blocking' && (diagnostic.severity === 'error' || diagnostic.category === 'blocking')) || (kind === 'info' && diagnostic.severity === 'info')).length; }
  protected hasProminentDiagnostics(report: ImportedModSummary['report']): boolean { return diagnosticPresentation(report) === 'prominent'; }
  protected detailsMetadata(mod: ImportedModSummary): NonNullable<PreparedModImport['normalizedMetadata']> | undefined { return mod.report.normalizedMetadata; }
}
