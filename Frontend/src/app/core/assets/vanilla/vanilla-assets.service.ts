import { computed, effect, Injectable, inject, signal } from '@angular/core';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlaceableItemDefinition, previewBlocksForItem } from '../../blocks/placement-palette/placeable-item';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { VanillaBlockVisualProvider } from '../../renderer/geometry/block-model-geometry';
import { IndexedDbAssetCache } from '../cache/indexeddb-asset-cache';
import { VanillaAssetProvider, VanillaAssetProviderDiagnostics, VANILLA_ASSET_CACHE_SCHEMA_VERSION, VANILLA_ASSET_VERSION } from './vanilla-asset-provider';
import { loadVanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import { JarImportSource, providerFromBundle } from '../bundle/asset-bundle';
import { ContentSourceRegistry } from '../content-source/content-source-registry';
import { ExternalModProvider, ModImportDiagnostic, ModImportReport } from '../mod/external-mod-provider';
import { commitModImport, inspectModJar, ModImportProgress, PreparedModImport } from '../mod/external-mod-importer';
import { MojangVanillaAssetSource, VanillaDownloadProgress } from './mojang-vanilla-asset-source';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { DEFAULT_MINECRAFT_VERSION } from '../../domain/project.types';
import { AssetActivityService } from '../asset-activity.service';
import { VanillaResourceFormatProfile } from './vanilla-resource-format';
import { CompatibilityReport } from './compatibility/compatibility.types';
import { evaluateCompatibility } from './compatibility/compatibility-evaluator';
import { downloadCompatibilityReport } from './compatibility/compatibility-report';
import { PaintingVariantCatalogService } from '../../decorations/catalog/painting-variant-catalog.service';
import { ThumbnailTaskPriority, ThumbnailTaskQueue } from './thumbnail-task-queue';

export type VanillaAssetStatus = 'no-assets' | 'loading-cache' | 'downloading' | 'importing' | 'ready' | 'offline' | 'unsupported-format' | 'import-required' | 'cache-error';
export interface VanillaAssetDiagnostics extends VanillaAssetProviderDiagnostics { readonly cacheSchema: number; readonly bundleFound: boolean; readonly generation: number; readonly providerReady: boolean; }
export interface ImportedModSummary { readonly sourceId: string; readonly modId: string; readonly displayName: string; readonly version: string; readonly namespaces: readonly string[]; readonly candidateBlockCount: number; readonly fingerprint?: string; readonly iconUrl?: string; readonly report: ModImportReport; }
export type ContentRestorePhase = 'vanilla' | 'restoring-mods' | 'ready' | 'partial' | 'error';
export interface ContentRestoreState { readonly phase: ContentRestorePhase; readonly current: number; readonly total: number; readonly sourceName?: string; readonly failed: number; }
export type AssetBootstrapStatusKind = 'loading-cache' | 'downloading' | 'preparing' | 'restoring-mods' | 'ready' | 'partial' | 'unavailable';
export interface AssetBootstrapStatus { readonly kind: AssetBootstrapStatusKind; readonly percent?: number; readonly current?: number; readonly total?: number; readonly sourceName?: string; readonly warnings?: number; }

@Injectable({ providedIn: 'root' })
export class VanillaAssetsService {
  private readonly library = inject(BlockLibraryService);
  private readonly cache = new IndexedDbAssetCache();
  private readonly workspace = inject(WorkspaceStateService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly official = new MojangVanillaAssetSource();
  readonly activity = inject(AssetActivityService);
  private readonly thumbnailUrls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly thumbnailQueue = new ThumbnailTaskQueue(4);
  readonly provider = signal<VanillaAssetProvider | undefined>(undefined);
  readonly visualProvider = signal<VanillaBlockVisualProvider | undefined>(undefined);
  readonly status = signal<VanillaAssetStatus>('loading-cache');
  readonly contentRestore = signal<ContentRestoreState>({ phase: 'vanilla', current: 0, total: 0, failed: 0 });
  readonly contentReady = computed(() => this.contentRestore().phase === 'ready' || this.contentRestore().phase === 'partial');
  readonly activeVersion = signal<string>(DEFAULT_MINECRAFT_VERSION);
  readonly downloadProgress = signal<VanillaDownloadProgress | undefined>(undefined);
  readonly message = signal('');
  readonly sourceName = signal('');
  readonly generation = signal(0);
  readonly thumbnailEpoch = signal(0);
  readonly diagnostics = signal<VanillaAssetDiagnostics>({ cacheSchema: VANILLA_ASSET_CACHE_SCHEMA_VERSION, bundleFound: false, generation: 0, providerReady: false, resourceCount: 0, stoneBlockstate: false, stoneModel: false, stoneTexture: false, language: false, itemDefinitions: 0, resourceFormat: { id: 'unsupported', support: 'unsupported-resource-format', blockstates: 0, models: 0, textures: 0, languages: 0, items: 0, label: 'Unsupported resource format' } });
  readonly cachedVersions = signal<readonly string[]>([]);
  readonly sources = new ContentSourceRegistry();
  readonly importedMods = signal<readonly ImportedModSummary[]>([]);
  readonly compatibilityReport = signal<CompatibilityReport | undefined>(undefined);
  private loadRequest = 0;
  private inFlight?: { readonly version: string; readonly promise: Promise<void> };

  constructor() {
    effect(() => { const version = this.workspace.project()?.metadata.minecraftVersion; if (version) void this.ensureVersion(version); });
    void this.refreshCachedVersions();
  }

  async importJar(file: File): Promise<void> {
    const request = ++this.loadRequest;
    const protection = this.activity.protect(`Importing ${file.name}`);
    this.status.set('importing'); this.message.set('');
    this.activity.begin('manual-import', `Reading ${file.name}`);
    try {
      const bundle = await new JarImportSource().load(file, this.activeVersion());
      const provider = providerFromBundle(bundle);
      provider.assertUsable();
      await this.cache.save(provider.serialize());
      await this.activateVersion(provider, request);
      this.activity.finish('manual-import', `Imported ${file.name}`);
    } catch (error) {
      this.status.set('import-required'); this.message.set(error instanceof Error ? error.message : 'Unable to import Minecraft assets');
      this.activity.fail('manual-import', this.message());
    } finally {
      this.activity.releaseProtected(protection);
    }
  }

  async importModJar(file: File): Promise<ModImportReport> {
    const protection = this.activity.protect(`Importing ${file.name}`);
    this.activity.begin('mod-import', `Reading ${file.name}`, 'mod');
    try {
      const prepared = await this.inspectModJar(file);
      try {
        const provider = commitModImport(prepared, (progress) => this.reportModProgress(progress));
        this.assertExternalSourceAvailable(provider);
        this.reportModProgress({ phase: 'saving-cache' });
        await this.cache.saveExternalMod(provider.serialize());
        this.reportModProgress({ phase: 'activating' });
        this.activateExternal(provider);
        this.activity.finish('mod-import', `Imported ${provider.metadata.displayName}`, 'mod');
        return provider.report;
      } finally { prepared.dispose(); }
    } catch (error) {
      this.activity.fail('mod-import', error instanceof Error ? error.message : 'Mod import failed', 'mod');
      throw error;
    } finally {
      this.activity.releaseProtected(protection);
    }
  }

  async inspectModJar(file: File, onProgress?: (progress: ModImportProgress) => void): Promise<PreparedModImport> {
    const prepared = await inspectModJar(file, this.activeVersion(), (progress) => {
      onProgress?.(progress);
      this.activity.update(progress.processed === undefined ? undefined : { loaded: progress.processed, ...(progress.total === undefined ? {} : { total: progress.total }) }, progress.phase);
    });
    if (!prepared.report || !prepared.loaderSupported || !prepared.metadata) return prepared;
    let preview: ExternalModProvider | undefined;
    let preservePreview = false;
    try {
      preview = ExternalModProvider.create({
        metadata: prepared.metadata,
        json: prepared.json,
        resources: prepared.resources,
        diagnostics: prepared.diagnostics,
        minecraftVersion: prepared.minecraftVersion,
        fingerprint: prepared.fingerprint,
      });
      const resourceConflicts = this.sources.resources.inspectProvider(preview);
      const catalogConflicts = this.sources.inspectCatalogContribution(preview.catalog());
      const conflictDiagnostics: ModImportDiagnostic[] = [
        ...resourceConflicts.map((conflict) => ({
          severity: 'error' as const,
          category: 'blocking' as const,
          code: conflict.kind === 'tag-replacement' ? 'tag-replacement-unsupported' : 'resource-conflict',
          message: conflict.kind === 'tag-replacement' ? 'A tag replacement conflicts with an active content source.' : 'A retained resource path conflicts with an active content source.',
          path: conflict.path,
        })),
        ...catalogConflicts.map((conflict) => ({
          severity: 'error' as const,
          category: 'blocking' as const,
          code: `${conflict.kind}-conflict`,
          message: `A ${conflict.kind} is already provided by an active content source: ${conflict.id}.`,
        })),
      ];
      if (!conflictDiagnostics.length) return prepared;
      const diagnostics = [...prepared.diagnostics, ...conflictDiagnostics];
      preservePreview = true;
      return {
        ...prepared,
        diagnostics,
        report: {
          ...prepared.report,
          conflicts: [...prepared.report.conflicts, ...conflictDiagnostics],
          diagnostics,
          canActivate: false,
        },
        canActivate: false,
        dispose: () => { preview?.dispose(); prepared.dispose(); },
      };
    } catch {
      return prepared;
    } finally {
      if (!preservePreview) preview?.dispose();
    }
  }

  async commitPreparedModImport(prepared: PreparedModImport, onProgress?: (progress: ModImportProgress) => void): Promise<ModImportReport> {
    const reportProgress = (progress: ModImportProgress): void => { onProgress?.(progress); this.reportModProgress(progress); };
    const provider = commitModImport(prepared, reportProgress);
    this.assertExternalSourceAvailable(provider);
    reportProgress({ phase: 'saving-cache' });
    await this.cache.saveExternalMod(provider.serialize());
    reportProgress({ phase: 'activating' });
    this.activateExternal(provider);
    return provider.report;
  }

  async removeMod(sourceId: string): Promise<void> {
    if (!this.sources.providerForSource(sourceId)) return;
    this.sources.remove(sourceId);
    this.paintingCatalog.removeSource(sourceId);
    this.library.removeSource(sourceId);
    this.refreshVisualProvider();
    this.bumpGeneration();
    this.importedMods.update((mods) => mods.filter((mod) => mod.sourceId !== sourceId));
    await this.cache.deleteExternalMod(sourceId);
  }

  private reportModProgress(progress: ModImportProgress): void {
    this.activity.update(undefined, progress.phase);
  }

  async redownload(): Promise<void> { await this.ensureVersion(this.activeVersion(), true); }
  async removeCachedVersion(version = this.activeVersion()): Promise<void> {
    if (version === this.activeVersion()) { this.loadRequest += 1; this.inFlight = undefined; }
    await this.cache.deleteVanilla(version); await this.refreshCachedVersions();
    if (version === this.activeVersion()) { this.clearActiveSources(); this.compatibilityReport.set(undefined); this.status.set('no-assets'); this.sourceName.set(''); this.message.set(''); this.diagnostics.update((value) => ({ ...value, bundleFound: false, providerReady: false, resourceCount: 0 })); this.activity.event('cache', `Removed cached assets for Java ${version}`, 'info', 'cache'); }
  }

  exportCompatibilityReport(): CompatibilityReport | undefined {
    const report = this.compatibilityReport() ?? (this.provider() ? evaluateCompatibility(this.provider()!) : undefined);
    if (!report) return undefined;
    this.compatibilityReport.set(report);
    downloadCompatibilityReport(report);
    return report;
  }

  prepareThumbnails(blocks: readonly BlockDefinition[]): void {
    for (const block of blocks) this.prepareThumbnail(block.id, block.defaultState);
  }

  prepareItemThumbnails(items: readonly PlaceableItemDefinition[]): void { for (const item of items) this.prepareItemThumbnail(item); }

  requestItemThumbnail(item: PlaceableItemDefinition, priority: ThumbnailTaskPriority = 'visible'): void {
    const visual = this.visualProvider(); if (!visual) return;
    const previewState = item.previewState ?? item.defaultState;
    const previewItem = { ...item, previewBlocks: previewBlocksForItem(item, previewState) };
    const key = this.itemThumbnailKey(item, previewState);
    if (this.thumbnailUrls().has(key)) return;
    const fallback = visual.thumbnailUrl(item.displayBlockId, previewState);
    if (fallback) this.thumbnailUrls.set(new Map(this.thumbnailUrls()).set(key, fallback));
    if (!visual.perspectiveItemThumbnail) return;
    this.thumbnailQueue.enqueue(key, priority, async () => {
      const url = await visual.perspectiveItemThumbnail!(previewItem);
      if (!url) return;
      const current = new Map(this.thumbnailUrls()); current.set(key, url); this.thumbnailUrls.set(current);
    });
  }

  invalidateQueuedThumbnails(): void { this.thumbnailQueue.invalidate(); }

  prepareItemThumbnail(item: PlaceableItemDefinition): void {
    this.requestItemThumbnail(item, 'visible');
  }

  prepareThumbnail(blockId: string, state: Readonly<Record<string, string>>): void {
    const item = this.library.getItem(blockId);
    if (item) { this.prepareItemThumbnail({ ...item, defaultState: { ...state }, previewState: { ...state } }); return; }
    const visual = this.visualProvider(); if (!visual) return;
    const key = thumbnailKey(this.generation(), this.provider()?.gameVersion ?? 'unavailable', blockId, state);
    if (this.thumbnailUrls().has(key)) return;
    const fallback = visual.thumbnailUrl(blockId, state);
    if (fallback) this.thumbnailUrls.set(new Map(this.thumbnailUrls()).set(key, fallback));
    if (visual.perspectiveThumbnail) void visual.perspectiveThumbnail(blockId, state).then((url) => {
      if (!url) return;
      const current = new Map(this.thumbnailUrls());
      if (current.get(key) === url) return;
      current.set(key, url); this.thumbnailUrls.set(current);
    });
  }

  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>> = {}): string | undefined {
    const item = this.library.getItem(blockId);
    if (item) return this.thumbnailUrlForItem({ ...item, defaultState: { ...state }, previewState: { ...state } });
    const recipe = 'single';
    return this.thumbnailUrls().get(thumbnailKey(this.generation(), this.provider()?.gameVersion ?? 'unavailable', blockId, state, recipe));
  }

  thumbnailUrlForItem(item: PlaceableItemDefinition): string | undefined {
    const state = item.previewState ?? item.defaultState;
    return this.thumbnailUrls().get(this.itemThumbnailKey(item, state));
  }

  private itemThumbnailKey(item: PlaceableItemDefinition, state: Readonly<Record<string, string>>): string {
    return thumbnailIdentityForItem(this.generation(), this.provider()?.gameVersion ?? 'unavailable', item, state);
  }

  private ensureVersion(version: string, force = false): Promise<void> {
    if (!shouldStartVersionLoad(this.provider()?.minecraftVersion, this.status(), version, this.inFlight?.version, force)) return this.inFlight?.promise ?? Promise.resolve();
    const request = ++this.loadRequest;
    this.activeVersion.set(version); this.status.set('loading-cache'); this.contentRestore.set({ phase: 'vanilla', current: 0, total: 0, failed: 0 }); this.message.set(''); this.downloadProgress.set(undefined); this.compatibilityReport.set(undefined); this.clearActiveSources();
    const promise = this.loadVersion(version, request).finally(() => { if (this.inFlight?.promise === promise) this.inFlight = undefined; });
    this.inFlight = { version, promise };
    return promise;
  }

  private async loadVersion(version: string, request: number): Promise<void> {
    this.activity.begin('cache', `Checking cached assets for Java ${version}`, 'cache');
    try {
      const cached = await this.cache.load(version);
      if (request !== this.loadRequest) return;
      if (cached) {
        this.activity.event('cache', `Cached assets found for Java ${version}`, 'success', 'cache');
        await this.activateVersion(providerFromBundle({ ...cached, id: `vanilla-${version}`, type: 'vanilla', version, namespaces: ['minecraft'], manifest: { format: 'minecraft-builder-asset-bundle', version: 1 } }), request);
        return;
      }
      this.activity.event('cache', `No cached assets found for Java ${version}`, 'info', 'cache');
      this.status.set('downloading');
      const protection = this.activity.protect(`Downloading Minecraft Java ${version}`);
      this.activity.begin('metadata', `Resolving official Mojang metadata for Java ${version}`);
      try {
        const provider = await this.official.load(version, (progress) => { if (request !== this.loadRequest) return; this.downloadProgress.set(progress); this.activity.update({ loaded: progress.loaded, ...(progress.total !== undefined ? { total: progress.total } : {}) }, progress.phase === 'download' ? `Downloading Minecraft Java ${version}` : undefined); });
        this.activity.event('download', `Official client downloaded for Java ${version}`, 'success');
        provider.assertUsable();
        await this.cache.save(provider.serialize());
        this.activity.event('cache', `Saved normalized assets for Java ${version}`, 'success', 'cache');
        await this.refreshCachedVersions();
        if (request !== this.loadRequest) return;
        await this.activateVersion(provider, request);
      } finally {
        this.activity.releaseProtected(protection);
      }
    } catch (error) {
      if (request !== this.loadRequest) return;
      const message = error instanceof Error ? error.message : 'Unable to load official Minecraft assets';
      const unsupported = /resource format is not supported|no Minecraft asset resources|incomplete/i.test(message);
      this.status.set(unsupported ? 'unsupported-format' : 'offline'); this.contentRestore.set({ phase: 'error', current: 0, total: 0, failed: 1 }); this.message.set(message);
      this.sourceName.set(''); this.compatibilityReport.set(undefined);
      this.diagnostics.update((value) => ({ ...value, bundleFound: false, providerReady: false, resourceCount: 0 }));
      this.activity.fail('assets', message, 'vanilla');
      this.library.load({ minecraftVersion: version, sourceId: 'vanilla', sourceName: 'Vanilla', blocks: [] });
      await this.restoreExternalMods(version);
    }
  }

  private async activateVersion(provider: VanillaAssetProvider, request = this.loadRequest): Promise<void> {
    if (request !== this.loadRequest) return;
    provider.assertUsable();
    const version = provider.minecraftVersion;
    const registry = version === VANILLA_ASSET_VERSION ? await loadVanillaBlockRegistry() : undefined;
    this.clearActiveSources();
    this.sources.setActiveVersion(version);
    this.visualProvider()?.dispose();
    this.provider.set(provider);
    if (this.sources.providerForSource('vanilla')) this.sources.replace(provider); else this.sources.register(provider);
    this.visualProvider.set(new VanillaBlockVisualProvider(this.sources.resources));
    const catalog = provider.catalog(registry);
    this.library.replaceSource(catalog); this.paintingCatalog.replaceSource(provider.source.id, catalog.paintingVariants ?? []); this.thumbnailQueue.invalidate(); this.thumbnailUrls.set(new Map()); this.thumbnailEpoch.update((value) => value + 1);
    const generation = this.generation() + 1;
    this.generation.set(generation);
    this.diagnostics.set({ cacheSchema: VANILLA_ASSET_CACHE_SCHEMA_VERSION, bundleFound: true, generation, providerReady: true, ...provider.diagnostics() });
    this.compatibilityReport.set(undefined);
    this.sourceName.set(provider.sourceName); this.activeVersion.set(version); this.status.set('ready'); this.contentRestore.set({ phase: 'vanilla', current: 0, total: 0, failed: 0, sourceName: provider.sourceName }); this.message.set('');
    this.activity.finish('assets', `${provider.diagnostics().resourceFormat.label}; Java ${version} ready`);
    void this.generateCompatibilityReport(provider, request);
    await this.restoreExternalMods(version);
  }

  private async generateCompatibilityReport(provider: VanillaAssetProvider, request: number): Promise<void> {
    await Promise.resolve();
    if (request !== this.loadRequest || this.provider() !== provider) return;
    this.activity.begin('compatibility', `Evaluating common block compatibility for Java ${provider.minecraftVersion}`);
    const report = evaluateCompatibility(provider);
    if (request !== this.loadRequest || this.provider() !== provider) return;
    this.compatibilityReport.set(report);
    this.activity.finish('compatibility', `Compatibility report ready: ${report.summary.compatibleReused} reused, ${report.summary.changedNeedsDelta} changed, ${report.summary.newGenericSupported} generic, ${report.summary.unsupported} unsupported`);
  }

  private activateExternal(provider: ExternalModProvider): void {
    this.assertExternalSourceAvailable(provider);
    if (this.sources.providerForSource(provider.source.id)) this.sources.replace(provider); else this.sources.register(provider);
    const catalog = provider.catalog();
    this.library.replaceSource(catalog); this.paintingCatalog.replaceSource(provider.source.id, catalog.paintingVariants ?? []);
    this.refreshVisualProvider();
    this.bumpGeneration();
    const summary = summarizeMod(provider);
    this.importedMods.update((mods) => [...mods.filter((mod) => mod.sourceId !== summary.sourceId), summary].sort((left, right) => left.displayName.localeCompare(right.displayName)));
  }

  private refreshVisualProvider(): void { this.visualProvider()?.dispose(); this.visualProvider.set(new VanillaBlockVisualProvider(this.sources.resources)); this.thumbnailQueue.invalidate(); this.thumbnailUrls.set(new Map()); this.thumbnailEpoch.update((value) => value + 1); }
  private bumpGeneration(): void { this.generation.update((value) => value + 1); }

  private assertExternalSourceAvailable(provider: ExternalModProvider): void {
    const conflicts = this.sources.resources.inspectProvider(provider);
    if (conflicts.length) throw new Error(`Mod resource conflict at ${conflicts[0].path} (${conflicts[0].sourceIds.join(', ')})`);
    const contentConflicts = this.sources.inspectCatalogContribution(provider.catalog());
    if (contentConflicts.length) throw new Error(`Mod ${contentConflicts[0].kind} conflict for ${contentConflicts[0].id} (${contentConflicts[0].sourceIds.join(', ')})`);
  }

  private clearActiveSources(): void {
    this.thumbnailQueue.invalidate();
    for (const source of this.sources.sources()) { this.sources.remove(source.id); this.library.removeSource(source.id); this.paintingCatalog.removeSource(source.id); }
    this.importedMods.set([]); this.provider.set(undefined); this.visualProvider()?.dispose(); this.visualProvider.set(undefined);
  }

  private async restoreExternalMods(version: string): Promise<void> {
    let stored: readonly import('../mod/external-mod-provider').SerializedExternalMod[] = [];
    try { stored = await this.cache.loadExternalMods(); } catch { this.contentRestore.set({ phase: 'partial', current: 0, total: 0, failed: 1 }); return; }
    const total = stored.length;
    this.contentRestore.set({ phase: total ? 'restoring-mods' : 'ready', current: 0, total, failed: 0 });
    if (!total) return;
    await yieldToBrowser();
    let failed = 0; let current = 0;
    this.activity.begin('mod-restore', `Restoring imported Mods (0 / ${total})`, 'mod');
    for (const serialized of stored) {
      let sourceName = serialized.metadata?.displayName;
      try {
        const provider = ExternalModProvider.deserialize(serialized, version);
        sourceName = provider.metadata.displayName;
        if (provider.report.canActivate === false) failed += 1;
        else this.activateExternal(provider);
      } catch { failed += 1; /* A stale external cache is quarantined by omission; Vanilla remains usable. */ }
      current += 1;
      this.contentRestore.set({ phase: 'restoring-mods', current, total, failed, ...(sourceName ? { sourceName } : {}) });
      this.activity.update({ loaded: current, total }, sourceName ? `Restoring imported Mods (${current} / ${total}): ${sourceName}` : `Restoring imported Mods (${current} / ${total})`);
      await yieldToBrowser();
    }
    this.contentRestore.set(contentRestoreAfterMods(total, failed));
    this.activity.finish('mod-restore', failed ? `Imported Mods restored with ${failed} warning${failed === 1 ? '' : 's'}` : 'Imported Mods restored', 'mod');
  }

  private async refreshCachedVersions(): Promise<void> { try { this.cachedVersions.set(await this.cache.listVanillaVersions()); } catch { /* Cache availability is reported by the active load. */ } }
}

function summarizeMod(provider: ExternalModProvider): ImportedModSummary {
  return { sourceId: provider.source.id, modId: provider.metadata.id, displayName: provider.metadata.displayName, version: provider.metadata.version, namespaces: provider.source.namespaces, candidateBlockCount: provider.report.candidateBlockCount, ...(provider.fingerprint ? { fingerprint: provider.fingerprint } : {}), ...(provider.iconUrl() ? { iconUrl: provider.iconUrl() } : {}), report: provider.report };
}

export function shouldStartVersionLoad(providerVersion: string | undefined, status: VanillaAssetStatus, requestedVersion: string, inFlightVersion: string | undefined, force = false): boolean {
  if (force) return true;
  if (providerVersion === requestedVersion && status === 'ready') return false;
  return inFlightVersion !== requestedVersion;
}

export function contentRestoreAfterMods(total: number, failed: number): ContentRestoreState {
  return { phase: failed > 0 ? 'partial' : 'ready', current: Math.max(0, total), total: Math.max(0, total), failed: Math.max(0, failed) };
}

export function deriveAssetBootstrapStatus(status: VanillaAssetStatus, restore: ContentRestoreState, progress?: VanillaDownloadProgress): AssetBootstrapStatus {
  if (status === 'loading-cache') return { kind: 'loading-cache' };
  if (status === 'downloading') return { kind: 'downloading', percent: progress?.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : undefined };
  if (status === 'importing') return { kind: 'preparing' };
  if (status !== 'ready' || restore.phase === 'error') return { kind: 'unavailable' };
  if (restore.phase === 'restoring-mods') return { kind: 'restoring-mods', current: restore.current, total: restore.total, sourceName: restore.sourceName };
  if (restore.phase === 'partial') return { kind: 'partial', warnings: restore.failed };
  if (restore.phase === 'vanilla') return { kind: 'preparing' };
  return { kind: 'ready' };
}

function yieldToBrowser(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible' || typeof requestAnimationFrame !== 'function') return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => { if (settled) return; settled = true; document.removeEventListener('visibilitychange', onVisibilityChange); resolve(); };
    const onVisibilityChange = (): void => { if (document.visibilityState !== 'visible') finish(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    requestAnimationFrame(finish);
  });
}

export function thumbnailKey(generation: number, gameVersion: string, blockId: string, state: Readonly<Record<string, string>>, recipe = 'single', concreteBlockIds: readonly string[] = []): string {
  const serializedState = Object.entries(state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',');
  return `thumbnail-v6|${generation}|${gameVersion}|item-preview-v3|${recipe}|${blockId}|${concreteBlockIds.slice().sort().join(',')}|${serializedState}`;
}

export function thumbnailIdentityForItem(generation: number, gameVersion: string, item: Pick<PlaceableItemDefinition, 'itemId' | 'previewRecipe' | 'concreteBlockIds'>, previewState: Readonly<Record<string, string>>): string {
  return thumbnailKey(generation, gameVersion, item.itemId, previewState, item.previewRecipe, item.concreteBlockIds);
}
