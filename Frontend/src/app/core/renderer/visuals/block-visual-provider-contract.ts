import type * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { ResolvedBlockModel } from '../../blocks/resolver';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import type { NormalizedSpecialVisualDescriptor } from './special-block-visuals';
import type { FluidRenderResolver, FluidWorldLookup } from '../fluids/fluid-state';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import type { ItemVisualKind } from './item-visual-resolver';

export type BlockRenderMode = 'real' | 'partial' | 'fallback';
export type BlockRenderDiagnosticCode = 'MODEL_NOT_FOUND' | 'TEXTURE_NOT_FOUND' | 'TEXTURE_DECODE_FAILED' | 'GEOMETRY_BUILD_FAILED' | 'UNKNOWN_ERROR';
export interface BlockRenderDiagnostic { readonly code: BlockRenderDiagnosticCode; readonly message: string; readonly resource?: string; }
export interface BlockVisualTrace {
  readonly texturePaths: readonly string[];
  readonly pngBytesFound: boolean;
  readonly textureDecoded: boolean;
  readonly geometryBuilt: boolean;
  readonly meshBuilt: boolean;
  readonly bounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
}
export interface BlockVisualResult {
  readonly object?: THREE.Group;
  readonly resolved: ResolvedBlockModel;
  readonly mode: BlockRenderMode;
  readonly diagnostics: readonly BlockRenderDiagnostic[];
  readonly trace: BlockVisualTrace;
}
export interface BlockVisualWorldContext extends FluidWorldLookup {}
export type PerspectiveThumbnailQuality = 'fallback' | 'enhanced';
export interface PerspectiveThumbnailResult {
  readonly url?: string;
  readonly quality: PerspectiveThumbnailQuality;
  readonly adapter?: Exclude<ItemVisualKind, 'unsupported'>;
  readonly retryable?: boolean;
}

export interface BlockVisualProvider {
  create(block: PlacedBlock, context?: BlockVisualWorldContext): Promise<BlockVisualResult>;
  occlusionClass?(block: PlacedBlock): OcclusionClass;
  reusableVisualKey?(block: PlacedBlock, context?: BlockVisualWorldContext): string | undefined;
  fluidRenderResolver?: FluidRenderResolver;
  fluidTexture?(resource: string): Promise<THREE.Texture | undefined>;
  fluidRenderContractKey?: string;
  thumbnailUrl(blockId: string, state: Readonly<Record<string, string>>): string | undefined;
  perspectiveThumbnail?(blockId: string, state: Readonly<Record<string, string>>): Promise<string | undefined>;
  perspectiveItemThumbnail?(item: PlaceableItemDefinition): Promise<PerspectiveThumbnailResult>;
  perspectiveItemVisualThumbnail?(itemId: string, components?: Readonly<Record<string, unknown>>): Promise<PerspectiveThumbnailResult>;
  setSpecialVisualDescriptors?(descriptors: readonly NormalizedSpecialVisualDescriptor[]): void;
  cacheStats?(): Readonly<VisualCacheStats>;
  resourceCounts?(): Readonly<VisualResourceCounts>;
  retain?(): void;
  release?(): void;
}
export interface VisualCacheStats { readonly resolvedModelCacheHits: number; readonly resolvedModelCacheMisses: number; readonly geometryCacheHits: number; readonly geometryCacheMisses: number; readonly textureCacheHits: number; readonly textureCacheMisses: number; }
export interface VisualResourceCounts { readonly resolvedModels: number; readonly geometries: number; readonly textures: number; readonly fluidTextures: number; readonly thumbnails: number; }
