import type {
  MinecraftContentKind,
  ContentClassificationProvenance,
} from '../../content/content-classifier.types';

export type {
  BehaviorSupportLevel,
  BlockSupportLevel,
  BlockVisualClassification,
  DefaultStateSource,
  VisualSupportLevel,
} from './block-support.types';

export interface PlacementSupportRequirement {
  readonly direction: 'below' | 'above' | 'north' | 'east' | 'south' | 'west';
  readonly contractId: string;
  readonly evidence: 'verified';
}

export interface BlockPlacementVariants {
  readonly standing?: string;
  readonly wall?: string;
  readonly hanging?: string;
  readonly wallHanging?: string;
}

export interface BlockStateDefinition {
  readonly name: string;
  readonly values: readonly string[];
  readonly derived?: boolean;
}

export interface BlockResourceReference {
  readonly blockstate?: string;
  readonly model?: string;
  readonly textures: readonly string[];
}

export interface BlockItemEvidence {
  readonly itemId: string;
  readonly placeable?: boolean;
  readonly contentKind?: MinecraftContentKind;
  readonly provenance?: ContentClassificationProvenance;
  readonly sourceFormat?:
    'modern-item-definition' | 'legacy-item-model' | 'authoritative-registry' | 'unknown';
  readonly referencedModels?: readonly string[];
  readonly referencedResources?: readonly string[];
  readonly maxStackSize?: number;
}

export interface CatalogItemEvidence {
  readonly itemId: string;
  readonly referencedModels: readonly string[];
  readonly referencedResources: readonly string[];
  readonly explicitBlockPlacement?: { readonly blockId: string };
  readonly sourceFormat:
    'modern-item-definition' | 'legacy-item-model' | 'authoritative-registry' | 'unknown';
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly maxStackSize?: number;
}

export type BlockBehavior =
  | { readonly kind: 'solid' }
  | {
      readonly kind: 'horizontal-connect';
      readonly family: 'fence' | 'pane' | 'wall';
      readonly connectionGroup: string;
      readonly compatibleGroups: readonly string[];
      readonly connectsToSolid: boolean;
      readonly derivedProperties: readonly string[];
    }
  | { readonly kind: 'stairs'; readonly derivedProperties: readonly ['shape'] }
  | { readonly kind: 'wall-mounted'; readonly facingProperty: 'facing' }
  | { readonly kind: 'wall-sign'; readonly facingProperty: 'facing' }
  | {
      readonly kind: 'standing-sign';
      readonly rotationProperty: 'rotation';
      readonly wallBlockId: string;
    }
  | {
      readonly kind: 'hanging-sign';
      readonly rotationProperty: 'rotation';
      readonly attachedProperty: 'attached';
      readonly wallBlockId: string;
    }
  | { readonly kind: 'wall-hanging-sign'; readonly facingProperty: 'facing' }
  | { readonly kind: 'floor-supported' }
  | { readonly kind: 'vertical-chain'; readonly axisProperty: 'axis'; readonly verticalAxis: 'y' }
  | { readonly kind: 'lantern-placement'; readonly hangingProperty: 'hanging' }
  | { readonly kind: 'torch-placement'; readonly wallBlockId: string }
  | {
      readonly kind: 'double-height';
      readonly halfProperty: 'half';
      readonly requiresFloor: boolean;
    }
  | {
      readonly kind: 'paired-horizontal';
      readonly partProperty: 'part';
      readonly facingProperty: 'facing';
      readonly firstPart: 'foot';
      readonly secondPart: 'head';
    }
  | { readonly kind: 'candle'; readonly candlesProperty: 'candles'; readonly maxCandles: 4 }
  | { readonly kind: 'six-face-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'attached-six-face-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'decorated-pot-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'conduit-placement'; readonly waterloggedProperty: 'waterlogged' }
  | { readonly kind: 'fluid'; readonly fluid: 'water' | 'lava' }
  | {
      readonly kind: 'button';
      readonly faceProperty: 'face';
      readonly facingProperty: 'facing';
      readonly poweredProperty: 'powered';
    }
  | {
      readonly kind: 'head-placement';
      readonly wall: boolean;
      readonly rotationProperty: 'rotation';
      readonly facingProperty: 'facing';
    };
