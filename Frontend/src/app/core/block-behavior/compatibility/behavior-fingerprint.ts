import type { AssetBlockRecord, BlockBehavior, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import type { ContentPropertyDescriptor, NormalizedContentDescriptor } from '../../content/content-introspection';

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

const SIX_FACE_VALUES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
const HORIZONTAL_VALUES = ['north', 'east', 'south', 'west'] as const;
const BOOLEAN_VALUES = ['true', 'false'] as const;

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
  const wall = compatibleSchema(definitions, { north: ['none', 'low', 'tall'], east: ['none', 'low', 'tall'], south: ['none', 'low', 'tall'], west: ['none', 'low', 'tall'], up: BOOLEAN_VALUES });
  if (wall.present && wall.valid && wallResourceEvidence(fingerprint)) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'tag']);
    const missing = HORIZONTAL_VALUES.filter((property) => !fingerprint.predicates.includes(property));
    if (missing.length) candidates.push(rejected('wall', `wall model selection omits ${missing.join(', ')}`, evidence));
    else candidates.push({ family: 'walls', behavior: { kind: 'horizontal-connect', family: 'wall', connectionGroup: 'wall', compatibleGroups: ['wall'], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west', 'up'] }, defaults: validDefaults(wallDefinitions(definitions), { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true' }), stateDefinitions: wallDefinitions(definitions), evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes('wall') ? 4 : 0) });
  } else if (wall.present) candidates.push(rejected('wall', 'wall properties have an incompatible value domain', evidenceFor(fingerprint, ['state-schema'])));

  const stairs = required(definitions, { facing: HORIZONTAL_VALUES, half: ['top', 'bottom'], shape: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] });
  if (stairs.present && stairs.valid) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'tag']);
    const missing = ['facing', 'half', 'shape'].filter((property) => !fingerprint.predicates.includes(property));
    if (missing.length) candidates.push(rejected('stairs', `stair model selection omits ${missing.join(', ')}`, evidence));
    else candidates.push({ family: 'stairs', behavior: { kind: 'stairs', derivedProperties: ['shape'] }, defaults: validDefaults(definitions, { shape: 'straight' }), evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes('stairs') ? 4 : 0) });
  } else if (stairs.present) candidates.push(rejected('stairs', 'stair properties have an incompatible value domain', evidenceFor(fingerprint, ['state-schema'])));

  const sixFace = required(definitions, { facing: SIX_FACE_VALUES });
  if (sixFace.present && sixFace.valid && fingerprint.traits.includes('face-attachment')) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'support', 'tag']);
    candidates.push({ family: 'six-face-attachment', behavior: { kind: 'attached-six-face-placement', facingProperty: 'facing' }, defaults: validDefaults(definitions, { facing: 'up', waterlogged: 'false' }), evidence, contradictions: [], score: score(evidence) + (fingerprint.supportContracts.length ? 4 : 0) });
  } else if (sixFace.present && fingerprint.supportContracts.includes('six-face-attachment')) candidates.push(rejected('six-face-attachment', 'attachment contract conflicts with the observed six-face schema', evidenceFor(fingerprint, ['state-schema', 'support'])));

  const connection = compatibleSchema(definitions, { north: BOOLEAN_VALUES, east: BOOLEAN_VALUES, south: BOOLEAN_VALUES, west: BOOLEAN_VALUES });
  if (connection.present && connection.valid) {
    const family = connectionFamily(fingerprint);
    if (family && HORIZONTAL_VALUES.every((property) => fingerprint.predicates.includes(property))) {
      const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
      const stateDefinitions = connectionDefinitions(definitions);
      candidates.push({ family, behavior: { kind: 'horizontal-connect', family, connectionGroup: family, compatibleGroups: [family], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west'] }, defaults: validDefaults(stateDefinitions, { north: 'false', east: 'false', south: 'false', west: 'false' }), stateDefinitions, evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes(family) ? 4 : 0) });
    }
  } else if (connection.present) candidates.push(rejected('horizontal-connection', 'horizontal connection properties are not boolean', evidenceFor(fingerprint, ['state-schema'])));
  return candidates;
}

function addSchemaCandidates(candidates: BehaviorCandidate[], fingerprint: BehaviorFingerprint, definitions: readonly BlockStateDefinition[]): void {
  addTrustedSignCandidates(candidates, fingerprint, definitions);
  const profiles: readonly { readonly family: string; readonly trustedFamily: string; readonly resourceTokens: readonly string[]; readonly expected: Readonly<Record<string, readonly string[]>>; readonly behavior: BlockBehavior; readonly defaults: Readonly<Record<string, string>> }[] = [
    { family: 'doors', trustedFamily: 'doors', resourceTokens: ['door'], expected: { facing: HORIZONTAL_VALUES, half: ['lower', 'upper'], hinge: ['left', 'right'], open: BOOLEAN_VALUES, powered: BOOLEAN_VALUES }, behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true, logicalObjectKind: 'door' }, defaults: { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' } },
    { family: 'beds', trustedFamily: 'beds', resourceTokens: ['bed'], expected: { facing: HORIZONTAL_VALUES, part: ['foot', 'head'], occupied: BOOLEAN_VALUES }, behavior: { kind: 'paired-horizontal', partProperty: 'part', facingProperty: 'facing', firstPart: 'foot', secondPart: 'head' }, defaults: { facing: 'north', part: 'foot', occupied: 'false' } },
    { family: 'candles', trustedFamily: 'candles', resourceTokens: ['candle'], expected: { candles: ['1', '2', '3', '4'], lit: BOOLEAN_VALUES, waterlogged: BOOLEAN_VALUES }, behavior: { kind: 'candle', candlesProperty: 'candles', maxCandles: 4 }, defaults: { candles: '1', lit: 'false', waterlogged: 'false' } },
    { family: 'lanterns', trustedFamily: 'lanterns', resourceTokens: ['lantern'], expected: { hanging: BOOLEAN_VALUES, waterlogged: BOOLEAN_VALUES }, behavior: { kind: 'lantern-placement', hangingProperty: 'hanging', chainId: 'minecraft:chain' }, defaults: { hanging: 'false', waterlogged: 'false' } },
    { family: 'chains', trustedFamily: 'chains', resourceTokens: ['chain'], expected: { axis: ['x', 'y', 'z'], waterlogged: BOOLEAN_VALUES }, behavior: { kind: 'vertical-chain', axisProperty: 'axis', verticalAxis: 'y' }, defaults: { axis: 'y', waterlogged: 'false' } },
    { family: 'conduits', trustedFamily: 'conduits', resourceTokens: ['conduit'], expected: { waterlogged: BOOLEAN_VALUES }, behavior: { kind: 'conduit-placement', waterloggedProperty: 'waterlogged' }, defaults: { waterlogged: 'true' } },
    { family: 'buttons', trustedFamily: 'buttons', resourceTokens: ['button'], expected: { face: ['floor', 'wall', 'ceiling'], facing: HORIZONTAL_VALUES, powered: BOOLEAN_VALUES }, behavior: { kind: 'button', faceProperty: 'face', facingProperty: 'facing', poweredProperty: 'powered' }, defaults: { face: 'floor', facing: 'north', powered: 'false' } },
  ];
  for (const profile of profiles) {
    const contract = required(definitions, profile.expected);
    if (!contract.present) continue;
    const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
    const hasProfileEvidence = fingerprint.trustedFamilies.includes(profile.trustedFamily) || resourceRelationship(fingerprint, profile.resourceTokens);
    if (contract.valid && hasProfileEvidence) candidates.push({ family: profile.family, behavior: profile.behavior, defaults: validDefaults(definitions, profile.defaults), evidence, contradictions: [], score: score(evidence) + (fingerprint.trustedFamilies.includes(profile.trustedFamily) ? 4 : 0) });
    else if (hasProfileEvidence && contract.present) candidates.push(rejected(profile.family, 'state schema conflicts with the candidate contract', evidence));
  }
  const shulker = required(definitions, { facing: SIX_FACE_VALUES });
  if (shulker.valid && (fingerprint.trustedFamilies.includes('shulker-boxes') || resourceRelationship(fingerprint, ['shulker']))) candidates.push({ family: 'shulker-boxes', behavior: { kind: 'six-face-placement', facingProperty: 'facing' }, defaults: validDefaults(definitions, { facing: 'up' }), evidence: evidenceFor(fingerprint, ['tag', 'state-schema', 'model', 'relationship']), contradictions: [], score: score(fingerprint.evidence) + 4 });
  const doubleHeight = required(definitions, { half: ['lower', 'upper'] });
  if (doubleHeight.valid && fingerprint.trustedFamilies.includes('double-height')) candidates.push({ family: 'double-height', behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true, logicalObjectKind: 'tall-plant' }, defaults: validDefaults(definitions, { half: 'lower' }), evidence: evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model']), contradictions: [], score: score(fingerprint.evidence) + 4 });
}

function addTrustedSignCandidates(candidates: BehaviorCandidate[], fingerprint: BehaviorFingerprint, definitions: readonly BlockStateDefinition[]): void {
  const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
  const rotation = Array.from({ length: 16 }, (_, index) => String(index));
  const profiles: readonly { readonly family: 'standing-sign' | 'wall-sign' | 'hanging-sign' | 'wall-hanging-sign'; readonly behavior: BlockBehavior; readonly expected: Readonly<Record<string, readonly string[]>>; readonly defaults: Readonly<Record<string, string>> }[] = [
    { family: 'standing-sign', behavior: { kind: 'standing-sign', rotationProperty: 'rotation', wallBlockId: '' }, expected: { rotation, waterlogged: BOOLEAN_VALUES }, defaults: { rotation: '0', waterlogged: 'false' } },
    { family: 'wall-sign', behavior: { kind: 'wall-sign', facingProperty: 'facing' }, expected: { facing: HORIZONTAL_VALUES, waterlogged: BOOLEAN_VALUES }, defaults: { facing: 'north', waterlogged: 'false' } },
    { family: 'hanging-sign', behavior: { kind: 'hanging-sign', rotationProperty: 'rotation', attachedProperty: 'attached', wallBlockId: '' }, expected: { rotation, attached: BOOLEAN_VALUES, waterlogged: BOOLEAN_VALUES }, defaults: { rotation: '0', attached: 'false', waterlogged: 'false' } },
    { family: 'wall-hanging-sign', behavior: { kind: 'wall-hanging-sign', facingProperty: 'facing' }, expected: { facing: HORIZONTAL_VALUES, waterlogged: BOOLEAN_VALUES }, defaults: { facing: 'north', waterlogged: 'false' } },
  ];
  for (const profile of profiles) {
    if (!fingerprint.trustedFamilies.includes(profile.family)) continue;
    const contract = required(definitions, profile.expected);
    const stateDefinitions = mergeDefinitions(definitions, profile.expected);
    if (contract.valid || canFillTrustedContract(definitions, profile.expected)) candidates.push({ family: profile.family, behavior: profile.behavior, defaults: validDefaults(stateDefinitions, profile.defaults), stateDefinitions, evidence, contradictions: [], score: score(evidence) + 4 });
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
  return compatibleSchema(definitions, { north: ['none', 'low', 'tall'], east: ['none', 'low', 'tall'], south: ['none', 'low', 'tall'], west: ['none', 'low', 'tall'], up: BOOLEAN_VALUES }).valid;
}

function wallDefinitions(definitions: readonly BlockStateDefinition[]): readonly BlockStateDefinition[] {
  const expected: Readonly<Record<string, readonly string[]>> = { north: ['none', 'low', 'tall'], east: ['none', 'low', 'tall'], south: ['none', 'low', 'tall'], west: ['none', 'low', 'tall'], up: BOOLEAN_VALUES };
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
