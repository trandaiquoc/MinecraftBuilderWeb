import type { BlockBehavior, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';

export interface GenericBehaviorProfile {
  readonly family: string;
  readonly behavior: BlockBehavior;
  readonly requiredStates: Readonly<Record<string, readonly string[]>>;
  /**
   * State properties that are expected to be observable in a block's
   * resource/state schema. Runtime-only properties may remain in
   * `requiredStates` without being required for classification.
   */
  readonly observableStates?: Readonly<Record<string, readonly string[]>>;
  /** Allows a complete observable schema to stand on its own as evidence. */
  readonly distinctiveObservableSchema?: boolean;
  readonly stateDefinitions: readonly BlockStateDefinition[];
  readonly defaults: Readonly<Record<string, string>>;
  readonly resourceTokens?: readonly string[];
}

const HORIZONTAL = ['north', 'east', 'south', 'west'] as const;
const BOOLEAN = ['true', 'false'] as const;
const SIX_FACE = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
const ROTATION = Array.from({ length: 16 }, (_, index) => String(index));

const connectionStates: readonly BlockStateDefinition[] = [
  { name: 'north', values: [...BOOLEAN], derived: true },
  { name: 'east', values: [...BOOLEAN], derived: true },
  { name: 'south', values: [...BOOLEAN], derived: true },
  { name: 'west', values: [...BOOLEAN], derived: true },
  { name: 'waterlogged', values: [...BOOLEAN] },
];

const wallStates: readonly BlockStateDefinition[] = [
  { name: 'north', values: ['none', 'low', 'tall'], derived: true },
  { name: 'east', values: ['none', 'low', 'tall'], derived: true },
  { name: 'south', values: ['none', 'low', 'tall'], derived: true },
  { name: 'west', values: ['none', 'low', 'tall'], derived: true },
  { name: 'up', values: [...BOOLEAN], derived: true },
  { name: 'waterlogged', values: [...BOOLEAN] },
];

const stairsStates: readonly BlockStateDefinition[] = [
  { name: 'facing', values: [...HORIZONTAL] },
  { name: 'half', values: ['top', 'bottom'] },
  { name: 'shape', values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'], derived: true },
  { name: 'waterlogged', values: [...BOOLEAN] },
];

function connectionProfile(family: 'fence' | 'pane'): GenericBehaviorProfile {
  const group = family;
  return {
    family,
    behavior: { kind: 'horizontal-connect', family, connectionGroup: group, compatibleGroups: [group], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west'] },
    requiredStates: { north: BOOLEAN, east: BOOLEAN, south: BOOLEAN, west: BOOLEAN },
    stateDefinitions: connectionStates,
    defaults: { north: 'false', east: 'false', south: 'false', west: 'false', waterlogged: 'false' },
    resourceTokens: family === 'fence' ? ['fence'] : ['pane', 'iron_bars'],
  };
}

export const GENERIC_BEHAVIOR_PROFILES = {
  floorSupported: {
    family: 'floor-supported',
    behavior: { kind: 'floor-supported' },
    requiredStates: {},
    stateDefinitions: [],
    defaults: {},
  },
  wallMounted: {
    family: 'wall-mounted',
    behavior: { kind: 'wall-mounted', facingProperty: 'facing' },
    requiredStates: { facing: HORIZONTAL },
    stateDefinitions: [{ name: 'facing', values: [...HORIZONTAL] }],
    defaults: { facing: 'north' },
  },
  fence: connectionProfile('fence'),
  pane: connectionProfile('pane'),
  wall: {
    family: 'walls',
    behavior: { kind: 'horizontal-connect', family: 'wall', connectionGroup: 'wall', compatibleGroups: ['wall'], connectsToSolid: true, derivedProperties: ['north', 'east', 'south', 'west', 'up'] },
    requiredStates: { north: ['none', 'low', 'tall'], east: ['none', 'low', 'tall'], south: ['none', 'low', 'tall'], west: ['none', 'low', 'tall'], up: BOOLEAN },
    stateDefinitions: wallStates,
    defaults: { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true', waterlogged: 'false' },
    resourceTokens: ['wall'],
  },
  stairs: {
    family: 'stairs',
    behavior: { kind: 'stairs', derivedProperties: ['shape'] as ['shape'] },
    requiredStates: { facing: HORIZONTAL, half: ['top', 'bottom'], shape: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] },
    stateDefinitions: stairsStates,
    defaults: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' },
    resourceTokens: ['stairs'],
  },
  doors: {
    family: 'doors',
    behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true },
    observableStates: { facing: HORIZONTAL, half: ['lower', 'upper'], hinge: ['left', 'right'], open: BOOLEAN },
    distinctiveObservableSchema: true,
    requiredStates: { facing: HORIZONTAL, half: ['lower', 'upper'], hinge: ['left', 'right'], open: BOOLEAN, powered: BOOLEAN },
    stateDefinitions: [
      { name: 'facing', values: [...HORIZONTAL] }, { name: 'half', values: ['lower', 'upper'], derived: true },
      { name: 'hinge', values: ['left', 'right'] }, { name: 'open', values: [...BOOLEAN] }, { name: 'powered', values: [...BOOLEAN] },
    ],
    defaults: { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' },
    resourceTokens: ['door'],
  },
  doubleHeight: {
    family: 'double-height',
    behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true },
    requiredStates: { half: ['lower', 'upper'] },
    stateDefinitions: [{ name: 'half', values: ['lower', 'upper'], derived: true }],
    defaults: { half: 'lower' },
  },
  beds: {
    family: 'beds',
    behavior: { kind: 'paired-horizontal', partProperty: 'part', facingProperty: 'facing', firstPart: 'foot', secondPart: 'head' },
    requiredStates: { facing: HORIZONTAL, part: ['foot', 'head'], occupied: BOOLEAN },
    stateDefinitions: [{ name: 'facing', values: [...HORIZONTAL] }, { name: 'part', values: ['foot', 'head'], derived: true }, { name: 'occupied', values: [...BOOLEAN] }],
    defaults: { facing: 'north', part: 'foot', occupied: 'false' },
    resourceTokens: ['bed'],
  },
  candles: {
    family: 'candles',
    behavior: { kind: 'candle', candlesProperty: 'candles', maxCandles: 4 },
    requiredStates: { candles: ['1', '2', '3', '4'], lit: BOOLEAN, waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'candles', values: ['1', '2', '3', '4'] }, { name: 'lit', values: [...BOOLEAN] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { candles: '1', lit: 'false', waterlogged: 'false' },
    resourceTokens: ['candle'],
  },
  lanterns: {
    family: 'lanterns',
    behavior: { kind: 'lantern-placement', hangingProperty: 'hanging' },
    requiredStates: { hanging: BOOLEAN, waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'hanging', values: [...BOOLEAN] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { hanging: 'false', waterlogged: 'false' },
    resourceTokens: ['lantern'],
  },
  chains: {
    family: 'chains',
    behavior: { kind: 'vertical-chain', axisProperty: 'axis', verticalAxis: 'y' },
    requiredStates: { axis: ['x', 'y', 'z'], waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'axis', values: ['x', 'y', 'z'] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { axis: 'y', waterlogged: 'false' },
    resourceTokens: ['chain'],
  },
  buttons: {
    family: 'buttons',
    behavior: { kind: 'button', faceProperty: 'face', facingProperty: 'facing', poweredProperty: 'powered' },
    requiredStates: { face: ['floor', 'wall', 'ceiling'], facing: HORIZONTAL, powered: BOOLEAN },
    stateDefinitions: [{ name: 'face', values: ['floor', 'wall', 'ceiling'] }, { name: 'facing', values: [...HORIZONTAL] }, { name: 'powered', values: [...BOOLEAN] }],
    defaults: { face: 'floor', facing: 'north', powered: 'false' },
    resourceTokens: ['button'],
  },
  shulker: {
    family: 'shulker-boxes',
    behavior: { kind: 'six-face-placement', facingProperty: 'facing' },
    requiredStates: { facing: SIX_FACE },
    stateDefinitions: [{ name: 'facing', values: [...SIX_FACE] }],
    defaults: { facing: 'up' },
    resourceTokens: ['shulker'],
  },
  attachedSixFace: {
    family: 'six-face-attachment',
    behavior: { kind: 'attached-six-face-placement', facingProperty: 'facing' },
    requiredStates: { facing: SIX_FACE },
    stateDefinitions: [{ name: 'facing', values: [...SIX_FACE] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { facing: 'up', waterlogged: 'false' },
  },
  conduit: {
    family: 'conduits',
    behavior: { kind: 'conduit-placement', waterloggedProperty: 'waterlogged' },
    requiredStates: { waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { waterlogged: 'true' },
  },
  standingSign: {
    family: 'standing-sign',
    behavior: { kind: 'standing-sign', rotationProperty: 'rotation', wallBlockId: '' },
    requiredStates: { rotation: ROTATION, waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'rotation', values: [...ROTATION] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { rotation: '0', waterlogged: 'false' },
  },
  wallSign: {
    family: 'wall-sign',
    behavior: { kind: 'wall-sign', facingProperty: 'facing' },
    requiredStates: { facing: HORIZONTAL, waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'facing', values: [...HORIZONTAL] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { facing: 'north', waterlogged: 'false' },
  },
  hangingSign: {
    family: 'hanging-sign',
    behavior: { kind: 'hanging-sign', rotationProperty: 'rotation', attachedProperty: 'attached', wallBlockId: '' },
    requiredStates: { rotation: ROTATION, attached: BOOLEAN, waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'rotation', values: [...ROTATION] }, { name: 'attached', values: [...BOOLEAN] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { rotation: '0', attached: 'false', waterlogged: 'false' },
  },
  wallHangingSign: {
    family: 'wall-hanging-sign',
    behavior: { kind: 'wall-hanging-sign', facingProperty: 'facing' },
    requiredStates: { facing: HORIZONTAL, waterlogged: BOOLEAN },
    stateDefinitions: [{ name: 'facing', values: [...HORIZONTAL] }, { name: 'waterlogged', values: [...BOOLEAN] }],
    defaults: { facing: 'north', waterlogged: 'false' },
  },
} as const satisfies Record<string, GenericBehaviorProfile>;

export type GenericBehaviorProfileId = keyof typeof GENERIC_BEHAVIOR_PROFILES;
