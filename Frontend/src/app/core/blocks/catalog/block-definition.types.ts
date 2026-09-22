import type { BlockCapability, BlockCapabilityEvidence, BlockCapabilityProfile } from '../capabilities/block-capability.types';
import type { ContentItemHostVisualDescriptor, ContentSemanticEvidence, ContentSpecialVisualDescriptor, NormalizedContentDescriptor } from '../../content/content-introspection';

export type BlockSupportLevel = 'full' | 'partial' | 'fallback';
export type BehaviorSupportLevel = 'full' | 'partial' | 'unknown';
export type VisualSupportLevel = 'real' | 'partial' | 'fallback';
export type BlockVisualClassification = 'standard-json' | 'special-renderer-required' | 'intentionally-invisible';
export type DefaultStateSource = 'authoritative-report' | 'verified-fixture' | 'compatible-common' | 'resource-derived' | 'resource-render-fallback' | 'unknown';

export interface PlacementSupportRequirement {
  readonly direction: 'below' | 'above' | 'north' | 'east' | 'south' | 'west';
  readonly contractId: string;
  readonly evidence: 'verified';
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
  readonly contentKind?: import('../../content/content-classifier').MinecraftContentKind;
  readonly provenance?: import('../../content/content-classifier').ContentClassificationProvenance;
  readonly sourceFormat?: 'modern-item-definition' | 'legacy-item-model' | 'authoritative-registry' | 'unknown';
  readonly referencedModels?: readonly string[];
  readonly referencedResources?: readonly string[];
}

/** Source-level item evidence. Item registry identity is independent from BlockDefinition identity. */
export interface CatalogItemEvidence {
  readonly itemId: string;
  readonly referencedModels: readonly string[];
  readonly referencedResources: readonly string[];
  readonly explicitBlockPlacement?: { readonly blockId: string };
  readonly sourceFormat: 'modern-item-definition' | 'legacy-item-model' | 'authoritative-registry' | 'unknown';
  readonly sourceId?: string;
  readonly sourceName?: string;
}

export type BlockBehavior =
  | { readonly kind: 'solid' }
  | { readonly kind: 'horizontal-connect'; readonly family: 'fence' | 'pane' | 'wall'; readonly connectionGroup: string; readonly compatibleGroups: readonly string[]; readonly connectsToSolid: boolean; readonly derivedProperties: readonly string[] }
  | { readonly kind: 'stairs'; readonly derivedProperties: readonly ['shape'] }
  | { readonly kind: 'wall-mounted'; readonly facingProperty: 'facing' }
  | { readonly kind: 'wall-sign'; readonly facingProperty: 'facing' }
  | { readonly kind: 'standing-sign'; readonly rotationProperty: 'rotation'; readonly wallBlockId: string }
  | { readonly kind: 'hanging-sign'; readonly rotationProperty: 'rotation'; readonly attachedProperty: 'attached'; readonly wallBlockId: string }
  | { readonly kind: 'wall-hanging-sign'; readonly facingProperty: 'facing' }
  | { readonly kind: 'floor-supported' }
  | { readonly kind: 'vertical-chain'; readonly axisProperty: 'axis'; readonly verticalAxis: 'y' }
  | { readonly kind: 'lantern-placement'; readonly hangingProperty: 'hanging'; readonly chainId: string }
  | { readonly kind: 'torch-placement'; readonly wallBlockId: string }
  | { readonly kind: 'double-height'; readonly halfProperty: 'half'; readonly requiresFloor: boolean }
  | { readonly kind: 'paired-horizontal'; readonly partProperty: 'part'; readonly facingProperty: 'facing'; readonly firstPart: 'foot'; readonly secondPart: 'head' }
  | { readonly kind: 'candle'; readonly candlesProperty: 'candles'; readonly maxCandles: 4 }
  | { readonly kind: 'six-face-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'decorated-pot-placement'; readonly facingProperty: 'facing' }
  | { readonly kind: 'conduit-placement'; readonly waterloggedProperty: 'waterlogged' }
  | { readonly kind: 'fluid'; readonly fluid: 'water' | 'lava' }
  | { readonly kind: 'button'; readonly faceProperty: 'face'; readonly facingProperty: 'facing'; readonly poweredProperty: 'powered' }
  | { readonly kind: 'head-placement'; readonly wall: boolean; readonly rotationProperty: 'rotation'; readonly facingProperty: 'facing' };

export interface BlockDefinition {
  readonly id: string;
  readonly namespace: string;
  readonly displayName: string;
  readonly modName?: string;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly resources: BlockResourceReference;
  readonly behaviorSupport: BehaviorSupportLevel;
  readonly visualSupport: VisualSupportLevel;
  readonly visualClassification: BlockVisualClassification;
  readonly defaultStateSource: DefaultStateSource;
  /** Compatibility alias for existing placement code; do not use for coverage reporting. */
  readonly support: BlockSupportLevel;
  readonly behavior?: BlockBehavior;
  /** Normalized, immutable routing metadata produced by BlockCatalog. Compatibility callers may omit it. */
  readonly capabilities?: BlockCapabilityProfile;
  readonly itemEvidence?: BlockItemEvidence;
  /** Trusted family evidence (for example an additive standard Minecraft tag). */
  readonly trustedBehaviorFamilies?: readonly string[];
  /** External resource sources set this to require explicit family evidence. */
  readonly behaviorEvidenceRequired?: boolean;
  /** Resource-backed roles/state/effect evidence shared by block, item and decoration tooling. */
  readonly contentDescriptor?: NormalizedContentDescriptor;
  readonly semanticEvidence?: readonly ContentSemanticEvidence[];
  readonly semanticSupplements?: readonly import('../../content/content-introspection').ContentSemanticSupplement[];
  readonly supportRequirements?: readonly PlacementSupportRequirement[];
  readonly supportContracts?: readonly string[];
  readonly specialVisual?: ContentSpecialVisualDescriptor;
  readonly itemHostVisual?: ContentItemHostVisualDescriptor;
}

/** Catalog output always has a normalized profile; legacy hand-authored callers may use BlockDefinition. */
export interface NormalizedBlockDefinition extends BlockDefinition {
  readonly capabilities: BlockCapabilityProfile;
  readonly sourceId: string;
  readonly sourceName: string;
}

/** Input produced by an approved asset extractor; it is kept separate from trusted registry entries. */
export interface AssetBlockRecord {
  readonly id: string;
  readonly displayName: string;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly resources: BlockResourceReference;
  readonly support?: BlockSupportLevel;
  readonly behaviorSupport?: BehaviorSupportLevel;
  readonly visualSupport?: VisualSupportLevel;
  readonly visualClassification?: BlockVisualClassification;
  readonly visualClassificationEvidence?: BlockCapabilityEvidence;
  readonly defaultStateSource?: DefaultStateSource;
  readonly modName?: string;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly behavior?: BlockBehavior;
  /** Optional trusted hints; final profiles are derived centrally during catalog normalization. */
  readonly capabilities?: readonly BlockCapability[];
  readonly itemEvidence?: BlockItemEvidence;
  readonly trustedBehaviorFamilies?: readonly string[];
  readonly behaviorEvidenceRequired?: boolean;
  readonly contentDescriptor?: NormalizedContentDescriptor;
  readonly semanticEvidence?: readonly ContentSemanticEvidence[];
  readonly semanticSupplements?: readonly import('../../content/content-introspection').ContentSemanticSupplement[];
  readonly supportRequirements?: readonly PlacementSupportRequirement[];
  readonly supportContracts?: readonly string[];
  readonly specialVisual?: ContentSpecialVisualDescriptor;
  readonly itemHostVisual?: ContentItemHostVisualDescriptor;
}
