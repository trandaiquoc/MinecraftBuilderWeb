import type { AssetResourceProvider } from '../blocks/resolver/resolver.types';
import { BlockModelResolver } from '../blocks/resolver/block-model-resolver';
import type { AssetBlockRecord, BlockItemEvidence, CatalogItemEvidence } from '../blocks/catalog/block-definition.types';
import type { BlockCapabilityProfile } from '../blocks/capabilities/block-capability.types';
import type { PlacementSupportRequirement } from '../blocks/catalog/block-definition.types';
import { blockStatePredicates, invalidPredicateReasons, type NormalizedPredicate } from './normalized-predicate';
import { extractBehaviorFingerprint, type BehaviorClassificationSummary, type BehaviorFingerprint } from '../block-behavior/compatibility/behavior-fingerprint';
import { mergeBlockStateDefinitions, inspectContentProperty, representativeContentState } from './content-property-inspector';
import { buildBlockResourceGraph, buildItemResourceGraph, mapResolverDiagnostic, resourceSourceMetadata, type ResourceDependencyGraph } from './content-resource-graph';
import { mergeContentEvidence, uniqueDiagnostics } from './content-evidence-merger';
import type { ContentIntrospectionDiagnostic, ContentItemHostVisualDescriptor, ContentPropertyDescriptor, ContentSemanticEvidence, ContentSemanticEvidenceProvider, ContentSpecialVisualDescriptor, EvidenceProvenance } from './content-semantic-types';
export type { ContentItemHostVisualDescriptor, ContentItemHostVisualSlot, ContentPropertyDescriptor, ContentPropertyEffects, ContentPropertySupplement, ContentSemanticEvidence, ContentSemanticEvidenceProvider, ContentSemanticSupplement, ContentSpecialVisualDescriptor, EvidenceProvenance, ContentIntrospectionDiagnostic, ContentIntrospectionDiagnosticCode } from './content-semantic-types';
export type { ResourceDependencyGraph, ResourceGraphEdge, ResourceGraphNode } from './content-resource-graph';
export { SemanticManifestEvidenceProvider, parseSemanticManifest } from './semantic-manifest-evidence';
export type { SemanticManifestParseResult } from './semantic-manifest-evidence';

export type ContentRole = 'block' | 'item' | 'decoration';
export type ContentConfidence = 'full' | 'partial' | 'unknown';

export interface ContentRoleEvidence {
  readonly role: ContentRole;
  readonly confidence: ContentConfidence;
  readonly provenance: EvidenceProvenance;
  readonly resources: readonly string[];
}

export type { NormalizedPredicate, NormalizedPropertyPredicate } from './normalized-predicate';

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

/** Resource-backed introspection shared by vanilla and external content sources. */
export class ContentIntrospectionEngine {
  private readonly resolver: BlockModelResolver;
  private readonly semanticEvidenceProviders: readonly ContentSemanticEvidenceProvider[];
  constructor(private readonly provider: AssetResourceProvider, semanticEvidenceProvider?: ContentSemanticEvidenceProvider | readonly ContentSemanticEvidenceProvider[]) {
    this.resolver = new BlockModelResolver(provider);
    this.semanticEvidenceProviders = semanticEvidenceProvider ? Array.isArray(semanticEvidenceProvider) ? semanticEvidenceProvider : [semanticEvidenceProvider] : [];
  }

  inspectBlock(record: AssetBlockRecord, fingerprintOverride?: BehaviorFingerprint): NormalizedContentDescriptor {
    const source = resourceSourceMetadata(this.provider, record.sourceId, record.sourceName);
    const resources = [...new Set([record.resources.blockstate, record.resources.model, ...record.resources.textures].filter((value): value is string => !!value))];
    const document = record.resources.blockstate ? this.provider.readJson(record.resources.blockstate) : undefined;
    const predicates = extractPredicates(document);
    const definitions = mergeBlockStateDefinitions(record.stateDefinitions, predicates);
    const placementDefault = { ...record.defaultState };
    const base = this.resolver.resolve(record.id, placementDefault);
    const properties = definitions.map((definition) => inspectContentProperty(record.id, definition, placementDefault, base, record, this.resolver));
    const representativeVisualState = representativeContentState(record.id, placementDefault, properties, this.resolver);
    const resolved = this.resolver.resolve(record.id, representativeVisualState);
    const graph = buildBlockResourceGraph(record.id, resources, resolved, this.provider, source);
    const diagnostics = [...graph.diagnostics, ...resolved.diagnostics.map((diagnostic) => mapResolverDiagnostic(diagnostic.code, diagnostic.message, diagnostic.resource, source.id)), ...this.semanticEvidenceProviders.flatMap((provider) => provider.diagnostics ?? [])];
    invalidPredicateReasons(predicates).forEach((reason) => diagnostics.push({ code: 'malformed-resource', message: `Malformed blockstate predicate: ${reason}`, resource: record.resources.blockstate, sourceId: source.id }));
    const roleEvidence: ContentRoleEvidence[] = [{ role: 'block', confidence: base.support === 'full' ? 'full' : base.support === 'partial' ? 'partial' : 'unknown', provenance: record.defaultStateSource === 'authoritative-report' ? 'authoritative-registry' : record.resources.blockstate ? 'resource-backed' : 'unknown', resources }];
    if (record.itemEvidence) roleEvidence.push({ role: 'item', confidence: 'partial', provenance: itemProvenance(record.itemEvidence), resources: [...(record.itemEvidence.referencedModels ?? []), ...(record.itemEvidence.referencedResources ?? [])] });
    const relationships: ContentRelationship[] = record.itemEvidence?.placeable === true ? [{ kind: 'item-block', from: record.itemEvidence.itemId, to: record.id, provenance: itemProvenance(record.itemEvidence) }] : [];
    const capabilities = record.capabilities?.map((capability) => capability.kind) ?? [];
    const semanticEvidence = record.semanticEvidence ?? (record.behavior ? [{ contractId: record.behavior.kind, provenance: record.defaultStateSource === 'authoritative-report' ? 'authoritative-registry' as const : 'resource-backed' as const, strength: 'partial' as const, supportingTags: [], supportingProperties: properties.filter((property) => property.effects.behavior).map((property) => property.name), supportingResources: resources }] : []);
    const stateSchemaIncomplete = record.defaultStateSource !== 'authoritative-report';
    if (stateSchemaIncomplete) diagnostics.push({ code: 'state-schema-incomplete', message: 'Static resources cannot prove runtime-registered properties.', sourceId: source.id });
    if (properties.some((property) => property.effects.runtimeUnknown)) diagnostics.push({ code: 'unknown-runtime-semantic', message: 'One or more observed properties have no verified runtime semantic contract.', sourceId: source.id });
    const descriptor: NormalizedContentDescriptor = { id: record.id, sourceId: source.id, sourceName: source.name, roles: roleEvidence.map((entry) => entry.role), roleEvidence, resources, properties, predicates, placementDefault, representativeVisualState, relationships, capabilities, capabilityProfile: record.capabilities, supportRequirements: record.supportRequirements, supportContracts: record.supportContracts, semanticEvidence, ...(record.behaviorClassification ? { behaviorClassification: record.behaviorClassification } : {}), stateSchemaIncomplete, resourceGraph: graph, diagnostics: uniqueDiagnostics(diagnostics) };
    const supplements = [...(record.semanticSupplements ?? []), ...this.semanticEvidenceProviders.flatMap((provider) => provider.supplementsFor(record.id, source.id))];
    const merged = mergeContentEvidence(descriptor, supplements);
    const fingerprint = fingerprintOverride
      ? { ...fingerprintOverride, properties: merged.properties.map((property) => ({ name: property.name, values: property.values, ...(property.derived ? { derived: true } : {}) })), defaultState: { ...record.defaultState, ...merged.placementDefault } }
      : extractBehaviorFingerprint(record, this.provider, merged);
    return { ...merged, behaviorFingerprint: fingerprint };
  }

  inspectItem(evidence: CatalogItemEvidence | BlockItemEvidence): NormalizedContentDescriptor {
    const id = evidence.itemId;
    const sourceId = 'sourceId' in evidence ? evidence.sourceId ?? 'unknown' : 'unknown';
    const sourceName = 'sourceName' in evidence ? evidence.sourceName ?? sourceId : sourceId;
    const resources = [...new Set([...(evidence.referencedModels ?? []), ...(evidence.referencedResources ?? [])])];
    const graph = buildItemResourceGraph(id, resources, this.provider, { id: sourceId, name: sourceName });
    return { id, sourceId, sourceName, roles: ['item'], roleEvidence: [{ role: 'item', confidence: resources.length ? 'partial' : 'unknown', provenance: 'resource-backed', resources }], resources, properties: [], predicates: [], placementDefault: {}, representativeVisualState: {}, relationships: [], capabilities: [], semanticEvidence: [], stateSchemaIncomplete: true, resourceGraph: graph, diagnostics: graph.diagnostics };
  }

  inspectDecoration(id: string, resources: readonly string[] = [], sourceId = 'unknown', sourceName = sourceId): NormalizedContentDescriptor {
    const roleEvidence: ContentRoleEvidence = { role: 'decoration', confidence: resources.length ? 'partial' : 'unknown', provenance: resources.length ? 'resource-backed' : 'unknown', resources };
    const graph: ResourceDependencyGraph = { nodes: [{ id: `decoration:${id}`, kind: 'decoration', sourceId, sourceName }, ...resources.map((resource) => ({ id: resource, kind: 'unknown' as const, sourceId, sourceName }))], edges: resources.map((resource) => ({ from: `decoration:${id}`, to: resource, kind: 'decoration' as const })), diagnostics: [] };
    return { id, sourceId, sourceName, roles: ['decoration'], roleEvidence: [roleEvidence], resources: [...resources], properties: [], predicates: [], placementDefault: {}, representativeVisualState: {}, relationships: [], capabilities: [], semanticEvidence: [], stateSchemaIncomplete: true, resourceGraph: graph, diagnostics: [] };
  }

}

export { mergeContentEvidence } from './content-evidence-merger';

export function extractPredicates(document: unknown): readonly NormalizedPredicate[] {
  return blockStatePredicates(document);
}

function itemProvenance(evidence: BlockItemEvidence): EvidenceProvenance { return evidence.sourceFormat === 'authoritative-registry' ? 'authoritative-registry' : (evidence.referencedModels?.length ?? 0) || (evidence.referencedResources?.length ?? 0) ? 'resource-backed' : 'unknown'; }
