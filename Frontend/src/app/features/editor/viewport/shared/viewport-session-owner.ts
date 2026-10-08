import { effect, type EffectRef } from '@angular/core';
import type { BlockDefinition } from '../../../../core/blocks/catalog/block-definition.types';
import type { BlockVisualProvider } from '../../../../core/renderer/visuals/block-visual-provider-contract';
import type { ContentSpecialVisualDescriptor } from '../../../../core/content/content-introspection';
import type { ResolvedItemVisual } from '../../../../core/renderer/visuals/item-visual-resolver';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import { viewportThemePalette } from '../../../../core/renderer/engine/viewport-theme';
import type { ThreeViewportEngine } from '../../../../core/renderer/engine/three-viewport-engine';
import type { ThemeService } from '../../../../core/ui/theme/theme.service';
import type { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import type { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import type { ViewportHydrationStatusService } from '../../../../core/editor/state/viewport-hydration-status.service';
import type { ViewportStatusService } from '../../../../core/editor/viewport/viewport-status.service';
import type { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import type { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import type { ItemVisualService } from '../../../../core/items/catalog/item-visual.service';

export interface ViewportSessionOwnerOptions {
  readonly engine: ThreeViewportEngine;
  readonly viewportActive: () => boolean;
  readonly modeLabel: string;
  readonly workspace: WorkspaceStateService;
  readonly theme: ThemeService;
  readonly preferences: UiPreferencesService;
  readonly assets: ContentAssetRuntimeService;
  readonly hydrationStatus: ViewportHydrationStatusService;
  readonly viewportStatus: ViewportStatusService;
  readonly paintingCatalog: PaintingVariantCatalogService;
  readonly itemVisuals: ItemVisualService;
  readonly visualResolvers: {
    readonly provider: () => BlockVisualProvider | undefined;
    readonly catalogRevision: () => number;
    readonly specialVisual: (id: string) => ContentSpecialVisualDescriptor | undefined;
    readonly blockDefinition: (id: string) => BlockDefinition | undefined;
    readonly decorationTexture: (resource: string) => string | undefined;
    readonly decorationItemResources: (itemId: string) => readonly string[];
    readonly decorationItemVisual: (itemId: string) => ResolvedItemVisual | undefined;
    readonly decorationItemPreview: (item: ItemStackData) => Promise<string | undefined>;
    readonly paintingTexture: (id: string) => string | undefined;
  };
  readonly usage: {
    readonly revision: () => number;
    readonly highlightedId: () => string | undefined;
    readonly positions: (id: string) => readonly { readonly x: number; readonly y: number; readonly z: number }[];
  };
}

/** Owns the lifecycle/effect composition shared by retained 3D and Y-layer viewports. */
export class ViewportSessionOwner {
  readonly hydrationOwner;
  readonly viewportStatusOwner;
  private readonly progressUnsubscribe: () => void;
  private readonly effects: EffectRef[] = [];

  constructor(private readonly options: ViewportSessionOwnerOptions) {
    this.hydrationOwner = options.hydrationStatus.claim();
    this.viewportStatusOwner = options.viewportStatus.claim();
    this.progressUnsubscribe = options.engine.onHydrationProgress((progress) => options.hydrationStatus.publish(this.hydrationOwner, progress));
    this.effects.push(
      effect(() => {
        if (options.viewportActive()) {
          options.hydrationStatus.activate(this.hydrationOwner);
          options.engine.resume();
        } else {
          options.engine.suspend();
        }
      }),
      effect(() => {
        const projectId = options.workspace.project()?.id;
        if (options.viewportActive()) options.viewportStatus.activate(this.viewportStatusOwner, projectId);
        else options.viewportStatus.deactivate(this.viewportStatusOwner);
      }),
      effect(() => {
        options.engine.applyTheme(viewportThemePalette(options.theme.editorBackground()));
      }),
      effect(() => {
        const preferences = options.preferences.effectivePreferences();
        options.engine.setControlConfiguration(preferences.controls);
        options.engine.setMouseBindings(preferences.mouseBindings);
        options.engine.setBlockBrightness(preferences.accessibility.blockBrightness);
        options.engine.setStructureBlockGuideVisible(preferences.showStructureBlockGuide);
      }),
      effect(() => {
        const resolver = options.visualResolvers;
        options.engine.setVisualProvider(resolver.provider());
        options.engine.setSpecialVisualDescriptorResolver(resolver.specialVisual, resolver.catalogRevision());
        options.engine.setBlockDefinitionResolver(resolver.blockDefinition);
        options.engine.setDecorationTextureProvider(resolver.decorationTexture);
        options.engine.setDecorationItemResourceProvider(resolver.decorationItemResources);
        options.engine.setDecorationItemVisualProvider(resolver.decorationItemVisual);
        options.engine.setDecorationItemPreviewProvider(resolver.decorationItemPreview);
        options.paintingCatalog.variants();
        options.engine.setPaintingTextureResolver(resolver.paintingTexture);
      }),
      effect(() => {
        options.usage.revision();
        const id = options.usage.highlightedId();
        options.engine.setBlockUsageHighlight(id, id ? options.usage.positions(id) : undefined);
      }),
      effect(() => {
        if (!options.viewportActive()) return;
        const restore = options.assets.contentRestore();
        const terminal = restore.phase === 'ready' || restore.phase === 'partial' || restore.phase === 'error';
        options.engine.setMissingBlocksTerminal(terminal);
        options.hydrationStatus.setSourceRestoreState(this.hydrationOwner, { terminal, pending: !terminal, failed: restore.phase === 'error' });
        options.hydrationStatus.setFinalizationAuditHooks(this.hydrationOwner, () => {
          const progress = options.engine.finalizationAuditProgress();
          const finalization = progress.finalization;
          return { input: { progress, sourceRestoreTerminal: terminal, sourceRestorePending: !terminal, sourceRestoreFailed: restore.phase === 'error', providerRefreshPlanning: progress.providerRefreshPlanning, providerRefreshQueued: progress.providerRefreshQueued, providerRefreshRunning: progress.providerRefreshRunning, terrainPending: progress.terrainPending }, ownershipComplete: !!finalization && finalization.finalReadyBlocks + finalization.permanentMissingBlocks >= finalization.expectedBlocks };
        }, () => options.engine.reconcileFinalizationAccounting());
      }),
      effect(() => {
        if (typeof console === 'undefined' || !options.workspace.restoreStatus) return;
        const projectRestore = options.workspace.restoreStatus();
        const assetStatus = options.assets.status();
        const assets = options.assets.diagnostics();
        if (typeof ngDevMode !== 'undefined' && ngDevMode) console.debug(`[MinecraftBuilder][${options.modeLabel} bootstrap]`, { projectRestore, assetStatus, assets, viewport: options.engine.diagnostics() });
      }),
    );
  }

  destroy(): void {
    this.progressUnsubscribe();
    for (const effectRef of this.effects) effectRef.destroy();
    this.options.hydrationStatus.release(this.hydrationOwner);
    this.options.viewportStatus.release(this.viewportStatusOwner);
  }
}
