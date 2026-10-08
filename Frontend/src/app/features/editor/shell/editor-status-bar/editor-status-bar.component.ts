import { Component, computed, effect, inject, signal } from '@angular/core';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { humanizeDecorationName } from '../../../../core/decorations/decoration-display';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { EditorModeService } from '../../../../core/editor/state/editor-mode.service';
import { EditorToolService } from '../../../../core/editor/state/tool.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { ProjectAutosaveService } from '../../../../core/persistence/autosave/project-autosave.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { deriveAssetBootstrapStatus, ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { ViewportHydrationStatusService, ViewportHydrationStatusSnapshot } from '../../../../core/editor/state/viewport-hydration-status.service';
import { MissingBlockReconciliationService } from '../../../../core/editor/structure/missing-block-reconciliation.service';
import { MissingProjectContentSummaryService } from '../../../../core/editor/state/missing-project-content-summary';
import { MissingAssetsDialogComponent } from './missing-assets-dialog.component';
import { EditorSessionService } from '../../../../core/editor/state/editor-session.service';
import { ViewportStatusService } from '../../../../core/editor/viewport/viewport-status.service';

@Component({ selector: 'app-editor-status-bar', imports: [MissingAssetsDialogComponent], templateUrl: './editor-status-bar.component.html', styleUrl: './editor-status-bar.component.scss' })
export class EditorStatusBarComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly mode = inject(EditorModeService);
  protected readonly tool = inject(EditorToolService);
  protected readonly selection = inject(SelectionService);
  protected readonly autosave = inject(ProjectAutosaveService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly assets = inject(ContentAssetRuntimeService);
  protected readonly hydration = inject(ViewportHydrationStatusService);
  protected readonly missingReconciliation = inject(MissingBlockReconciliationService);
  private readonly missingContent = inject(MissingProjectContentSummaryService);
  protected readonly library = inject(BlockLibraryService);
  protected readonly decorations = inject(DecorationService);
  private readonly session = inject(EditorSessionService);
  private readonly viewportStatus = inject(ViewportStatusService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  protected readonly selectionCount = computed(() => {
    const project = this.workspace.project();
    const kind = this.selection.kind();
    if (kind === 'all') return project?.blocks.length ?? 0;
    if (kind === 'single' || kind === 'explicit') return this.selection.logicalPositions().length || (this.selection.single() ? 1 : 0);
    return this.selection.count(project);
  });
  protected readonly projectBlockCount = computed(() => this.workspace.project()?.blocks.length ?? 0);
  protected readonly statusCoordinate = computed(() => {
    const project = this.workspace.project();
    if (!project) return undefined;
    const hovered = this.viewportStatus.target();
    if (this.viewportStatus.projectId() === project.id && hovered) return { coordinate: hovered, source: 'hover' as const };
    const selected = this.selection.single();
    const positions = this.selection.logicalPositions();
    if (this.selectionCount() === 1 && selected && positions.length === 1) return { coordinate: selected, source: 'selection' as const };
    return undefined;
  });
  protected readonly missingSummary = this.missingContent.summary;
  protected readonly missingDialogOpen = signal(false);
  private readonly closeMissingDialogWhenResolved = effect(() => { if (this.missingDialogOpen() && this.missingSummary().totalMissingBlocks === 0) this.missingDialogOpen.set(false); });
  private readonly settleExternalTerminalState = effect(() => {
    this.missingReconciliation.activity();
    this.assets.status();
    this.assets.contentRestore();
    this.hydration.settleIfTerminal();
  });
  protected readonly activePlacement = computed<ActivePlacementStatus | undefined>(() => {
    const activeBlock = this.library.activeBlock.active();
    if (activeBlock) {
      const id = activeBlock.itemId || activeBlock.id;
      return { kind: 'block', label: this.library.getItem(id)?.displayName ?? id };
    }
    const activeDecoration = this.decorations.active();
    if (!activeDecoration) return undefined;
    if (activeDecoration.kind === 'painting') {
      const variant = this.paintingCatalog.get(activeDecoration.variantId);
      const label = variant ? humanizeDecorationName(variant.id) : activeDecoration.variantId ? humanizeDecorationName(activeDecoration.variantId) : this.i18n.t('painting');
      return { kind: 'decoration', label: `${this.i18n.t('painting')} · ${label}` };
    }
    return { kind: 'decoration', label: activeDecoration.kind === 'glow-item-frame' ? this.i18n.t('glowItemFrame') : this.i18n.t('itemFrame') };
  });
  protected saveStatusLabel(): string { return this.i18n.t(this.autosave.status() === 'pending' || this.autosave.status() === 'saving' ? 'savingProject' : this.autosave.status() === 'error' ? 'saveProjectError' : 'projectSaved'); }
  protected selectionSummaryLabel(): string { return this.i18n.t('selectionSummary').replace('{count}', String(this.selectionCount())); }
  protected projectSizeLabel(): string { const size = this.workspace.project()?.size; return size ? `X ${size.x} · Y ${size.y} · Z ${size.z}` : ''; }
  protected coordinateLabel(): string { const status = this.statusCoordinate(); if (!status) return ''; const { x, y, z } = status.coordinate; return `${this.i18n.t('position')}: X ${x} · Y ${y} · Z ${z}`; }
  protected coordinateTitle(): string { return this.statusCoordinate()?.source === 'hover' ? this.i18n.t('target') : this.i18n.t('selectedBlock'); }
  protected currentLayer(): number { return this.session.currentY(this.workspace.project()); }
  protected assetStatus(): ReturnType<typeof deriveAssetBootstrapStatus> { return deriveAssetBootstrapStatus(this.assets.status(), this.assets.contentRestore(), this.assets.downloadProgress()); }
  protected finalizationState() { return this.hydration.finalization(); }
  protected assetDataStatus(status: ReturnType<typeof deriveAssetBootstrapStatus>): 'invalid' | 'warning' | 'valid' | 'unknown' {
    const finalization = this.finalizationState();
    if (this.missingWarningVisible()) return 'warning';
    if (finalization?.warning) return 'warning';
    if (finalization?.loading) return 'unknown';
    return status.kind === 'unavailable' ? 'invalid' : status.kind === 'partial' ? 'warning' : status.kind === 'ready' ? 'valid' : 'unknown';
  }
  protected assetLoading(status: ReturnType<typeof deriveAssetBootstrapStatus>): boolean { const finalization = this.finalizationState(); return status.kind === 'loading-cache' || status.kind === 'downloading' || status.kind === 'preparing' || status.kind === 'restoring-mods' || !!finalization?.loading || this.missingReconciliation.activity() === 'running'; }
  protected assetProgressPercent(status: ReturnType<typeof deriveAssetBootstrapStatus>): number | null {
    const finalization = this.finalizationState();
    if (this.missingReconciliation.activity() === 'running') return null;
    if (finalization?.loading) {
      if (finalization.indeterminate || !finalization.finalization?.expectedBlocks) return null;
      const progress = finalization.progress;
      if (!progress?.finalization) return Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
      return Math.max(0, Math.min(100, Math.round(finalization.finalization.finalReadyBlocks / finalization.finalization.expectedBlocks * 100)));
    }
    const contentHydration = this.hydration.status();
    if (contentHydration?.activity === 'content') return Math.max(0, Math.min(100, Math.round(contentHydration.progress.percent)));
    if (status.kind === 'downloading' && status.percent !== undefined) return Math.max(0, Math.min(100, Math.round(status.percent)));
    if (status.kind === 'restoring-mods' && status.total && status.current !== undefined) return Math.max(0, Math.min(100, Math.round(status.current / status.total * 100)));
    return null;
  }
  protected assetStatusLabel(): string {
    const status = this.assetStatus();
    const finalization = this.finalizationState();
    if (finalization?.loading || this.missingReconciliation.activity() === 'running') return this.i18n.t('updatingBlockAssets');
    if (this.missingWarningVisible()) return this.i18n.t('missingAssetsWarning').replace('{count}', this.formatCount(this.missingSummary().totalMissingBlocks));
    if (this.hydration.status()?.activity === 'content') return this.i18n.t('updatingBlockAssets');
    if (status.kind === 'loading-cache') return this.i18n.t('checkingAssetCache');
    if (status.kind === 'downloading') return `${this.i18n.t('downloadingAsset')}${status.percent === undefined ? '' : ` ${status.percent}%`}`;
    if (status.kind === 'preparing') return this.i18n.t('preparingAssets');
    if (status.kind === 'restoring-mods') { const label = this.i18n.t('restoringModsProgress').replace('{current}', String(status.current ?? 0)).replace('{total}', String(status.total ?? 0)); return status.sourceName ? `${label} · ${status.sourceName}` : label; }
    if (status.kind === 'partial') return this.i18n.t('assetsReadyWarnings').replace('{count}', String(status.warnings ?? 0));
    if (status.kind === 'unavailable') return this.i18n.t('assetsUnavailableForBrowser');
    return this.i18n.t('assetsReady');
  }
  protected missingWarningVisible(): boolean {
    const finalization = this.finalizationState();
    return this.missingSummary().totalMissingBlocks > 0 && this.missingReconciliation.activity() === 'idle' && !finalization?.loading && this.hydration.status()?.activity !== 'content';
  }
  protected openMissingAssets(): void { if (this.missingWarningVisible()) this.missingDialogOpen.set(true); }
  protected finalizationCount(): string | undefined {
    const finalization = this.finalizationState();
    if (!finalization?.loading || finalization.indeterminate || !finalization.finalization) return undefined;
    const value = finalization.finalization;
    return `${this.formatCount(value.finalReadyBlocks)} / ${this.formatCount(value.expectedBlocks)} ${this.i18n.t('viewportHydrationBlocks')}`;
  }
  protected hydrationStatus(): ViewportHydrationStatusSnapshot | undefined { return this.finalizationState()?.loading ? undefined : this.hydration.status(); }
  protected hydrationStatusLabel(snapshot: ViewportHydrationStatusSnapshot): string {
    const label = snapshot.activity === 'content' ? this.i18n.t('updatingBlockAssets') : this.i18n.t(snapshot.activity === 'import' ? 'importingStructure' : 'buildingStructure');
    return `${label} · ${this.formatPercent(snapshot.progress.percent)}%`;
  }
  protected hydrationCount(snapshot: ViewportHydrationStatusSnapshot): string {
    const progress = snapshot.progress;
    if (progress.decorationsTotal > 0) {
      return `${this.formatCount(progress.blocksCompleted)} / ${this.formatCount(progress.blocksTotal)} ${this.i18n.t('viewportHydrationBlocks')} · ${this.formatCount(progress.decorationsCompleted)} / ${this.formatCount(progress.decorationsTotal)} ${this.i18n.t('viewportHydrationItems')}`;
    }
    return `${this.formatCount(progress.blocksCompleted)} / ${this.formatCount(progress.blocksTotal)} ${this.i18n.t('viewportHydrationBlocks')}`;
  }
  private formatPercent(value: number): string { return value.toLocaleString(this.i18n.locale(), { maximumFractionDigits: 1 }); }
  private formatCount(value: number): string { return value.toLocaleString(this.i18n.locale()); }
}

interface ActivePlacementStatus { readonly kind: 'block' | 'decoration'; readonly label: string; }
