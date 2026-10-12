import type { BlockCapabilityProfile } from '../blocks/capabilities/block-capability.types';
import type { PlacementSupportRequirement } from '../blocks/catalog/block-contracts.types';
import type { NormalizedPredicate } from './resources/normalized-predicate';
import type {
  ContentIntrospectionDiagnostic,
  ContentPropertyDescriptor,
  ContentSemanticEvidence,
  ContentSpecialVisualDescriptor,
  ContentItemHostVisualDescriptor,
  EvidenceProvenance,
} from './content-semantic-types';
import type { ResourceDependencyGraph } from './resources/content-resource-graph';
import type {
  BehaviorClassificationSummary,
  BehaviorFingerprint,
} from '../block-behavior/compatibility/behavior-fingerprint.types';

export type ContentRole = 'block' | 'item' | 'decoration';
export type ContentConfidence = 'full' | 'partial' | 'unknown';

export interface ContentRoleEvidence {
  readonly role: ContentRole;
  readonly confidence: ContentConfidence;
  readonly provenance: EvidenceProvenance;
  readonly resources: readonly string[];
}

export interface ContentRelationship {
  readonly kind: 'item-block' | 'resource' | 'tag' | 'multipart' | 'paired-part';
  readonly from: string;
  readonly to: string;
  readonly provenance: EvidenceProvenance;
}

export interface NormalizedContentDescriptor {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly roles: readonly ContentRole[];
  readonly roleEvidence: readonly ContentRoleEvidence[];
  readonly resources: readonly string[];
  readonly properties: readonly ContentPropertyDescriptor[];
  readonly predicates: readonly NormalizedPredicate[];
  readonly placementDefault: Readonly<Record<string, string>>;
  readonly representativeVisualState: Readonly<Record<string, string>>;
  readonly relationships: readonly ContentRelationship[];
  readonly capabilities: readonly string[];
  readonly capabilityProfile?: BlockCapabilityProfile;
  readonly supportRequirements?: readonly PlacementSupportRequirement[];
  readonly supportContracts?: readonly string[];
  readonly specialVisual?: ContentSpecialVisualDescriptor;
  readonly itemHostVisual?: ContentItemHostVisualDescriptor;
  readonly semanticEvidence: readonly ContentSemanticEvidence[];
  readonly behaviorFingerprint?: BehaviorFingerprint;
  readonly behaviorClassification?: BehaviorClassificationSummary;
  readonly stateSchemaIncomplete: boolean;
  readonly resourceGraph: ResourceDependencyGraph;
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
}

export type { NormalizedPredicate, NormalizedPropertyPredicate } from './resources/normalized-predicate';
export type {
  ResourceDependencyGraph,
  ResourceGraphEdge,
  ResourceGraphNode,
} from './resources/content-resource-graph';
export type {
  BehaviorCandidateSummary,
  BehaviorClassificationSummary,
  BehaviorEvidenceRecord,
  BehaviorFingerprint,
  BehaviorFingerprintResourceProvider,
  BehaviorTrait,
} from '../block-behavior/compatibility/behavior-fingerprint.types';
