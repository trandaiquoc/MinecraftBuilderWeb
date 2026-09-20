import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { AssetResourceProvider } from '../../blocks/resolver/resolver.types';

export type ContentSourceKind = 'vanilla' | 'external';
export const CONTENT_SOURCE_MINECRAFT_VERSION = '1.21.1' as const;

export interface ContentSourceDescriptor {
  readonly id: string;
  readonly kind: ContentSourceKind;
  readonly displayName: string;
  readonly minecraftVersion: string;
  readonly sourceVersion?: string;
  readonly namespaces: readonly string[];
  readonly decorationSupport?: boolean;
}

export interface ContentSourceProvider extends AssetResourceProvider {
  readonly source: ContentSourceDescriptor;
  catalog?(): BlockCatalogSource;
  dispose?(): void;
}

export interface RenderableAssetResourceProvider extends AssetResourceProvider {
  readonly gameVersion?: string;
  readBinary(path: string): Uint8Array | undefined;
  textureUrl(resource: string): string | undefined;
}
