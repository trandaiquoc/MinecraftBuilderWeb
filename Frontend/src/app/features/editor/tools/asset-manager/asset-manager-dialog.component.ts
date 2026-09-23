import { Component, computed, inject, output, signal } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { VanillaAssetsService, ImportedModSummary } from '../../../../core/assets/vanilla/vanilla-assets.service';
import { ModImportProgress, PreparedModImport } from '../../../../core/assets/mod/external-mod-importer';
import { ModSupportCatalog, ModSupportCertification } from '../../../../core/assets/mod/mod-support-catalog';
import { SupportedModLoader } from '../../../../core/assets/mod/mod-loader';
import { AssetActivityEntry } from '../../../../core/assets/asset-activity.service';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { trapDialogFocus } from '../../../../shared/ui/dialog/dialog-focus';

type AssetManagerTab = 'vanilla' | 'mods';
const phases: readonly ModImportProgress['phase'][] = ['opening-archive', 'reading-metadata', 'checking-compatibility', 'indexing-resources', 'extracting-resources', 'discovering-blocks', 'discovering-items', 'discovering-decorations', 'evaluating-behavior', 'checking-conflicts', 'saving-cache', 'activating'];
export type ImportStage = 'reading' | 'compatibility' | 'resources' | 'content' | 'validation' | 'import';
export const importStages: readonly { readonly id: ImportStage; readonly phases: readonly ModImportProgress['phase'][]; readonly label: string }[] = [
  { id: 'reading', phases: ['opening-archive', 'reading-metadata'], label: 'assetManagerReadingJar' },
  { id: 'compatibility', phases: ['checking-compatibility'], label: 'assetManagerCompatibility' },
  { id: 'resources', phases: ['indexing-resources', 'extracting-resources'], label: 'assetManagerResourcesStage' },
  { id: 'content', phases: ['discovering-blocks', 'discovering-items', 'discovering-decorations', 'evaluating-behavior'], label: 'assetManagerDiscoveringContent' },
  { id: 'validation', phases: ['checking-conflicts'], label: 'assetManagerValidationStage' },
  { id: 'import', phases: ['saving-cache', 'activating'], label: 'assetManagerImportStage' },
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

@Component({ selector: 'app-asset-manager-dialog', imports: [LucideX], templateUrl: './asset-manager-dialog.component.html', styleUrl: './asset-manager-dialog.component.scss', host: { '(document:keydown.escape)': 'closeFromEscape()', '(document:pointerdown)': 'handleDocumentPointerdown($event)' } })
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
  protected readonly helpPinned = signal(false);
  protected readonly technicalProgressOpen = signal(false);
  protected readonly phaseOrder = phases;
  protected readonly stageOrder = importStages;
  private helpCloseTimer: number | undefined;
  protected readonly filteredMods = computed(() => { const query = this.modSearch().trim().toLocaleLowerCase(); return this.assets.importedMods().filter((mod) => !query || [mod.displayName, mod.modId, mod.version, mod.report.loader].some((value) => value.toLocaleLowerCase().includes(query))); });
  protected readonly vanillaActivity = computed(() => filterAssetActivity(this.assets.activity.entries(), 'vanilla'));
  protected readonly modActivity = computed(() => filterAssetActivity(this.assets.activity.entries(), 'mods'));
  protected readonly currentVanillaActivity = computed(() => { const current = this.assets.activity.current(); return current && (current.category === 'vanilla' || current.category === 'cache') ? current : undefined; });
  protected readonly currentModActivity = computed(() => { const current = this.assets.activity.current(); return current?.category === 'mod' ? current : undefined; });
  protected readonly selectedDetails = computed(() => this.assets.importedMods().find((mod) => mod.sourceId === this.detailsSourceId()));

  protected closeFromEscape(): void { if (this.helpOpen()) { this.closeHelp(); return; } if (this.selectedDetails()) { this.detailsSourceId.set(undefined); return; } this.cancelPreflight(); this.closed.emit(); }
  protected handleDocumentPointerdown(event: PointerEvent): void { const target = event.target as HTMLElement | null; if (this.helpOpen() && !target?.closest('.help-popover, .help-button')) this.closeHelp(); }
  protected setTab(tab: AssetManagerTab): void { this.tab.set(tab); }
  protected trapFocus(event: KeyboardEvent): void { trapDialogFocus(event, event.currentTarget as HTMLElement); }
  protected openHelp(pinned: boolean): void { this.helpPinned.set(pinned || this.helpPinned()); this.helpOpen.set(true); }
  protected toggleHelp(): void { if (this.helpPinned()) this.closeHelp(); else this.openHelp(true); }
  protected closeHelp(): void { if (this.helpCloseTimer !== undefined) window.clearTimeout(this.helpCloseTimer); this.helpCloseTimer = undefined; this.helpOpen.set(false); this.helpPinned.set(false); }
  protected scheduleHelpClose(): void { if (this.helpPinned()) return; if (this.helpCloseTimer !== undefined) window.clearTimeout(this.helpCloseTimer); this.helpCloseTimer = window.setTimeout(() => { this.helpCloseTimer = undefined; if (!this.helpPinned()) this.helpOpen.set(false); }, 180); }
  protected cancelHelpClose(): void { if (this.helpCloseTimer !== undefined) window.clearTimeout(this.helpCloseTimer); this.helpCloseTimer = undefined; }
  protected openJarPicker(input: HTMLInputElement): void { if (this.importing() || this.assets.status() === 'importing') return; input.value = ''; const picker = input as HTMLInputElement & { showPicker?: () => void }; if (typeof picker.showPicker === 'function') { try { picker.showPicker(); return; } catch { /* native click fallback */ } } input.click(); }
  protected async importJar(event: Event): Promise<void> { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; const confirmed = await this.dialog.confirm({ title: this.i18n.t('assetManagerManualImportConfirmTitle'), text: this.i18n.t('assetManagerManualImportConfirmText').replace('{version}', this.assets.activeVersion()), confirmButtonText: this.i18n.t('assetManagerImport'), cancelButtonText: this.i18n.t('cancel') }); if (!confirmed) { input.value = ''; return; } this.importing.set(true); try { await this.assets.importJar(file); } finally { this.importing.set(false); input.value = ''; } }
  protected async inspectMod(event: Event): Promise<void> { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file || this.importing()) return; this.cancelPreflight(); this.importing.set(true); this.modError.set(''); this.preflightError.set(''); this.preflightProgress.set(undefined); try { const prepared = await this.assets.inspectModJar(file, (progress) => this.preflightProgress.set(progress)); this.preflight.set(prepared); this.preflightIconUrl.set(this.createPreflightIcon(prepared)); } catch (error) { this.preflightError.set(error instanceof Error ? error.message : this.i18n.t('assetManagerImportError')); } finally { this.importing.set(false); input.value = ''; } }
  protected async confirmModImport(): Promise<void> { const prepared = this.preflight(); if (!prepared || !prepared.canActivate || this.importing()) return; this.importing.set(true); this.modError.set(''); try { await this.assets.commitPreparedModImport(prepared, (progress) => this.preflightProgress.set(progress)); this.preflight.set(undefined); this.preflightProgress.set(undefined); this.modSearch.set(''); } catch (error) { this.modError.set(error instanceof Error ? error.message : this.i18n.t('assetManagerImportError')); } finally { prepared.dispose(); this.revokePreflightIcon(); this.importing.set(false); } }
  protected cancelPreflight(): void { const prepared = this.preflight(); if (prepared) prepared.dispose(); this.revokePreflightIcon(); this.preflight.set(undefined); this.preflightProgress.set(undefined); this.preflightError.set(''); }
  protected async removeMod(mod: ImportedModSummary): Promise<void> { if (this.removing()) return; const confirmed = await this.dialog.confirm({ title: this.i18n.t('assetManagerRemoveModTitle'), text: this.i18n.t('assetManagerRemoveModText').replace('{name}', mod.displayName), confirmButtonText: this.i18n.t('remove'), cancelButtonText: this.i18n.t('cancel') }); if (!confirmed) return; this.removing.set(mod.sourceId); try { await this.assets.removeMod(mod.sourceId); if (this.detailsSourceId() === mod.sourceId) this.detailsSourceId.set(undefined); } finally { this.removing.set(undefined); } }
  protected async redownload(): Promise<void> { if (!this.importing()) { this.importing.set(true); try { await this.assets.redownload(); } finally { this.importing.set(false); } } }
  protected async removeCached(): Promise<void> { if (!this.importing()) { this.importing.set(true); try { await this.assets.removeCachedVersion(); } finally { this.importing.set(false); } } }
  protected exportCompatibilityReport(): void { this.assets.exportCompatibilityReport(); }
  protected formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }
  protected formatTime(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp); }
  protected statusLabel(): string { const status = this.assets.status(); return status === 'ready' ? this.i18n.t('assetsReady') : status === 'importing' || status === 'downloading' || status === 'loading-cache' ? this.i18n.t('loadingAssets') : status === 'offline' ? this.i18n.t('assetsOffline') : status === 'unsupported-format' ? this.i18n.t('assetsUnsupportedFormat') : status === 'no-assets' ? this.i18n.t('noAssets') : this.i18n.t('importRequired'); }
  protected phaseLabel(phase: ModImportProgress['phase']): string { return this.i18n.t(`assetPhase_${phase.replaceAll('-', '_')}`); }
  protected phaseState(phase: ModImportProgress['phase']): 'pending' | 'active' | 'complete' { const current = this.preflightProgress()?.phase; if (!current) return 'pending'; const currentIndex = phases.indexOf(current); const index = phases.indexOf(phase); return index < currentIndex ? 'complete' : index === currentIndex ? 'active' : 'pending'; }
  protected stageLabel(stage: ImportStage): string { const value = importStages.find((candidate) => candidate.id === stage)?.label ?? stage; return this.i18n.t(value); }
  protected stageState(stage: ImportStage): 'pending' | 'active' | 'complete' { const current = this.preflightProgress()?.phase; if (!current) return 'pending'; const currentIndex = importStages.findIndex((candidate) => candidate.phases.includes(current)); const index = importStages.findIndex((candidate) => candidate.id === stage); return index < currentIndex ? 'complete' : index === currentIndex ? 'active' : 'pending'; }
  protected loaderLabel(loader: SupportedModLoader): string { return loader === 'unknown' ? this.i18n.t('assetManagerUnknownLoader') : loader[0].toUpperCase() + loader.slice(1); }
  protected compatibilityStatus(status: string | undefined): string { return status === 'compatible' ? this.i18n.t('assetManagerCompatible') : status === 'incompatible' ? this.i18n.t('assetManagerIncompatible') : this.i18n.t('assetManagerCannotVerify'); }
  protected compatibilityClass(status: string | undefined): string { return status === 'compatible' ? 'status-ok' : 'status-blocked'; }
  protected certification(value: ImportedModSummary | PreparedModImport): ModSupportCertification | undefined { const normalized = 'report' in value ? value.report?.normalizedMetadata : value.normalizedMetadata; if (!normalized) return undefined; return this.supportCatalog.certificationFor({ metadata: normalized, minecraftVersion: this.assets.activeVersion(), fingerprint: value.fingerprint }); }
  protected importedCertification(mod: ImportedModSummary): ModSupportCertification | undefined { return this.certification(mod); }
  protected warningCount(report: PreparedModImport['report'] | ImportedModSummary['report'] | undefined): number { return report?.warnings.length ?? report?.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length ?? 0; }
  protected blockingCount(report: PreparedModImport['report'] | ImportedModSummary['report'] | undefined): number { return report?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error' || diagnostic.category === 'blocking').length ?? 0; }
  protected compactCount(imported: number, detected: number, label: string): string { return compactContentCount(imported, detected, label); }
  protected warningLabel(report: ImportedModSummary['report']): string { const count = this.warningCount(report); return count ? `${count} ${this.i18n.t('assetManagerWarnings')}` : ''; }
  protected hasDiagnostics(report: ImportedModSummary['report'], kind: 'blocking' | 'warning' | 'info'): boolean { return report.diagnostics.some((diagnostic) => diagnostic.category === kind || (kind === 'warning' && diagnostic.severity === 'warning') || (kind === 'info' && diagnostic.severity === 'info')); }
  protected detailsMetadata(mod: ImportedModSummary): NonNullable<PreparedModImport['normalizedMetadata']> | undefined { return mod.report.normalizedMetadata; }
  private createPreflightIcon(prepared: PreparedModImport): string | undefined { const path = prepared.normalizedMetadata?.icon; const bytes = path ? prepared.resources.get(path) : undefined; if (!bytes || typeof URL === 'undefined') return undefined; return URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })); }
  private revokePreflightIcon(): void { const url = this.preflightIconUrl(); if (url && typeof URL !== 'undefined') URL.revokeObjectURL(url); this.preflightIconUrl.set(undefined); }
}
