import { SerializedVanillaAssets, VanillaAssetProvider } from '../vanilla/vanilla-asset-provider';

/** Portable normalized asset payload. The same shape can be stored for a future mod JAR. */
export interface VanillaAssetBundle extends SerializedVanillaAssets {
  readonly id: string;
  readonly type: 'vanilla';
  readonly version: string;
  readonly namespaces: readonly string[];
  readonly manifest: { readonly format: 'minecraft-builder-asset-bundle'; readonly version: 1 };
}

export interface AssetBundleSource {
  readonly id: string;
  load(): Promise<VanillaAssetBundle | undefined>;
}

/** Explicit File API source. Keeping it here means future mod imports share the same source contract. */
export class JarImportSource {
  async load(file: File, minecraftVersion = '1.21.1'): Promise<VanillaAssetBundle> { return vanillaBundle((await VanillaAssetProvider.fromJar(file, minecraftVersion, file.name)).serialize(), file.name); }
}

export class IndexedDbAssetBundleSource implements AssetBundleSource {
  readonly id = 'indexeddb';
  constructor(private readonly loadBundle: () => Promise<SerializedVanillaAssets | undefined>) {}
  async load(): Promise<VanillaAssetBundle | undefined> {
    const bundle = await this.loadBundle();
    return bundle ? vanillaBundle(bundle, 'indexeddb') : undefined;
  }
}

export function vanillaBundle(bundle: SerializedVanillaAssets, id = `vanilla-${bundle.minecraftVersion}`): VanillaAssetBundle {
  return { ...bundle, id, type: 'vanilla', version: bundle.minecraftVersion, namespaces: ['minecraft'], manifest: { format: 'minecraft-builder-asset-bundle', version: 1 } };
}

export function providerFromBundle(bundle: VanillaAssetBundle): VanillaAssetProvider { return VanillaAssetProvider.deserialize(bundle); }
