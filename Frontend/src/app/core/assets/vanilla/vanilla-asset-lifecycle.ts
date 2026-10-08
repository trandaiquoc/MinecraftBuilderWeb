import { JarImportSource, providerFromBundle } from '../bundle/asset-bundle';
import type { IndexedDbAssetCache } from '../cache/indexeddb-asset-cache';
import type { MojangVanillaAssetSource, VanillaDownloadProgress } from './mojang-vanilla-asset-source';
import type { VanillaAssetProvider } from './vanilla-asset-provider';
import { validateJarUpload } from '../mod/jar-upload-validation';
import { evaluateCompatibility } from './compatibility/compatibility-evaluator';
import type { CompatibilityReport } from './compatibility/compatibility.types';

export interface VanillaAssetLifecycleCache {
  load(version: string, signal?: AbortSignal): ReturnType<IndexedDbAssetCache['load']>;
  save(bundle: Parameters<IndexedDbAssetCache['save']>[0], signal?: AbortSignal): ReturnType<IndexedDbAssetCache['save']>;
  deleteVanilla(version: string, signal?: AbortSignal): ReturnType<IndexedDbAssetCache['deleteVanilla']>;
  listVanillaVersions(): ReturnType<IndexedDbAssetCache['listVanillaVersions']>;
}

export interface VanillaAssetSource {
  load(version: string, onProgress: (progress: VanillaDownloadProgress) => void, signal?: AbortSignal): ReturnType<MojangVanillaAssetSource['load']>;
}

/** Owns official vanilla bundle acquisition, normalization cache, and manual client-JAR import. */
export class VanillaAssetLifecycle {
  constructor(private readonly cache: VanillaAssetLifecycleCache, private readonly official: VanillaAssetSource) {}

  async loadCached(version: string, signal?: AbortSignal): Promise<VanillaAssetProvider | undefined> {
    const cached = await this.cache.load(version, signal);
    if (!cached) return undefined;
    const provider = providerFromBundle({ ...cached, id: `vanilla-${version}`, type: 'vanilla', version, namespaces: ['minecraft'], manifest: { format: 'minecraft-builder-asset-bundle', version: 1 } });
    provider.assertUsable();
    return provider;
  }

  async downloadAndCache(version: string, onProgress: (progress: VanillaDownloadProgress) => void, signal?: AbortSignal, onDownloaded?: () => void): Promise<VanillaAssetProvider> {
    const provider = await this.official.load(version, onProgress, signal);
    provider.assertUsable();
    onDownloaded?.();
    await this.cache.save(provider.serialize(), signal);
    return provider;
  }

  async importClientJar(file: File, version: string, signal?: AbortSignal): Promise<VanillaAssetProvider> {
    validateJarUpload(file);
    const bundle = await new JarImportSource().load(file, version, signal);
    const provider = providerFromBundle(bundle);
    provider.assertUsable();
    await this.cache.save(provider.serialize(), signal);
    return provider;
  }

  removeCachedVersion(version: string, signal?: AbortSignal): Promise<void> { return this.cache.deleteVanilla(version, signal); }
  cachedVersions(): Promise<readonly string[]> { return this.cache.listVanillaVersions(); }
  compatibilityReport(provider: VanillaAssetProvider): CompatibilityReport { return evaluateCompatibility(provider); }
}
