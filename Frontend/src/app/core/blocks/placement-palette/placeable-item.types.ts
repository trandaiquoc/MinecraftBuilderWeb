import type {
  BlockPlacementVariants,
  BlockSupportLevel,
  CatalogItemEvidence,
  VisualSupportLevel,
} from '../catalog/block-definition.types';
import type { BlockState, PlacedBlock } from '../../domain/project.types';
import type { BlockCapabilityProfile } from '../capabilities/block-capability.types';
import type { MinecraftContentKind } from '../../content/content-classifier';
import type { LogicalPlacementMetadata } from '../../block-behavior/logical-objects/logical-placement';

export type PlaceablePlacementKind =
  | 'direct'
  | 'sign'
  | 'hanging-sign'
  | 'torch'
  | 'head'
  | 'banner'
  | 'coral-fan'
  | 'bed'
  | 'door'
  | 'tall-plant'
  | 'multi-block'
  | 'fluid-bucket';

export type PreviewRecipe =
  'single' | 'bed' | 'door' | 'tall-plant' | 'vertical-two-part' | 'horizontal-two-part';

export interface PlaceableItemDefinition {
  readonly itemId: string;
  readonly displayBlockId: string;
  readonly namespace: string;
  readonly displayName: string;
  readonly modName?: string;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly maxStackSize?: number;
  readonly defaultState: BlockState;
  /** State used only for browser/thumbnail representation; placement keeps defaultState. */
  readonly previewState?: BlockState;
  readonly concreteBlockIds: readonly string[];
  readonly placementVariants?: BlockPlacementVariants;
  readonly placementKind: PlaceablePlacementKind;
  readonly previewRecipe: PreviewRecipe;
  readonly logicalPlacement?: LogicalPlacementMetadata;
  readonly support: BlockSupportLevel;
  readonly visualSupport: VisualSupportLevel;
  /** Runtime item-backed profile; block definitions remain independent of item catalogs. */
  readonly capabilities: BlockCapabilityProfile;
  readonly contentKind?: MinecraftContentKind;
  readonly previewBlocks: readonly PlacedBlock[];
}

export interface PlaceableItemEvidence extends Partial<
  Pick<
    CatalogItemEvidence,
    | 'referencedModels'
    | 'referencedResources'
    | 'explicitBlockPlacement'
    | 'sourceFormat'
    | 'sourceId'
    | 'sourceName'
    | 'maxStackSize'
  >
> {
  readonly itemId: string;
  readonly placeable?: boolean;
  readonly contentKind?: MinecraftContentKind;
}

export interface PlaceableManifestEntry {
  readonly itemId: string;
  readonly concreteBlockIds: readonly string[];
  readonly kind: PlaceablePlacementKind;
  readonly recipe: PreviewRecipe;
  readonly displayName?: string;
  readonly defaultState?: BlockState;
  readonly placementVariants?: BlockPlacementVariants;
  readonly logicalPlacement?: LogicalPlacementMetadata;
}
