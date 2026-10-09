import { effect, inject, type EffectRef } from '@angular/core';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { BlockUsageHighlightService } from '../../../../core/editor/state/block-usage-highlight.service';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { itemVisualTextureResources, resolveItemVisual } from '../../../../core/renderer/visuals/item-visual-resolver';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import { viewportThemePalette } from '../../../../core/renderer/engine/viewport-theme';
import type { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import { ThemeService } from '../../../../core/ui/theme/theme.service';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import { ViewportStatusService } from '../../../../core/editor/viewport/viewport-status.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { ItemVisualService } from '../../../../core/items/catalog/item-visual.service';

/** Owns the lifecycle/effect composition shared by retained 3D and Y-layer viewports. */
export class ViewportSessionOwner {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly theme = inject(ThemeService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly assets = inject(ContentAssetRuntimeService);
  private readonly hydrationStatus = inject(ViewportHydrationStatusService);
  private readonly viewportStatus = inject(ViewportStatusService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly itemVisuals = inject(ItemVisualService);
  private readonly library = inject(BlockLibraryService);
  private readonly runtimeIndex = inject(ProjectBlockRuntimeIndex);
  private readonly usageHighlight = inject(BlockUsageHighlightService);
  readonly hydrationOwner;
  readonly viewportStatusOwner;
  private readonly progressUnsubscribe: () => void;
  private readonly effects: EffectRef[] = [];

  constructor(
    private readonly engine: ThreeViewportEngine,
    private readonly viewportActive: () => boolean,
    private readonly modeLabel: string,
  ) {
    this.hydrationOwner = this.hydrationStatus.claim();
    this.viewportStatusOwner = this.viewportStatus.claim();
    this.progressUnsubscribe = engine.onHydrationProgress((progress) => this.hydrationStatus.publish(this.hydrationOwner, progress));
    this.effects.push(
      effect(() => {
        if (this.viewportActive()) {
          this.hydrationStatus.activate(this.hydrationOwner);
          this.engine.resume();
        } else {
          this.engine.suspend();
        }
      }),
      effect(() => {
        const projectId = this.workspace.project()?.id;
        if (this.viewportActive()) this.viewportStatus.activate(this.viewportStatusOwner, projectId);
        else this.viewportStatus.deactivate(this.viewportStatusOwner);
      }),
      effect(() => {
        this.engine.applyTheme(viewportThemePalette(this.theme.editorBackground()));
      }),
      effect(() => {
        const preferences = this.preferences.effectivePreferences();
        this.engine.setControlConfiguration(preferences.controls);
        this.engine.setMouseBindings(preferences.mouseBindings);
        this.engine.setBlockBrightness(preferences.accessibility.blockBrightness);
        this.engine.setStructureBlockGuideVisible(preferences.showStructureBlockGuide);
      }),
      effect(() => {
        this.engine.setVisualProvider(this.assets.visualProvider());
        this.engine.setSpecialVisualDescriptorResolver((id) => this.library.get(id)?.specialVisual, this.library.catalogRevision());
        this.engine.setBlockDefinitionResolver((id) => this.library.get(id));
        this.engine.setDecorationTextureProvider((resource) => this.assets.sources.resources.textureUrl(resource));
        this.engine.setDecorationItemResourceProvider((itemId) => itemVisualTextureResources(this.assets.sources.resources, itemId));
        this.engine.setDecorationItemVisualProvider((itemId) => resolveItemVisual(this.assets.sources.resources, itemId));
        this.engine.setDecorationItemPreviewProvider((item) => this.itemVisuals.request(item, 'high').then((info) => info.previewUrls[0]));
        this.paintingCatalog.variants();
        this.engine.setPaintingTextureResolver((id) => this.paintingCatalog.get(id)?.assetPath);
      }),
      effect(() => {
        this.runtimeIndex.usageRevision();
        const id = this.usageHighlight.highlightedBlockId();
        const positions = id ? this.runtimeIndex.blocksForId(id).map((block) => ({ ...block.position })) : undefined;
        this.engine.setBlockUsageHighlight(id, positions);
      }),
      effect(() => {
        if (!this.viewportActive()) return;
        const restore = this.assets.contentRestore();
        const terminal = restore.phase === 'ready' || restore.phase === 'partial' || restore.phase === 'error';
        this.engine.setMissingBlocksTerminal(terminal);
        this.hydrationStatus.setSourceRestoreState(this.hydrationOwner, { terminal, pending: !terminal, failed: restore.phase === 'error' });
        this.hydrationStatus.setFinalizationAuditHooks(this.hydrationOwner, () => {
          const progress = this.engine.finalizationAuditProgress();
          const finalization = progress.finalization;
          return { input: { progress, sourceRestoreTerminal: terminal, sourceRestorePending: !terminal, sourceRestoreFailed: restore.phase === 'error', providerRefreshPlanning: progress.providerRefreshPlanning, providerRefreshQueued: progress.providerRefreshQueued, providerRefreshRunning: progress.providerRefreshRunning, terrainPending: progress.terrainPending }, ownershipComplete: !!finalization && finalization.finalReadyBlocks + finalization.permanentMissingBlocks >= finalization.expectedBlocks };
        }, () => this.engine.reconcileFinalizationAccounting());
      }),
      effect(() => {
        if (typeof console === 'undefined' || !this.workspace.restoreStatus) return;
        const projectRestore = this.workspace.restoreStatus();
        const assetStatus = this.assets.status();
        const assets = this.assets.diagnostics();
        if (typeof ngDevMode !== 'undefined' && ngDevMode) console.debug(`[MinecraftBuilder][${this.modeLabel} bootstrap]`, { projectRestore, assetStatus, assets, viewport: this.engine.diagnostics() });
      }),
    );
  }

  destroy(): void {
    this.progressUnsubscribe();
    for (const effectRef of this.effects) effectRef.destroy();
    this.hydrationStatus.release(this.hydrationOwner);
    this.viewportStatus.release(this.viewportStatusOwner);
  }
}
