import { SerializedVanillaAssets, VanillaAssetProvider } from '../vanilla/vanilla-asset-provider';
import { DEFAULT_MINECRAFT_VERSION } from '../../domain/project.types';

export const ASSET_BUNDLE_FORMAT = 'the-block-laundromat-asset-bundle' as const;
export const LEGACY_ASSET_BUNDLE_FORMAT = 'minecraft-builder-asset-bundle' as const;
type AssetBundleFormat = typeof ASSET_BUNDLE_FORMAT | typeof LEGACY_ASSET_BUNDLE_FORMAT;

/** Portable normalized asset payload. The same shape can be stored for a future mod JAR. */
export interface VanillaAssetBundle extends SerializedVanillaAssets {
  readonly id: string;
  readonly type: 'vanilla';
  readonly version: string;
  readonly namespaces: readonly string[];
  readonly manifest: { readonly format: AssetBundleFormat; readonly version: 1 };
}

export interface AssetBundleSource {
  readonly id: string;
  load(): Promise<VanillaAssetBundle | undefined>;
}

/** Explicit File API source. Keeping it here means future mod imports share the same source contract. */
export class JarImportSource {
  async load(
    file: File,
    minecraftVersion: string = DEFAULT_MINECRAFT_VERSION,
    signal?: AbortSignal,
  ): Promise<VanillaAssetBundle> {
    return vanillaBundle(
      (await VanillaAssetProvider.fromJar(file, minecraftVersion, file.name, signal)).serialize(),
      file.name,
    );
  }
}

export class IndexedDbAssetBundleSource implements AssetBundleSource {
  readonly id = 'indexeddb';
  constructor(private readonly loadBundle: () => Promise<SerializedVanillaAssets | undefined>) {}
  async load(): Promise<VanillaAssetBundle | undefined> {
    const bundle = await this.loadBundle();
    return bundle ? vanillaBundle(bundle, 'indexeddb') : undefined;
  }
}

export function vanillaBundle(
  bundle: SerializedVanillaAssets,
  id = `vanilla-${bundle.minecraftVersion}`,
): VanillaAssetBundle {
  return {
    ...bundle,
    id,
    type: 'vanilla',
    version: bundle.minecraftVersion,
    namespaces: ['minecraft'],
    manifest: { format: ASSET_BUNDLE_FORMAT, version: 1 },
  };
}

export function providerFromBundle(bundle: VanillaAssetBundle): VanillaAssetProvider {
  return VanillaAssetProvider.deserialize(bundle);
}
