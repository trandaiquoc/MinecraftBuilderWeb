import type { PlaceableManifestEntry } from './placeable-item.types';
import { MINECRAFT_DYE_COLORS } from '../../domain/minecraft-dye-colors';
import { MINECRAFT_WOOD_TYPES } from '../../domain/minecraft-wood-types';
import { MINECRAFT_HEAD_VARIANTS } from '../../domain/minecraft-head-variants';

const CORAL = ['tube', 'brain', 'bubble', 'fire', 'horn'] as const;
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
  for (const wood of MINECRAFT_WOOD_TYPES) {
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
  for (const [standing, wall] of MINECRAFT_HEAD_VARIANTS)
    entries.push({
      itemId: id(standing),
      concreteBlockIds: [id(standing), id(wall)],
      kind: 'head',
      recipe: 'single',
    });
  for (const color of MINECRAFT_DYE_COLORS)
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
  for (const color of MINECRAFT_DYE_COLORS)
    entries.push({
      itemId: id(`${color}_bed`),
      concreteBlockIds: [id(`${color}_bed`)],
      kind: 'bed',
      recipe: 'bed',
    });
  for (const door of MINECRAFT_WOOD_TYPES)
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
