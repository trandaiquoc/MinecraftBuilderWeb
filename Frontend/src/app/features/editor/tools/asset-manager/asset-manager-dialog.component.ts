import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { LucideArrowLeft, LucideArrowRight, LucideCheckCircle2, LucideChevronDown, LucideChevronUp, LucideCircleX, LucideTrash2, LucideTriangleAlert, LucideX } from '@lucide/angular';
import { VanillaAssetsService, ImportedModSummary } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { ModImportProgress, PreparedModImport } from '../../../../core/assets/mod/external-mod-importer';
import type { ModImportDiagnostic, ModImportReport } from '../../../../core/assets/mod/external-mod-provider';
import { ModSupportCatalog, ModSupportCertification } from '../../../../core/assets/mod/mod-support-catalog';
import { SupportedModLoader } from '../../../../core/assets/mod/mod-loader';
import { AssetActivityEntry, AssetActivityProgress } from '../../../../core/assets/asset-activity.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { JarUploadValidationError, validateJarUpload } from '../../../../core/assets/mod/jar-upload-validation';
import { UiProgressComponent } from '../../../../shared/ui/progress/ui-progress.component';
import { ModImportTimeoutError } from '../../../../core/assets/mod/mod-import-cancellation';

type AssetManagerTab = 'vanilla' | 'mods';
type DiagnosticDialogState = { readonly modName: string; readonly kind: 'warning' | 'blocking'; readonly diagnostics: readonly ModImportDiagnostic[] };
const phases: readonly ModImportProgress['phase'][] = ['opening-archive', 'reading-metadata', 'checking-compatibility', 'indexing-resources', 'extracting-resources', 'discovering-blocks', 'discovering-items', 'discovering-decorations', 'evaluating-behavior', 'checking-conflicts', 'saving-cache', 'finalizing-cache', 'activating'];
export type ImportStage = 'reading' | 'compatibility' | 'resources' | 'content' | 'validation' | 'import';
export type ImportStageState = 'pending' | 'active' | 'complete' | 'awaiting-user' | 'blocked';
export type ImportOperationKind = 'preflight' | 'commit' | undefined;
export type ImportOperationStatus = 'running' | 'cancelling' | 'cancelled' | 'timed-out' | 'failed' | 'ready' | undefined;
export const importStages: readonly { readonly id: ImportStage; readonly phases: readonly ModImportProgress['phase'][]; readonly label: string }[] = [
  { id: 'reading', phases: ['opening-archive', 'reading-metadata'], label: 'assetManagerReadingJar' },
  { id: 'compatibility', phases: ['checking-compatibility'], label: 'assetManagerCompatibility' },
  { id: 'resources', phases: ['indexing-resources', 'extracting-resources'], label: 'assetManagerResourcesStage' },
  { id: 'content', phases: ['discovering-blocks', 'discovering-items', 'discovering-decorations', 'evaluating-behavior'], label: 'assetManagerDiscoveringContent' },
  { id: 'validation', phases: ['checking-conflicts'], label: 'assetManagerValidationStage' },
  { id: 'import', phases: ['saving-cache', 'finalizing-cache', 'activating'], label: 'assetManagerImportStage' },
];

export function filterAssetActivity(entries: readonly AssetActivityEntry[], tab: 'vanilla' | 'mods'): readonly AssetActivityEntry[] {
  return entries.filter((entry) => tab === 'mods' ? entry.category === 'mod' : entry.category === 'vanilla' || entry.category === 'cache');
}

export function importStageForPhase(phase: ModImportProgress['phase']): ImportStage | undefined {
  return importStages.find((stage) => stage.phases.includes(phase))?.id;
}

export function compactContentCount(imported: number, detected: number, label: string): string {
  return imported === detected ? `${imported} ${label}` : `${imported} / ${detected} ${label}`;
}

export function progressPercentForProgress(progress: Pick<ModImportProgress, 'processed' | 'total'>): number | undefined {
  return progress.total && progress.total > 0 && progress.processed !== undefined
    ? Math.min(100, Math.max(0, progress.processed / progress.total * 100))
    : undefined;
}

export interface ImportStageStateContext {
  readonly operationKind: ImportOperationKind;
  readonly operationStatus: ImportOperationStatus;
  readonly prepared: boolean;
  readonly canActivate: boolean;
  readonly progressPhase?: ModImportProgress['phase'];
}

/** Maps technical progress plus the user confirmation boundary to one UI state. */
export function importStageState(stage: ImportStage, context: ImportStageStateContext): ImportStageState {
  const stageIndex = importStages.findIndex((candidate) => candidate.id === stage);
  const currentIndex = context.progressPhase ? importStages.findIndex((candidate) => candidate.phases.includes(context.progressPhase!)) : -1;

  if (context.operationKind === 'commit') return stageIndex < importStages.length - 1 ? 'complete' : 'active';
  if (context.operationKind === 'preflight') {
    if (currentIndex < 0) return 'pending';
    return stageIndex < currentIndex ? 'complete' : stageIndex === currentIndex ? 'active' : 'pending';
  }
  if (!context.prepared) return 'pending';
  if (!context.canActivate) {
    if (stage === 'validation' || stage === 'import') return 'blocked';
    return stageIndex < importStages.length - 2 ? 'complete' : 'pending';
  }
  if (context.operationStatus === 'failed' || context.operationStatus === 'cancelled' || context.operationStatus === 'timed-out') {
    return stage === 'import' ? 'blocked' : stageIndex < importStages.length - 1 ? 'complete' : 'pending';
  }
  if (context.operationStatus === 'ready' && stage === 'import') return 'awaiting-user';
  return stageIndex < importStages.length - 1 ? 'complete' : 'pending';
}

export function importPhaseState(phase: ModImportProgress['phase'], context: ImportStageStateContext): 'pending' | 'active' | 'complete' {
  const currentIndex = context.progressPhase ? phases.indexOf(context.progressPhase) : -1;
  const phaseIndex = phases.indexOf(phase);
  if (currentIndex < 0) return 'pending';
  if (context.operationKind) return phaseIndex < currentIndex ? 'complete' : phaseIndex === currentIndex ? 'active' : 'pending';
  return phaseIndex <= currentIndex ? 'complete' : 'pending';
}

export type DiagnosticPresentation = 'none' | 'technical' | 'prominent';

export function diagnosticPresentation(report: Pick<ModImportReport, 'diagnostics'>): DiagnosticPresentation {
  const hasBlocking = report.diagnostics.some((diagnostic) => diagnostic.severity === 'error' || diagnostic.category === 'blocking');
  const hasWarning = report.diagnostics.some((diagnostic) => diagnostic.severity === 'warning' || diagnostic.category === 'warning');
  if (hasBlocking || hasWarning) return 'prominent';
  return report.diagnostics.some((diagnostic) => diagnostic.severity === 'info' || diagnostic.category === 'info') ? 'technical' : 'none';
}

@Component({ selector: 'app-asset-manager-dialog', imports: [LucideArrowLeft, LucideCheckCircle2, LucideChevronDown, LucideChevronUp, LucideCircleX, LucideTrash2, LucideTriangleAlert, LucideX, CdkTrapFocus, CdkConnectedOverlay, CdkOverlayOrigin, UiProgressComponent], templateUrl: './asset-manager-dialog.component.html', styleUrl: './asset-manager-dialog.component.scss', host: { '(document:keydown.escape)': 'closeFromEscape()' } })
export class AssetManagerDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly assets = inject(VanillaAssetsService);
  private readonly dialog = inject(DialogService);
  private readonly supportCatalog = inject(ModSupportCatalog);
  readonly closed = output<void>();
  protected readonly tab = signal<AssetManagerTab>('vanilla');
  protected readonly importing = signal(false);
  protected readonly removing = signal<string | undefined>(undefined);
  protected readonly modError = signal('');
  protected readonly modSearch = signal('');
  protected readonly helpOpen = signal(false);
  protected readonly detailsSourceId = signal<string | undefined>(undefined);
  protected readonly preflight = signal<PreparedModImport | undefined>(undefined);
  protected readonly preflightProgress = signal<ModImportProgress | undefined>(undefined);
  protected readonly preflightError = signal('');
  protected readonly preflightIconUrl = signal<string | undefined>(undefined);
  protected readonly technicalProgressOpen = signal(false);
  protected readonly diagnosticDialog = signal<DiagnosticDialogState | undefined>(undefined);
  protected readonly confirming = signal(false);
  protected readonly operationKind = signal<'preflight' | 'commit' | undefined>(undefined);
  protected readonly operationStatus = signal<ImportOperationStatus>(undefined);
  protected readonly phaseOrder = phases;
  protected readonly stageOrder = importStages;
  protected readonly centeredOverlayPositions = [{ originX: 'center' as const, originY: 'center' as const, overlayX: 'center' as const, overlayY: 'center' as const }];
  private detailsRestoreTarget: HTMLElement | undefined;
  private diagnosticRestoreTarget: HTMLElement | undefined;
  private operationId = 0;
  private operationController?: AbortController;
  private lastModFile?: File;
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
  ngOnDestroy(): void { this.operationId += 1; this.operationController?.abort(); this.operationController = undefined; this.preflight()?.dispose(); this.revokePreflightIcon(); }
  protected setTab(tab: AssetManagerTab): void { this.tab.set(tab); }
  protected closeDetails(): void { const target = this.detailsRestoreTarget; this.detailsRestoreTarget = undefined; this.detailsSourceId.set(undefined); queueMicrotask(() => target?.focus()); }
  protected openHelp(): void { this.helpOpen.set(true); }
  protected toggleHelp(): void { this.helpOpen.update((open) => !open); }
  protected closeHelp(): void { this.helpOpen.set(false); }
  protected openJarPicker(input: HTMLInputElement): void { if (this.importing() || this.assets.status() === 'importing') return; input.value = ''; const picker = input as HTMLInputElement & { showPicker?: () => void }; if (typeof picker.showPicker === 'function') { try { picker.showPicker(); return; } catch { /* native click fallback */ } } input.click(); }
  protected async importJar(event: Event): Promise<void> { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { validateJarUpload(file); } catch (error) { this.modError.set(this.jarValidationMessage(error)); input.value = ''; return; } const confirmed = await this.dialog.confirm({ title: this.i18n.t('assetManagerManualImportConfirmTitle'), text: this.i18n.t('assetManagerManualImportConfirmText').replace('{version}', this.assets.activeVersion()), confirmButtonText: this.i18n.t('assetManagerImport'), cancelButtonText: this.i18n.t('cancel') }); if (!confirmed) { input.value = ''; return; } this.importing.set(true); try { await this.assets.importJar(file); } finally { this.importing.set(false); input.value = ''; } }
  protected async inspectMod(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; if (this.importing()) this.cancelPreflight();
    try { validateJarUpload(file); } catch (error) { this.preflightError.set(this.jarValidationMessage(error)); input.value = ''; return; }
    this.lastModFile = file;
    this.cancelPreflight(); this.preflight.set(undefined); this.beginOperation('preflight'); this.modError.set(''); this.preflightError.set(''); this.preflightProgress.set(undefined);
    const operation = this.operationController!; const id = this.operationId;
    try {
      const prepared = await this.assets.inspectModJar(file, (progress) => { if (id === this.operationId) this.preflightProgress.set(progress); }, operation.signal);
      if (id !== this.operationId || operation.signal.aborted) { prepared.dispose(); return; }
      this.preflight.set(prepared); this.preflightIconUrl.set(this.createPreflightIcon(prepared)); this.operationStatus.set(prepared.canActivate ? 'ready' : 'failed'); this.assets.activity.finish('mod-preflight', this.i18n.t('assetManagerImportReady'), 'mod');
    } catch (error) {
      if (id !== this.operationId) return;
      if (isAbortError(error)) { if (error instanceof ModImportTimeoutError) { this.operationStatus.set('timed-out'); this.preflightError.set(this.timeoutMessage(error)); this.assets.activity.timeout('mod-preflight', this.preflightError(), 'mod'); } else { this.operationStatus.set('cancelled'); this.assets.activity.cancel('mod-preflight', this.i18n.t('assetManagerTaskCancelled'), 'mod'); } }
      else { this.operationStatus.set('failed'); this.preflightError.set(error instanceof Error ? error.message : this.i18n.t('assetManagerImportError')); this.assets.activity.fail('mod-preflight', this.preflightError(), 'mod'); }
    } finally { if (id === this.operationId) this.finishOperation(); input.value = ''; }
  }
  private jarValidationMessage(error: unknown): string { if (error instanceof JarUploadValidationError) return this.i18n.t(error.code === 'jar-extension' ? 'assetManagerJarOnly' : 'assetManagerJarTooLarge'); return error instanceof Error ? error.message : this.i18n.t('assetManagerImportError'); }
  protected async confirmModImport(): Promise<void> {
    const prepared = this.preflight(); if (!prepared || !prepared.canActivate || this.importing()) return;
    this.beginOperation('commit'); this.modError.set(''); const operation = this.operationController!; const id = this.operationId;
    try {
      await this.assets.commitPreparedModImport(prepared, (progress) => { if (id === this.operationId) this.preflightProgress.set(progress); }, operation.signal);
      if (id !== this.operationId) return;
      this.preflight.set(undefined); this.preflightProgress.set(undefined); this.modSearch.set('');
      this.operationStatus.set(undefined);
      this.assets.activity.finish('mod-import', this.i18n.t('assetManagerImported'), 'mod');
    } catch (error) {
      if (id !== this.operationId) return;
      if (isAbortError(error)) { if (error instanceof ModImportTimeoutError) { this.operationStatus.set('timed-out'); this.modError.set(this.timeoutMessage(error)); this.assets.activity.timeout('mod-import', this.modError(), 'mod'); } else { this.operationStatus.set('cancelled'); this.assets.activity.cancel('mod-import', this.i18n.t('assetManagerTaskCancelled'), 'mod'); } }
      else { this.operationStatus.set('failed'); this.modError.set(error instanceof Error ? error.message : this.i18n.t('assetManagerImportError')); this.assets.activity.fail('mod-import', this.modError(), 'mod'); }
    } finally { if (id === this.operationId) { prepared.dispose(); this.revokePreflightIcon(); this.finishOperation(); } }
  }
  protected cancelPreflight(): void {
    if (this.operationController && !this.operationController.signal.aborted) this.operationStatus.set('cancelling');
    this.operationController?.abort(); this.operationController = undefined; this.operationId += 1;
    const prepared = this.preflight(); if (prepared) prepared.dispose(); this.revokePreflightIcon(); this.preflight.set(undefined); this.preflightProgress.set(undefined); this.preflightError.set('');
    if (this.operationKind()) { this.assets.activity.cancel(this.operationKind() === 'commit' ? 'mod-import' : 'mod-preflight', this.i18n.t('assetManagerTaskCancelled'), 'mod'); this.operationKind.set(undefined); this.operationStatus.set('cancelled'); this.importing.set(false); }
  }
  protected cancelActiveOperation(): void { this.cancelPreflight(); }
  protected canRetryPreflight(): boolean { return !!this.lastModFile && !this.importing(); }
  protected retryPreflight(): void { const file = this.lastModFile; if (!file || this.importing()) return; const input = { files: [file], value: '' } as unknown as HTMLInputElement; void this.inspectMod({ target: input } as unknown as Event); }
  protected async removeMod(mod: ImportedModSummary): Promise<void> { if (this.removing()) return; this.confirming.set(true); let confirmed = false; try { confirmed = await this.dialog.confirm({ title: this.i18n.t('assetManagerRemoveModTitle'), text: this.i18n.t('assetManagerRemoveModText').replace('{name}', mod.displayName), confirmButtonText: this.i18n.t('remove'), cancelButtonText: this.i18n.t('cancel'), destructive: true }); } finally { this.confirming.set(false); } if (!confirmed) return; this.removing.set(mod.sourceId); try { await this.assets.removeMod(mod.sourceId); if (this.detailsSourceId() === mod.sourceId) this.closeDetails(); } finally { this.removing.set(undefined); } }
  protected openDiagnostics(report: ModImportReport | undefined, modName: string, kind: 'warning' | 'blocking' = 'warning'): void { if (!report) return; const diagnostics = report.diagnostics.filter((diagnostic) => kind === 'warning' ? diagnostic.severity === 'warning' : diagnostic.severity === 'error' || diagnostic.category === 'blocking'); if (diagnostics.length) this.diagnosticDialog.set({ modName, kind, diagnostics }); }
  protected closeDiagnostics(): void { this.diagnosticDialog.set(undefined); }
  protected async redownload(): Promise<void> { if (!this.importing()) { this.importing.set(true); try { await this.assets.redownload(); } finally { this.importing.set(false); } } }
  protected async removeCached(): Promise<void> { if (!this.importing()) { this.importing.set(true); try { await this.assets.removeCachedVersion(); } finally { this.importing.set(false); } } }
  protected exportCompatibilityReport(): void { this.assets.exportCompatibilityReport(); }
  protected formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }
  private withActivityProgress(entry: AssetActivityEntry): AssetActivityEntry { const phase = phases.includes(entry.message as ModImportProgress['phase']) ? this.phaseLabel(entry.message as ModImportProgress['phase']) : entry.message; return { ...entry, message: entry.progress ? `${phase} · ${this.activityProgressLabel(entry.progress, entry.message === 'opening-archive')}` : phase }; }
  private activityProgressLabel(progress: AssetActivityProgress, bytes: boolean): string { const loaded = progress.total !== undefined && progress.total > 0 ? `${bytes ? this.formatBytes(progress.loaded) : progress.loaded} / ${bytes ? this.formatBytes(progress.total) : progress.total}` : `${progress.loaded}`; return progress.total !== undefined && progress.total > 0 ? `${loaded} (${Math.round(progress.loaded / progress.total * 100)}%)` : loaded; }
  protected progressPercent(progress: ModImportProgress): number | undefined { return progressPercentForProgress(progress); }
  protected progressDetail(progress: ModImportProgress): string { return progress.processed !== undefined && progress.total !== undefined ? `${progress.phase === 'opening-archive' ? `${this.formatBytes(progress.processed)} / ${this.formatBytes(progress.total)}` : `${progress.processed} / ${progress.total}`} · ${this.progressPercent(progress)?.toFixed(0) ?? 0}%` : this.i18n.t('assetManagerWorking'); }
  protected operationTaskLabel(): string { const phase = this.preflightProgress()?.phase; return phase ? this.phaseLabel(phase) : this.i18n.t('assetManagerReadingJar'); }
  protected operationDetail(): string { const progress = this.preflightProgress(); return progress ? this.progressDetail(progress) : this.i18n.t('assetManagerWorking'); }
  protected formatTime(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp); }
  protected statusLabel(): string { const status = this.assets.status(); return status === 'ready' ? this.i18n.t('assetsReady') : status === 'importing' || status === 'downloading' || status === 'loading-cache' ? this.i18n.t('loadingAssets') : status === 'offline' ? this.i18n.t('assetsOffline') : status === 'unsupported-format' ? this.i18n.t('assetsUnsupportedFormat') : status === 'no-assets' ? this.i18n.t('noAssets') : this.i18n.t('importRequired'); }
  protected phaseLabel(phase: ModImportProgress['phase']): string { return this.i18n.t(`assetPhase_${phase.replaceAll('-', '_')}`); }
  protected phaseState(phase: ModImportProgress['phase']): 'pending' | 'active' | 'complete' { return importPhaseState(phase, this.stageStateContext()); }
  protected stageLabel(stage: ImportStage): string { const value = importStages.find((candidate) => candidate.id === stage)?.label ?? stage; return this.i18n.t(value); }
  protected stageState(stage: ImportStage): ImportStageState { return importStageState(stage, this.stageStateContext()); }
  protected stageStateContext(): ImportStageStateContext { const prepared = this.preflight(); return { operationKind: this.operationKind(), operationStatus: this.operationStatus(), prepared: !!prepared, canActivate: prepared?.canActivate ?? false, progressPhase: this.preflightProgress()?.phase }; }
  protected preflightIsAwaitingImport(): boolean { return !!this.preflight() && this.stageState('import') === 'awaiting-user'; }
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
  private createPreflightIcon(prepared: PreparedModImport): string | undefined { const path = prepared.normalizedMetadata?.icon; const bytes = path ? prepared.resources.get(path) : undefined; if (!bytes || typeof URL === 'undefined') return undefined; return URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })); }
  private revokePreflightIcon(): void { const url = this.preflightIconUrl(); if (url && typeof URL !== 'undefined') URL.revokeObjectURL(url); this.preflightIconUrl.set(undefined); }
  private beginOperation(kind: 'preflight' | 'commit'): void { this.operationController?.abort(); this.operationId += 1; this.operationController = new AbortController(); this.operationKind.set(kind); this.operationStatus.set('running'); this.importing.set(true); this.assets.activity.begin(kind === 'commit' ? 'mod-import' : 'mod-preflight', this.i18n.t('assetManagerImporting'), 'mod'); }
  private finishOperation(): void { this.operationController = undefined; this.operationKind.set(undefined); this.importing.set(false); }
  private timeoutMessage(error: ModImportTimeoutError): string { return `${this.i18n.t('assetManagerTaskTimedOut')}: ${this.phaseLabel(error.phase as ModImportProgress['phase'])}. ${this.i18n.t('assetManagerNoProgress').replace('{seconds}', String(Math.round(error.timeoutMs / 1000)))}`; }
}

function isAbortError(error: unknown): boolean { return error instanceof ModImportTimeoutError || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError'); }
