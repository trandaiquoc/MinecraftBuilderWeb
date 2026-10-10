import { computed, effect, Injectable, inject, signal, type Signal } from '@angular/core';
import { BlockDefinition } from '../blocks/catalog/block-definition.types';
import type { PlaceableItemDefinition } from '../blocks/placement-palette/placeable-item.types';
import { BlockLibraryService } from '../blocks/catalog/block-library.service';
import { VanillaBlockVisualProvider } from '../renderer/geometry/vanilla-block-visual-provider';
import { IndexedDbAssetCache } from './cache/indexeddb-asset-cache';
import { AssetThumbnailService } from './vanilla/asset-thumbnail-service';
import type { ThumbnailPreviewState } from './vanilla/asset-thumbnail-service';
import {
  VanillaAssetProvider,
  VanillaAssetProviderDiagnostics,
  VANILLA_ASSET_CACHE_SCHEMA_VERSION,
  VANILLA_ASSET_VERSION,
} from './vanilla/vanilla-asset-provider';
import { loadVanillaBlockRegistry } from '../blocks/registry/vanilla-block-registry';
import {
  loadVanillaItemRegistry,
  VanillaItemRegistry,
} from '../items/registry/vanilla-item-registry';
import {
  ContentSourceRegistry,
  PreparedContentSource,
} from './content-source/content-source-registry';
import { ContentSourceCleanupError } from './content-source/composite-asset-provider';
import { ExternalModProvider } from './mod/external-mod-provider';
import type { ModImportReport } from './mod/external-mod-import-contracts';
import { ModImportProgress, PreparedModImport } from './mod/external-mod-importer';
import {
  ExternalModContentLifecycle,
  type ExternalModRestoreState,
} from './mod/external-mod-content-lifecycle';
import {
  MojangVanillaAssetSource,
  VanillaDownloadProgress,
} from './vanilla/mojang-vanilla-asset-source';
import { VanillaAssetLifecycle } from './vanilla/vanilla-asset-lifecycle';
import { WorkspaceStateService } from '../workspace/workspace-state.service';
import { DEFAULT_MINECRAFT_VERSION } from '../domain/project.types';
import { AssetActivityService } from './asset-activity.service';
import { VanillaResourceFormatProfile } from './vanilla/vanilla-resource-format';
import { CompatibilityReport } from './vanilla/compatibility/compatibility.types';
import { downloadCompatibilityReport } from './vanilla/compatibility/compatibility-report';
import { PaintingVariantCatalogService } from '../decorations/catalog/painting-variant-catalog.service';
import type { ThumbnailTaskPriority } from './vanilla/thumbnail-task-queue';
import { isAbortError, throwIfAborted } from './mod/mod-import-cancellation';
import { ContentOperationCoordinator } from './content-operation-coordinator';

export type VanillaAssetStatus =
  | 'no-assets'
  | 'loading-cache'
  | 'downloading'
  | 'importing'
  | 'ready'
  | 'offline'
  | 'unsupported-format'
  | 'import-required'
  | 'cache-error';
export interface VanillaAssetDiagnostics extends VanillaAssetProviderDiagnostics {
  readonly cacheSchema: number;
  readonly bundleFound: boolean;
  readonly generation: number;
  readonly providerReady: boolean;
}
export type { ImportedModSummary } from './mod/external-mod-content-lifecycle';
export type ContentRestorePhase = 'vanilla' | 'restoring-mods' | 'ready' | 'partial' | 'error';
export interface ContentRestoreState {
  readonly phase: ContentRestorePhase;
  readonly current: number;
  readonly total: number;
  readonly sourceName?: string;
  readonly failed: number;
}
export type AssetBootstrapStatusKind =
  | 'loading-cache'
  | 'downloading'
  | 'preparing'
  | 'restoring-mods'
  | 'ready'
  | 'partial'
  | 'unavailable';
export interface AssetBootstrapStatus {
  readonly kind: AssetBootstrapStatusKind;
  readonly percent?: number;
  readonly current?: number;
  readonly total?: number;
  readonly sourceName?: string;
  readonly warnings?: number;
}
@Injectable({ providedIn: 'root' })
export class ContentAssetRuntimeService {
  private readonly library = inject(BlockLibraryService);
  private readonly cache = new IndexedDbAssetCache();
  private readonly workspace = inject(WorkspaceStateService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly vanillaLifecycle = new VanillaAssetLifecycle(
    this.cache,
    new MojangVanillaAssetSource(),
  );
  readonly activity = inject(AssetActivityService);
  private readonly thumbnails!: AssetThumbnailService;
  private externalMods!: ExternalModContentLifecycle;
  readonly thumbnailEpoch!: Signal<number>;
  readonly provider = signal<VanillaAssetProvider | undefined>(undefined);
  readonly visualProvider = signal<VanillaBlockVisualProvider | undefined>(undefined);
  readonly status = signal<VanillaAssetStatus>('loading-cache');
  readonly contentRestore = signal<ContentRestoreState>({
    phase: 'vanilla',
    current: 0,
    total: 0,
    failed: 0,
  });
  readonly contentReady = computed(
    () => this.contentRestore().phase === 'ready' || this.contentRestore().phase === 'partial',
  );
  readonly activeVersion = signal<string>(DEFAULT_MINECRAFT_VERSION);
  readonly downloadProgress = signal<VanillaDownloadProgress | undefined>(undefined);
  readonly message = signal('');
  readonly sourceName = signal('');
  readonly generation = signal(0);
  readonly diagnostics = signal<VanillaAssetDiagnostics>({
    cacheSchema: VANILLA_ASSET_CACHE_SCHEMA_VERSION,
    bundleFound: false,
    generation: 0,
    providerReady: false,
    resourceCount: 0,
    stoneBlockstate: false,
    stoneModel: false,
    stoneTexture: false,
    language: false,
    itemDefinitions: 0,
    resourceFormat: {
      id: 'unsupported',
      support: 'unsupported-resource-format',
      blockstates: 0,
      models: 0,
      textures: 0,
      languages: 0,
      items: 0,
      label: 'Unsupported resource format',
    },
  });
  readonly cachedVersions = signal<readonly string[]>([]);
  readonly sources = new ContentSourceRegistry();
  get importedMods() {
    return this.externalMods.importedMods;
  }
  readonly compatibilityReport = signal<CompatibilityReport | undefined>(undefined);
  private loadRequest = 0;
  private inFlight?: {
    readonly version: string;
    readonly promise: Promise<void>;
    readonly controller: AbortController;
  };
  private restoreResumeQueued = false;
  private readonly contentOperations = new ContentOperationCoordinator();

  constructor() {
    this.externalMods = new ExternalModContentLifecycle(
      this.cache,
      this.activity,
      this.contentOperations,
      {
        sources: this.sources,
        activate: (provider, restoring) => this.activateExternal(provider, restoring),
        commitRestored: (prepared) => this.commitRestoredExternal(prepared),
        remove: (sourceId) => this.removeExternalSource(sourceId),
      },
      () => this.activeVersion(),
    );
    this.thumbnails = new AssetThumbnailService(this.library, () => ({
      generation: this.generation(),
      provider: this.provider(),
      visualProvider: this.visualProvider(),
      restoringExternalMods: this.externalMods.isRestoring,
    }));
    this.thumbnailEpoch = this.thumbnails.epoch;
    effect(() => {
      const version = this.workspace.project()?.metadata.minecraftVersion;
      if (version) void this.ensureVersion(version);
    });
    void this.refreshCachedVersions();
  }

  async importJar(file: File): Promise<void> {
    return this.contentOperations.run('foreground', async (signal) => {
      const request = ++this.loadRequest;
      const protection = this.activity.protect(`Importing ${file.name}`);
      this.status.set('importing');
      this.message.set('');
      this.activity.begin('manual-import', `Reading ${file.name}`);
      try {
        const provider = await this.vanillaLifecycle.importClientJar(
          file,
          this.activeVersion(),
          signal,
        );
        throwIfAborted(signal);
        await this.activateVersion(provider, request, signal);
        this.activity.finish('manual-import', `Imported ${file.name}`);
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        this.status.set('import-required');
        this.message.set(
          error instanceof Error ? error.message : 'Unable to import Minecraft assets',
        );
        this.activity.fail('manual-import', this.message());
      } finally {
        this.activity.releaseProtected(protection);
      }
    });
  }

  async importModJar(file: File, signal?: AbortSignal): Promise<ModImportReport> {
    return this.externalMods
      .importJar(file, signal)
      .finally(() => this.scheduleExternalModRestore());
  }

  async inspectModJar(
    file: File,
    onProgress?: (progress: ModImportProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreparedModImport> {
    return this.externalMods.inspectJar(file, onProgress, signal);
  }

  async commitPreparedModImport(
    prepared: PreparedModImport,
    onProgress?: (progress: ModImportProgress) => void,
    signal?: AbortSignal,
  ): Promise<ModImportReport> {
    return this.externalMods
      .commitPrepared(prepared, onProgress, signal)
      .finally(() => this.scheduleExternalModRestore());
  }

  async removeMod(sourceId: string, signal?: AbortSignal): Promise<void> {
    return this.externalMods
      .remove(sourceId, signal)
      .finally(() => this.scheduleExternalModRestore());
  }

  async redownload(): Promise<void> {
    await this.ensureVersion(this.activeVersion(), true);
  }
  async removeCachedVersion(version = this.activeVersion()): Promise<void> {
    return this.contentOperations.run('foreground', async (signal) => {
      if (version === this.activeVersion()) {
        this.loadRequest += 1;
        this.inFlight?.controller.abort(signal.reason);
        this.inFlight = undefined;
      }
      await this.vanillaLifecycle.removeCachedVersion(version, signal);
      await this.refreshCachedVersions();
      if (version === this.activeVersion()) {
        this.clearActiveSources();
        this.compatibilityReport.set(undefined);
        this.status.set('no-assets');
        this.sourceName.set('');
        this.message.set('');
        this.diagnostics.update((value) => ({
          ...value,
          bundleFound: false,
          providerReady: false,
          resourceCount: 0,
        }));
        this.activity.event('cache', `Removed cached assets for Java ${version}`, 'info', 'cache');
      }
    });
  }

  exportCompatibilityReport(): CompatibilityReport | undefined {
    const report =
      this.compatibilityReport() ??
      (this.provider() ? this.vanillaLifecycle.compatibilityReport(this.provider()!) : undefined);
    if (!report) return undefined;
    this.compatibilityReport.set(report);
    downloadCompatibilityReport(report);
    return report;
  }

  prepareThumbnails(blocks: readonly BlockDefinition[]): void {
    this.thumbnails.prepareBlocks(blocks);
  }

  prepareItemThumbnails(items: readonly PlaceableItemDefinition[]): void {
    this.thumbnails.prepareItems(items);
  }

  requestItemThumbnail(
    item: PlaceableItemDefinition,
    priority: ThumbnailTaskPriority = 'visible',
  ): void {
    this.thumbnails.requestItem(item, priority);
  }

  invalidateQueuedThumbnails(): void {
    this.thumbnails.invalidateQueued();
  }

  prepareItemThumbnail(item: PlaceableItemDefinition): void {
    this.thumbnails.prepareItem(item);
  }

  prepareThumbnail(blockId: string, state: Readonly<Record<string, string>>): void {
    this.thumbnails.prepareBlock(blockId, state);
  }

  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>> = {}): string | undefined {
    return this.thumbnails.urlForBlock(blockId, state);
  }

  thumbnailUrlForItem(item: PlaceableItemDefinition): string | undefined {
    return this.thumbnails.urlForItem(item);
  }

  thumbnailStateForItem(item: PlaceableItemDefinition): ThumbnailPreviewState {
    return this.thumbnails.stateForItem(item);
  }

  private ensureVersion(version: string, force = false): Promise<void> {
    if (
      !shouldStartVersionLoad(
        this.provider()?.minecraftVersion,
        this.status(),
        version,
        this.inFlight?.version,
        force,
      )
    )
      return this.inFlight?.promise ?? Promise.resolve();
    const request = ++this.loadRequest;
    const controller = new AbortController();
    const promise = this.contentOperations
      .run(
        'background',
        async (signal) => {
          this.activeVersion.set(version);
          this.status.set('loading-cache');
          this.contentRestore.set({ phase: 'vanilla', current: 0, total: 0, failed: 0 });
          this.message.set('');
          this.downloadProgress.set(undefined);
          this.compatibilityReport.set(undefined);
          this.clearActiveSources();
          return this.loadVersion(version, request, signal);
        },
        controller.signal,
      )
      .finally(() => {
        if (this.inFlight?.promise === promise) this.inFlight = undefined;
      });
    this.inFlight = { version, promise, controller };
    return promise;
  }

  private async loadVersion(version: string, request: number, signal: AbortSignal): Promise<void> {
    this.activity.begin('cache', `Checking cached assets for Java ${version}`, 'cache');
    try {
      const cached = await this.vanillaLifecycle.loadCached(version, signal);
      if (request !== this.loadRequest) return;
      if (cached) {
        this.activity.event('cache', `Cached assets found for Java ${version}`, 'success', 'cache');
        await this.activateVersion(cached, request, signal);
        return;
      }
      this.activity.event('cache', `No cached assets found for Java ${version}`, 'info', 'cache');
      this.status.set('downloading');
      const protection = this.activity.protect(`Downloading Minecraft Java ${version}`);
      this.activity.begin('metadata', `Resolving official Mojang metadata for Java ${version}`);
      try {
        const provider = await this.vanillaLifecycle.downloadAndCache(
          version,
          (progress) => {
            if (request !== this.loadRequest) return;
            this.downloadProgress.set(progress);
            this.activity.update(
              {
                loaded: progress.loaded,
                ...(progress.total !== undefined ? { total: progress.total } : {}),
              },
              progress.phase === 'download' ? `Downloading Minecraft Java ${version}` : undefined,
            );
          },
          signal,
          () =>
            this.activity.event(
              'download',
              `Official client downloaded for Java ${version}`,
              'success',
            ),
        );
        this.activity.event(
          'cache',
          `Saved normalized assets for Java ${version}`,
          'success',
          'cache',
        );
        await this.refreshCachedVersions();
        if (request !== this.loadRequest) return;
        await this.activateVersion(provider, request, signal);
      } finally {
        this.activity.releaseProtected(protection);
      }
    } catch (error) {
      if (request !== this.loadRequest || signal.aborted || isAbortError(error)) return;
      const message =
        error instanceof Error ? error.message : 'Unable to load official Minecraft assets';
      const unsupported =
        /resource format is not supported|no Minecraft asset resources|incomplete/i.test(message);
      this.status.set(unsupported ? 'unsupported-format' : 'offline');
      this.contentRestore.set({ phase: 'error', current: 0, total: 0, failed: 1 });
      this.message.set(message);
      this.sourceName.set('');
      this.compatibilityReport.set(undefined);
      this.diagnostics.update((value) => ({
        ...value,
        bundleFound: false,
        providerReady: false,
        resourceCount: 0,
      }));
      this.activity.fail('assets', message, 'vanilla');
      this.library.load({
        minecraftVersion: version,
        sourceId: 'vanilla',
        sourceName: 'Vanilla',
        blocks: [],
      });
      await this.restoreExternalMods(version, signal);
    }
  }

  private async activateVersion(
    provider: VanillaAssetProvider,
    request = this.loadRequest,
    signal?: AbortSignal,
  ): Promise<void> {
    if (request !== this.loadRequest) return;
    throwIfAborted(signal);
    provider.assertUsable();
    const version = provider.minecraftVersion;
    const registry =
      version === VANILLA_ASSET_VERSION ? await loadVanillaBlockRegistry() : undefined;
    let itemRegistry: VanillaItemRegistry | undefined;
    if (version === VANILLA_ASSET_VERSION) {
      try {
        itemRegistry = await loadVanillaItemRegistry();
      } catch {
        itemRegistry = undefined;
      }
    }
    throwIfAborted(signal);
    this.clearActiveSources();
    const catalog = provider.catalog(registry, itemRegistry);
    this.transitionThumbnailGeneration(() => {
      this.sources.setActiveVersion(version);
      this.provider.set(provider);
      this.publishSourceChange(() => {
        if (this.sources.providerForSource('vanilla')) this.sources.replace(provider);
        else this.sources.register(provider);
      });
      this.replaceVisualProvider();
      this.library.replaceSource(catalog);
      this.paintingCatalog.replaceSource(provider.source.id, catalog.paintingVariants ?? []);
    });
    const generation = this.generation();
    this.diagnostics.set({
      cacheSchema: VANILLA_ASSET_CACHE_SCHEMA_VERSION,
      bundleFound: true,
      generation,
      providerReady: true,
      ...provider.diagnostics(),
    });
    this.compatibilityReport.set(undefined);
    this.sourceName.set(provider.sourceName);
    this.activeVersion.set(version);
    this.status.set('ready');
    this.contentRestore.set({
      phase: 'vanilla',
      current: 0,
      total: 0,
      failed: 0,
      sourceName: provider.sourceName,
    });
    this.message.set('');
    this.activity.finish(
      'assets',
      `${provider.diagnostics().resourceFormat.label}; Java ${version} ready`,
    );
    void this.generateCompatibilityReport(provider, request);
    await this.restoreExternalMods(version, signal);
  }

  private async generateCompatibilityReport(
    provider: VanillaAssetProvider,
    request: number,
  ): Promise<void> {
    await Promise.resolve();
    if (request !== this.loadRequest || this.provider() !== provider) return;
    this.activity.begin(
      'compatibility',
      `Evaluating common block compatibility for Java ${provider.minecraftVersion}`,
    );
    const report = this.vanillaLifecycle.compatibilityReport(provider);
    if (request !== this.loadRequest || this.provider() !== provider) return;
    this.compatibilityReport.set(report);
    this.activity.finish(
      'compatibility',
      `Compatibility report ready: ${report.summary.compatibleReused} reused, ${report.summary.changedNeedsDelta} changed, ${report.summary.newGenericSupported} generic, ${report.summary.unsupported} unsupported`,
    );
  }

  private activateExternal(provider: ExternalModProvider, restoring: boolean): void {
    const catalog = provider.catalog();
    const publish = (): void => {
      this.publishSourceChange(() => {
        if (this.sources.providerForSource(provider.source.id)) this.sources.replace(provider);
        else this.sources.register(provider);
      });
      this.library.replaceSource(catalog);
      this.paintingCatalog.replaceSource(provider.source.id, catalog.paintingVariants ?? []);
    };
    if (restoring) publish();
    else
      this.transitionThumbnailGeneration(() => {
        publish();
        this.replaceVisualProvider();
      });
  }

  private commitRestoredExternal(prepared: readonly PreparedContentSource[]): void {
    this.transitionThumbnailGeneration(() => {
      this.publishSourceChange(() => this.sources.commitBatch(prepared));
      this.replaceVisualProvider();
      this.library.replaceSources(prepared.map((entry) => entry.catalog));
      this.paintingCatalog.replaceSources(
        prepared.map((entry) => ({
          sourceId: entry.provider.source.id,
          variants: entry.catalog.paintingVariants ?? [],
        })),
      );
    });
  }

  private removeExternalSource(sourceId: string): void {
    this.transitionThumbnailGeneration(() => {
      this.publishSourceChange(() => {
        this.sources.remove(sourceId);
      });
      this.paintingCatalog.removeSource(sourceId);
      this.library.removeSource(sourceId);
      this.replaceVisualProvider();
    });
  }

  private replaceVisualProvider(): void {
    this.visualProvider()?.dispose();
    this.visualProvider.set(new VanillaBlockVisualProvider(this.sources.resources));
  }

  private transitionThumbnailGeneration(replace: () => void): void {
    this.generation.update((value) => value + 1);
    try {
      replace();
    } finally {
      this.thumbnails.clearForContentGeneration();
    }
  }
  private clearActiveSources(): void {
    this.thumbnails.clearForContentGeneration();
    for (const source of this.sources.sources()) {
      this.publishSourceChange(() => {
        this.sources.remove(source.id);
      });
      this.library.removeSource(source.id);
      this.paintingCatalog.removeSource(source.id);
    }
    this.externalMods.clear();
    this.provider.set(undefined);
    this.visualProvider()?.dispose();
    this.visualProvider.set(undefined);
  }

  private publishSourceChange(publish: () => void): void {
    try {
      publish();
    } catch (error) {
      if (!(error instanceof ContentSourceCleanupError) || !error.committed) throw error;
      this.activity.event('cache', error.message, 'warning', 'cache');
    }
  }

  private async restoreExternalMods(version: string, signal?: AbortSignal): Promise<void> {
    await this.externalMods.restore(version, signal, (state) => this.contentRestore.set(state));
  }

  private scheduleExternalModRestore(): void {
    if (this.restoreResumeQueued || this.status() !== 'ready' || this.externalMods.isRestoring)
      return;
    this.restoreResumeQueued = true;
    queueMicrotask(() => {
      this.restoreResumeQueued = false;
      if (this.status() !== 'ready' || this.externalMods.isRestoring) return;
      void this.contentOperations
        .run('background', (signal) => this.restoreExternalMods(this.activeVersion(), signal))
        .catch((error) => {
          if (!isAbortError(error))
            this.activity.event(
              'mod-restore',
              error instanceof Error ? error.message : 'Imported Mod restore failed',
              'warning',
              'mod',
            );
        });
    });
  }

  private async refreshCachedVersions(): Promise<void> {
    try {
      this.cachedVersions.set(await this.vanillaLifecycle.cachedVersions());
    } catch {
      /* Cache availability is reported by the active load. */
    }
  }
}

export function shouldStartVersionLoad(
  providerVersion: string | undefined,
  status: VanillaAssetStatus,
  requestedVersion: string,
  inFlightVersion: string | undefined,
  force = false,
): boolean {
  if (force) return true;
  if (providerVersion === requestedVersion && status === 'ready') return false;
  return inFlightVersion !== requestedVersion;
}

export function deriveAssetBootstrapStatus(
  status: VanillaAssetStatus,
  restore: ContentRestoreState,
  progress?: VanillaDownloadProgress,
): AssetBootstrapStatus {
  if (status === 'loading-cache') return { kind: 'loading-cache' };
  if (status === 'downloading')
    return {
      kind: 'downloading',
      percent: progress?.total
        ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
        : undefined,
    };
  if (status === 'importing') return { kind: 'preparing' };
  if (status !== 'ready' || restore.phase === 'error') return { kind: 'unavailable' };
  if (restore.phase === 'restoring-mods')
    return {
      kind: 'restoring-mods',
      current: restore.current,
      total: restore.total,
      sourceName: restore.sourceName,
    };
  if (restore.phase === 'partial') return { kind: 'partial', warnings: restore.failed };
  if (restore.phase === 'vanilla') return { kind: 'preparing' };
  return { kind: 'ready' };
}
