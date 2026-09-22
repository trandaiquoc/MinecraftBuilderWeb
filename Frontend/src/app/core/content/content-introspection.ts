import type { AssetResourceProvider, ResolvedBlockModel } from '../blocks/resolver/resolver.types';
import { BlockModelResolver } from '../blocks/resolver/block-model-resolver';
import type { AssetBlockRecord, BlockItemEvidence, BlockStateDefinition, CatalogItemEvidence } from '../blocks/catalog/block-definition.types';
import type { BlockCapabilityProfile } from '../blocks/capabilities/block-capability.types';
import type { PlacementSupportRequirement } from '../blocks/catalog/block-definition.types';
import { resourcePath, resolveResourceLocation } from './resource-location';
import { blockStatePredicates, invalidPredicateReasons, type NormalizedPredicate, type NormalizedPropertyPredicate } from './normalized-predicate';

export type ContentRole = 'block' | 'item' | 'decoration';
export type EvidenceProvenance = 'authoritative-registry' | 'trusted-data' | 'resource-backed' | 'inferred' | 'unknown';
export type ContentConfidence = 'full' | 'partial' | 'unknown';
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
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly provenance: EvidenceProvenance;
}
export interface ContentItemHostVisualSlot {
  readonly index: number;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}
/** Verified item-display placement data. Slot count alone does not imply this contract. */
export interface ContentItemHostVisualDescriptor {
  readonly slots: readonly ContentItemHostVisualSlot[];
  readonly provenance: EvidenceProvenance;
}

export interface ContentRoleEvidence {
  readonly role: ContentRole;
  readonly confidence: ContentConfidence;
  readonly provenance: EvidenceProvenance;
  readonly resources: readonly string[];
}

export type { NormalizedPredicate, NormalizedPropertyPredicate } from './normalized-predicate';

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

export interface ContentRelationship {
  readonly kind: 'item-block' | 'resource' | 'tag' | 'multipart' | 'paired-part';
  readonly from: string;
  readonly to: string;
  readonly provenance: EvidenceProvenance;
}

export interface ResourceGraphNode {
  readonly id: string;
  readonly kind: 'blockstate' | 'model' | 'parent' | 'texture' | 'item' | 'decoration' | 'unknown';
  readonly sourceId: string;
  readonly sourceName: string;
}

export interface ResourceGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'variant' | 'model' | 'parent' | 'texture' | 'item' | 'decoration';
}

export interface ResourceDependencyGraph {
  readonly nodes: readonly ResourceGraphNode[];
  readonly edges: readonly ResourceGraphEdge[];
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
}

export type ContentIntrospectionDiagnosticCode = 'missing-resource' | 'missing-parent' | 'missing-texture' | 'resource-cycle' | 'malformed-resource' | 'unsupported-resource' | 'unknown-runtime-semantic' | 'state-schema-incomplete' | 'semantic-contract-mismatch' | 'ambiguous-content-role' | 'unsupported-resource-format';
export interface ContentIntrospectionDiagnostic {
  readonly code: ContentIntrospectionDiagnosticCode;
  readonly message: string;
  readonly resource?: string;
  readonly sourceId?: string;
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
  readonly stateSchemaIncomplete: boolean;
  readonly resourceGraph: ResourceDependencyGraph;
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
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

/** Verified runtime evidence supplied by an explicit, source-independent producer. */
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

/** Reads the optional MinecraftBuilder-owned semantic manifest without making
 * any assumptions about the namespace or loader that supplied the resources. */
export class SemanticManifestEvidenceProvider implements ContentSemanticEvidenceProvider {
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
  private readonly entries: readonly ContentSemanticSupplement[];
  constructor(provider: Pick<AssetResourceProvider, 'readJson'>, sourceId?: string, sourceName = sourceId ?? 'content source') {
    const path = ['data/minecraftbuilder/semantic-manifest.json', 'assets/minecraftbuilder/semantic-manifest.json']
      .find((candidate) => provider.readJson(candidate) !== undefined);
    if (!path) { this.entries = []; this.diagnostics = []; return; }
    const raw = provider.readJson(path);
    const parsed = parseSemanticManifest(raw, sourceId, sourceName, path);
    this.entries = parsed.entries;
    this.diagnostics = parsed.diagnostics;
  }
  supplementsFor(contentId: string, sourceId?: string): readonly ContentSemanticSupplement[] {
    return this.entries.filter((entry) => entry.id === contentId && (!entry.sourceId || entry.sourceId === sourceId));
  }
}

export interface SemanticManifestParseResult { readonly entries: readonly ContentSemanticSupplement[]; readonly diagnostics: readonly ContentIntrospectionDiagnostic[]; }

export function parseSemanticManifest(raw: unknown, sourceId?: string, sourceName = sourceId ?? 'content source', resource = 'data/minecraftbuilder/semantic-manifest.json'): SemanticManifestParseResult {
  const diagnostics: ContentIntrospectionDiagnostic[] = [];
  if (!isRecord(raw) || raw['schemaVersion'] !== 1 || !isRecord(raw['content'])) {
    return { entries: [], diagnostics: [{ code: 'malformed-resource', message: `Invalid semantic manifest from ${sourceName}; expected schemaVersion 1 and a content object.`, resource, sourceId }] };
  }
  const entries: ContentSemanticSupplement[] = [];
  for (const [id, value] of Object.entries(raw['content'])) {
    if (!isRecord(value)) { diagnostics.push({ code: 'malformed-resource', message: `Semantic manifest entry ${id} is not an object.`, resource, sourceId }); continue; }
    const properties = parsePropertySupplements(value['properties'], diagnostics, id, resource, sourceId);
    const capabilities = Array.isArray(value['capabilities']) ? value['capabilities'].filter(isRecord) as unknown as BlockCapabilityProfile : undefined;
    const supportRequirements = Array.isArray(value['supportRequirements']) ? value['supportRequirements'].filter(isSupportRequirement) : undefined;
    const supportContracts = Array.isArray(value['supportContracts']) ? value['supportContracts'].filter((item): item is string => typeof item === 'string') : undefined;
    const specialVisual = parseSpecialVisual(value['specialVisual']);
    if (value['specialVisual'] !== undefined && !specialVisual) diagnostics.push({ code: 'malformed-resource', message: `Semantic manifest special visual for ${id} is malformed.`, resource, sourceId });
    const itemHostVisual = parseItemHostVisual(value['itemHostVisual']);
    if (value['itemHostVisual'] !== undefined && !itemHostVisual) diagnostics.push({ code: 'malformed-resource', message: `Semantic manifest item host visual for ${id} is malformed.`, resource, sourceId });
    const defaultState = isStringRecord(value['defaultState']) ? value['defaultState'] : undefined;
    entries.push({ id, ...(sourceId ? { sourceId } : {}), properties, defaultState, capabilities, supportRequirements, supportContracts, ...(specialVisual ? { specialVisual } : {}), ...(itemHostVisual ? { itemHostVisual } : {}), semanticEvidence: [{ contractId: 'minecraftbuilder:semantic-manifest', provenance: 'trusted-data', strength: 'strong', supportingTags: [], supportingProperties: properties.map((property) => property.name), supportingResources: [resource] }] });
  }
  return { entries, diagnostics };
}

/** Resource-backed introspection shared by vanilla and external content sources. */
export class ContentIntrospectionEngine {
  private readonly resolver: BlockModelResolver;
  private readonly semanticEvidenceProviders: readonly ContentSemanticEvidenceProvider[];
  constructor(private readonly provider: AssetResourceProvider, semanticEvidenceProvider?: ContentSemanticEvidenceProvider | readonly ContentSemanticEvidenceProvider[]) {
    this.resolver = new BlockModelResolver(provider);
    this.semanticEvidenceProviders = semanticEvidenceProvider ? Array.isArray(semanticEvidenceProvider) ? semanticEvidenceProvider : [semanticEvidenceProvider] : [];
  }

  inspectBlock(record: AssetBlockRecord): NormalizedContentDescriptor {
    const source = sourceMetadata(this.provider, record.sourceId, record.sourceName);
    const resources = [...new Set([record.resources.blockstate, record.resources.model, ...record.resources.textures].filter((value): value is string => !!value))];
    const document = record.resources.blockstate ? this.provider.readJson(record.resources.blockstate) : undefined;
    const predicates = extractPredicates(document);
    const definitions = mergeDefinitions(record.stateDefinitions, predicates);
    const placementDefault = { ...record.defaultState };
    const base = this.resolver.resolve(record.id, placementDefault);
    const properties = definitions.map((definition) => this.inspectProperty(record.id, definition, placementDefault, base, record));
    const representativeVisualState = representativeState(record.id, placementDefault, definitions, this.resolver);
    const resolved = this.resolver.resolve(record.id, representativeVisualState);
    const graph = buildResourceGraph(record.id, resources, resolved, this.provider, source);
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
    const descriptor: NormalizedContentDescriptor = { id: record.id, sourceId: source.id, sourceName: source.name, roles: roleEvidence.map((entry) => entry.role), roleEvidence, resources, properties, predicates, placementDefault, representativeVisualState, relationships, capabilities, capabilityProfile: record.capabilities, supportRequirements: record.supportRequirements, supportContracts: record.supportContracts, semanticEvidence, stateSchemaIncomplete, resourceGraph: graph, diagnostics: uniqueDiagnostics(diagnostics) };
    const supplements = [...(record.semanticSupplements ?? []), ...this.semanticEvidenceProviders.flatMap((provider) => provider.supplementsFor(record.id, source.id))];
    return mergeContentEvidence(descriptor, supplements);
  }

  inspectItem(evidence: CatalogItemEvidence | BlockItemEvidence): NormalizedContentDescriptor {
    const id = evidence.itemId;
    const sourceId = 'sourceId' in evidence ? evidence.sourceId ?? 'unknown' : 'unknown';
    const sourceName = 'sourceName' in evidence ? evidence.sourceName ?? sourceId : sourceId;
    const resources = [...new Set([...(evidence.referencedModels ?? []), ...(evidence.referencedResources ?? [])])];
    const graph = buildItemGraph(id, resources, this.provider, { id: sourceId, name: sourceName });
    return { id, sourceId, sourceName, roles: ['item'], roleEvidence: [{ role: 'item', confidence: resources.length ? 'partial' : 'unknown', provenance: 'resource-backed', resources }], resources, properties: [], predicates: [], placementDefault: {}, representativeVisualState: {}, relationships: [], capabilities: [], semanticEvidence: [], stateSchemaIncomplete: true, resourceGraph: graph, diagnostics: graph.diagnostics };
  }

  inspectDecoration(id: string, resources: readonly string[] = [], sourceId = 'unknown', sourceName = sourceId): NormalizedContentDescriptor {
    const roleEvidence: ContentRoleEvidence = { role: 'decoration', confidence: resources.length ? 'partial' : 'unknown', provenance: resources.length ? 'resource-backed' : 'unknown', resources };
    const graph: ResourceDependencyGraph = { nodes: [{ id: `decoration:${id}`, kind: 'decoration', sourceId, sourceName }, ...resources.map((resource) => ({ id: resource, kind: 'unknown' as const, sourceId, sourceName }))], edges: resources.map((resource) => ({ from: `decoration:${id}`, to: resource, kind: 'decoration' as const })), diagnostics: [] };
    return { id, sourceId, sourceName, roles: ['decoration'], roleEvidence: [roleEvidence], resources: [...resources], properties: [], predicates: [], placementDefault: {}, representativeVisualState: {}, relationships: [], capabilities: [], semanticEvidence: [], stateSchemaIncomplete: true, resourceGraph: graph, diagnostics: [] };
  }

  private inspectProperty(id: string, definition: BlockStateDefinition, baseline: Readonly<Record<string, string>>, base: ResolvedBlockModel, record: AssetBlockRecord): ContentPropertyDescriptor {
    const values = [...new Set(definition.values)].sort();
    const visual = values.some((value) => {
      const candidate = this.resolver.resolve(id, { ...baseline, [definition.name]: value });
      return modelSignature(candidate) !== modelSignature(base);
    });
    const evidence = visual ? ['resource model selection differs for at least one observed value'] : ['no resource selection difference observed'];
    const behavior = behaviorEffects(record, definition.name);
    return { name: definition.name, values, ...(baseline[definition.name] !== undefined ? { defaultValue: baseline[definition.name] } : {}), derived: definition.derived === true, provenance: 'resource-backed', effects: { visual, placement: behavior.placement, behavior: behavior.behavior, attachment: behavior.attachment, connection: behavior.connection, itemDisplay: false, runtimeUnknown: !behavior.known }, evidence: [...evidence, ...behavior.evidence] };
  }
}

export function mergeContentEvidence(staticDescriptor: NormalizedContentDescriptor, supplements: readonly ContentSemanticSupplement[] = []): NormalizedContentDescriptor {
  const relevant = [...new Map(supplements.filter((supplement) => supplement.id === staticDescriptor.id && (!supplement.sourceId || supplement.sourceId === staticDescriptor.sourceId)).map((supplement) => [JSON.stringify(supplement), supplement] as const)).values()];
  if (!relevant.length) return staticDescriptor;
  const properties = new Map(staticDescriptor.properties.map((property) => [property.name, property]));
  const diagnostics = [...staticDescriptor.diagnostics];
  const defaults: Record<string, string> = { ...staticDescriptor.placementDefault };
  const capabilityProfile = [...(staticDescriptor.capabilityProfile ?? [])];
  const supportRequirements = [...(staticDescriptor.supportRequirements ?? [])];
  const supportContracts = [...(staticDescriptor.supportContracts ?? [])];
  const semanticEvidence = [...staticDescriptor.semanticEvidence];
  let specialVisual = staticDescriptor.specialVisual;
  let itemHostVisual = staticDescriptor.itemHostVisual;
  let stateSchemaIncomplete = staticDescriptor.stateSchemaIncomplete;
  for (const supplement of relevant) {
    for (const [name, value] of Object.entries(supplement.defaultState ?? {})) {
      if (defaults[name] !== undefined && defaults[name] !== value) diagnostics.push({ code: 'semantic-contract-mismatch', message: `Verified semantic evidence conflicts with the default value for ${name}.`, sourceId: staticDescriptor.sourceId });
      else defaults[name] = value;
    }
    for (const property of supplement.properties ?? []) {
      const current = properties.get(property.name);
      if (current && current.values.length && property.values.length && !current.values.some((value) => property.values.includes(value))) diagnostics.push({ code: 'semantic-contract-mismatch', message: `Verified semantic evidence conflicts with static property values for ${property.name}.`, sourceId: staticDescriptor.sourceId });
      const effects: ContentPropertyEffects = {
        visual: property.effects?.visual ?? current?.effects.visual ?? false,
        placement: property.effects?.placement ?? current?.effects.placement ?? false,
        behavior: property.effects?.behavior ?? current?.effects.behavior ?? false,
        attachment: property.effects?.attachment ?? current?.effects.attachment ?? false,
        connection: property.effects?.connection ?? current?.effects.connection ?? false,
        itemDisplay: property.effects?.itemDisplay ?? current?.effects.itemDisplay ?? false,
        runtimeUnknown: property.effects?.runtimeUnknown ?? current?.effects.runtimeUnknown ?? true,
      };
      properties.set(property.name, { name: property.name, values: [...new Set([...(current?.values ?? []), ...property.values])].sort(), ...(property.defaultValue !== undefined || current?.defaultValue !== undefined ? { defaultValue: property.defaultValue ?? current?.defaultValue } : {}), derived: property.derived ?? current?.derived ?? false, provenance: property.provenance ?? 'trusted-data', effects, evidence: [...new Set([...(current?.evidence ?? []), ...(property.evidence ?? [])])] });
      if (property.defaultValue !== undefined && defaults[property.name] === undefined) defaults[property.name] = property.defaultValue;
      else if (property.defaultValue !== undefined && defaults[property.name] !== undefined && defaults[property.name] !== property.defaultValue) diagnostics.push({ code: 'semantic-contract-mismatch', message: `Verified semantic evidence conflicts with the default value for ${property.name}.`, sourceId: staticDescriptor.sourceId });
    }
    for (const capability of supplement.capabilities ?? []) if (!capabilityProfile.some((current) => JSON.stringify(current) === JSON.stringify(capability))) capabilityProfile.push(capability);
    for (const requirement of supplement.supportRequirements ?? []) if (!supportRequirements.some((current) => JSON.stringify(current) === JSON.stringify(requirement))) supportRequirements.push(requirement);
    for (const contract of supplement.supportContracts ?? []) if (!supportContracts.includes(contract)) supportContracts.push(contract);
    if (supplement.specialVisual) {
      if (specialVisual && JSON.stringify(specialVisual) !== JSON.stringify(supplement.specialVisual)) diagnostics.push({ code: 'semantic-contract-mismatch', message: 'Verified semantic evidence conflicts with the special visual descriptor.', sourceId: staticDescriptor.sourceId });
      else specialVisual = supplement.specialVisual;
    }
    if (supplement.itemHostVisual) {
      if (itemHostVisual && JSON.stringify(itemHostVisual) !== JSON.stringify(supplement.itemHostVisual)) diagnostics.push({ code: 'semantic-contract-mismatch', message: 'Verified semantic evidence conflicts with the item host visual descriptor.', sourceId: staticDescriptor.sourceId });
      else itemHostVisual = supplement.itemHostVisual;
    }
    for (const evidence of supplement.semanticEvidence ?? []) if (!semanticEvidence.some((current) => JSON.stringify(current) === JSON.stringify(evidence))) semanticEvidence.push(evidence);
    diagnostics.push(...(supplement.diagnostics ?? []));
    if (supplement.stateSchemaIncomplete !== undefined) stateSchemaIncomplete = supplement.stateSchemaIncomplete;
  }
  const mergedProperties = [...properties.values()].sort((left, right) => left.name.localeCompare(right.name));
  return { ...staticDescriptor, properties: mergedProperties, placementDefault: defaults, capabilities: [...new Set([...staticDescriptor.capabilities, ...capabilityProfile.map((capability) => capability.kind)])], capabilityProfile: capabilityProfile.length ? capabilityProfile : staticDescriptor.capabilityProfile, supportRequirements: supportRequirements.length ? supportRequirements : staticDescriptor.supportRequirements, supportContracts: supportContracts.length ? supportContracts : staticDescriptor.supportContracts, ...(specialVisual ? { specialVisual } : {}), ...(itemHostVisual ? { itemHostVisual } : {}), semanticEvidence, stateSchemaIncomplete, diagnostics: uniqueDiagnostics(diagnostics) };
}

export function extractPredicates(document: unknown): readonly NormalizedPredicate[] {
  return blockStatePredicates(document);
}

function mergeDefinitions(definitions: readonly BlockStateDefinition[], predicates: readonly NormalizedPredicate[]): readonly BlockStateDefinition[] {
  const values = new Map<string, Set<string>>(); const derived = new Set<string>();
  for (const definition of definitions) { values.set(definition.name, new Set(definition.values)); if (definition.derived) derived.add(definition.name); }
  const visit = (predicate: NormalizedPredicate): void => { if (predicate.kind === 'properties') for (const item of predicate.properties ?? []) values.set(item.property, new Set([...(values.get(item.property) ?? []), ...item.values])); else for (const child of predicate.predicates ?? []) visit(child); };
  predicates.forEach(visit);
  return [...values].sort(([left], [right]) => left.localeCompare(right)).map(([name, options]) => ({ name, values: [...options].sort(), ...(derived.has(name) ? { derived: true } : {}) }));
}

function representativeState(id: string, baseline: Readonly<Record<string, string>>, definitions: readonly BlockStateDefinition[], resolver: BlockModelResolver): Readonly<Record<string, string>> {
  let best = { ...baseline }; let bestScore = score(resolver.resolve(id, best));
  for (const definition of definitions.slice().sort((a, b) => a.name.localeCompare(b.name))) for (const value of definition.values.slice().sort()) {
    const candidate = { ...baseline, [definition.name]: value }; const candidateScore = score(resolver.resolve(id, candidate));
    if (candidateScore > bestScore || candidateScore === bestScore && JSON.stringify(candidate) < JSON.stringify(best)) { best = candidate; bestScore = candidateScore; }
  }
  return best;
}
function score(model: ResolvedBlockModel): number { return (model.parts.length ? 100 : 0) + model.parts.reduce((sum, part) => sum + part.elements.length, 0) - model.diagnostics.length * 20; }
function modelSignature(model: ResolvedBlockModel): string { return JSON.stringify(model.parts.map((part) => [part.model, part.transform, part.elements.length, Object.keys(part.textures).sort()])); }
function behaviorEffects(record: AssetBlockRecord, property: string): { readonly known: boolean; readonly behavior: boolean; readonly placement: boolean; readonly attachment: boolean; readonly connection: boolean; readonly evidence: readonly string[] } {
  const behavior = record.behavior;
  if (!behavior) return { known: false, behavior: false, placement: false, attachment: false, connection: false, evidence: ['no verified common semantic contract for this property'] };
  const derived = behavior.kind === 'horizontal-connect' || behavior.kind === 'stairs' ? (behavior.derivedProperties as readonly string[]).includes(property) : false;
  const placement = behavior.kind === 'wall-mounted' || behavior.kind === 'wall-sign' || behavior.kind === 'wall-hanging-sign' || behavior.kind === 'head-placement' ? property === ('facing' in behavior ? behavior.facingProperty : 'rotation') : behavior.kind === 'paired-horizontal' ? property === behavior.partProperty || property === behavior.facingProperty : behavior.kind === 'double-height' ? property === behavior.halfProperty : false;
  const attachment = behavior.kind === 'wall-mounted' || behavior.kind === 'wall-sign' || behavior.kind === 'wall-hanging-sign' || behavior.kind === 'torch-placement' || behavior.kind === 'lantern-placement' ? property === ('facingProperty' in behavior ? behavior.facingProperty : 'hanging') : false;
  const connection = behavior.kind === 'horizontal-connect' || behavior.kind === 'stairs' ? derived : false;
  return { known: true, behavior: derived || placement || attachment || connection, placement, attachment, connection, evidence: [`common semantic contract ${behavior.kind} observes ${property}`] };
}

function buildResourceGraph(blockId: string, resources: readonly string[], model: ResolvedBlockModel, provider: AssetResourceProvider, source: { readonly id: string; readonly name: string }): ResourceDependencyGraph {
  const nodes = new Map<string, ResourceGraphNode>(); const edges: ResourceGraphEdge[] = [];
  const add = (id: string, kind: ResourceGraphNode['kind']): void => { const owner = resourceOwner(provider, id); nodes.set(id, { id, kind, sourceId: owner.id, sourceName: owner.name }); };
  const blockstate = resourcePath(blockId, 'blockstates'); if (blockstate) { add(blockstate, 'blockstate'); resources.forEach((resource) => { if (resource !== blockstate) edges.push({ from: blockstate, to: resource, kind: 'variant' }); }); }
  model.trace.modelResources.forEach((resource) => add(resource, 'model')); model.trace.parentResources.forEach((resource) => add(resource, 'parent')); model.trace.textureResources.forEach((resource) => add(resource, 'texture'));
  model.trace.modelResources.forEach((resource) => { if (blockstate) edges.push({ from: blockstate, to: resource, kind: 'model' }); });
  model.trace.parentResources.forEach((resource) => model.trace.modelResources.forEach((modelResource) => edges.push({ from: modelResource, to: resource, kind: 'parent' })));
  model.trace.textureResources.forEach((resource) => model.trace.modelResources.forEach((modelResource) => edges.push({ from: modelResource, to: resource, kind: 'texture' })));
  const diagnostics = model.diagnostics.map((diagnostic) => mapResolverDiagnostic(diagnostic.code, diagnostic.message, diagnostic.resource, source.id));
  for (const resource of resources) if (resource.endsWith('.json') && !provider.readJson(resource)) diagnostics.push({ code: 'missing-resource', message: `Missing resource: ${resource}`, resource, sourceId: source.id });
  return { nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)), edges: dedupeEdges(edges), diagnostics: uniqueDiagnostics(diagnostics) };
}
function buildItemGraph(itemId: string, resources: readonly string[], provider: AssetResourceProvider, source: { readonly id: string; readonly name: string }): ResourceDependencyGraph {
  const nodes = new Map<string, ResourceGraphNode>(); const edges: ResourceGraphEdge[] = []; const itemNode = `item:${itemId}`;
  nodes.set(itemNode, { id: itemNode, kind: 'item', sourceId: source.id, sourceName: source.name });
  for (const reference of resources) {
    const modelResource = resourcePath(reference, 'models');
    const textureResource = resourcePath(reference, 'textures');
    const resource = modelResource && provider.readJson(modelResource) ? modelResource : textureResource ?? reference;
    const kind: ResourceGraphNode['kind'] = resource === textureResource && resource !== modelResource ? 'texture' : 'model';
    const owner = resourceOwner(provider, resource); nodes.set(resource, { id: resource, kind, sourceId: owner.id, sourceName: owner.name }); edges.push({ from: itemNode, to: resource, kind: kind === 'texture' ? 'texture' : 'item' });
    if (resource.endsWith('.json') && !provider.readJson(resource)) edges.push({ from: itemNode, to: resource, kind: 'item' });
  }
  const diagnostics = [...edges.filter((edge) => edge.to.endsWith('.json') && !provider.readJson(edge.to)).map((edge) => ({ code: 'missing-resource' as const, message: `Missing resource: ${edge.to}`, resource: edge.to, sourceId: source.id }))];
  return { nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)), edges: dedupeEdges(edges), diagnostics };
}
function mapResolverDiagnostic(code: string, message: string, resource: string | undefined, sourceId: string): ContentIntrospectionDiagnostic { const mapped: ContentIntrospectionDiagnosticCode = code === 'missing-parent' || code === 'parent-cycle' ? (code === 'parent-cycle' ? 'resource-cycle' : 'missing-parent') : code === 'missing-texture' || code === 'texture-cycle' ? (code === 'texture-cycle' ? 'resource-cycle' : 'missing-texture') : code === 'missing-model' || code === 'missing-blockstate' ? 'missing-resource' : code === 'malformed-model' || code === 'malformed-blockstate' ? 'malformed-resource' : 'unsupported-resource'; return { code: mapped, message, resource, sourceId }; }
function dedupeEdges(edges: readonly ResourceGraphEdge[]): readonly ResourceGraphEdge[] { const seen = new Set<string>(); return edges.filter((edge) => { const key = `${edge.from}|${edge.to}|${edge.kind}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function uniqueDiagnostics(diagnostics: readonly ContentIntrospectionDiagnostic[]): readonly ContentIntrospectionDiagnostic[] { const seen = new Set<string>(); return diagnostics.filter((diagnostic) => { const key = `${diagnostic.code}|${diagnostic.resource}|${diagnostic.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function sourceMetadata(provider: AssetResourceProvider, fallbackId?: string, fallbackName?: string): { readonly id: string; readonly name: string } { const source = (provider as { readonly source?: { readonly id?: string; readonly displayName?: string } }).source; return { id: source?.id ?? fallbackId ?? 'unknown', name: source?.displayName ?? fallbackName ?? source?.id ?? fallbackId ?? 'Unknown' }; }
function resourceOwner(provider: AssetResourceProvider, resource: string): { readonly id: string; readonly name: string } {
  const routed = provider as AssetResourceProvider & { providerForExactPath?: (path: string) => readonly { readonly source?: { readonly id?: string; readonly displayName?: string } }[] };
  const owner = routed.providerForExactPath?.(resource)?.[0]?.source;
  return { id: owner?.id ?? sourceMetadata(provider).id, name: owner?.displayName ?? sourceMetadata(provider).name };
}
function itemProvenance(evidence: BlockItemEvidence): EvidenceProvenance { return evidence.sourceFormat === 'authoritative-registry' ? 'authoritative-registry' : (evidence.referencedModels?.length ?? 0) || (evidence.referencedResources?.length ?? 0) ? 'resource-backed' : 'unknown'; }
function parsePropertySupplements(value: unknown, diagnostics: ContentIntrospectionDiagnostic[], id: string, resource: string, sourceId?: string): readonly ContentPropertySupplement[] {
  if (value === undefined) return [];
  if (!isRecord(value)) { diagnostics.push({ code: 'malformed-resource', message: `Semantic manifest properties for ${id} must be an object.`, resource, sourceId }); return []; }
  return Object.entries(value).flatMap(([name, raw]): ContentPropertySupplement[] => {
    if (!isRecord(raw) || !Array.isArray(raw['values']) || !raw['values'].every((entry) => typeof entry === 'string')) { diagnostics.push({ code: 'malformed-resource', message: `Semantic manifest property ${id}.${name} is malformed.`, resource, sourceId }); return []; }
    return [{ name, values: raw['values'] as string[], ...(typeof raw['defaultValue'] === 'string' ? { defaultValue: raw['defaultValue'] } : {}), ...(typeof raw['derived'] === 'boolean' ? { derived: raw['derived'] } : {}), ...(isRecord(raw['effects']) ? { effects: raw['effects'] as Partial<ContentPropertyEffects> } : {}), provenance: 'trusted-data', evidence: [resource] }];
  });
}
function isSupportRequirement(value: unknown): value is PlacementSupportRequirement { return isRecord(value) && value['evidence'] === 'verified' && typeof value['contractId'] === 'string' && ['below', 'above', 'north', 'east', 'south', 'west'].includes(String(value['direction'])); }
function parseSpecialVisual(value: unknown): ContentSpecialVisualDescriptor | undefined {
  if (!isRecord(value) || typeof value['contractId'] !== 'string' || !isRecord(value['resources']) || !Object.values(value['resources']).every((entry) => typeof entry === 'string')) return undefined;
  const stateDependencies = Array.isArray(value['stateDependencies']) ? value['stateDependencies'].filter((entry): entry is string => typeof entry === 'string') : [];
  return { contractId: value['contractId'], resources: value['resources'] as Record<string, string>, stateDependencies, ...(isRecord(value['parameters']) ? { parameters: value['parameters'] } : {}), provenance: 'trusted-data' };
}
function parseItemHostVisual(value: unknown): ContentItemHostVisualDescriptor | undefined {
  if (!isRecord(value) || !Array.isArray(value['slots'])) return undefined;
  const slots = value['slots'].map((entry): ContentItemHostVisualSlot | undefined => {
    if (!isRecord(entry) || !Number.isInteger(entry['index']) || Number(entry['index']) < 0) return undefined;
    const position = vectorTuple(entry['position'] ?? entry['translation']);
    const rotation = vectorTuple(entry['rotation']);
    const scale = vectorTuple(entry['scale']);
    if ((entry['position'] ?? entry['translation']) !== undefined && !position || entry['rotation'] !== undefined && !rotation || entry['scale'] !== undefined && !scale) return undefined;
    return { index: Number(entry['index']), ...(position ? { position } : {}), ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) };
  });
  return slots.every((slot): slot is ContentItemHostVisualSlot => !!slot) ? { slots: slots as ContentItemHostVisualSlot[], provenance: 'trusted-data' } : undefined;
}
function vectorTuple(value: unknown): readonly [number, number, number] | undefined {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? [value[0] as number, value[1] as number, value[2] as number] : undefined;
}
function isStringRecord(value: unknown): value is Record<string, string> { return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
