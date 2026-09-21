import { Injectable, inject, signal } from '@angular/core';
import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlaceableItemDefinition, previewBlocksForItem } from '../../blocks/placement-palette/placeable-item';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { VanillaBlockVisualProvider } from '../../renderer/geometry/block-model-geometry';
import { IndexedDbAssetCache } from '../cache/indexeddb-asset-cache';
import { VanillaAssetProvider, VanillaAssetProviderDiagnostics, VANILLA_ASSET_CACHE_SCHEMA_VERSION } from './vanilla-asset-provider';
import { loadVanillaBlockRegistry, VanillaBlockRegistry } from '../../blocks/registry/vanilla-block-registry';
import { VanillaAssetBundle, IndexedDbAssetBundleSource, JarImportSource, LocalDefaultBundleSource, providerFromBundle } from '../bundle/asset-bundle';
import { ContentSourceRegistry } from '../content-source/content-source-registry';
import { ExternalModProvider, ModImportReport } from '../mod/external-mod-provider';
import { importFabricModJar } from '../mod/external-mod-importer';

export type VanillaAssetStatus = 'no-assets' | 'loading-cache' | 'importing' | 'ready' | 'import-required' | 'cache-error';
export interface VanillaAssetDiagnostics extends VanillaAssetProviderDiagnostics { readonly cacheSchema: number; readonly bundleFound: boolean; readonly generation: number; readonly providerReady: boolean; }
export interface ImportedModSummary { readonly sourceId: string; readonly modId: string; readonly displayName: string; readonly version: string; readonly namespaces: readonly string[]; readonly candidateBlockCount: number; readonly report: ModImportReport; }

@Injectable({ providedIn: 'root' })
export class VanillaAssetsService {
  private readonly library = inject(BlockLibraryService);
  private readonly cache = new IndexedDbAssetCache();
  private readonly thumbnailUrls = signal<ReadonlyMap<string, string>>(new Map());
  readonly provider = signal<VanillaAssetProvider | undefined>(undefined);
  readonly visualProvider = signal<VanillaBlockVisualProvider | undefined>(undefined);
  readonly status = signal<VanillaAssetStatus>('loading-cache');
  readonly message = signal('');
  readonly sourceName = signal('');
  readonly generation = signal(0);
  readonly diagnostics = signal<VanillaAssetDiagnostics>({ cacheSchema: VANILLA_ASSET_CACHE_SCHEMA_VERSION, bundleFound: false, generation: 0, providerReady: false, resourceCount: 0, stoneBlockstate: false, stoneModel: false, stoneTexture: false, language: false });
  private readonly registry = loadVanillaBlockRegistry();
  readonly sources = new ContentSourceRegistry();
  readonly importedMods = signal<readonly ImportedModSummary[]>([]);

  constructor() { void this.restore(); }

  async importJar(file: File): Promise<void> {
    this.status.set('importing'); this.message.set('');
    try {
      const [bundle, registry] = await Promise.all([new JarImportSource().load(file), this.registry]);
      const provider = providerFromBundle(bundle);
      provider.assertUsable();
      await this.cache.save(provider.serialize());
      this.activate(provider, registry);
    } catch (error) {
      this.status.set('import-required'); this.message.set(error instanceof Error ? error.message : 'Unable to import Minecraft assets');
    }
  }

  async importModJar(file: File): Promise<ModImportReport> {
    const provider = await importFabricModJar(file);
    this.assertExternalSourceAvailable(provider);
    await this.cache.saveExternalMod(provider.serialize());
    this.activateExternal(provider);
    return provider.report;
  }

  async removeMod(sourceId: string): Promise<void> {
    if (!this.sources.providerForSource(sourceId)) return;
    this.sources.remove(sourceId);
    this.library.removeSource(sourceId);
    this.refreshVisualProvider();
    this.bumpGeneration();
    this.importedMods.update((mods) => mods.filter((mod) => mod.sourceId !== sourceId));
    await this.cache.deleteExternalMod(sourceId);
  }

  prepareThumbnails(blocks: readonly BlockDefinition[]): void {
    for (const block of blocks) this.prepareThumbnail(block.id, block.defaultState);
  }

  prepareItemThumbnails(items: readonly PlaceableItemDefinition[]): void { for (const item of items) this.prepareItemThumbnail(item); }

  prepareItemThumbnail(item: PlaceableItemDefinition): void {
    const visual = this.visualProvider(); if (!visual) return;
    const previewItem = { ...item, previewBlocks: previewBlocksForItem(item, item.defaultState) };
    const key = thumbnailKey(this.generation(), this.provider()?.gameVersion ?? 'unavailable', item.itemId, item.defaultState, item.previewRecipe);
    if (this.thumbnailUrls().has(key)) return;
    const fallback = visual.thumbnailUrl(item.displayBlockId, item.defaultState);
    if (fallback) this.thumbnailUrls.set(new Map(this.thumbnailUrls()).set(key, fallback));
    if (visual.perspectiveItemThumbnail) void visual.perspectiveItemThumbnail(previewItem).then((url) => { if (!url) return; const current = new Map(this.thumbnailUrls()); current.set(key, url); this.thumbnailUrls.set(current); });
  }

  prepareThumbnail(blockId: string, state: Readonly<Record<string, string>>): void {
    const item = this.library.getItem(blockId);
    if (item) { this.prepareItemThumbnail({ ...item, defaultState: { ...state } }); return; }
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
    const recipe = this.library.getItem(blockId)?.previewRecipe ?? 'single';
    return this.thumbnailUrls().get(thumbnailKey(this.generation(), this.provider()?.gameVersion ?? 'unavailable', blockId, state, recipe));
  }

  private async restore(): Promise<void> {
    let registry: VanillaBlockRegistry | undefined;
    try {
      registry = await this.registry;
      const bundle = await this.loadFirstBundle();
      if (bundle) this.activate(providerFromBundle(bundle), registry);
      else {
        this.library.load(new VanillaAssetProvider('registry-only', {}, new Map()).catalog(registry));
        this.status.set('no-assets');
      }
      await this.restoreExternalMods();
    } catch (error) {
      if (registry) this.library.load(new VanillaAssetProvider('registry-only', {}, new Map()).catalog(registry));
      this.status.set('cache-error'); this.message.set(error instanceof Error ? error.message : 'Unable to restore vanilla assets');
    }
  }

  /** Local development bundle wins, then the durable browser cache, then the explicit JAR import fallback. */
  private async loadFirstBundle(): Promise<VanillaAssetBundle | undefined> {
    const sources = [new LocalDefaultBundleSource(), new IndexedDbAssetBundleSource(() => this.cache.load())];
    for (const source of sources) {
      try {
        const bundle = await source.load();
        if (bundle) {
          providerFromBundle(bundle).assertUsable();
          return bundle;
        }
      } catch (error) {
        if (source.id === 'indexeddb') throw error;
      }
    }
    return undefined;
  }

  private activate(provider: VanillaAssetProvider, registry: VanillaBlockRegistry): void {
    provider.assertUsable();
    this.visualProvider()?.dispose();
    this.provider.set(provider);
    if (this.sources.providerForSource('vanilla')) this.sources.replace(provider); else this.sources.register(provider);
    this.visualProvider.set(new VanillaBlockVisualProvider(this.sources.resources));
    this.library.replaceSource(provider.catalog(registry)); this.thumbnailUrls.set(new Map());
    const generation = this.generation() + 1;
    this.generation.set(generation);
    this.diagnostics.set({ cacheSchema: VANILLA_ASSET_CACHE_SCHEMA_VERSION, bundleFound: true, generation, providerReady: true, ...provider.diagnostics() });
    this.sourceName.set(provider.sourceName); this.status.set('ready'); this.message.set('');
  }

  private activateExternal(provider: ExternalModProvider): void {
    this.assertExternalSourceAvailable(provider);
    if (this.sources.providerForSource(provider.source.id)) this.sources.replace(provider); else this.sources.register(provider);
    this.library.replaceSource(provider.catalog());
    this.refreshVisualProvider();
    this.bumpGeneration();
    const summary = summarizeMod(provider);
    this.importedMods.update((mods) => [...mods.filter((mod) => mod.sourceId !== summary.sourceId), summary].sort((left, right) => left.displayName.localeCompare(right.displayName)));
  }

  private refreshVisualProvider(): void { this.visualProvider()?.dispose(); this.visualProvider.set(new VanillaBlockVisualProvider(this.sources.resources)); this.thumbnailUrls.set(new Map()); }
  private bumpGeneration(): void { this.generation.update((value) => value + 1); }

  private assertExternalSourceAvailable(provider: ExternalModProvider): void {
    for (const namespace of provider.source.namespaces) {
      if (namespace === 'minecraft') throw new Error('External mods cannot silently override the Vanilla namespace');
      const owner = this.sources.resources.providerForNamespace(namespace);
      if (owner && owner.source.id !== provider.source.id) throw new Error(`Content namespace is already owned: ${namespace}`);
    }
  }

  private async restoreExternalMods(): Promise<void> {
    let stored: readonly import('../mod/external-mod-provider').SerializedExternalMod[] = [];
    try { stored = await this.cache.loadExternalMods(); } catch { return; }
    for (const serialized of stored) {
      try { this.activateExternal(ExternalModProvider.deserialize(serialized)); }
      catch { /* A stale external cache is quarantined by omission; Vanilla remains usable. */ }
    }
  }
}

function summarizeMod(provider: ExternalModProvider): ImportedModSummary {
  return { sourceId: provider.source.id, modId: provider.metadata.id, displayName: provider.metadata.displayName, version: provider.metadata.version, namespaces: provider.source.namespaces, candidateBlockCount: provider.report.candidateBlockCount, report: provider.report };
}

export function thumbnailKey(generation: number, gameVersion: string, blockId: string, state: Readonly<Record<string, string>>, recipe = 'single'): string {
  const serializedState = Object.entries(state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',');
  return `thumbnail-v5|${generation}|${gameVersion}|item-preview-v2|${recipe}|${blockId}|${serializedState}`;
}
