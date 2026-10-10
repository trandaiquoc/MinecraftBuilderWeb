import type * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import type { SpecialModelDescriptor } from './special-model-descriptor';

export interface SpecialVisualResourceProvider {
  readonly gameVersion?: string;
  readBinary(path: string): Uint8Array | undefined;
}

export interface SpecialVisualContext {
  readonly texture?: THREE.Texture;
  readonly textures?: Readonly<Record<string, THREE.Texture | undefined>>;
}

export interface NormalizedSpecialVisualDescriptor extends ContentSpecialVisualDescriptor {
  readonly contentId: string;
}

export interface SpecialVisualProviderMetadata {
  readonly providerId: string;
  readonly gameEdition: 'java';
  readonly gameVersion: string;
  readonly namespace: string;
  readonly family: string;
  readonly priority: number;
}

export interface BedVisualDescriptor {
  readonly metadata: SpecialVisualProviderMetadata;
  matches(block: PlacedBlock): boolean;
  textureResource(block: PlacedBlock): string | undefined;
  model(block: PlacedBlock): SpecialModelDescriptor | undefined;
  transform(block: PlacedBlock, root: THREE.Group): void;
}

export interface SpecialBlockVisualAdapter {
  readonly family: string;
  readonly overrideGeneric?: boolean;
  readonly staticBatchable?: boolean;
  matches(block: PlacedBlock): boolean;
  textureResource?(block: PlacedBlock): string | undefined;
  textureResources?(block: PlacedBlock): Readonly<Record<string, string>>;
  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group;
}

export interface SpecialVisualCompatibility {
  readonly adapter?: SpecialBlockVisualAdapter;
  readonly family?: string;
  readonly missingResources: readonly string[];
}

export const SPECIAL_VISUAL_COMPATIBILITY: Readonly<
  Record<string, { readonly requiredState: readonly string[]; readonly requiredResource: string }>
> = {
  beds: { requiredState: ['part', 'facing', 'occupied'], requiredResource: 'entity/bed/<color>' },
  chests: { requiredState: ['facing', 'type'], requiredResource: 'entity/chest/<variant>' },
  containers: { requiredState: [], requiredResource: 'generic-or-fallback' },
  signs: { requiredState: ['rotation|facing'], requiredResource: 'entity/signs/<wood>' },
  banners: { requiredState: ['facing|rotation'], requiredResource: 'banner-or-generic-model' },
  'heads-skulls': {
    requiredState: ['rotation|facing'],
    requiredResource: 'entity/<family>/<texture>',
  },
  'shulker-boxes': { requiredState: ['facing'], requiredResource: 'entity/shulker/<color>' },
  'decorated-pots': {
    requiredState: ['facing', 'waterlogged'],
    requiredResource: 'entity/decorated_pot/*',
  },
  conduits: { requiredState: ['waterlogged'], requiredResource: 'entity/conduit/base' },
};
