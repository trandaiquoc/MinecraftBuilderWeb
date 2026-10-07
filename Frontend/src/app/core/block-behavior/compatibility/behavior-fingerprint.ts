import type { AssetBlockRecord, BlockBehavior, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import type { ContentPropertyDescriptor, NormalizedContentDescriptor } from '../../content/content-introspection';
import { GENERIC_BEHAVIOR_PROFILES, type GenericBehaviorProfile } from './behavior-profiles';

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
  readonly source: 'tag' | 'jvm' | 'state-schema' | 'blockstate' | 'model' | 'relationship' | 'support' | 'name';
  readonly strength: 'strong' | 'partial' | 'weak';
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
  readonly supportRequirements: readonly string[];
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly traits: readonly BehaviorTrait[];
  readonly nameTokens: readonly string[];
}

export interface BehaviorFingerprintResourceProvider { readJson(path: string): unknown | undefined; }

interface BehaviorCandidate {
  readonly family: string;
  readonly behavior: BlockBehavior;
  readonly defaults: Readonly<Record<string, string>>;
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly contradictions: readonly string[];
  readonly score: number;
  readonly stateDefinitions?: readonly BlockStateDefinition[];
}

const SIX_FACE_VALUES = GENERIC_BEHAVIOR_PROFILES.attachedSixFace.requiredStates.facing;
const HORIZONTAL_VALUES = GENERIC_BEHAVIOR_PROFILES.wallMounted.requiredStates.facing;
const BOOLEAN_VALUES = GENERIC_BEHAVIOR_PROFILES.fence.requiredStates['north'];

export function extractBehaviorFingerprint(record: AssetBlockRecord, resources?: BehaviorFingerprintResourceProvider, descriptor?: NormalizedContentDescriptor): BehaviorFingerprint {
  const properties = descriptor?.properties?.map(toStateDefinition) ?? record.stateDefinitions;
  const blockstate = record.resources.blockstate ? resources?.readJson(record.resources.blockstate) : undefined;
  const modelReferences = uniqueStrings([record.resources.model, ...collectStrings(blockstate, 'model'), ...(record.itemEvidence?.referencedModels ?? [])]);
  const modelParents = collectModelParents(modelReferences, resources);
  const predicates = uniqueStrings([...collectPredicateProperties(blockstate), ...(descriptor?.predicates ?? []).flatMap((predicate) => predicateProperties(predicate))]);
  const modelChangingProperties = uniqueStrings([
    ...(descriptor?.properties?.filter((property) => property.derived || property.effects.visual).map((property) => property.name) ?? properties.filter((property) => property.derived).map((property) => property.name)),
    ...predicates,
  ]);
  const tags = uniqueStrings([...(record.semanticEvidence ?? []).flatMap((entry) => entry.supportingTags), ...(descriptor?.semanticEvidence ?? []).flatMap((entry) => entry.supportingTags)]);
  const semanticAttachmentContracts = [...(record.semanticEvidence ?? []), ...(descriptor?.semanticEvidence ?? [])]
    .filter((entry) => entry.strength === 'strong' && (entry.provenance === 'trusted-data' || entry.provenance === 'authoritative-registry'))
    .map((entry) => entry.contractId)
    .filter((contractId) => contractId === 'six-face-attachment');
  const supportContracts = uniqueStrings([...(record.supportContracts ?? []), ...(descriptor?.supportContracts ?? []), ...semanticAttachmentContracts]);
  const supportRequirements = uniqueStrings([
    ...(record.supportRequirements ?? []).map((requirement) => `${requirement.direction}:${requirement.contractId}`),
    ...(descriptor?.supportRequirements ?? []).map((requirement) => `${requirement.direction}:${requirement.contractId}`),
  ]);
  const evidence: BehaviorEvidenceRecord[] = [
    { source: 'state-schema', strength: 'strong', detail: `properties:${properties.map((property) => `${property.name}=${property.values.join('|')}`).join(';')}` },
    ...(predicates.length ? [{ source: 'blockstate' as const, strength: 'strong' as const, detail: `model predicates:${predicates.join(',')}` }] : []),
    ...(modelParents.length ? [{ source: 'model' as const, strength: 'strong' as const, detail: `parents:${modelParents.join(',')}` }] : []),
    ...(tags.length ? [{ source: 'tag' as const, strength: 'strong' as const, detail: `tags:${tags.join(',')}` }] : []),
    ...(supportContracts.length ? [{ source: 'support' as const, strength: 'strong' as const, detail: `contracts:${supportContracts.join(',')}` }] : []),
    ...(record.itemEvidence?.placeable ? [{ source: 'relationship' as const, strength: 'partial' as const, detail: `item:${record.itemEvidence.itemId}` }] : []),
  ];
  const base: Omit<BehaviorFingerprint, 'traits'> = {
    id: record.id,
    displayName: record.displayName,
    ...(record.behaviorEvidenceRequired !== undefined ? { behaviorEvidenceRequired: record.behaviorEvidenceRequired } : {}),
    properties,
    defaultState: { ...record.defaultState },
    modelChangingProperties,
    predicates,
    modelReferences,
    modelParents,
    trustedFamilies: uniqueStrings(record.trustedBehaviorFamilies ?? []),
    tags,
    ...(record.itemEvidence?.itemId ? { itemBlockRelationship: record.itemEvidence.itemId } : {}),
    capabilities: uniqueStrings([...(record.capabilities ?? []).map((capability) => capability.kind), ...(descriptor?.capabilities ?? [])]),
    supportContracts,
    supportRequirements,
    evidence,
    nameTokens: nameTokens(record.id, record.displayName),
  };
  return { ...base, traits: inferBehaviorTraits(base) };
}

export function inferBehaviorTraits(fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint): readonly BehaviorTrait[] {
  const traits = new Set<BehaviorTrait>();
  const has = (name: string, values?: readonly string[]) => {
    const property = fingerprint.properties.find((entry) => entry.name === name);
    return !!property && (!values || values.every((value) => property.values.includes(value)));
  };
  const horizontalConnection = HORIZONTAL_VALUES.every((name) => has(name, BOOLEAN_VALUES));
  const wallState = wallSchema(fingerprint) && wallResourceEvidence(fingerprint);
  const stairs = has('facing', HORIZONTAL_VALUES) && has('half', ['top', 'bottom']) && has('shape', ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']);
  const sixFace = has('facing', SIX_FACE_VALUES);
  if (horizontalConnection || wallState) traits.add('horizontal-connection');
  if (wallState || stairs) traits.add('neighbor-derived-shape');
  if (sixFace) traits.add('six-face-orientation');
  if (sixFace && hasFaceAttachmentEvidence(fingerprint)) traits.add('face-attachment');
  if (has('waterlogged', BOOLEAN_VALUES)) traits.add('waterloggable');
  if (has('axis', ['x', 'y', 'z'])) traits.add('axis-orientation');
  if (fingerprint.supportContracts.some((contract) => contract === 'floor' || contract === 'plantable-soil') || fingerprint.supportRequirements.some((requirement) => requirement.startsWith('below:'))) traits.add('floor-support');
  if (fingerprint.supportContracts.some((contract) => contract === 'ceiling') || fingerprint.supportRequirements.some((requirement) => requirement.startsWith('above:'))) traits.add('ceiling-support');
  if (fingerprint.capabilities.some((capability) => capability === 'block-entity')) traits.add('block-entity');
  if (fingerprint.capabilities.some((capability) => capability === 'solid' || capability === 'support-provider')) traits.add('solid-support-provider');
  return [...traits];
}

export function matchVanillaBehaviorCandidates(fingerprint: BehaviorFingerprint): { readonly behavior?: BlockBehavior; readonly family?: string; readonly defaults?: Readonly<Record<string, string>>; readonly stateDefinitions?: readonly BlockStateDefinition[]; readonly classification: BehaviorClassificationSummary } {
  const candidates = generateCandidates(fingerprint);
  const valid = candidates.filter((candidate) => candidate.contradictions.length === 0);
  const ranked = [...valid].sort((left, right) => right.score - left.score);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const evidenceWinner = top && (!runnerUp || top.score - runnerUp.score >= 2) ? top : undefined;
  const nameWinner = !evidenceWinner && ranked.length > 1 ? chooseByName(ranked, fingerprint.nameTokens) : undefined;
  const chosen = evidenceWinner ?? nameWinner;
  const selectionReason: BehaviorClassificationSummary['selectionReason'] = evidenceWinner
    ? 'evidence'
    : nameWinner
      ? 'name-tie-break'
      : ranked.length > 1
        ? 'ambiguous'
        : 'none';
  const nameTieBreak = nameWinner ? `registry/display alias selected ${nameWinner.family} after evidence tie` : undefined;
  const classification: BehaviorClassificationSummary = {
    ...(chosen ? { chosenCandidate: chosen.family } : {}),
    traits: fingerprint.traits,
    supportingEvidence: chosen?.evidence ?? [],
    rejectedCandidates: candidates.filter((candidate) => candidate.contradictions.length > 0).map(summary),
    candidates: candidates.map(summary),
    ...(nameTieBreak ? { nameTieBreak } : {}),
    selectionReason,
    confidence: chosen ? chosen.score >= 6 ? 'strong' : 'partial' : 'unknown',
  };
  return chosen ? { behavior: chosen.behavior, family: chosen.family, defaults: chosen.defaults, stateDefinitions: chosen.stateDefinitions, classification } : { classification };
}

function generateCandidates(fingerprint: BehaviorFingerprint): readonly BehaviorCandidate[] {
  const definitions = fingerprint.properties;
  const candidates: BehaviorCandidate[] = [];
  addSchemaCandidates(candidates, fingerprint, definitions);
  const wallProfile = GENERIC_BEHAVIOR_PROFILES.wall;
  const wall = compatibleSchema(definitions, wallProfile.requiredStates);
  if (wall.present && wall.valid && wallResourceEvidence(fingerprint)) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'tag']);
    const missing = HORIZONTAL_VALUES.filter((property) => !fingerprint.predicates.includes(property));
    if (missing.length) candidates.push(rejected('wall', `wall model selection omits ${missing.join(', ')}`, evidence));
    else candidates.push({ family: wallProfile.family, behavior: wallProfile.behavior, defaults: validDefaults(wallDefinitions(definitions), wallProfile.defaults), stateDefinitions: wallDefinitions(definitions), evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes('wall') ? 4 : 0) });
  } else if (wall.present) candidates.push(rejected('wall', 'wall properties have an incompatible value domain', evidenceFor(fingerprint, ['state-schema'])));

  const stairsProfile = GENERIC_BEHAVIOR_PROFILES.stairs;
  const stairs = required(definitions, stairsProfile.requiredStates);
  if (stairs.present && stairs.valid) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'tag']);
    const missing = ['facing', 'half', 'shape'].filter((property) => !fingerprint.predicates.includes(property));
    if (missing.length) candidates.push(rejected('stairs', `stair model selection omits ${missing.join(', ')}`, evidence));
    else candidates.push({ family: stairsProfile.family, behavior: stairsProfile.behavior, defaults: validDefaults(definitions, stairsProfile.defaults), evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes('stairs') ? 4 : 0) });
  } else if (stairs.present) candidates.push(rejected('stairs', 'stair properties have an incompatible value domain', evidenceFor(fingerprint, ['state-schema'])));

  const attachedProfile = GENERIC_BEHAVIOR_PROFILES.attachedSixFace;
  const sixFace = required(definitions, attachedProfile.requiredStates);
  if (sixFace.present && sixFace.valid && fingerprint.traits.includes('face-attachment')) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'support', 'tag']);
    candidates.push({ family: attachedProfile.family, behavior: attachedProfile.behavior, defaults: validDefaults(definitions, attachedProfile.defaults), evidence, contradictions: [], score: score(evidence) + (fingerprint.supportContracts.length ? 4 : 0) });
  } else if (sixFace.present && fingerprint.supportContracts.includes('six-face-attachment')) candidates.push(rejected(attachedProfile.family, 'attachment contract conflicts with the observed six-face schema', evidenceFor(fingerprint, ['state-schema', 'support'])));

  const connection = compatibleSchema(definitions, GENERIC_BEHAVIOR_PROFILES.fence.requiredStates);
  if (connection.present && connection.valid) {
    const family = connectionFamily(fingerprint);
    if (family && HORIZONTAL_VALUES.every((property) => fingerprint.predicates.includes(property))) {
      const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
      const stateDefinitions = connectionDefinitions(definitions);
      const profile = family === 'fence' ? GENERIC_BEHAVIOR_PROFILES.fence : GENERIC_BEHAVIOR_PROFILES.pane;
      candidates.push({ family, behavior: profile.behavior, defaults: validDefaults(stateDefinitions, profile.defaults), stateDefinitions, evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes(family) ? 4 : 0) });
    }
  } else if (connection.present) candidates.push(rejected('horizontal-connection', 'horizontal connection properties are not boolean', evidenceFor(fingerprint, ['state-schema'])));
  return candidates;
}

function addSchemaCandidates(candidates: BehaviorCandidate[], fingerprint: BehaviorFingerprint, definitions: readonly BlockStateDefinition[]): void {
  addTrustedSignCandidates(candidates, fingerprint, definitions);
  const profiles: readonly GenericBehaviorProfile[] = [
    GENERIC_BEHAVIOR_PROFILES.doors,
    GENERIC_BEHAVIOR_PROFILES.beds,
    GENERIC_BEHAVIOR_PROFILES.candles,
    GENERIC_BEHAVIOR_PROFILES.lanterns,
    GENERIC_BEHAVIOR_PROFILES.chains,
    GENERIC_BEHAVIOR_PROFILES.conduit,
    GENERIC_BEHAVIOR_PROFILES.buttons,
  ];
  for (const profile of profiles) {
    const classificationStates = profile.observableStates ?? profile.requiredStates;
    const contract = required(definitions, classificationStates);
    if (!contract.present) continue;
    const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
    const hasProfileEvidence = fingerprint.trustedFamilies.includes(profile.family) || resourceRelationship(fingerprint, profile.resourceTokens ?? []);
    // A complete, exact door state contract is itself distinctive evidence.
    // External content must not need a tag or a name/model token to preserve
    // a verified double-height door schema, while all other profiles remain
    // evidence-gated as before.
    // Door `powered` is a runtime property and is not present in every
    // blockstate schema (including verified external door resources). Match
    // the observable contract while preserving any additional properties that
    // the resource actually declares.
    const schemaCompatible = profile.family === 'doors' ? exactSchema(definitions, classificationStates) : contract.valid;
    const distinctiveDoorSchema = profile.family === 'doors' && schemaCompatible;
    if (schemaCompatible && (hasProfileEvidence || distinctiveDoorSchema)) {
      candidates.push({
        family: profile.family,
        behavior: profile.behavior,
        defaults: validDefaults(definitions, profile.defaults),
        evidence,
        contradictions: [],
        score: score(evidence) + (fingerprint.trustedFamilies.includes(profile.family) ? 4 : 0) + (distinctiveDoorSchema ? 4 : 0),
      });
    }
    else if (hasProfileEvidence && contract.present) candidates.push(rejected(profile.family, 'state schema conflicts with the candidate contract', evidence));
  }
  const shulker = GENERIC_BEHAVIOR_PROFILES.shulker;
  const shulkerContract = required(definitions, shulker.requiredStates);
  if (shulkerContract.valid && (fingerprint.trustedFamilies.includes(shulker.family) || resourceRelationship(fingerprint, shulker.resourceTokens ?? []))) candidates.push({ family: shulker.family, behavior: shulker.behavior, defaults: validDefaults(definitions, shulker.defaults), evidence: evidenceFor(fingerprint, ['tag', 'state-schema', 'model', 'relationship']), contradictions: [], score: score(fingerprint.evidence) + 4 });
  const doubleHeight = GENERIC_BEHAVIOR_PROFILES.doubleHeight;
  const doubleHeightContract = required(definitions, doubleHeight.requiredStates);
  if (doubleHeightContract.valid && fingerprint.trustedFamilies.includes(doubleHeight.family)) candidates.push({ family: doubleHeight.family, behavior: doubleHeight.behavior, defaults: validDefaults(definitions, doubleHeight.defaults), evidence: evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model']), contradictions: [], score: score(fingerprint.evidence) + 4 });
}

function addTrustedSignCandidates(candidates: BehaviorCandidate[], fingerprint: BehaviorFingerprint, definitions: readonly BlockStateDefinition[]): void {
  const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
  const profiles = [GENERIC_BEHAVIOR_PROFILES.standingSign, GENERIC_BEHAVIOR_PROFILES.wallSign, GENERIC_BEHAVIOR_PROFILES.hangingSign, GENERIC_BEHAVIOR_PROFILES.wallHangingSign];
  for (const profile of profiles) {
    if (!fingerprint.trustedFamilies.includes(profile.family)) continue;
    const contract = required(definitions, profile.requiredStates);
    const stateDefinitions = mergeDefinitions(definitions, profile.requiredStates);
    if (contract.valid || canFillTrustedContract(definitions, profile.requiredStates)) candidates.push({ family: profile.family, behavior: profile.behavior, defaults: validDefaults(stateDefinitions, profile.defaults), stateDefinitions, evidence, contradictions: [], score: score(evidence) + 4 });
    else candidates.push(rejected(profile.family, 'trusted sign family conflicts with the observed state schema', evidence));
  }
}

function resourceRelationship(fingerprint: BehaviorFingerprint, tokens: readonly string[]): boolean {
  const resources = `${fingerprint.modelReferences.join(' ')} ${fingerprint.modelParents.join(' ')}`.toLowerCase();
  return tokens.some((token) => resources.includes(token));
}

function hasFaceAttachmentEvidence(fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint): boolean {
  if (fingerprint.supportContracts.includes('six-face-attachment')) return true;
  // Generic floor/wall/ceiling support is intentionally insufficient. The
  // contract must identify the six-face attachment semantics, or the resource
  // graph must show the verified cross-model/facing pattern used by buds and
  // clusters.
  return fingerprint.predicates.includes('facing') && fingerprint.modelParents.some((parent) => parent.endsWith('block/cross')) && SIX_FACE_VALUES.every((value) => fingerprint.predicates.includes(`facing:${value}`));
}

function wallResourceEvidence(fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint): boolean {
  return fingerprint.trustedFamilies.includes('wall')
    || fingerprint.tags.some((tag) => /(?:^|:)walls$/.test(tag))
    || fingerprint.modelParents.some((parent) => parent.includes('template_wall_'))
    || fingerprint.modelReferences.some((model) => /(?:^|\/)(?:post|side|side_tall)$/.test(model.replace(/\.json$/, '')))
    || HORIZONTAL_VALUES.every((property) => fingerprint.predicates.includes(property)) && fingerprint.modelReferences.length > 0;
}

function wallSchema(fingerprint: Omit<BehaviorFingerprint, 'traits'> | BehaviorFingerprint): boolean {
  const definitions = fingerprint.properties;
  return compatibleSchema(definitions, GENERIC_BEHAVIOR_PROFILES.wall.requiredStates).valid;
}

function wallDefinitions(definitions: readonly BlockStateDefinition[]): readonly BlockStateDefinition[] {
  const expected = GENERIC_BEHAVIOR_PROFILES.wall.requiredStates;
  const merged = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const [name, values] of Object.entries(expected)) {
    const current = merged.get(name);
    if (!current) continue;
    merged.set(name, { ...current, values: [...new Set([...current.values, ...values])] });
  }
  return [...merged.values()];
}

function connectionFamily(fingerprint: BehaviorFingerprint): 'fence' | 'pane' | undefined {
  const trusted = new Set(fingerprint.trustedFamilies);
  if (trusted.has('fence')) return 'fence';
  if (trusted.has('pane')) return 'pane';
  if (fingerprint.tags.some((tag) => /(?:^|:)fences$/.test(tag))) return 'fence';
  if (fingerprint.tags.some((tag) => /(?:^|:)(?:panes|iron_bars)$/.test(tag))) return 'pane';
  const resources = `${fingerprint.modelReferences.join(' ')} ${fingerprint.modelParents.join(' ')}`.toLowerCase();
  if (fingerprint.behaviorEvidenceRequired) {
    if (fingerprint.modelParents.some((parent) => parent.includes('template_fence'))) return 'fence';
    if (fingerprint.modelParents.some((parent) => parent.includes('template_pane') || parent.includes('iron_bars'))) return 'pane';
    return undefined;
  }
  if (resources.includes('fence')) return 'fence';
  if (resources.includes('pane') || resources.includes('iron_bars')) return 'pane';
  return undefined;
}

function required(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): { present: boolean; valid: boolean } {
  let present = false; let valid = true;
  for (const [name, values] of Object.entries(expected)) {
    const definition = definitions.find((entry) => entry.name === name);
    if (!definition) { valid = false; continue; }
    present = true;
    if (!values.every((value) => definition.values.includes(value))) valid = false;
  }
  return { present, valid };
}

function compatibleSchema(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): { present: boolean; valid: boolean } {
  let present = false;
  const valid = Object.entries(expected).every(([name, values]) => {
    const definition = definitions.find((entry) => entry.name === name);
    if (!definition) return false;
    present = true;
    return definition.values.every((value) => values.includes(value));
  });
  return { present, valid };
}

function exactSchema(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): boolean {
  return Object.entries(expected).every(([name, values]) => {
    const definition = definitions.find((entry) => entry.name === name);
    return !!definition && definition.values.length === values.length && values.every((value) => definition.values.includes(value));
  });
}

function connectionDefinitions(definitions: readonly BlockStateDefinition[]): readonly BlockStateDefinition[] {
  const merged = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const name of HORIZONTAL_VALUES) {
    const current = merged.get(name);
    merged.set(name, current ? { ...current, values: [...BOOLEAN_VALUES], derived: true } : { name, values: [...BOOLEAN_VALUES], derived: true });
  }
  return [...merged.values()];
}

function canFillTrustedContract(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): boolean {
  return definitions.every((definition) => {
    const values = expected[definition.name];
    return !values || definition.values.every((value) => values.includes(value));
  });
}

function validDefaults(definitions: readonly BlockStateDefinition[], defaults: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(definitions.flatMap((definition) => { const value = defaults[definition.name] ?? defaultValue(definition); return value && definition.values.includes(value) ? [[definition.name, value]] : []; }));
}
function defaultValue(definition: BlockStateDefinition): string | undefined { const preferred: Readonly<Record<string, string>> = { facing: 'up', half: 'bottom', shape: 'straight', waterlogged: 'false', up: 'true' }; return preferred[definition.name] && definition.values.includes(preferred[definition.name]) ? preferred[definition.name] : definition.values[0]; }
function rejected(family: string, contradiction: string, evidence: readonly BehaviorEvidenceRecord[]): BehaviorCandidate { return { family, behavior: { kind: 'solid' }, defaults: {}, evidence, contradictions: [contradiction], score: 0 }; }
function summary(candidate: BehaviorCandidate): BehaviorCandidateSummary { return { family: candidate.family, valid: candidate.contradictions.length === 0, score: candidate.score, evidence: candidate.evidence, contradictions: candidate.contradictions }; }
function evidenceFor(fingerprint: BehaviorFingerprint, sources: readonly BehaviorEvidenceRecord['source'][]): readonly BehaviorEvidenceRecord[] { return fingerprint.evidence.filter((entry) => sources.includes(entry.source)); }
function score(evidence: readonly BehaviorEvidenceRecord[]): number { return evidence.reduce((total, entry) => total + (entry.strength === 'strong' ? 2 : entry.strength === 'partial' ? 1 : 0), 0); }
const FAMILY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  walls: ['wall', 'walls'],
  fence: ['fence', 'fences'],
  pane: ['pane', 'panes', 'bar', 'bars', 'iron_bars'],
  stairs: ['stair', 'stairs'],
  'six-face-attachment': ['bud', 'buds', 'cluster', 'clusters'],
  doors: ['door', 'doors'],
  beds: ['bed', 'beds'],
  buttons: ['button', 'buttons'],
  lanterns: ['lantern', 'lanterns'],
  chains: ['chain', 'chains'],
  'standing-sign': ['standing', 'standing_sign'],
  'wall-sign': ['wall', 'wall_sign'],
  'hanging-sign': ['hanging', 'hanging_sign'],
  'wall-hanging-sign': ['wall_hanging', 'wall-hanging'],
};

function chooseByName(candidates: readonly BehaviorCandidate[], tokens: readonly string[]): BehaviorCandidate | undefined {
  const matches = candidates.filter((candidate) => FAMILY_NAME_ALIASES[candidate.family]?.some((alias) => tokens.includes(alias)) === true);
  return matches.length === 1 ? matches[0] : undefined;
}
function mergeDefinitions(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): readonly BlockStateDefinition[] {
  const merged = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const [name, values] of Object.entries(expected)) {
    const current = merged.get(name);
    merged.set(name, current ? { ...current, values: [...new Set([...current.values, ...values])] } : { name, values: [...values] });
  }
  return [...merged.values()];
}
function toStateDefinition(property: ContentPropertyDescriptor): BlockStateDefinition { return { name: property.name, values: property.values, ...(property.derived ? { derived: true } : {}) }; }
function uniqueStrings(values: readonly (string | undefined)[]): string[] { return [...new Set(values.filter((value): value is string => !!value))]; }
function nameTokens(id: string, displayName: string): readonly string[] { return `${id} ${displayName}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
function collectStrings(value: unknown, key: string): string[] { const found: string[] = []; const visit = (node: unknown): void => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(visit); return; } for (const [childKey, child] of Object.entries(node)) { if (childKey === key && typeof child === 'string') found.push(child); visit(child); } }; visit(value); return found; }
function collectPredicateProperties(value: unknown): string[] { const found: string[] = []; const visit = (node: unknown): void => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(visit); return; } for (const [key, child] of Object.entries(node)) { if (key === 'variants' && child && typeof child === 'object' && !Array.isArray(child)) for (const variant of Object.keys(child)) for (const part of variant.split(',')) { const [property, value] = part.trim().split('=', 2); if (property) { found.push(property); if (value && SIX_FACE_VALUES.includes(value as typeof SIX_FACE_VALUES[number])) found.push(`${property}:${value}`); } } else if (key === 'when' && child && typeof child === 'object' && !Array.isArray(child)) for (const property of Object.keys(child)) found.push(property); visit(child); } }; visit(value); return uniqueStrings(found); }
function predicateProperties(predicate: { readonly kind?: string; readonly properties?: readonly { readonly property: string }[]; readonly predicates?: readonly unknown[] }): string[] { return predicate.kind === 'properties' ? (predicate.properties ?? []).map((entry) => entry.property) : (predicate.predicates ?? []).flatMap((entry) => predicateProperties(entry as { kind?: string; properties?: readonly { readonly property: string }[]; predicates?: readonly unknown[] })); }
function collectModelParents(models: readonly string[], resources?: BehaviorFingerprintResourceProvider): string[] { if (!resources) return []; const parents = new Set<string>(); const visit = (model: string, visited: Set<string>): void => { const path = modelResourcePath(model); if (!path || visited.has(path)) return; visited.add(path); const document = resources.readJson(path); if (!document || typeof document !== 'object' || Array.isArray(document)) return; const parent = (document as Record<string, unknown>)['parent']; if (typeof parent !== 'string') return; const normalized = parent.replace(/^minecraft:/, ''); parents.add(normalized); visit(parent, visited); }; models.forEach((model) => visit(model, new Set<string>())); return [...parents]; }
function modelResourcePath(model: string): string | undefined { if (model.startsWith('assets/')) return model.endsWith('.json') ? model : `${model}.json`; const separator = model.indexOf(':'); if (separator <= 0) return undefined; return `assets/${model.slice(0, separator)}/models/${model.slice(separator + 1).replace(/^models\//, '')}.json`; }
