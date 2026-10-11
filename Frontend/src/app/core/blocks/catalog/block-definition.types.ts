import type {
  BlockBehavior,
  BlockItemEvidence,
  BlockPlacementVariants,
  BlockResourceReference,
  BlockStateDefinition,
  BlockSupportLevel,
  BehaviorSupportLevel,
  DefaultStateSource,
  PlacementSupportRequirement,
  VisualSupportLevel,
  BlockVisualClassification,
} from './block-contracts.types';
import type { BlockCapabilityProfile } from '../capabilities/block-capability.types';
import type {
  ContentSemanticEvidence,
  ContentSemanticSupplement,
  ContentSpecialVisualDescriptor,
  ContentItemHostVisualDescriptor,
} from '../../content/content-semantic-types';
import type { NormalizedContentDescriptor } from '../../content/content-introspection.types';
import type {
  BehaviorClassificationSummary,
  BehaviorFingerprint,
} from '../../block-behavior/compatibility/behavior-fingerprint.types';
import type { LogicalPlacementMetadata } from '../../block-behavior/logical-objects/logical-placement.types';
import type { MinecraftContentKind } from '../../content/content-classifier.types';

export type {
  BlockBehavior,
  BlockItemEvidence,
  BlockPlacementVariants,
  BlockResourceReference,
  BlockStateDefinition,
  BlockSupportLevel,
  BehaviorSupportLevel,
  CatalogItemEvidence,
  DefaultStateSource,
  PlacementSupportRequirement,
  VisualSupportLevel,
  BlockVisualClassification,
} from './block-contracts.types';
export type { AssetBlockRecord } from './block-content-evidence.types';
export type {
  BehaviorClassificationSummary,
  BehaviorFingerprint,
  BehaviorFingerprintResourceProvider,
  BehaviorTrait,
  BehaviorCandidateSummary,
  BehaviorEvidenceRecord,
} from '../../block-behavior/compatibility/behavior-fingerprint.types';

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
  readonly contentKind?: MinecraftContentKind;
  readonly capabilities?: BlockCapabilityProfile;
  readonly itemEvidence?: BlockItemEvidence;
  readonly trustedBehaviorFamilies?: readonly string[];
  readonly behaviorEvidenceRequired?: boolean;
  readonly contentDescriptor?: NormalizedContentDescriptor;
  readonly behaviorFingerprint?: BehaviorFingerprint;
  readonly behaviorClassification?: BehaviorClassificationSummary;
  readonly semanticEvidence?: readonly ContentSemanticEvidence[];
  readonly semanticSupplements?: readonly ContentSemanticSupplement[];
  readonly supportRequirements?: readonly PlacementSupportRequirement[];
  readonly supportContracts?: readonly string[];
  readonly placementVariants?: BlockPlacementVariants;
  readonly logicalPlacement?: LogicalPlacementMetadata;
  readonly specialVisual?: ContentSpecialVisualDescriptor;
  readonly itemHostVisual?: ContentItemHostVisualDescriptor;
}

/** Catalog output always has a normalized profile; legacy hand-authored callers may use BlockDefinition. */
export interface NormalizedBlockDefinition extends BlockDefinition {
  readonly capabilities: BlockCapabilityProfile;
  readonly sourceId: string;
  readonly sourceName: string;
}
