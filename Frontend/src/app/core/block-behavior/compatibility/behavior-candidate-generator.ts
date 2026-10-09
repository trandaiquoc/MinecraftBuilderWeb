import type { BlockBehavior, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import type { BehaviorEvidenceRecord, BehaviorFingerprint } from './behavior-fingerprint';
import { GENERIC_BEHAVIOR_PROFILES, type GenericBehaviorProfile } from './behavior-profiles';
import { hasWallResourceEvidence } from './behavior-traits';

const HORIZONTAL_VALUES = GENERIC_BEHAVIOR_PROFILES.wallMounted.requiredStates.facing;
const BOOLEAN_VALUES = GENERIC_BEHAVIOR_PROFILES.fence.requiredStates['north'];

export interface BehaviorCandidate {
  readonly family: string;
  readonly behavior: BlockBehavior;
  readonly defaults: Readonly<Record<string, string>>;
  readonly evidence: readonly BehaviorEvidenceRecord[];
  readonly contradictions: readonly string[];
  readonly scoreAdjustment: number;
  readonly scoreEvidence?: readonly BehaviorEvidenceRecord[];
  readonly stateDefinitions?: readonly BlockStateDefinition[];
}

export function generateBehaviorCandidates(fingerprint: BehaviorFingerprint): readonly BehaviorCandidate[] {
  const definitions = fingerprint.properties;
  const candidates: BehaviorCandidate[] = [];
  addSchemaCandidates(candidates, fingerprint, definitions);
  const wallProfile = GENERIC_BEHAVIOR_PROFILES.wall;
  const wall = compatibleSchema(definitions, wallProfile.requiredStates);
  if (wall.present && wall.valid && hasWallResourceEvidence(fingerprint)) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'tag']);
    const missing = HORIZONTAL_VALUES.filter((property) => !fingerprint.predicates.includes(property));
    if (missing.length) candidates.push(rejected('wall', `wall model selection omits ${missing.join(', ')}`, evidence));
    else candidates.push({ family: wallProfile.family, behavior: wallProfile.behavior, defaults: validDefaults(wallDefinitions(definitions), wallProfile.defaults), stateDefinitions: wallDefinitions(definitions), evidence, contradictions: [], scoreAdjustment: fingerprint.trustedFamilies.includes('wall') ? 4 : 0 });
  } else if (wall.present) candidates.push(rejected('wall', 'wall properties have an incompatible value domain', evidenceFor(fingerprint, ['state-schema'])));

  const stairsProfile = GENERIC_BEHAVIOR_PROFILES.stairs;
  const stairs = required(definitions, stairsProfile.requiredStates);
  if (stairs.present && stairs.valid) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'tag']);
    const missing = ['facing', 'half', 'shape'].filter((property) => !fingerprint.predicates.includes(property));
    if (missing.length) candidates.push(rejected('stairs', `stair model selection omits ${missing.join(', ')}`, evidence));
    else candidates.push({ family: stairsProfile.family, behavior: stairsProfile.behavior, defaults: validDefaults(definitions, stairsProfile.defaults), evidence, contradictions: [], scoreAdjustment: fingerprint.trustedFamilies.includes('stairs') ? 4 : 0 });
  } else if (stairs.present) candidates.push(rejected('stairs', 'stair properties have an incompatible value domain', evidenceFor(fingerprint, ['state-schema'])));

  const attachedProfile = GENERIC_BEHAVIOR_PROFILES.attachedSixFace;
  const sixFace = required(definitions, attachedProfile.requiredStates);
  if (sixFace.present && sixFace.valid && fingerprint.traits.includes('face-attachment')) {
    const evidence = evidenceFor(fingerprint, ['state-schema', 'blockstate', 'model', 'support', 'tag']);
    candidates.push({ family: attachedProfile.family, behavior: attachedProfile.behavior, defaults: validDefaults(definitions, attachedProfile.defaults), evidence, contradictions: [], scoreAdjustment: fingerprint.supportContracts.length ? 4 : 0 });
  } else if (sixFace.present && fingerprint.supportContracts.includes('six-face-attachment')) candidates.push(rejected(attachedProfile.family, 'attachment contract conflicts with the observed six-face schema', evidenceFor(fingerprint, ['state-schema', 'support'])));

  const connection = compatibleSchema(definitions, GENERIC_BEHAVIOR_PROFILES.fence.requiredStates);
  if (connection.present && connection.valid) {
    const family = connectionFamily(fingerprint);
    if (family && HORIZONTAL_VALUES.every((property) => fingerprint.predicates.includes(property))) {
      const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
      const stateDefinitions = connectionDefinitions(definitions);
      const profile = family === 'fence' ? GENERIC_BEHAVIOR_PROFILES.fence : GENERIC_BEHAVIOR_PROFILES.pane;
      candidates.push({ family, behavior: profile.behavior, defaults: validDefaults(stateDefinitions, profile.defaults), stateDefinitions, evidence, contradictions: [], scoreAdjustment: fingerprint.trustedFamilies.includes(family) ? 4 : 0 });
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
    // Profiles may explicitly declare a complete observable schema as
    // distinctive evidence. Runtime-only properties can remain in the
    // canonical profile without being required by static resources.
    const schemaCompatible = profile.distinctiveObservableSchema ? exactSchema(definitions, classificationStates) : contract.valid;
    const distinctiveSchema = profile.distinctiveObservableSchema === true && schemaCompatible;
    if (schemaCompatible && (hasProfileEvidence || distinctiveSchema)) {
      candidates.push({
        family: profile.family,
        behavior: profile.behavior,
        defaults: validDefaults(definitions, profile.defaults),
        evidence,
        contradictions: [],
        scoreAdjustment: (fingerprint.trustedFamilies.includes(profile.family) ? 4 : 0) + (distinctiveSchema ? 4 : 0),
      });
    }
    else if (hasProfileEvidence && contract.present) candidates.push(rejected(profile.family, 'state schema conflicts with the candidate contract', evidence));
  }
  const shulker = GENERIC_BEHAVIOR_PROFILES.shulker;
  const shulkerContract = required(definitions, shulker.requiredStates);
  if (shulkerContract.valid && (fingerprint.trustedFamilies.includes(shulker.family) || resourceRelationship(fingerprint, shulker.resourceTokens ?? []))) candidates.push({ family: shulker.family, behavior: shulker.behavior, defaults: validDefaults(definitions, shulker.defaults), evidence: evidenceFor(fingerprint, ['tag', 'state-schema', 'model', 'relationship']), scoreEvidence: fingerprint.evidence, contradictions: [], scoreAdjustment: 4 });
  const doubleHeight = GENERIC_BEHAVIOR_PROFILES.doubleHeight;
  const doubleHeightContract = required(definitions, doubleHeight.requiredStates);
  if (doubleHeightContract.valid && fingerprint.trustedFamilies.includes(doubleHeight.family)) candidates.push({ family: doubleHeight.family, behavior: doubleHeight.behavior, defaults: validDefaults(definitions, doubleHeight.defaults), evidence: evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model']), scoreEvidence: fingerprint.evidence, contradictions: [], scoreAdjustment: 4 });
}

function addTrustedSignCandidates(candidates: BehaviorCandidate[], fingerprint: BehaviorFingerprint, definitions: readonly BlockStateDefinition[]): void {
  const evidence = evidenceFor(fingerprint, ['tag', 'state-schema', 'blockstate', 'model', 'relationship']);
  const profiles = [GENERIC_BEHAVIOR_PROFILES.standingSign, GENERIC_BEHAVIOR_PROFILES.wallSign, GENERIC_BEHAVIOR_PROFILES.hangingSign, GENERIC_BEHAVIOR_PROFILES.wallHangingSign];
  for (const profile of profiles) {
    if (!fingerprint.trustedFamilies.includes(profile.family)) continue;
    const contract = required(definitions, profile.requiredStates);
    const stateDefinitions = mergeDefinitions(definitions, profile.requiredStates);
    if (contract.valid || canFillTrustedContract(definitions, profile.requiredStates)) candidates.push({ family: profile.family, behavior: profile.behavior, defaults: validDefaults(stateDefinitions, profile.defaults), stateDefinitions, evidence, contradictions: [], scoreAdjustment: 4 });
    else candidates.push(rejected(profile.family, 'trusted sign family conflicts with the observed state schema', evidence));
  }
}

function resourceRelationship(fingerprint: BehaviorFingerprint, tokens: readonly string[]): boolean {
  const resources = `${fingerprint.modelReferences.join(' ')} ${fingerprint.modelParents.join(' ')}`.toLowerCase();
  return tokens.some((token) => resources.includes(token));
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
function rejected(family: string, contradiction: string, evidence: readonly BehaviorEvidenceRecord[]): BehaviorCandidate { return { family, behavior: { kind: 'solid' }, defaults: {}, evidence, contradictions: [contradiction], scoreAdjustment: 0 }; }
function evidenceFor(fingerprint: BehaviorFingerprint, sources: readonly BehaviorEvidenceRecord['source'][]): readonly BehaviorEvidenceRecord[] { return fingerprint.evidence.filter((entry) => sources.includes(entry.source)); }
function mergeDefinitions(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): readonly BlockStateDefinition[] {
  const merged = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const [name, values] of Object.entries(expected)) {
    const current = merged.get(name);
    merged.set(name, current ? { ...current, values: [...new Set([...current.values, ...values])] } : { name, values: [...values] });
  }
  return [...merged.values()];
}
