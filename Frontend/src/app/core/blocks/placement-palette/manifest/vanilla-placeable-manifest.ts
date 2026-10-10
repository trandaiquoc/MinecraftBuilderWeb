import type { PlaceableManifestEntry } from '../placeable-item.types';

const WOODS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'bamboo',
  'crimson',
  'warped',
] as const;
const COLORS = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
] as const;
const HEADS = [
  ['skeleton_skull', 'skeleton_wall_skull'],
  ['wither_skeleton_skull', 'wither_skeleton_wall_skull'],
  ['zombie_head', 'zombie_wall_head'],
  ['creeper_head', 'creeper_wall_head'],
  ['piglin_head', 'piglin_wall_head'],
  ['player_head', 'player_wall_head'],
  ['dragon_head', 'dragon_wall_head'],
] as const;
const CORAL = ['tube', 'brain', 'bubble', 'fire', 'horn'] as const;
const DOORS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'bamboo',
  'crimson',
  'warped',
] as const;
const TALL_PLANTS = [
  'sunflower',
  'lilac',
  'rose_bush',
  'peony',
  'tall_grass',
  'large_fern',
  'small_dripleaf',
] as const;

const id = (name: string): string => `minecraft:${name}`;

function buildManifest(): readonly PlaceableManifestEntry[] {
  const entries: PlaceableManifestEntry[] = [
    {
      itemId: id('water_bucket'),
      concreteBlockIds: [id('water')],
      kind: 'fluid-bucket',
      recipe: 'single',
      displayName: 'Water Bucket',
      defaultState: { level: '0' },
    },
    {
      itemId: id('lava_bucket'),
      concreteBlockIds: [id('lava')],
      kind: 'fluid-bucket',
      recipe: 'single',
      displayName: 'Lava Bucket',
      defaultState: { level: '0' },
    },
  ];
  for (const wood of WOODS) {
    entries.push({
      itemId: id(`${wood}_sign`),
      concreteBlockIds: [id(`${wood}_sign`), id(`${wood}_wall_sign`)],
      kind: 'sign',
      recipe: 'single',
      placementVariants: { standing: id(`${wood}_sign`), wall: id(`${wood}_wall_sign`) },
    });
    entries.push({
      itemId: id(`${wood}_hanging_sign`),
      concreteBlockIds: [id(`${wood}_hanging_sign`), id(`${wood}_wall_hanging_sign`)],
      kind: 'hanging-sign',
      recipe: 'single',
      placementVariants: {
        hanging: id(`${wood}_hanging_sign`),
        wallHanging: id(`${wood}_wall_hanging_sign`),
      },
    });
  }
  for (const name of ['torch', 'soul_torch', 'redstone_torch']) {
    const wall = name === 'torch' ? 'wall_torch' : name.replace('_torch', '_wall_torch');
    entries.push({
      itemId: id(name),
      concreteBlockIds: [id(name), id(wall)],
      kind: 'torch',
      recipe: 'single',
    });
  }
  for (const [standing, wall] of HEADS)
    entries.push({
      itemId: id(standing),
      concreteBlockIds: [id(standing), id(wall)],
      kind: 'head',
      recipe: 'single',
    });
  for (const color of COLORS)
    entries.push({
      itemId: id(`${color}_banner`),
      concreteBlockIds: [id(`${color}_banner`), id(`${color}_wall_banner`)],
      kind: 'banner',
      recipe: 'single',
    });
  for (const type of CORAL)
    for (const dead of ['', 'dead_'])
      entries.push({
        itemId: id(`${dead}${type}_coral_fan`),
        concreteBlockIds: [id(`${dead}${type}_coral_fan`), id(`${dead}${type}_coral_wall_fan`)],
        kind: 'coral-fan',
        recipe: 'single',
      });
  for (const color of COLORS)
    entries.push({
      itemId: id(`${color}_bed`),
      concreteBlockIds: [id(`${color}_bed`)],
      kind: 'bed',
      recipe: 'bed',
    });
  for (const door of DOORS)
    entries.push({
      itemId: id(`${door}_door`),
      concreteBlockIds: [id(`${door}_door`)],
      kind: 'door',
      recipe: 'door',
    });
  for (const plant of TALL_PLANTS)
    entries.push({
      itemId: id(plant),
      concreteBlockIds: [id(plant)],
      kind: 'tall-plant',
      recipe: 'tall-plant',
    });
  return entries;
}

export const VANILLA_PLACEABLE_MANIFEST = buildManifest();
const placeableByConcrete = new Map(
  VANILLA_PLACEABLE_MANIFEST.flatMap((entry) =>
    entry.concreteBlockIds.map((blockId) => [blockId, entry] as const),
  ),
);

export function vanillaPlaceableForConcreteId(blockId: string): PlaceableManifestEntry | undefined {
  return placeableByConcrete.get(blockId);
}
