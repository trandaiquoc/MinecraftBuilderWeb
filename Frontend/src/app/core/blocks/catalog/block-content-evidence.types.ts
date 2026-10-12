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
import type {
  BlockCapability,
  BlockCapabilityEvidence,
} from '../capabilities/block-capability.types';
import type { MinecraftContentKind } from '../../content/classification/content-classifier.types';
import type {
  ContentSemanticEvidence,
  ContentSemanticSupplement,
  ContentSpecialVisualDescriptor,
  ContentItemHostVisualDescriptor,
} from '../../content/content-semantic-types';
import type {
  BehaviorClassificationSummary,
  BehaviorFingerprint,
} from '../../block-behavior/compatibility/behavior-fingerprint.types';
import type { NormalizedContentDescriptor } from '../../content/content-introspection.types';
import type { LogicalPlacementMetadata } from '../../block-behavior/logical-objects/logical-placement.types';

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
  readonly contentKind?: MinecraftContentKind;
  readonly capabilities?: readonly BlockCapability[];
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
