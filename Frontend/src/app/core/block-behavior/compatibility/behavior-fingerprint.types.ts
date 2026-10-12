import type { BlockStateDefinition } from '../../blocks/catalog/block-contracts.types';
import type { EvidenceProvenance } from '../../content/content-semantic-types';

export type BehaviorTrait =
  | 'horizontal-connection'
  | 'neighbor-derived-shape'
  | 'six-face-orientation'
  | 'face-attachment'
  | 'floor-support'
  | 'ceiling-support'
  | 'axis-orientation'
  | 'waterloggable'
  | 'multi-block'
  | 'block-entity'
  | 'solid-support-provider';

export interface BehaviorEvidenceRecord {
  readonly source:
    | 'tag'
    | 'jvm'
    | 'state-schema'
    | 'blockstate'
    | 'model'
    | 'relationship'
    | 'support'
    | 'attachment'
    | 'name';
  readonly strength: 'strong' | 'partial' | 'weak';
  readonly provenance?: EvidenceProvenance;
  readonly detail: string;
}

export interface BehaviorCandidateSummary {
  readonly family: string;
  readonly valid: boolean;
  readonly score: number;
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly contradictions: readonly string[];
}

export interface BehaviorClassificationSummary {
  readonly chosenCandidate?: string;
  readonly traits: readonly BehaviorTrait[];
  readonly supportingEvidence: readonly BehaviorEvidenceRecord[];
  readonly rejectedCandidates: readonly BehaviorCandidateSummary[];
  readonly candidates: readonly BehaviorCandidateSummary[];
  readonly nameTieBreak?: string;
  readonly selectionReason: 'evidence' | 'name-tie-break' | 'ambiguous' | 'none';
  readonly confidence: 'strong' | 'partial' | 'unknown';
}

export interface BehaviorFingerprint {
  readonly id: string;
  readonly displayName: string;
  readonly behaviorEvidenceRequired?: boolean;
  readonly properties: readonly BlockStateDefinition[];
  readonly defaultState: Readonly<Record<string, string>>;
  readonly modelChangingProperties: readonly string[];
  readonly predicates: readonly string[];
  readonly modelReferences: readonly string[];
  readonly modelParents: readonly string[];
  readonly trustedFamilies: readonly string[];
  readonly tags: readonly string[];
  readonly itemBlockRelationship?: string;
  readonly capabilities: readonly string[];
  readonly supportContracts: readonly string[];
  readonly verifiedAttachmentContracts: readonly string[];
  readonly supportRequirements: readonly string[];
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly traits: readonly BehaviorTrait[];
  readonly nameTokens: readonly string[];
}

export interface BehaviorFingerprintResourceProvider {
  readJson(path: string): unknown | undefined;
}
