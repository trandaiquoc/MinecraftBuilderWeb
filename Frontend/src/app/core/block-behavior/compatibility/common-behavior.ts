import { AssetBlockRecord, BlockBehavior, BlockStateDefinition, DefaultStateSource } from '../../blocks/catalog/block-definition.types';

export interface CommonBehaviorResourceProvider { readJson(path: string): unknown | undefined; }

export interface CommonBehaviorEvaluation {
  readonly behavior?: BlockBehavior;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly defaultStateSource: DefaultStateSource;
  readonly family?: string;
  readonly compatible: boolean;
  readonly reason?: string;
}

const horizontal = ['north', 'east', 'south', 'west'] as const;
const booleanValues = ['true', 'false'] as const;

/**
 * Evaluates only contracts that are common to the JSON/resource pipeline.
 * It deliberately does not attach special block-entity or version-verified
 * behavior; those remain owned by the 1.21.1 evidence registry.
 */
export function evaluateCommonBehavior(record: AssetBlockRecord, resources?: CommonBehaviorResourceProvider): CommonBehaviorEvaluation {
  const definitions = record.stateDefinitions;
  const defaultState = deriveResourceState(definitions);
  const blockstate = record.resources.blockstate ? resources?.readJson(record.resources.blockstate) : undefined;
  const modelEvidence = typeof record.resources.model === 'string' || hasModelReference(blockstate);

  const door = contract(definitions, {
    facing: horizontal,
    half: ['lower', 'upper'],
    hinge: ['left', 'right'],
    open: booleanValues,
    powered: booleanValues,
  });
  if (door.complete) {
    return complete(record, definitions, 'doors', { kind: 'double-height', halfProperty: 'half', requiresFloor: true }, doorState(definitions), 'compatible-common');
  }
  if (door.partial && looksLikeDoor(record.id, definitions)) return changed(record, definitions, defaultState, 'doors', 'Door state contract is missing one or more common properties.');

  const button = contract(definitions, { face: ['floor', 'wall', 'ceiling'], facing: horizontal, powered: booleanValues });
  if (button.complete) {
    return complete(record, definitions, 'buttons', { kind: 'button', faceProperty: 'face', facingProperty: 'facing', poweredProperty: 'powered' }, buttonState(definitions), 'compatible-common');
  }
  if (button.partial && looksLikeButton(record.id, definitions)) return changed(record, definitions, defaultState, 'buttons', 'Button state contract differs from the common face/facing/powered properties.');

  const connections = contract(definitions, { north: booleanValues, east: booleanValues, south: booleanValues, west: booleanValues });
  if (connections.complete && modelEvidence) {
    const family = connectionFamily(blockstate, record.resources.model);
    if (family) return complete(record, definitions, family, { kind: 'horizontal-connect', family, connectionGroup: family, compatibleGroups: [family], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west'] }, deriveResourceState(definitions), 'compatible-common');
  }
  if (connections.partial && connectionFamily(blockstate, record.resources.model)) return changed(record, definitions, defaultState, 'connections', 'Horizontal connection properties are not compatible with the common rule.');

  const wall = contract(definitions, { north: ['none', 'low', 'tall'], east: ['none', 'low', 'tall'], south: ['none', 'low', 'tall'], west: ['none', 'low', 'tall'], up: booleanValues });
  if (wall.complete && isWallEvidence(blockstate, record.resources.model)) return complete(record, definitions, 'walls', { kind: 'horizontal-connect', family: 'wall', connectionGroup: 'wall', compatibleGroups: ['wall'], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west', 'up'] }, deriveResourceState(definitions), 'compatible-common');
  if (wall.partial && isWallEvidence(blockstate, record.resources.model)) return changed(record, definitions, defaultState, 'walls', 'Wall connection properties are not compatible with the common rule.');

  const stairs = contract(definitions, { facing: horizontal, half: ['top', 'bottom'], shape: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] });
  if (stairs.complete) return complete(record, definitions, 'stairs', { kind: 'stairs', derivedProperties: ['shape'] }, { ...deriveResourceState(definitions), shape: 'straight' }, 'compatible-common');
  if (stairs.partial && looksLikeStairs(record.id, definitions)) return changed(record, definitions, defaultState, 'stairs', 'Stair state contract differs from the common facing/half/shape properties.');

  return { defaultState, stateDefinitions: definitions, defaultStateSource: Object.keys(defaultState).length ? 'resource-derived' : 'unknown', compatible: false };
}

function complete(record: AssetBlockRecord, definitions: readonly BlockStateDefinition[], family: string, behavior: BlockBehavior, defaults: Readonly<Record<string, string>>, source: DefaultStateSource): CommonBehaviorEvaluation {
  return { behavior, family, compatible: true, defaultState: mergeValidDefaults(definitions, defaults), stateDefinitions: markDerived(definitions, behavior), defaultStateSource: source };
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

function deriveResourceState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const definition of definitions) {
    const preferred = preferredValue(definition.name, definition.values);
    if (preferred !== undefined) values[definition.name] = preferred;
  }
  return values;
}

function mergeValidDefaults(definitions: readonly BlockStateDefinition[], defaults: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const fallback = deriveResourceState(definitions);
  return Object.fromEntries(definitions.flatMap((definition) => {
    const value = defaults[definition.name] ?? fallback[definition.name];
    return value !== undefined && definition.values.includes(value) ? [[definition.name, value]] : [];
  }));
}

function markDerived(definitions: readonly BlockStateDefinition[], behavior: BlockBehavior): readonly BlockStateDefinition[] {
  const names = new Set<string>(behavior.kind === 'horizontal-connect' || behavior.kind === 'stairs' ? behavior.derivedProperties : behavior.kind === 'double-height' ? [behavior.halfProperty] : []);
  return definitions.map((definition) => names.has(definition.name) ? { ...definition, derived: true } : definition);
}

function doorState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> { return mergeValidDefaults(definitions, { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }); }
function buttonState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> { return mergeValidDefaults(definitions, { face: 'floor', facing: 'north', powered: 'false' }); }
function preferredValue(name: string, values: readonly string[]): string | undefined {
  const preferences: Readonly<Record<string, string>> = { facing: 'north', half: 'bottom', part: 'foot', shape: 'straight', hinge: 'left', open: 'false', powered: 'false', waterlogged: 'false', lit: 'false', attached: 'false', hanging: 'false', axis: 'y', face: 'floor', rotation: '0', candles: '1', level: '0', up: 'true' };
  const value = preferences[name];
  return value && values.includes(value) ? value : values[0];
}

function hasAny(definitions: readonly BlockStateDefinition[], names: readonly string[]): boolean { return names.some((name) => definitions.some((definition) => definition.name === name)); }
function looksLikeDoor(id: string, definitions: readonly BlockStateDefinition[]): boolean { return id.endsWith('_door') || hasAny(definitions, ['hinge', 'half']) && hasAny(definitions, ['open', 'powered']); }
function looksLikeButton(id: string, definitions: readonly BlockStateDefinition[]): boolean { return id.endsWith('_button') || hasAny(definitions, ['face', 'powered']); }
function looksLikeStairs(id: string, definitions: readonly BlockStateDefinition[]): boolean { return id.endsWith('_stairs') || hasAny(definitions, ['shape']); }
function connectionFamily(blockstate: unknown, model: string | undefined): 'fence' | 'pane' | undefined {
  const evidence = `${JSON.stringify(blockstate ?? '')} ${model ?? ''}`.toLowerCase();
  // Resource/model evidence chooses the family; the shared connection contract
  // alone is intentionally insufficient to apply a vanilla fence rule.
  if (evidence.includes('fence')) return 'fence';
  if (evidence.includes('pane') || evidence.includes('iron_bars')) return 'pane';
  return undefined;
}
function isWallEvidence(blockstate: unknown, model: string | undefined): boolean { return `${JSON.stringify(blockstate ?? '')} ${model ?? ''}`.toLowerCase().includes('wall'); }
function hasModelReference(value: unknown): boolean { return !!value && typeof value === 'object' && JSON.stringify(value).includes('model'); }
