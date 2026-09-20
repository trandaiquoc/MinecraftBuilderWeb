import { AssetBlockRecord, BehaviorSupportLevel, BlockBehavior, BlockStateDefinition } from '../../blocks/catalog/block-definition.types';
import { representativeBlockFixture } from '../../blocks/catalog/block-catalog.fixture';

export interface VanillaBehaviorResourceProvider {
  readJson(path: string): unknown | undefined;
}

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

/** Maps verified vanilla 1.21.1 families to editor behavior without coupling them to visual assets. */
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
    const metadata = this.metadata(record.id);
    if (!metadata) return record;
    return {
      ...record,
      defaultState: { ...metadata.defaultState, ...record.defaultState },
      stateDefinitions: mergeStateDefinitions(record.stateDefinitions, metadata.stateDefinitions),
      behavior: metadata.behavior,
      behaviorSupport: metadata.support,
    };
  }

  private metadata(id: string): BehaviorMetadata | undefined {
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
    return this.explicit.get(id);
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

function tagValues(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const values = (value as Record<string, unknown>)['values'];
  if (!Array.isArray(values)) return [];
  return values.flatMap((entry) => typeof entry === 'string' ? [entry] : typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>)['id'] === 'string' ? [(entry as Record<string, string>)['id']] : []);
}
