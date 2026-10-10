import type { BlockCapabilityProfile } from '../blocks/capabilities/block-capability.types';
import type { PlacementSupportRequirement } from '../blocks/catalog/block-definition.types';

export type EvidenceProvenance =
  'authoritative-registry' | 'trusted-data' | 'resource-backed' | 'inferred' | 'unknown';
export interface ContentSemanticEvidence {
  readonly contractId: string;
  readonly provenance: EvidenceProvenance;
  readonly strength: 'strong' | 'partial' | 'unknown';
  readonly supportingTags: readonly string[];
  readonly supportingProperties: readonly string[];
  readonly supportingResources: readonly string[];
}
export interface ContentSpecialVisualDescriptor {
  readonly contractId: string;
  readonly resources: Readonly<Record<string, string>>;
  readonly stateDependencies: readonly string[];
  readonly variant?: 'standing' | 'wall' | 'hanging' | 'wall-hanging';
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly provenance: EvidenceProvenance;
}
export interface ContentItemHostVisualSlot {
  readonly index: number;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}
export interface ContentItemHostVisualDescriptor {
  readonly slots: readonly ContentItemHostVisualSlot[];
  readonly provenance: EvidenceProvenance;
}
export interface ContentPropertyEffects {
  readonly visual: boolean;
  readonly placement: boolean;
  readonly behavior: boolean;
  readonly attachment: boolean;
  readonly connection: boolean;
  readonly itemDisplay: boolean;
  readonly runtimeUnknown: boolean;
}
export interface ContentPropertyDescriptor {
  readonly name: string;
  readonly values: readonly string[];
  readonly defaultValue?: string;
  readonly derived: boolean;
  readonly provenance: EvidenceProvenance;
  readonly effects: ContentPropertyEffects;
  readonly evidence: readonly string[];
}
export interface ContentPropertySupplement {
  readonly name: string;
  readonly values: readonly string[];
  readonly defaultValue?: string;
  readonly derived?: boolean;
  readonly effects?: Partial<ContentPropertyEffects>;
  readonly provenance?: EvidenceProvenance;
  readonly evidence?: readonly string[];
}
export interface ContentSemanticSupplement {
  readonly id: string;
  readonly sourceId?: string;
  readonly properties?: readonly ContentPropertySupplement[];
  readonly defaultState?: Readonly<Record<string, string>>;
  readonly capabilities?: BlockCapabilityProfile;
  readonly supportRequirements?: readonly PlacementSupportRequirement[];
  readonly supportContracts?: readonly string[];
  readonly specialVisual?: ContentSpecialVisualDescriptor;
  readonly itemHostVisual?: ContentItemHostVisualDescriptor;
  readonly semanticEvidence?: readonly ContentSemanticEvidence[];
  readonly diagnostics?: readonly ContentIntrospectionDiagnostic[];
  readonly stateSchemaIncomplete?: boolean;
}
export interface ContentSemanticEvidenceProvider {
  supplementsFor(contentId: string, sourceId?: string): readonly ContentSemanticSupplement[];
  readonly diagnostics?: readonly ContentIntrospectionDiagnostic[];
}
export type ContentIntrospectionDiagnosticCode =
  | 'missing-resource'
  | 'missing-parent'
  | 'missing-texture'
  | 'resource-cycle'
  | 'malformed-resource'
  | 'unsupported-resource'
  | 'unknown-runtime-semantic'
  | 'state-schema-incomplete'
  | 'semantic-contract-mismatch'
  | 'ambiguous-content-role'
  | 'unsupported-resource-format';
export interface ContentIntrospectionDiagnostic {
  readonly code: ContentIntrospectionDiagnosticCode;
  readonly message: string;
  readonly resource?: string;
  readonly sourceId?: string;
}

// The diagnostic type is intentionally declared with the semantic contracts;
// both manifest and JVM evidence producers emit the same diagnostic protocol.
