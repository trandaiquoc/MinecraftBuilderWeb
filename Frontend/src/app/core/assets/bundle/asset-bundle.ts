import { SerializedVanillaAssets, VANILLA_ASSET_VERSION, VanillaAssetProvider } from '../vanilla/vanilla-asset-provider';

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
  async load(file: File): Promise<VanillaAssetBundle> { return vanillaBundle((await VanillaAssetProvider.fromJar(file)).serialize(), file.name); }
}

export class IndexedDbAssetBundleSource implements AssetBundleSource {
  readonly id = 'indexeddb';
  constructor(private readonly loadBundle: () => Promise<SerializedVanillaAssets | undefined>) {}
  async load(): Promise<VanillaAssetBundle | undefined> {
    const bundle = await this.loadBundle();
    return bundle ? vanillaBundle(bundle, 'indexeddb') : undefined;
  }
}

/** Reads a developer-generated bundle if it is hosted in public/local-assets. */
export class LocalDefaultBundleSource implements AssetBundleSource {
  readonly id = 'local-default';
  constructor(private readonly root = '/local-assets/vanilla/1.21.1') {}
  async load(): Promise<VanillaAssetBundle | undefined> {
    const response = await fetch(`${this.root}/asset-bundle.json`);
    if (!response.ok) return undefined;
    const stored = await response.json() as VanillaAssetBundle | LocalBundleManifest;
    const bundle = 'binaryBase64' in stored ? {
      ...stored,
      binary: stored.binaryBase64.map((entry) => ({ path: entry.path, data: base64Buffer(entry.data) })),
    } : stored;
    if (bundle.type !== 'vanilla' || bundle.version !== VANILLA_ASSET_VERSION || bundle.manifest?.format !== 'minecraft-builder-asset-bundle') throw new Error('The local vanilla bundle manifest is incompatible');
    return bundle;
  }
}

interface LocalBundleManifest extends Omit<VanillaAssetBundle, 'binary'> { readonly binaryBase64: readonly { readonly path: string; readonly data: string }[]; }
function base64Buffer(value: string): ArrayBuffer { const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); return bytes.buffer; }

export function vanillaBundle(bundle: SerializedVanillaAssets, id = 'vanilla-1.21.1'): VanillaAssetBundle {
  return { ...bundle, id, type: 'vanilla', version: VANILLA_ASSET_VERSION, namespaces: ['minecraft'], manifest: { format: 'minecraft-builder-asset-bundle', version: 1 } };
}

export function providerFromBundle(bundle: VanillaAssetBundle): VanillaAssetProvider { return VanillaAssetProvider.deserialize(bundle); }
