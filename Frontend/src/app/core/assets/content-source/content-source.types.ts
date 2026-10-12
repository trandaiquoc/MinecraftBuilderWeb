import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import type { PaintingVariant } from '../../decorations/decoration.types';
import type { ContentSemanticEvidenceProvider } from '../../content/content-introspection';
import { DEFAULT_MINECRAFT_VERSION } from '../../domain/project.types';

export type ContentSourceKind = 'vanilla' | 'external';
export const CONTENT_SOURCE_MINECRAFT_VERSION = DEFAULT_MINECRAFT_VERSION;

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
  catalog?(): BlockCatalogSource & { readonly paintingVariants?: readonly PaintingVariant[] };
  readonly semanticEvidenceProviders?: readonly ContentSemanticEvidenceProvider[];
  dispose?(): void;
}

export type ContentSourceResourceReader = Pick<ContentSourceProvider, 'readJson'>;

export interface RenderableAssetResourceProvider extends AssetResourceProvider {
  readonly gameVersion?: string;
  readBinary(path: string): Uint8Array | undefined;
  textureUrl(resource: string): string | undefined;
}
