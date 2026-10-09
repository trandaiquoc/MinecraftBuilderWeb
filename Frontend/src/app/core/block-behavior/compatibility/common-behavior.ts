import { AssetBlockRecord, BlockBehavior, BlockStateDefinition, DefaultStateSource } from '../../blocks/catalog/block-definition.types';
import { extractBehaviorFingerprint } from './behavior-fingerprint';
import { matchVanillaBehaviorCandidates } from './behavior-classifier';
import type { BehaviorClassificationSummary } from './behavior-fingerprint';
import { GENERIC_BEHAVIOR_PROFILES } from './behavior-profiles';

export interface CommonBehaviorResourceProvider { readJson(path: string): unknown | undefined; }

export interface CommonBehaviorEvaluation {
  readonly behavior?: BlockBehavior;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly defaultStateSource: DefaultStateSource;
  readonly family?: string;
  readonly compatible: boolean;
  readonly reason?: string;
  readonly classification?: BehaviorClassificationSummary;
}

const horizontal = GENERIC_BEHAVIOR_PROFILES.wallMounted.requiredStates.facing;
const booleanValues = GENERIC_BEHAVIOR_PROFILES.fence.requiredStates['north'];
/** Shared evidence contract name for six-direction blocks attached to a face. */
export const SIX_FACE_ATTACHMENT_CONTRACT = 'six-face-attachment';

/**
 * Evaluates only contracts that are common to the JSON/resource pipeline.
 * It deliberately does not attach special block-entity or version-verified
 * behavior; those remain owned by the 1.21.1 evidence registry.
 */
export function evaluateCommonBehavior(record: AssetBlockRecord, resources?: CommonBehaviorResourceProvider): CommonBehaviorEvaluation {
  const definitions = record.stateDefinitions;
  const defaultState = Object.keys(record.defaultState).length ? record.defaultState : deriveResourceDefaultState(definitions);
  const blockstate = record.resources.blockstate ? resources?.readJson(record.resources.blockstate) : undefined;
  const modelEvidence = typeof record.resources.model === 'string' || hasModelReference(blockstate);
  const fingerprint = record.behaviorFingerprint ?? extractBehaviorFingerprint(record, resources);
  const candidate = matchVanillaBehaviorCandidates(fingerprint);
  if (candidate.behavior && candidate.family && candidate.defaults) return complete(record, candidate.stateDefinitions ?? definitions, candidate.family, candidate.behavior, candidate.defaults, 'compatible-common', candidate.classification);

  // External resources must stay on the evidence-first classifier path. The
  // recognizers below predate fingerprints and intentionally use compatibility
  // fallbacks for trusted vanilla records; allowing them to run for external
  // content would let an ID/model-name heuristic bypass an Unknown result.
  if (!canUseTrustedVanillaCompatibilityFallback(record)) {
    const reason = candidate.classification.candidates.length
      ? candidate.classification.selectionReason === 'ambiguous'
        ? 'Multiple vanilla behavior candidates remain evidence-ambiguous.'
        : 'No vanilla behavior candidate passed the evidence threshold.'
      : 'No vanilla behavior candidate was produced from the available evidence.';
    return { defaultState, stateDefinitions: definitions, defaultStateSource: Object.keys(defaultState).length ? 'resource-derived' : 'unknown', compatible: false, reason, classification: candidate.classification };
  }

  const doorProfile = GENERIC_BEHAVIOR_PROFILES.doors;
  const doorClassificationStates = doorProfile.observableStates ?? doorProfile.requiredStates;
  const door = contract(definitions, doorClassificationStates);
  if (door.complete && hasFamilyEvidence(record, doorProfile.family)) {
    return complete(record, definitions, doorProfile.family, doorProfile.behavior, doorState(definitions), 'compatible-common');
  }
  if (door.partial && hasFamilyEvidence(record, doorProfile.family) && canFillCommon(record, definitions, doorClassificationStates) && hasDoorStateEvidence(definitions)) {
    return complete(record, definitions, doorProfile.family, doorProfile.behavior, doorState(definitions), 'compatible-common');
  }
  if (door.partial && hasDoorStateEvidence(definitions)) return changed(record, definitions, defaultState, doorProfile.family, 'Door state contract is missing one or more common properties.');

  const doubleHeightProfile = GENERIC_BEHAVIOR_PROFILES.doubleHeight;
  const doubleHeight = contract(definitions, doubleHeightProfile.requiredStates);
  if (doubleHeight.complete && !door.partial && hasFamilyEvidence(record, doubleHeightProfile.family) && !hasDoorStateEvidence(definitions)) return complete(record, definitions, doubleHeightProfile.family, doubleHeightProfile.behavior, doubleHeightProfile.defaults, 'compatible-common');

  const bedProfile = GENERIC_BEHAVIOR_PROFILES.beds;
  const bed = contract(definitions, bedProfile.requiredStates);
  if (bed.complete && hasFamilyEvidence(record, bedProfile.family)) return complete(record, definitions, bedProfile.family, bedProfile.behavior, bedProfile.defaults, 'compatible-common');
  if (bed.partial && hasFamilyEvidence(record, bedProfile.family) && canFillCommon(record, definitions, bedProfile.requiredStates)) return complete(record, definitions, bedProfile.family, bedProfile.behavior, bedProfile.defaults, 'compatible-common');

  // Standard sign tags prove the common Java state contract even when a mod
  // ships model-only blockstates. The renderer and placement layers consume
  // this normalized state instead of relying on resource JSON properties.
  const signProfiles = [GENERIC_BEHAVIOR_PROFILES.standingSign, GENERIC_BEHAVIOR_PROFILES.wallSign, GENERIC_BEHAVIOR_PROFILES.hangingSign, GENERIC_BEHAVIOR_PROFILES.wallHangingSign];
  for (const profile of signProfiles) {
    if (record.trustedBehaviorFamilies?.includes(profile.family) === true) return complete(record, signDefinitions(definitions, profile.requiredStates), profile.family, profile.behavior, profile.defaults, 'compatible-common');
  }

  const candleProfile = GENERIC_BEHAVIOR_PROFILES.candles;
  const candle = contract(definitions, candleProfile.requiredStates);
  // The state contract is the evidence. Do not classify a mod block by an
  // ID suffix (which would also misclassify candle-cake variants).
  if (candle.complete && hasFamilyEvidence(record, candleProfile.family)) return complete(record, definitions, candleProfile.family, candleProfile.behavior, candleProfile.defaults, 'compatible-common');

  const fluid = contract(definitions, { level: Array.from({ length: 16 }, (_, value) => String(value)) });
  if (fluid.complete && (record.id === 'minecraft:water' || record.id === 'minecraft:lava')) return complete(record, definitions, 'fluids', { kind: 'fluid', fluid: record.id.endsWith('lava') ? 'lava' : 'water' }, { level: '0' }, 'compatible-common');

  const shulkerProfile = GENERIC_BEHAVIOR_PROFILES.shulker;
  const sixFace = contract(definitions, shulkerProfile.requiredStates);
  if (sixFace.complete && hasFamilyEvidence(record, shulkerProfile.family) && hasResourceToken(record, 'shulker')) return complete(record, definitions, shulkerProfile.family, shulkerProfile.behavior, shulkerProfile.defaults, 'compatible-common');

  const conduitProfile = GENERIC_BEHAVIOR_PROFILES.conduit;
  const conduit = contract(definitions, conduitProfile.requiredStates);
  if (conduit.complete && record.id === 'minecraft:conduit') return complete(record, definitions, conduitProfile.family, conduitProfile.behavior, conduitProfile.defaults, 'compatible-common');

  const lanternProfile = GENERIC_BEHAVIOR_PROFILES.lanterns;
  const lantern = contract(definitions, lanternProfile.requiredStates);
  if (lantern.complete && hasFamilyEvidence(record, lanternProfile.family) && hasResourceToken(record, 'lantern')) return complete(record, definitions, lanternProfile.family, lanternProfile.behavior, lanternProfile.defaults, 'compatible-common');

  const chainProfile = GENERIC_BEHAVIOR_PROFILES.chains;
  const chain = contract(definitions, chainProfile.requiredStates);
  if (chain.complete && hasFamilyEvidence(record, chainProfile.family) && hasResourceToken(record, 'chain')) return complete(record, definitions, chainProfile.family, chainProfile.behavior, chainProfile.defaults, 'compatible-common');

  const buttonProfile = GENERIC_BEHAVIOR_PROFILES.buttons;
  const button = contract(definitions, buttonProfile.requiredStates);
  if (button.complete && hasFamilyEvidence(record, buttonProfile.family) && hasButtonStateEvidence(definitions)) {
    return complete(record, definitions, buttonProfile.family, buttonProfile.behavior, buttonState(definitions), 'compatible-common');
  }
  if (button.partial && hasFamilyEvidence(record, buttonProfile.family) && hasButtonStateEvidence(definitions)) return changed(record, definitions, defaultState, buttonProfile.family, 'Button state contract differs from the common face/facing/powered properties.');

  const family = connectionFamily(record, blockstate, record.resources.model);
  const connections = contract(definitions, { north: booleanValues, east: booleanValues, south: booleanValues, west: booleanValues });
  if (connections.partial && family) {
    const connectionValuesCompatible = definitions.filter((definition) => horizontal.includes(definition.name as typeof horizontal[number])).every((definition) => definition.values.every((value) => booleanValues.includes(value as typeof booleanValues[number])));
    if (!connectionValuesCompatible) return changed(record, definitions, defaultState, 'connections', 'Horizontal connection properties are not compatible with the common rule.');
    const connectionDefinitions = expandBooleanConnections(definitions);
    const connectionContract = contract(connectionDefinitions, { north: booleanValues, east: booleanValues, south: booleanValues, west: booleanValues });
    const profile = family === 'fence' ? GENERIC_BEHAVIOR_PROFILES.fence : GENERIC_BEHAVIOR_PROFILES.pane;
    if (connectionContract.complete && modelEvidence) return complete(record, connectionDefinitions, family, profile.behavior, { ...deriveResourceDefaultState(connectionDefinitions), ...profile.defaults }, 'compatible-common');
    return changed(record, definitions, defaultState, 'connections', 'Horizontal connection properties are not compatible with the common rule.');
  }

  const wallProfile = GENERIC_BEHAVIOR_PROFILES.wall;
  const wall = contract(definitions, wallProfile.requiredStates);
  if (wall.complete && isWallEvidence(blockstate, record.resources.model, record)) return complete(record, definitions, wallProfile.family, wallProfile.behavior, wallState(definitions, record.defaultState), 'compatible-common');
  if (wall.partial && isWallEvidence(blockstate, record.resources.model, record)) return changed(record, definitions, defaultState, 'walls', 'Wall connection properties are not compatible with the common rule.');

  const stairsProfile = GENERIC_BEHAVIOR_PROFILES.stairs;
  const stairs = contract(definitions, stairsProfile.requiredStates);
  if (stairs.complete && isStairsEvidence(blockstate, record.resources.model, record)) return complete(record, definitions, stairsProfile.family, stairsProfile.behavior, { ...deriveResourceDefaultState(definitions), ...stairsProfile.defaults }, 'compatible-common');
  if (stairs.partial && isStairsEvidence(blockstate, record.resources.model, record)) return changed(record, definitions, defaultState, 'stairs', 'Stair state contract differs from the common facing/half/shape properties.');

  return { defaultState, stateDefinitions: definitions, defaultStateSource: record.defaultStateSource === 'resource-render-fallback' || usesArbitraryValue(definitions) ? 'resource-render-fallback' : Object.keys(defaultState).length ? 'resource-derived' : 'unknown', compatible: false };
}

function canUseTrustedVanillaCompatibilityFallback(record: AssetBlockRecord): boolean {
  return record.behaviorEvidenceRequired !== true
    && (record.id.startsWith('minecraft:') || record.sourceId === 'vanilla');
}

function complete(record: AssetBlockRecord, definitions: readonly BlockStateDefinition[], family: string, behavior: BlockBehavior, defaults: Readonly<Record<string, string>>, source: DefaultStateSource, classification?: BehaviorClassificationSummary): CommonBehaviorEvaluation {
  return { behavior, family, compatible: true, defaultState: mergeValidDefaults(definitions, defaults), stateDefinitions: markDerived(definitions, behavior), defaultStateSource: source, ...(classification ? { classification } : {}) };
}

function changed(record: AssetBlockRecord, definitions: readonly BlockStateDefinition[], defaults: Readonly<Record<string, string>>, family: string, reason: string): CommonBehaviorEvaluation {
  return { family, compatible: false, defaultState: defaults, stateDefinitions: definitions, defaultStateSource: Object.keys(defaults).length ? 'resource-derived' : 'unknown', reason };
}

function contract(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): { complete: boolean; partial: boolean } {
  let present = 0; let complete = true;
  for (const [name, values] of Object.entries(expected)) {
    const definition = definitions.find((entry) => entry.name === name);
    if (!definition) { complete = false; continue; }
    present += 1;
    if (!values.every((value) => definition.values.includes(value))) complete = false;
  }
  return { complete, partial: present > 0 };
}

function canFillCommon(record: AssetBlockRecord, definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): boolean {
  if (!record.itemEvidence && record.behaviorEvidenceRequired !== true && !(record.trustedBehaviorFamilies?.length)) return false;
  return definitions.every((definition) => expected[definition.name] === undefined || definition.values.every((value) => expected[definition.name].includes(value)));
}

export function deriveResourceDefaultState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const definition of definitions) {
    const preferred = preferredValue(definition.name, definition.values);
    if (preferred !== undefined) values[definition.name] = preferred;
  }
  return values;
}

function mergeValidDefaults(definitions: readonly BlockStateDefinition[], defaults: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const fallback = deriveResourceDefaultState(definitions);
  return Object.fromEntries(definitions.flatMap((definition) => {
    const value = defaults[definition.name] ?? fallback[definition.name];
    return value !== undefined && definition.values.includes(value) ? [[definition.name, value]] : [];
  }));
}

function expandBooleanConnections(definitions: readonly BlockStateDefinition[]): readonly BlockStateDefinition[] {
  const merged = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const name of horizontal) {
    const current = merged.get(name);
    merged.set(name, current
      ? { ...current, values: [...booleanValues], derived: true }
      : { name, values: [...booleanValues], derived: true });
  }
  return [...merged.values()];
}

function markDerived(definitions: readonly BlockStateDefinition[], behavior: BlockBehavior): readonly BlockStateDefinition[] {
  const names = new Set<string>(behavior.kind === 'horizontal-connect' || behavior.kind === 'stairs' ? behavior.derivedProperties : behavior.kind === 'double-height' ? [behavior.halfProperty] : []);
  return definitions.map((definition) => names.has(definition.name) ? { ...definition, derived: true } : definition);
}

function doorState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> { return mergeValidDefaults(definitions, GENERIC_BEHAVIOR_PROFILES.doors.defaults); }
function buttonState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> { return mergeValidDefaults(definitions, GENERIC_BEHAVIOR_PROFILES.buttons.defaults); }
function wallState(definitions: readonly BlockStateDefinition[], source: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return mergeValidDefaults(definitions, { ...GENERIC_BEHAVIOR_PROFILES.wall.defaults, ...source });
}
function preferredValue(name: string, values: readonly string[]): string | undefined {
  const preferences: Readonly<Record<string, string>> = { facing: 'north', half: 'bottom', part: 'foot', type: 'bottom', shape: 'straight', hinge: 'left', open: 'false', powered: 'false', waterlogged: 'false', lit: 'false', attached: 'false', hanging: 'false', axis: 'y', face: 'floor', rotation: '0', candles: '1', level: '0', honey_level: '0', in_wall: 'false', up: 'true' };
  const value = preferences[name];
  return value && values.includes(value) ? value : values[0];
}

function signDefinitions(definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): readonly BlockStateDefinition[] {
  const merged = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const [name, values] of Object.entries(expected)) {
    const current = merged.get(name);
    merged.set(name, current ? { ...current, values: [...new Set([...current.values, ...values])] } : { name, values: [...values] });
  }
  return [...merged.values()];
}

function hasFamilyEvidence(record: AssetBlockRecord, family: string): boolean {
  if (!record.behaviorEvidenceRequired) return true;
  return family === 'any' && !!record.itemEvidence || record.trustedBehaviorFamilies?.includes(family) === true;
}
function usesArbitraryValue(definitions: readonly BlockStateDefinition[]): boolean {
  const semantic = new Set(['facing', 'half', 'part', 'type', 'shape', 'hinge', 'open', 'powered', 'waterlogged', 'lit', 'attached', 'hanging', 'axis', 'face', 'rotation', 'candles', 'level', 'honey_level', 'in_wall', 'up', 'age']);
  return definitions.some((definition) => definition.values.length > 0 && !semantic.has(definition.name));
}

function hasDoorStateEvidence(definitions: readonly BlockStateDefinition[]): boolean {
  return hasAny(definitions, ['hinge', 'half']) && hasAny(definitions, ['open']);
}
function hasButtonStateEvidence(definitions: readonly BlockStateDefinition[]): boolean {
  return hasAny(definitions, ['face', 'powered']);
}
function hasAny(definitions: readonly BlockStateDefinition[], names: readonly string[]): boolean { return names.some((name) => definitions.some((definition) => definition.name === name)); }
function hasResourceToken(record: AssetBlockRecord, token: string): boolean {
  return `${record.resources.model ?? ''} ${record.resources.blockstate ?? ''}`.toLowerCase().includes(token);
}
function connectionFamily(record: AssetBlockRecord, blockstate: unknown, model: string | undefined): 'fence' | 'pane' | undefined {
  const evidence = `${JSON.stringify(blockstate ?? '')} ${model ?? ''}`.toLowerCase();
  // Resource/model evidence chooses the family; the shared connection contract
  // alone is intentionally insufficient to apply a vanilla fence rule.
  const trusted = new Set(record.trustedBehaviorFamilies ?? []);
  if (trusted.has('fence') || (!record.behaviorEvidenceRequired && evidence.includes('fence'))) return 'fence';
  if (trusted.has('pane') || (!record.behaviorEvidenceRequired && (evidence.includes('pane') || evidence.includes('iron_bars')))) return 'pane';
  return undefined;
}
function isWallEvidence(blockstate: unknown, model: string | undefined, record?: AssetBlockRecord): boolean {
  if (record?.trustedBehaviorFamilies?.includes('wall') === true) return true;
  const resourceText = `${JSON.stringify(blockstate ?? '')} ${model ?? ''}`.toLowerCase();
  if (record?.behaviorEvidenceRequired !== true) return resourceText.includes('wall');
  // External sources are fail-closed unless both the complete wall state
  // schema and a blockstate that actually drives the wall parts are present.
  // This deliberately avoids treating a mod name or a single model as proof.
  return hasStructuredPropertyEvidence(blockstate, ['north', 'east', 'south', 'west', 'up']);
}

function isStairsEvidence(blockstate: unknown, model: string | undefined, record: AssetBlockRecord): boolean {
  if (hasFamilyEvidence(record, 'stairs')) return true;
  if (record.behaviorEvidenceRequired !== true) return `${JSON.stringify(blockstate ?? '')} ${model ?? ''}`.toLowerCase().includes('stairs') || hasAny(record.stateDefinitions, ['shape']);
  // The state contract alone is not enough: require model selection by the
  // stair shape/facing properties as well.
  return hasStructuredPropertyEvidence(blockstate, ['facing', 'half', 'shape']);
}

function hasStructuredPropertyEvidence(value: unknown, properties: readonly string[]): boolean {
  if (!value || typeof value !== 'object') return false;
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    for (const [key, child] of Object.entries(node)) {
      const normalizedKey = key.toLowerCase();
      for (const property of properties) {
        if (normalizedKey === property || normalizedKey.includes(`${property}=`)) seen.add(property);
      }
      if (normalizedKey === 'variants' && child && typeof child === 'object') {
        for (const variantKey of Object.keys(child)) for (const property of properties) if (variantKey.split(',').some((part) => part.trim().split('=')[0] === property)) seen.add(property);
      }
      visit(child);
    }
  };
  visit(value);
  return properties.every((property) => seen.has(property)) && hasModelReference(value);
}
function hasModelReference(value: unknown): boolean { return !!value && typeof value === 'object' && JSON.stringify(value).includes('model'); }
