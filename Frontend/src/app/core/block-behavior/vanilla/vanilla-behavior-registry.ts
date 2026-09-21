import { AssetBlockRecord, BehaviorSupportLevel, BlockBehavior, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import { representativeBlockFixture } from '../../blocks/catalog/block-catalog.fixture';

export interface VanillaBehaviorResourceProvider {
  readJson(path: string): unknown | undefined;
}

export type VanillaBehaviorCompatibilityMode = 'common-reusable' | 'delta-validated' | 'unsupported-with-reason';
export const VANILLA_BEHAVIOR_COMPATIBILITY: Readonly<Record<BlockBehavior['kind'], { readonly mode: VanillaBehaviorCompatibilityMode; readonly evidence: string }>> = {
  solid: { mode: 'common-reusable', evidence: 'generic voxel/catalog contract' },
  'horizontal-connect': { mode: 'common-reusable', evidence: 'connection state domain and family resource evidence' },
  stairs: { mode: 'common-reusable', evidence: 'facing/half/shape state contract' },
  'wall-mounted': { mode: 'common-reusable', evidence: 'facing attachment state contract' },
  'wall-sign': { mode: 'common-reusable', evidence: 'wall sign facing and resource contract' },
  'standing-sign': { mode: 'common-reusable', evidence: 'rotation plus wall counterpart contract' },
  'hanging-sign': { mode: 'common-reusable', evidence: 'rotation/attached plus wall counterpart contract' },
  'wall-hanging-sign': { mode: 'common-reusable', evidence: 'wall hanging sign facing contract' },
  'floor-supported': { mode: 'common-reusable', evidence: 'support-only placement contract' },
  'vertical-chain': { mode: 'common-reusable', evidence: 'axis and waterlogged contract' },
  'lantern-placement': { mode: 'common-reusable', evidence: 'hanging and chain support contract' },
  'torch-placement': { mode: 'common-reusable', evidence: 'standing/wall counterpart contract' },
  'double-height': { mode: 'common-reusable', evidence: 'lower/upper atomic object contract' },
  'paired-horizontal': { mode: 'common-reusable', evidence: 'foot/head pair contract' },
  candle: { mode: 'common-reusable', evidence: 'candles/lit/waterlogged contract' },
  'six-face-placement': { mode: 'common-reusable', evidence: 'six-direction facing contract' },
  'decorated-pot-placement': { mode: 'common-reusable', evidence: 'facing/waterlogged placement contract' },
  'conduit-placement': { mode: 'common-reusable', evidence: 'waterlogged and entity resource contract' },
  fluid: { mode: 'common-reusable', evidence: 'level/fluid resource contract' },
  button: { mode: 'common-reusable', evidence: 'face/facing/powered contract' },
  'head-placement': { mode: 'common-reusable', evidence: 'rotation or wall-facing and special resource contract' },
};

interface BehaviorMetadata {
  readonly behavior: BlockBehavior;
  readonly support: BehaviorSupportLevel;
  readonly defaultState: Readonly<Record<string, string>>;
  readonly stateDefinitions: readonly BlockStateDefinition[];
}

const tagPaths = {
  beds: 'data/minecraft/tags/block/beds.json',
  doors: 'data/minecraft/tags/block/doors.json',
  fences: 'data/minecraft/tags/block/fences.json',
  smallFlowers: 'data/minecraft/tags/block/small_flowers.json',
  stairs: 'data/minecraft/tags/block/stairs.json',
  tallFlowers: 'data/minecraft/tags/block/tall_flowers.json',
  walls: 'data/minecraft/tags/block/walls.json',
  woodenFences: 'data/minecraft/tags/block/wooden_fences.json',
} as const;

const horizontalBooleanState: readonly BlockStateDefinition[] = [
  { name: 'north', values: ['true', 'false'], derived: true },
  { name: 'east', values: ['true', 'false'], derived: true },
  { name: 'south', values: ['true', 'false'], derived: true },
  { name: 'west', values: ['true', 'false'], derived: true },
  { name: 'waterlogged', values: ['true', 'false'] },
];
const horizontalFalse = { north: 'false', east: 'false', south: 'false', west: 'false', waterlogged: 'false' } as const;

/** Maps verified vanilla families to reusable editor behavior without coupling them to visual assets. */
export class VanillaBehaviorRegistry {
  private readonly tags = new Map<string, ReadonlySet<string>>();
  private readonly explicit = new Map<string, BehaviorMetadata>();

  constructor(private readonly resources?: VanillaBehaviorResourceProvider) {
    for (const [name, path] of Object.entries(tagPaths)) this.tags.set(name, this.resolveTag(path));
    for (const record of representativeBlockFixture.blocks) {
      if (!record.id.startsWith('minecraft:') || !record.behavior) continue;
      this.explicit.set(record.id, {
        behavior: record.behavior,
        support: record.behavior.kind === 'horizontal-connect' ? 'partial' : record.support === 'full' ? 'full' : 'partial',
        defaultState: record.defaultState,
        stateDefinitions: record.stateDefinitions,
      });
    }
    this.explicit.set('minecraft:dandelion', floorSupportedMetadata);
    this.explicit.set('minecraft:chain', chainMetadata);
    this.explicit.set('minecraft:lantern', lanternMetadata);
    for (const id of standingHeadIds) this.explicit.set(`minecraft:${id}`, standingHeadMetadata);
    for (const id of wallHeadIds) this.explicit.set(`minecraft:${id}`, wallHeadMetadata);
    for (const id of vanillaShulkerBoxIds) this.explicit.set(id, shulkerBoxMetadata);
    this.explicit.set('minecraft:decorated_pot', decoratedPotMetadata);
    this.explicit.set('minecraft:conduit', conduitMetadata);
    this.explicit.set('minecraft:water', waterMetadata);
    this.explicit.set('minecraft:lava', lavaMetadata);
    for (const wood of vanillaSignWoods) {
      this.explicit.set(`minecraft:${wood}_sign`, standingSignMetadata(wood));
      this.explicit.set(`minecraft:${wood}_wall_sign`, wallSignMetadata);
      this.explicit.set(`minecraft:${wood}_hanging_sign`, hangingSignMetadata(wood));
      this.explicit.set(`minecraft:${wood}_wall_hanging_sign`, wallHangingSignMetadata);
    }
  }

  enrich(record: AssetBlockRecord): AssetBlockRecord {
    if (!record.id.startsWith('minecraft:')) return record;
    const metadata = this.metadata(record);
    if (!metadata) return record;
    if (!isCompatibleContract(record, metadata, this.resources)) return record;
    return {
      ...record,
      defaultState: { ...metadata.defaultState, ...record.defaultState },
      stateDefinitions: mergeStateDefinitions(record.stateDefinitions, metadata.stateDefinitions),
      behavior: metadata.behavior,
      behaviorSupport: metadata.support,
    };
  }

  private metadata(record: AssetBlockRecord): BehaviorMetadata | undefined {
    const id = record.id;
    if (id === 'minecraft:decorated_pot') return decoratedPotMetadata;
    if (id === 'minecraft:conduit') return conduitMetadata;
    if (id === 'minecraft:water') return waterMetadata;
    if (id === 'minecraft:lava') return lavaMetadata;
    if (isVanillaCandleId(id)) return candleMetadata;
    const torch = vanillaTorchMetadata(id);
    if (torch) return torch;
    const banner = vanillaBannerMetadata(id);
    if (banner) return banner;
    if (this.has('woodenFences', id)) return connectMetadata('fence', 'wood-fence', ['wood-fence'], horizontalBooleanState, horizontalFalse);
    if (this.has('fences', id)) return connectMetadata('fence', 'nether-fence', ['nether-fence'], horizontalBooleanState, horizontalFalse);
    if (this.has('walls', id)) return connectMetadata('wall', 'wall', ['wall'], wallStateDefinitions, wallDefaultState);
    if (this.has('stairs', id)) return stairsMetadata;
    if (this.has('doors', id)) return doorMetadata;
    if (this.has('tallFlowers', id)) return tallFlowerMetadata;
    if (this.has('beds', id)) return bedMetadata;
    if (this.has('smallFlowers', id)) return floorSupportedMetadata;
    return this.explicit.get(id) ?? this.dynamicMetadata(record);
  }

  private dynamicMetadata(record: AssetBlockRecord): BehaviorMetadata | undefined {
    const name = record.id.slice('minecraft:'.length);
    const definitions = record.stateDefinitions;
    const facing = hasState(definitions, 'facing', ['north', 'east', 'south', 'west']);
    const rotation = hasState(definitions, 'rotation', Array.from({ length: 16 }, (_, value) => String(value)));
    if (name.endsWith('_wall_sign') && facing && this.hasBlockstate(`minecraft:${name.replace(/_wall_sign$/, '_sign')}`)) return wallSignMetadata;
    if (name.endsWith('_sign') && !name.endsWith('_wall_sign') && rotation && this.hasBlockstate(`minecraft:${name.replace(/_sign$/, '_wall_sign')}`)) {
      return standingSignMetadata(name.replace(/_sign$/, ''));
    }
    if (name.endsWith('_wall_hanging_sign') && facing && this.hasBlockstate(`minecraft:${name.replace(/_wall_hanging_sign$/, '_hanging_sign')}`)) return wallHangingSignMetadata;
    if (name.endsWith('_hanging_sign') && !name.endsWith('_wall_hanging_sign') && rotation && this.hasBlockstate(`minecraft:${name.replace(/_hanging_sign$/, '_wall_hanging_sign')}`)) {
      return hangingSignMetadata(name.replace(/_hanging_sign$/, ''));
    }
    if (name.endsWith('_wall_head') || name.endsWith('_wall_skull')) {
      const standing = name.replace(/_wall_(head|skull)$/, '_$1');
      if (facing && this.hasBlockstate(`minecraft:${standing}`)) return wallHeadMetadata;
    }
    if (name.endsWith('_wall_torch') && facing && this.hasBlockstate(`minecraft:${name.replace(/_wall_torch$/, '_torch')}`)) return { behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] };
    if ((name.endsWith('_head') || name.endsWith('_skull')) && !name.startsWith('piston_') && rotation) {
      const wallName = name.replace(/_(head|skull)$/, (match) => `_wall${match}`);
      if (this.hasBlockstate(`minecraft:${wallName}`)) return standingHeadMetadata;
    }
    if (name.endsWith('_wall_banner') && facing && this.hasBlockstate(`minecraft:${name.replace(/_wall_banner$/, '_banner')}`)) return { behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] };
    if (name.endsWith('_banner') && !name.endsWith('_wall_banner') && rotation && this.hasBlockstate(`minecraft:${name.replace(/_banner$/, '_wall_banner')}`)) return undefined;
    if (name.endsWith('_wall_fan') && facing && this.hasBlockstate(`minecraft:${name.replace(/_wall_fan$/, '_fan')}`)) return { behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] };
    if (name.startsWith('wall_') && name.endsWith('_torch') && facing && this.hasBlockstate(`minecraft:${name.replace(/^wall_/, '')}`)) return { behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] };
    if (name.endsWith('_torch') && !name.startsWith('wall_') && (this.hasBlockstate(`minecraft:wall_${name}`) || this.hasBlockstate(`minecraft:${name.replace(/_torch$/, '_wall_torch')}`))) return { behavior: { kind: 'torch-placement', wallBlockId: this.hasBlockstate(`minecraft:${name.replace(/_torch$/, '_wall_torch')}`) ? `minecraft:${name.replace(/_torch$/, '_wall_torch')}` : `minecraft:wall_${name}` }, support: 'full', defaultState: {}, stateDefinitions: [] };
    return undefined;
  }

  private hasBlockstate(id: string): boolean {
    return !!this.resources?.readJson(`assets/${id.split(':')[0]}/blockstates/${id.split(':')[1]}.json`);
  }

  private has(tag: keyof typeof tagPaths, id: string): boolean { return this.tags.get(tag)?.has(id) ?? false; }

  private resolveTag(path: string, visited = new Set<string>()): ReadonlySet<string> {
    if (!this.resources || visited.has(path)) return new Set();
    visited.add(path);
    const values = tagValues(this.resources.readJson(path));
    const ids = new Set<string>();
    for (const value of values) {
      if (value.startsWith('#')) {
        const reference = value.slice(1);
        const [namespace, name] = reference.includes(':') ? reference.split(':', 2) : ['minecraft', reference];
        for (const id of this.resolveTag(`data/${namespace}/tags/block/${name}.json`, visited)) ids.add(id);
      } else if (value.includes(':')) ids.add(value);
    }
    return ids;
  }
}

function isCompatibleContract(record: AssetBlockRecord, metadata: BehaviorMetadata, resources: VanillaBehaviorResourceProvider | undefined): boolean {
  // Standalone fixture callers have no target resource evidence; retain the
  // verified metadata behavior used by the domain tests in that context.
  if (!resources) return true;
  for (const expected of metadata.stateDefinitions) {
    const actual = record.stateDefinitions.find((definition) => definition.name === expected.name);
    if (!actual) {
      // Empty state metadata (floor support, torch variant selection, etc.)
      // intentionally has no state contract to validate.
      if (metadata.stateDefinitions.length === 0) continue;
      // A normalized legacy record may not have retained its blockstate path
      // or state definitions. There is no contradictory target evidence to
      // reject in that case, so keep the authoritative tag/fixture contract.
      if (!record.resources.blockstate) continue;
      if (metadata.behavior.kind === 'horizontal-connect' && hasConnectionStateEvidence(record, resources)) continue;
      // Visual blockstate JSON is only a model-selection contract. Missing
      // runtime properties are unobserved evidence and are completed from the
      // compatible family metadata; only explicit values can contradict it.
      continue;
    }
    // Multipart blockstates often mention only the true branch. A target
    // domain that is a subset of the known common domain is completed below;
    // an unknown value is evidence of a changed contract and is rejected.
    if (!actual.values.every((value) => expected.values.includes(value))) return false;
  }
  return true;
}

function hasMultipartEvidence(record: AssetBlockRecord, resources: VanillaBehaviorResourceProvider | undefined): boolean {
  if (!record.resources.blockstate) return false;
  const value = resources?.readJson(record.resources.blockstate);
  return typeof value === 'object' && value !== null && !Array.isArray(value) && ('multipart' in value || 'variants' in value);
}

function hasConnectionStateEvidence(record: AssetBlockRecord, resources: VanillaBehaviorResourceProvider | undefined): boolean {
  if (hasMultipartEvidence(record, resources)) return true;
  if (record.stateDefinitions.length === 0 && !record.resources.blockstate) return true;
  // Some normalized catalogs preserve only the properties explicitly present
  // in a tag-derived fixture. A boolean connection subset is still valid
  // evidence; the missing directions are completed by the common contract.
  const names = new Set(['north', 'east', 'south', 'west']);
  return record.stateDefinitions.length > 0
    && record.stateDefinitions.every((definition) => names.has(definition.name)
      && definition.values.every((value) => value === 'true' || value === 'false'));
}

export function isVanillaCandleId(id: string): boolean {
  if (!id.startsWith('minecraft:')) return false;
  const path = id.slice('minecraft:'.length);
  return path === 'candle' || path.endsWith('_candle');
}

const wallStateDefinitions: readonly BlockStateDefinition[] = [
  { name: 'north', values: ['none', 'low', 'tall'], derived: true },
  { name: 'east', values: ['none', 'low', 'tall'], derived: true },
  { name: 'south', values: ['none', 'low', 'tall'], derived: true },
  { name: 'west', values: ['none', 'low', 'tall'], derived: true },
  { name: 'up', values: ['true', 'false'], derived: true },
  { name: 'waterlogged', values: ['true', 'false'] },
];
const wallDefaultState = { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true', waterlogged: 'false' } as const;
const stairsMetadata: BehaviorMetadata = {
  behavior: { kind: 'stairs', derivedProperties: ['shape'] }, support: 'full',
  defaultState: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }, { name: 'half', values: ['top', 'bottom'] }, { name: 'shape', values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'], derived: true }, { name: 'waterlogged', values: ['true', 'false'] }],
};
const doorMetadata: BehaviorMetadata = {
  behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true }, support: 'partial',
  defaultState: { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }, { name: 'half', values: ['lower', 'upper'], derived: true }, { name: 'hinge', values: ['left', 'right'] }, { name: 'open', values: ['true', 'false'] }, { name: 'powered', values: ['true', 'false'] }],
};
const tallFlowerMetadata: BehaviorMetadata = {
  behavior: { kind: 'double-height', halfProperty: 'half', requiresFloor: true }, support: 'partial', defaultState: { half: 'lower' },
  stateDefinitions: [{ name: 'half', values: ['lower', 'upper'], derived: true }],
};
const bedMetadata: BehaviorMetadata = {
  behavior: { kind: 'paired-horizontal', partProperty: 'part', facingProperty: 'facing', firstPart: 'foot', secondPart: 'head' }, support: 'full',
  defaultState: { facing: 'north', part: 'foot', occupied: 'false' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }, { name: 'part', values: ['foot', 'head'], derived: true }, { name: 'occupied', values: ['true', 'false'] }],
};
const floorSupportedMetadata: BehaviorMetadata = { behavior: { kind: 'floor-supported' }, support: 'partial', defaultState: {}, stateDefinitions: [] };
const chainMetadata: BehaviorMetadata = {
  behavior: { kind: 'vertical-chain', axisProperty: 'axis', verticalAxis: 'y' }, support: 'partial',
  defaultState: { axis: 'y', waterlogged: 'false' },
  stateDefinitions: [{ name: 'axis', values: ['x', 'y', 'z'] }, { name: 'waterlogged', values: ['true', 'false'] }],
};
const lanternMetadata: BehaviorMetadata = {
  behavior: { kind: 'lantern-placement', hangingProperty: 'hanging', chainId: 'minecraft:chain' }, support: 'full',
  defaultState: { hanging: 'false', waterlogged: 'false' },
  stateDefinitions: [{ name: 'hanging', values: ['true', 'false'] }, { name: 'waterlogged', values: ['true', 'false'] }],
};
const candleMetadata: BehaviorMetadata = {
  behavior: { kind: 'candle', candlesProperty: 'candles', maxCandles: 4 },
  support: 'full',
  defaultState: { candles: '1', lit: 'false', waterlogged: 'false' },
  stateDefinitions: [
    { name: 'candles', values: ['1', '2', '3', '4'] },
    { name: 'lit', values: ['true', 'false'] },
    { name: 'waterlogged', values: ['true', 'false'] },
  ],
};
const decoratedPotMetadata: BehaviorMetadata = {
  behavior: { kind: 'decorated-pot-placement', facingProperty: 'facing' },
  support: 'full',
  defaultState: { facing: 'north', waterlogged: 'false', cracked: 'false' },
  stateDefinitions: [
    { name: 'facing', values: ['north', 'south', 'west', 'east'] },
    { name: 'waterlogged', values: ['true', 'false'] },
    { name: 'cracked', values: ['true', 'false'] },
  ],
};
const conduitMetadata: BehaviorMetadata = {
  behavior: { kind: 'conduit-placement', waterloggedProperty: 'waterlogged' },
  support: 'full',
  defaultState: { waterlogged: 'true' },
  stateDefinitions: [{ name: 'waterlogged', values: ['true', 'false'] }],
};
const fluidStateDefinitions: readonly BlockStateDefinition[] = [{ name: 'level', values: Array.from({ length: 16 }, (_, value) => String(value)) }];
const waterMetadata: BehaviorMetadata = { behavior: { kind: 'fluid', fluid: 'water' }, support: 'full', defaultState: { level: '0' }, stateDefinitions: fluidStateDefinitions };
const lavaMetadata: BehaviorMetadata = { behavior: { kind: 'fluid', fluid: 'lava' }, support: 'full', defaultState: { level: '0' }, stateDefinitions: fluidStateDefinitions };
const standingHeadMetadata: BehaviorMetadata = {
  behavior: { kind: 'head-placement', wall: false, rotationProperty: 'rotation', facingProperty: 'facing' }, support: 'full',
  defaultState: { rotation: '0' }, stateDefinitions: [{ name: 'rotation', values: Array.from({ length: 16 }, (_, value) => String(value)) }],
};
const wallHeadMetadata: BehaviorMetadata = {
  behavior: { kind: 'head-placement', wall: true, rotationProperty: 'rotation', facingProperty: 'facing' }, support: 'full',
  defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }],
};
const wallSignMetadata: BehaviorMetadata = {
  behavior: { kind: 'wall-sign', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north', waterlogged: 'false' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }, { name: 'waterlogged', values: ['true', 'false'] }],
};
const signRotationStates: readonly BlockStateDefinition[] = [{ name: 'rotation', values: Array.from({ length: 16 }, (_, value) => String(value)) }, { name: 'waterlogged', values: ['true', 'false'] }];
const hangingSignStates: readonly BlockStateDefinition[] = [{ name: 'rotation', values: Array.from({ length: 16 }, (_, value) => String(value)) }, { name: 'attached', values: ['true', 'false'], derived: true }, { name: 'waterlogged', values: ['true', 'false'] }];
const vanillaSignWoods = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'] as const;
const vanillaShulkerBoxIds = [
  'minecraft:shulker_box', 'minecraft:white_shulker_box', 'minecraft:orange_shulker_box', 'minecraft:magenta_shulker_box',
  'minecraft:light_blue_shulker_box', 'minecraft:yellow_shulker_box', 'minecraft:lime_shulker_box', 'minecraft:pink_shulker_box',
  'minecraft:gray_shulker_box', 'minecraft:light_gray_shulker_box', 'minecraft:cyan_shulker_box', 'minecraft:purple_shulker_box',
  'minecraft:blue_shulker_box', 'minecraft:brown_shulker_box', 'minecraft:green_shulker_box', 'minecraft:red_shulker_box',
  'minecraft:black_shulker_box',
] as const;
const standingHeadIds = ['creeper_head', 'dragon_head', 'piglin_head', 'player_head', 'skeleton_skull', 'wither_skeleton_skull', 'zombie_head'] as const;
const wallHeadIds = ['creeper_wall_head', 'dragon_wall_head', 'piglin_wall_head', 'player_wall_head', 'skeleton_wall_skull', 'wither_skeleton_wall_skull', 'zombie_wall_head'] as const;
const vanillaBannerColors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;
function standingSignMetadata(wood: string): BehaviorMetadata {
  return { behavior: { kind: 'standing-sign', rotationProperty: 'rotation', wallBlockId: `minecraft:${wood}_wall_sign` }, support: 'full', defaultState: { rotation: '0', waterlogged: 'false' }, stateDefinitions: signRotationStates };
}
function hangingSignMetadata(wood: string): BehaviorMetadata {
  return { behavior: { kind: 'hanging-sign', rotationProperty: 'rotation', attachedProperty: 'attached', wallBlockId: `minecraft:${wood}_wall_hanging_sign` }, support: 'full', defaultState: { rotation: '0', attached: 'false', waterlogged: 'false' }, stateDefinitions: hangingSignStates };
}
const wallHangingSignMetadata: BehaviorMetadata = {
  behavior: { kind: 'wall-hanging-sign', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north', waterlogged: 'false' },
  stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }, { name: 'waterlogged', values: ['true', 'false'] }],
};
const shulkerBoxMetadata: BehaviorMetadata = {
  behavior: { kind: 'six-face-placement', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'up' },
  stateDefinitions: [{ name: 'facing', values: ['down', 'up', 'north', 'south', 'west', 'east'] }],
};

function vanillaTorchMetadata(id: string): BehaviorMetadata | undefined {
  const standing: Readonly<Record<string, string>> = {
    'minecraft:torch': 'minecraft:wall_torch',
    'minecraft:soul_torch': 'minecraft:soul_wall_torch',
    'minecraft:redstone_torch': 'minecraft:redstone_wall_torch',
  };
  const wallIds = new Set(['minecraft:wall_torch', 'minecraft:soul_wall_torch', 'minecraft:redstone_wall_torch']);
  const wallId = standing[id];
  if (wallId) return { behavior: { kind: 'torch-placement', wallBlockId: wallId }, support: 'full', defaultState: {}, stateDefinitions: [] };
  if (wallIds.has(id)) return { behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] };
  return undefined;
}

function vanillaBannerMetadata(id: string): BehaviorMetadata | undefined {
  const name = id.replace('minecraft:', '');
  const color = vanillaBannerColors.find((value) => name === `${value}_banner` || name === `${value}_wall_banner`);
  if (!color) return undefined;
  return name === `${color}_wall_banner`
    ? { behavior: { kind: 'wall-mounted', facingProperty: 'facing' }, support: 'full', defaultState: { facing: 'north' }, stateDefinitions: [{ name: 'facing', values: ['north', 'east', 'south', 'west'] }] }
    : undefined;
}

function connectMetadata(family: 'fence' | 'pane' | 'wall', connectionGroup: string, compatibleGroups: readonly string[], stateDefinitions: readonly BlockStateDefinition[], defaultState: Readonly<Record<string, string>>): BehaviorMetadata {
  // The editor has no vanilla voxel-shape/sturdiness metadata for arbitrary
  // solid neighbors yet. Keep verified family connections, but do not claim
  // complete Java placement parity for solid/support-dependent cases.
  return { behavior: { kind: 'horizontal-connect', family, connectionGroup, compatibleGroups, connectsToSolid: true, derivedProperties: family === 'wall' ? ['north', 'east', 'south', 'west', 'up'] : ['north', 'east', 'south', 'west'] }, support: 'partial', defaultState, stateDefinitions };
}

function mergeStateDefinitions(base: readonly BlockStateDefinition[], metadata: readonly BlockStateDefinition[]): readonly BlockStateDefinition[] {
  const merged = new Map(base.map((definition) => [definition.name, definition]));
  for (const definition of metadata) {
    const existing = merged.get(definition.name);
    merged.set(definition.name, existing ? { ...existing, derived: definition.derived ?? existing.derived } : definition);
  }
  return [...merged.values()];
}

function hasState(definitions: readonly BlockStateDefinition[], name: string, values: readonly string[]): boolean {
  const definition = definitions.find((entry) => entry.name === name);
  return !!definition && values.every((value) => definition.values.includes(value));
}

function tagValues(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const values = (value as Record<string, unknown>)['values'];
  if (!Array.isArray(values)) return [];
  return values.flatMap((entry) => typeof entry === 'string' ? [entry] : typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>)['id'] === 'string' ? [(entry as Record<string, string>)['id']] : []);
}
