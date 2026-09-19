import { BlockDefinition, BlockSupportLevel, VisualSupportLevel } from './block-definition.types';
import { BlockState, PlacedBlock, VoxelCoordinate } from '../domain/project.types';
import { PlacementContext } from '../editor/placement';
import { normalizeSearchText } from './block-catalog';

export type PlaceablePlacementKind =
  | 'direct' | 'sign' | 'hanging-sign' | 'torch' | 'head' | 'banner' | 'coral-fan'
  | 'bed' | 'door' | 'tall-plant' | 'fluid-bucket';

export type PreviewRecipe = 'single' | 'bed' | 'door' | 'tall-plant';

export interface PlaceableItemDefinition {
  readonly itemId: string;
  readonly displayBlockId: string;
  readonly namespace: string;
  readonly displayName: string;
  readonly modName?: string;
  readonly defaultState: BlockState;
  readonly concreteBlockIds: readonly string[];
  readonly placementKind: PlaceablePlacementKind;
  readonly previewRecipe: PreviewRecipe;
  readonly support: BlockSupportLevel;
  readonly visualSupport: VisualSupportLevel;
  readonly previewBlocks: readonly PlacedBlock[];
}

interface ManifestEntry { readonly itemId: string; readonly concreteBlockIds: readonly string[]; readonly kind: PlaceablePlacementKind; readonly recipe: PreviewRecipe; readonly displayName?: string; readonly defaultState?: BlockState; }

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'] as const;
const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;
const HEADS = [
  ['skeleton_skull', 'skeleton_wall_skull'], ['wither_skeleton_skull', 'wither_skeleton_wall_skull'],
  ['zombie_head', 'zombie_wall_head'], ['creeper_head', 'creeper_wall_head'], ['piglin_head', 'piglin_wall_head'],
  ['player_head', 'player_wall_head'], ['dragon_head', 'dragon_wall_head'],
] as const;
const CORAL = ['tube', 'brain', 'bubble', 'fire', 'horn'] as const;
const DOORS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'] as const;
const TALL_PLANTS = ['sunflower', 'lilac', 'rose_bush', 'peony', 'tall_grass', 'large_fern', 'small_dripleaf'] as const;

const TECHNICAL_IDS = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:end_portal', 'minecraft:end_gateway', 'minecraft:nether_portal',
  'minecraft:piston_head', 'minecraft:moving_piston', 'minecraft:bubble_column', 'minecraft:fire', 'minecraft:soul_fire', 'minecraft:frosted_ice',
  'minecraft:command_block', 'minecraft:chain_command_block', 'minecraft:repeating_command_block', 'minecraft:jigsaw', 'minecraft:structure_block',
  'minecraft:structure_void', 'minecraft:barrier', 'minecraft:light',
]);

function id(name: string): string { return `minecraft:${name}`; }
function manifest(): readonly ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  entries.push({ itemId: id('water_bucket'), concreteBlockIds: [id('water')], kind: 'fluid-bucket', recipe: 'single', displayName: 'Water Bucket', defaultState: { level: '0' } });
  entries.push({ itemId: id('lava_bucket'), concreteBlockIds: [id('lava')], kind: 'fluid-bucket', recipe: 'single', displayName: 'Lava Bucket', defaultState: { level: '0' } });
  for (const wood of WOODS) {
    entries.push({ itemId: id(`${wood}_sign`), concreteBlockIds: [id(`${wood}_sign`), id(`${wood}_wall_sign`)], kind: 'sign', recipe: 'single' });
    entries.push({ itemId: id(`${wood}_hanging_sign`), concreteBlockIds: [id(`${wood}_hanging_sign`), id(`${wood}_wall_hanging_sign`)], kind: 'hanging-sign', recipe: 'single' });
  }
  for (const name of ['torch', 'soul_torch', 'redstone_torch']) { const wall = name === 'torch' ? 'wall_torch' : name.replace('_torch', '_wall_torch'); entries.push({ itemId: id(name), concreteBlockIds: [id(name), id(wall)], kind: 'torch', recipe: 'single' }); }
  for (const [standing, wall] of HEADS) entries.push({ itemId: id(standing), concreteBlockIds: [id(standing), id(wall)], kind: 'head', recipe: 'single' });
  for (const color of COLORS) entries.push({ itemId: id(`${color}_banner`), concreteBlockIds: [id(`${color}_banner`), id(`${color}_wall_banner`)], kind: 'banner', recipe: 'single' });
  for (const type of CORAL) for (const dead of ['', 'dead_']) entries.push({ itemId: id(`${dead}${type}_coral_fan`), concreteBlockIds: [id(`${dead}${type}_coral_fan`), id(`${dead}${type}_coral_wall_fan`)], kind: 'coral-fan', recipe: 'single' });
  for (const color of COLORS) entries.push({ itemId: id(`${color}_bed`), concreteBlockIds: [id(`${color}_bed`)], kind: 'bed', recipe: 'bed' });
  for (const door of DOORS) entries.push({ itemId: id(`${door}_door`), concreteBlockIds: [id(`${door}_door`)], kind: 'door', recipe: 'door' });
  for (const plant of TALL_PLANTS) entries.push({ itemId: id(plant), concreteBlockIds: [id(plant)], kind: 'tall-plant', recipe: 'tall-plant' });
  return entries;
}

export const VANILLA_PLACEABLE_MANIFEST = manifest();
const MANIFEST_BY_CONCRETE = new Map(VANILLA_PLACEABLE_MANIFEST.flatMap((entry) => entry.concreteBlockIds.map((blockId) => [blockId, entry] as const)));

export function isNormalBuildingPaletteEligible(block: Pick<BlockDefinition, 'id' | 'namespace'>): boolean {
  return block.namespace !== 'minecraft' || !TECHNICAL_IDS.has(block.id);
}

export function isNormalBuildingExportEligible(blockId: string): boolean { return !TECHNICAL_IDS.has(blockId); }
export function technicalBuildingIds(): readonly string[] { return [...TECHNICAL_IDS]; }

export function buildPlaceableItems(definitions: readonly BlockDefinition[]): readonly PlaceableItemDefinition[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const covered = new Set<string>();
  const result: PlaceableItemDefinition[] = [];
  for (const entry of VANILLA_PLACEABLE_MANIFEST) {
    const display = byId.get(entry.itemId) ?? byId.get(entry.concreteBlockIds[0]);
    if (!display || !isNormalBuildingPaletteEligible(display)) continue;
    for (const blockId of entry.concreteBlockIds) covered.add(blockId);
    result.push(toItem(display, entry, entry.concreteBlockIds));
  }
  for (const definition of definitions) {
    if (!isNormalBuildingPaletteEligible(definition) || covered.has(definition.id) || MANIFEST_BY_CONCRETE.has(definition.id)) continue;
    result.push(toItem(definition, { itemId: definition.id, concreteBlockIds: [definition.id], kind: 'direct', recipe: 'single' }, [definition.id]));
  }
  return result.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function toItem(definition: BlockDefinition, entry: ManifestEntry, concreteBlockIds: readonly string[]): PlaceableItemDefinition {
  const defaultState = { ...definition.defaultState, ...(entry.defaultState ?? {}) };
  const previewBlocks = previewFor(entry, definition, defaultState);
  return { itemId: entry.itemId, displayBlockId: definition.id, namespace: definition.namespace, displayName: entry.displayName ?? definition.displayName, modName: definition.modName, defaultState, concreteBlockIds, placementKind: entry.kind, previewRecipe: entry.recipe, support: definition.support, visualSupport: definition.visualSupport, previewBlocks };
}

function previewFor(entry: ManifestEntry, definition: BlockDefinition, itemState: BlockState): readonly PlacedBlock[] {
  const state = { ...itemState };
  const make = (position: VoxelCoordinate, overrides: BlockState = {}, concreteId = definition.id): PlacedBlock => ({ kind: 'resolved', id: concreteId, namespace: concreteId.split(':')[0] ?? 'minecraft', position, state: { ...state, ...overrides } });
  if (entry.recipe === 'bed') return [make({ x: 0, y: 0, z: 0 }, { part: 'foot', facing: 'south', occupied: 'false' }), make({ x: 0, y: 0, z: 1 }, { part: 'head', facing: 'south', occupied: 'false' })];
  if (entry.recipe === 'door') return [make({ x: 0, y: 0, z: 0 }, { half: 'lower' }), make({ x: 0, y: 1, z: 0 }, { half: 'upper' })];
  if (entry.recipe === 'tall-plant') return [make({ x: 0, y: 0, z: 0 }, { half: 'lower' }), make({ x: 0, y: 1, z: 0 }, { half: 'upper' })];
  return [make({ x: 0, y: 0, z: 0 })];
}

export function canonicalPlaceableItemId(concreteId: string): string { return MANIFEST_BY_CONCRETE.get(concreteId)?.itemId ?? concreteId; }

export function resolveConcreteBlockId(item: PlaceableItemDefinition, context?: PlacementContext): string {
  const normal = item.concreteBlockIds.find((value) => !isWallVariant(value)) ?? item.displayBlockId;
  const side = !!context?.faceNormal && Math.abs(context.faceNormal.x) + Math.abs(context.faceNormal.z) > 0 && context.faceNormal.y === 0;
  if (!side) return normal;
  const wall = item.concreteBlockIds.find(isWallVariant);
  return wall ?? normal;
}

function isWallVariant(value: string): boolean {
  const name = value.split(':').at(-1) ?? value;
  return name.startsWith('wall_') || name.includes('_wall_') || name.endsWith('_wall_sign') || name.endsWith('_wall_hanging_sign') || name.endsWith('_wall_banner') || name.endsWith('_wall_fan');
}
function isHorizontal(value: string | undefined): value is 'north' | 'east' | 'south' | 'west' { return value === 'north' || value === 'east' || value === 'south' || value === 'west'; }

export function resolveItemBlock(item: PlaceableItemDefinition, state: BlockState, position: VoxelCoordinate, context?: PlacementContext, definition?: (id: string) => BlockDefinition | undefined): PlacedBlock {
  const blockId = resolveConcreteBlockId(item, context);
  const target = definition?.(blockId);
  const source = { ...state, ...context?.stateOverride };
  const finalState: Record<string, string> = {};
  if (target) {
    for (const entry of target.stateDefinitions) {
      const value = source[entry.name] ?? target.defaultState[entry.name];
      if (typeof value === 'string') finalState[entry.name] = value;
    }
  } else {
    Object.assign(finalState, source);
  }
  return { kind: 'resolved', id: blockId, namespace: item.namespace, position: { ...position }, state: finalState, blockEntityData: undefined };
}

/** Builds final, internally consistent preview blocks for a logical item state. */
export function previewBlocksForItem(item: PlaceableItemDefinition, state: BlockState = item.defaultState): readonly PlacedBlock[] {
  const source = item.previewBlocks;
  if (item.previewRecipe === 'bed') {
    const facing = isHorizontal(state['facing']) ? state['facing'] : 'south';
    const foot = source.find((block) => block.state['part'] === 'foot') ?? source[0];
    const head = source.find((block) => block.state['part'] === 'head') ?? source[1];
    if (!foot || !head) return source;
    const headPosition = add(foot.position, directionOffset(facing));
    return [
      { ...foot, position: { ...foot.position }, state: { ...foot.state, ...state, facing, part: 'foot' } },
      { ...head, position: headPosition, state: { ...head.state, ...state, facing, part: 'head' } },
    ];
  }
  if (item.previewRecipe === 'door' || item.previewRecipe === 'tall-plant') {
    return source.map((block) => ({ ...block, state: { ...block.state, ...state, ...(block.state['half'] ? { half: block.state['half'] } : {}) } }));
  }
  return source.map((block) => ({ ...block, state: { ...block.state, ...state } }));
}

export function placementItemSearch(items: readonly PlaceableItemDefinition[], query: string): readonly PlaceableItemDefinition[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return items;
  return items.filter((item) => [item.displayName, item.itemId, item.namespace, item.modName ?? ''].map(normalizeSearchText).join('\u0000').includes(normalized));
}

function directionOffset(direction: string): VoxelCoordinate { return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 }; }
function add(position: VoxelCoordinate, offset: VoxelCoordinate): VoxelCoordinate { return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z }; }
