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
  const defaultState = deriveResourceDefaultState(definitions);
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
  if (door.partial && canFillCommon(record, definitions, { facing: horizontal, half: ['lower', 'upper'], hinge: ['left', 'right'], open: booleanValues, powered: booleanValues }) && looksLikeDoor(record.id, definitions)) {
    return complete(record, definitions, 'doors', { kind: 'double-height', halfProperty: 'half', requiresFloor: true }, doorState(definitions), 'compatible-common');
  }
  if (door.partial && looksLikeDoor(record.id, definitions)) return changed(record, definitions, defaultState, 'doors', 'Door state contract is missing one or more common properties.');

  const doubleHeight = contract(definitions, { half: ['lower', 'upper'] });
  if (doubleHeight.complete && !looksLikeDoor(record.id, definitions)) return complete(record, definitions, 'double-height', { kind: 'double-height', halfProperty: 'half', requiresFloor: true }, { half: 'lower' }, 'compatible-common');

  const bed = contract(definitions, { facing: horizontal, part: ['foot', 'head'], occupied: booleanValues });
  if (bed.complete) return complete(record, definitions, 'beds', { kind: 'paired-horizontal', partProperty: 'part', facingProperty: 'facing', firstPart: 'foot', secondPart: 'head' }, { facing: 'north', part: 'foot', occupied: 'false' }, 'compatible-common');
  if (bed.partial && canFillCommon(record, definitions, { facing: horizontal, part: ['foot', 'head'], occupied: booleanValues }) && looksLikeBed(record)) return complete(record, definitions, 'beds', { kind: 'paired-horizontal', partProperty: 'part', facingProperty: 'facing', firstPart: 'foot', secondPart: 'head' }, { facing: 'north', part: 'foot', occupied: 'false' }, 'compatible-common');

  const candle = contract(definitions, { candles: ['1', '2', '3', '4'], lit: booleanValues, waterlogged: booleanValues });
  // The state contract is the evidence. Do not classify a mod block by an
  // ID suffix (which would also misclassify candle-cake variants).
  if (candle.complete) return complete(record, definitions, 'candles', { kind: 'candle', candlesProperty: 'candles', maxCandles: 4 }, { candles: '1', lit: 'false', waterlogged: 'false' }, 'compatible-common');

  const fluid = contract(definitions, { level: Array.from({ length: 16 }, (_, value) => String(value)) });
  if (fluid.complete && (record.id === 'minecraft:water' || record.id === 'minecraft:lava')) return complete(record, definitions, 'fluids', { kind: 'fluid', fluid: record.id.endsWith('lava') ? 'lava' : 'water' }, { level: '0' }, 'compatible-common');

  const sixFace = contract(definitions, { facing: ['down', 'up', 'north', 'south', 'west', 'east'] });
  if (sixFace.complete && looksLikeShulker(record)) return complete(record, definitions, 'shulker-boxes', { kind: 'six-face-placement', facingProperty: 'facing' }, { facing: 'up' }, 'compatible-common');

  const conduit = contract(definitions, { waterlogged: booleanValues });
  if (conduit.complete && record.id === 'minecraft:conduit') return complete(record, definitions, 'conduits', { kind: 'conduit-placement', waterloggedProperty: 'waterlogged' }, { waterlogged: 'true' }, 'compatible-common');

  const lantern = contract(definitions, { hanging: booleanValues, waterlogged: booleanValues });
  if (lantern.complete && looksLikeLantern(record)) return complete(record, definitions, 'lanterns', { kind: 'lantern-placement', hangingProperty: 'hanging', chainId: 'minecraft:chain' }, { hanging: 'false', waterlogged: 'false' }, 'compatible-common');

  const chain = contract(definitions, { axis: ['x', 'y', 'z'], waterlogged: booleanValues });
  if (chain.complete && looksLikeChain(record)) return complete(record, definitions, 'chains', { kind: 'vertical-chain', axisProperty: 'axis', verticalAxis: 'y' }, { axis: 'y', waterlogged: 'false' }, 'compatible-common');

  const button = contract(definitions, { face: ['floor', 'wall', 'ceiling'], facing: horizontal, powered: booleanValues });
  if (button.complete) {
    return complete(record, definitions, 'buttons', { kind: 'button', faceProperty: 'face', facingProperty: 'facing', poweredProperty: 'powered' }, buttonState(definitions), 'compatible-common');
  }
  if (button.partial && looksLikeButton(record.id, definitions)) return changed(record, definitions, defaultState, 'buttons', 'Button state contract differs from the common face/facing/powered properties.');

  const family = connectionFamily(blockstate, record.resources.model);
  const connections = contract(definitions, { north: booleanValues, east: booleanValues, south: booleanValues, west: booleanValues });
  if (connections.partial && family) {
    const connectionValuesCompatible = definitions.filter((definition) => horizontal.includes(definition.name as typeof horizontal[number])).every((definition) => definition.values.every((value) => booleanValues.includes(value as typeof booleanValues[number])));
    if (!connectionValuesCompatible) return changed(record, definitions, defaultState, 'connections', 'Horizontal connection properties are not compatible with the common rule.');
    const connectionDefinitions = expandBooleanConnections(definitions);
    const connectionContract = contract(connectionDefinitions, { north: booleanValues, east: booleanValues, south: booleanValues, west: booleanValues });
    if (connectionContract.complete && modelEvidence) return complete(record, connectionDefinitions, family, { kind: 'horizontal-connect', family, connectionGroup: family, compatibleGroups: [family], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west'] }, { ...deriveResourceDefaultState(connectionDefinitions), north: 'false', east: 'false', south: 'false', west: 'false' }, 'compatible-common');
    return changed(record, definitions, defaultState, 'connections', 'Horizontal connection properties are not compatible with the common rule.');
  }

  const wall = contract(definitions, { north: ['none', 'low', 'tall'], east: ['none', 'low', 'tall'], south: ['none', 'low', 'tall'], west: ['none', 'low', 'tall'], up: booleanValues });
  if (wall.complete && isWallEvidence(blockstate, record.resources.model)) return complete(record, definitions, 'walls', { kind: 'horizontal-connect', family: 'wall', connectionGroup: 'wall', compatibleGroups: ['wall'], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west', 'up'] }, deriveResourceDefaultState(definitions), 'compatible-common');
  if (wall.partial && isWallEvidence(blockstate, record.resources.model)) return changed(record, definitions, defaultState, 'walls', 'Wall connection properties are not compatible with the common rule.');

  const stairs = contract(definitions, { facing: horizontal, half: ['top', 'bottom'], shape: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] });
  if (stairs.complete) return complete(record, definitions, 'stairs', { kind: 'stairs', derivedProperties: ['shape'] }, { ...deriveResourceDefaultState(definitions), shape: 'straight' }, 'compatible-common');
  if (stairs.partial && looksLikeStairs(record.id, definitions)) return changed(record, definitions, defaultState, 'stairs', 'Stair state contract differs from the common facing/half/shape properties.');

  return { defaultState, stateDefinitions: definitions, defaultStateSource: Object.keys(defaultState).length ? (usesArbitraryValue(definitions) ? 'resource-render-fallback' : 'resource-derived') : 'unknown', compatible: false };
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

function canFillCommon(record: AssetBlockRecord, definitions: readonly BlockStateDefinition[], expected: Readonly<Record<string, readonly string[]>>): boolean {
  if (!record.id.startsWith('minecraft:') && !record.itemEvidence) return false;
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

function doorState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> { return mergeValidDefaults(definitions, { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' }); }
function buttonState(definitions: readonly BlockStateDefinition[]): Readonly<Record<string, string>> { return mergeValidDefaults(definitions, { face: 'floor', facing: 'north', powered: 'false' }); }
function preferredValue(name: string, values: readonly string[]): string | undefined {
  const preferences: Readonly<Record<string, string>> = { facing: 'north', half: 'bottom', part: 'foot', type: 'bottom', shape: 'straight', hinge: 'left', open: 'false', powered: 'false', waterlogged: 'false', lit: 'false', attached: 'false', hanging: 'false', axis: 'y', face: 'floor', rotation: '0', candles: '1', level: '0', honey_level: '0', in_wall: 'false', up: 'true' };
  const value = preferences[name];
  return value && values.includes(value) ? value : values[0];
}
function usesArbitraryValue(definitions: readonly BlockStateDefinition[]): boolean {
  const semantic = new Set(['facing', 'half', 'part', 'type', 'shape', 'hinge', 'open', 'powered', 'waterlogged', 'lit', 'attached', 'hanging', 'axis', 'face', 'rotation', 'candles', 'level', 'honey_level', 'in_wall', 'up', 'age']);
  return definitions.some((definition) => definition.values.length > 0 && !semantic.has(definition.name));
}

function hasAny(definitions: readonly BlockStateDefinition[], names: readonly string[]): boolean { return names.some((name) => definitions.some((definition) => definition.name === name)); }
function looksLikeDoor(id: string, definitions: readonly BlockStateDefinition[]): boolean { return id.endsWith('_door') || hasAny(definitions, ['hinge', 'half']) && hasAny(definitions, ['open', 'powered']); }
function looksLikeBed(record: AssetBlockRecord): boolean { return record.id.endsWith('_bed') || `${record.resources.model ?? ''} ${record.resources.blockstate ?? ''}`.includes('bed'); }
function looksLikeButton(id: string, definitions: readonly BlockStateDefinition[]): boolean { return id.endsWith('_button') || hasAny(definitions, ['face', 'powered']); }
function looksLikeStairs(id: string, definitions: readonly BlockStateDefinition[]): boolean { return id.endsWith('_stairs') || hasAny(definitions, ['shape']); }
function looksLikeShulker(record: AssetBlockRecord): boolean { return record.id.endsWith('_shulker_box') || `${record.resources.model ?? ''} ${record.resources.blockstate ?? ''}`.includes('shulker'); }
function looksLikeLantern(record: AssetBlockRecord): boolean { return record.id.endsWith('lantern') || `${record.resources.model ?? ''} ${record.resources.blockstate ?? ''}`.includes('lantern'); }
function looksLikeChain(record: AssetBlockRecord): boolean { return record.id.endsWith('chain') || `${record.resources.model ?? ''} ${record.resources.blockstate ?? ''}`.includes('chain'); }
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
