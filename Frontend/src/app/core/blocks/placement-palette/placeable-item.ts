import type { BlockDefinition, BlockPlacementVariants, BlockSupportLevel, CatalogItemEvidence, VisualSupportLevel } from '../catalog/block-definition.types';
import { addBlockCapability } from '../capabilities/block-capability-resolver';
import { BlockCapabilityProfile } from '../capabilities/block-capability.types';
import { BlockState, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { PlacementContext } from '../../editor/placement/placement';
import { normalizeSearchText } from '../catalog/block-catalog';
import { isInternalBlockId, isTechnicalBlockId, isDecorationEntityId, vanillaTechnicalBlockIds } from '../../content/content-classifier';

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
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly defaultState: BlockState;
  /** State used only for browser/thumbnail representation; placement keeps defaultState. */
  readonly previewState?: BlockState;
  readonly concreteBlockIds: readonly string[];
  readonly placementVariants?: BlockPlacementVariants;
  readonly placementKind: PlaceablePlacementKind;
  readonly previewRecipe: PreviewRecipe;
  readonly support: BlockSupportLevel;
  readonly visualSupport: VisualSupportLevel;
  /** Runtime item-backed profile; block definitions remain independent of item catalogs. */
  readonly capabilities: BlockCapabilityProfile;
  readonly previewBlocks: readonly PlacedBlock[];
}

// Search metadata is runtime-only and deliberately kept outside the catalog
// contract. A WeakMap lets imported items stay plain data while avoiding
// repeated Unicode normalization on every keystroke.
const placementSearchIndex = new WeakMap<object, string>();

export interface PlaceableItemEvidence extends Partial<Pick<CatalogItemEvidence, 'referencedModels' | 'referencedResources' | 'explicitBlockPlacement' | 'sourceFormat' | 'sourceId' | 'sourceName'>> { readonly itemId: string; readonly placeable?: boolean; readonly contentKind?: string; }

interface ManifestEntry { readonly itemId: string; readonly concreteBlockIds: readonly string[]; readonly kind: PlaceablePlacementKind; readonly recipe: PreviewRecipe; readonly displayName?: string; readonly defaultState?: BlockState; readonly placementVariants?: BlockPlacementVariants; }

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

function id(name: string): string { return `minecraft:${name}`; }
function manifest(): readonly ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  entries.push({ itemId: id('water_bucket'), concreteBlockIds: [id('water')], kind: 'fluid-bucket', recipe: 'single', displayName: 'Water Bucket', defaultState: { level: '0' } });
  entries.push({ itemId: id('lava_bucket'), concreteBlockIds: [id('lava')], kind: 'fluid-bucket', recipe: 'single', displayName: 'Lava Bucket', defaultState: { level: '0' } });
  for (const wood of WOODS) {
    entries.push({ itemId: id(`${wood}_sign`), concreteBlockIds: [id(`${wood}_sign`), id(`${wood}_wall_sign`)], kind: 'sign', recipe: 'single', placementVariants: { standing: id(`${wood}_sign`), wall: id(`${wood}_wall_sign`) } });
    entries.push({ itemId: id(`${wood}_hanging_sign`), concreteBlockIds: [id(`${wood}_hanging_sign`), id(`${wood}_wall_hanging_sign`)], kind: 'hanging-sign', recipe: 'single', placementVariants: { hanging: id(`${wood}_hanging_sign`), wallHanging: id(`${wood}_wall_hanging_sign`) } });
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
  return !isTechnicalBlockId(block.id) && !isInternalBlockId(block.id) && !isDecorationEntityId(block.id);
}

/** A palette policy: can the user choose this ID as an independent item? */
export function isPaletteEligible(block: Pick<BlockDefinition, 'id' | 'namespace'>): boolean { return isNormalBuildingPaletteEligible(block); }

/** A world policy: valid concrete internal variants remain serializable. */
export function isWorldBlockSerializable(blockId: string): boolean { return !isTechnicalBlockId(blockId) && !isDecorationEntityId(blockId); }

/** @deprecated Use isWorldBlockSerializable; retained for callers during the policy split. */
export function isNormalBuildingExportEligible(blockId: string): boolean { return isWorldBlockSerializable(blockId); }
export function technicalBuildingIds(): readonly string[] { return vanillaTechnicalBlockIds(); }

export function buildPlaceableItems(definitions: readonly BlockDefinition[], targetItems: readonly PlaceableItemEvidence[] = [], targetItemsAvailable?: boolean): readonly PlaceableItemDefinition[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const targetItemIds = new Set(targetItems.filter((item) => isTargetItemPlaceable(item, byId)).map((item) => item.itemId));
  const hasTargetItemEvidence = targetItemsAvailable ?? (targetItems.length > 0 || definitions.some((definition) => definition.itemEvidence !== undefined));
  // Hand-authored/legacy callers may only have same-ID evidence attached to a
  // BlockDefinition. Modern sources pass the independent targetItems catalog.
  if (targetItemsAvailable === undefined && targetItems.length === 0) {
    for (const definition of definitions) if (definition.itemEvidence?.placeable === true) targetItemIds.add(definition.itemEvidence.itemId);
  }
  const covered = new Set<string>();
  const result: PlaceableItemDefinition[] = [];
  for (const entry of VANILLA_PLACEABLE_MANIFEST) {
    const concreteBlockIds = entry.concreteBlockIds.filter((blockId) => byId.has(blockId));
    const display = byId.get(entry.itemId) ?? byId.get(concreteBlockIds[0]);
    if (!display || !concreteBlockIds.length || !isNormalBuildingPaletteEligible(display)) continue;
    if (hasTargetItemEvidence && !targetItemIds.has(entry.itemId)) continue;
    for (const blockId of concreteBlockIds) covered.add(blockId);
    result.push(toItem(display, entry, concreteBlockIds));
  }
  for (const entry of discoverLogicalEntries(definitions, byId)) {
    if (covered.has(entry.itemId) || !entry.concreteBlockIds.every((blockId) => byId.has(blockId))) continue;
    const display = byId.get(entry.itemId);
    if (!display || !isNormalBuildingPaletteEligible(display)) continue;
    if (hasTargetItemEvidence && !targetItemIds.has(entry.itemId)) continue;
    for (const blockId of entry.concreteBlockIds) covered.add(blockId);
    result.push(toItem(display, entry, entry.concreteBlockIds));
  }
  for (const definition of definitions) {
    if (!isNormalBuildingPaletteEligible(definition) || covered.has(definition.id) || MANIFEST_BY_CONCRETE.has(definition.id)) continue;
    // A block catalog is intentionally broader than the player-facing item
    // palette. Once the target resource set exposes item definitions, only
    // blocks backed by that evidence may become direct palette entries.
    if (hasTargetItemEvidence && !targetItemIds.has(definition.id)) continue;
    result.push(toItem(definition, { itemId: definition.id, concreteBlockIds: [definition.id], kind: 'direct', recipe: 'single' }, [definition.id]));
  }
  const sorted = result.sort((left, right) => left.displayName.localeCompare(right.displayName));
  for (const item of sorted) placementSearchIndex.set(item, placementSearchText(item));
  return sorted;
}

function isTargetItemPlaceable(item: PlaceableItemEvidence, byId: ReadonlyMap<string, BlockDefinition>): boolean {
  if (item.placeable === false) return false;
  const direct = byId.get(item.itemId);
  if (direct && isNormalBuildingPaletteEligible(direct)) return true;
  const manifestEntry = VANILLA_PLACEABLE_MANIFEST.find((entry) => entry.itemId === item.itemId);
  if (manifestEntry) return manifestEntry.concreteBlockIds.some((blockId) => {
    const concrete = byId.get(blockId);
    return concrete !== undefined && isNormalBuildingPaletteEligible(byId.get(entryDisplayId(manifestEntry, byId, blockId)) ?? concrete);
  });
  const explicit = item.explicitBlockPlacement?.blockId;
  return explicit !== undefined && byId.has(explicit) && isNormalBuildingPaletteEligible(byId.get(explicit)!);
}

function entryDisplayId(entry: ManifestEntry, byId: ReadonlyMap<string, BlockDefinition>, fallback: string): string {
  return byId.has(entry.itemId) ? entry.itemId : entry.concreteBlockIds.find((blockId) => byId.has(blockId)) ?? fallback;
}

function discoverLogicalEntries(definitions: readonly BlockDefinition[], byId: ReadonlyMap<string, BlockDefinition>): readonly ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    if (seen.has(definition.id)) continue;
    const name = definition.id.slice(definition.namespace.length + 1);
    const variants = definition.placementVariants;
    if (variants?.standing || variants?.hanging) {
      const ids = [...new Set(Object.values(variants).filter((value): value is string => !!value))];
      if (ids.every((id) => byId.has(id))) {
        const itemId = variants.standing ?? variants.hanging!;
        const kind: PlaceablePlacementKind = variants.hanging ? 'hanging-sign' : 'sign';
        if (!seen.has(itemId)) { ids.forEach((id) => seen.add(id)); entries.push({ itemId, concreteBlockIds: ids, kind, recipe: 'single', placementVariants: variants }); }
      }
      continue;
    }
    if (definition.namespace === 'minecraft') {
      const pair = vanillaLogicalPair(name);
      if (pair) {
        const standing = `${definition.namespace}:${pair.standing}`; const wall = `${definition.namespace}:${pair.wall}`;
        if (byId.has(standing) && byId.has(wall) && !seen.has(standing)) {
          seen.add(standing); seen.add(wall); entries.push({ itemId: standing, concreteBlockIds: [standing, wall], kind: pair.kind, recipe: 'single', placementVariants: pair.variants });
        }
        continue;
      }
    }
    const behavior = definition.behavior?.kind;
    if (behavior === 'paired-horizontal') entries.push({ itemId: definition.id, concreteBlockIds: [definition.id], kind: 'bed', recipe: 'bed' });
    else if (behavior === 'double-height') entries.push({ itemId: definition.id, concreteBlockIds: [definition.id], kind: name.endsWith('_door') ? 'door' : 'tall-plant', recipe: name.endsWith('_door') ? 'door' : 'tall-plant' });
  }
  return entries;
}

function vanillaLogicalPair(name: string): { readonly standing: string; readonly wall: string; readonly kind: PlaceablePlacementKind; readonly variants: BlockPlacementVariants } | undefined {
  if (name.endsWith('_wall_sign')) { const standing = name.replace(/_wall_sign$/, '_sign'); return { standing, wall: name, kind: 'sign', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  if (name.endsWith('_wall_hanging_sign')) { const standing = name.replace(/_wall_hanging_sign$/, '_hanging_sign'); return { standing, wall: name, kind: 'hanging-sign', variants: { hanging: `minecraft:${standing}`, wallHanging: `minecraft:${name}` } }; }
  if (name.endsWith('_wall_banner')) { const standing = name.replace(/_wall_banner$/, '_banner'); return { standing, wall: name, kind: 'banner', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  if (name.endsWith('_wall_fan')) { const standing = name.replace(/_wall_fan$/, '_fan'); return { standing, wall: name, kind: 'coral-fan', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  if (name.endsWith('_wall_head')) { const standing = name.replace(/_wall_head$/, '_head'); return { standing, wall: name, kind: 'head', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  if (name.endsWith('_wall_skull')) { const standing = name.replace(/_wall_skull$/, '_skull'); return { standing, wall: name, kind: 'head', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  if (name.startsWith('wall_') && name.endsWith('_torch')) { const standing = name.replace(/^wall_/, ''); return { standing, wall: name, kind: 'torch', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  if (name.endsWith('_wall_torch')) { const standing = name.replace(/_wall_torch$/, '_torch'); return { standing, wall: name, kind: 'torch', variants: { standing: `minecraft:${standing}`, wall: `minecraft:${name}` } }; }
  return undefined;
}

function toItem(definition: BlockDefinition, entry: ManifestEntry, concreteBlockIds: readonly string[]): PlaceableItemDefinition {
  const defaultState = { ...definition.defaultState, ...(entry.defaultState ?? {}) };
  const previewState = definition.contentDescriptor?.representativeVisualState ? { ...defaultState, ...definition.contentDescriptor.representativeVisualState } : undefined;
  const previewBlocks = previewFor(entry, definition, previewState ?? defaultState);
  const placementVariants = entry.placementVariants ?? (definition.namespace === 'minecraft' && entry.concreteBlockIds.length > 1 ? { standing: entry.concreteBlockIds[0], wall: entry.concreteBlockIds[1] } : undefined);
  const itemEvidence = definition.sourceId && definition.sourceId !== 'vanilla' ? 'inferred' : 'verified';
  return { itemId: entry.itemId, displayBlockId: definition.id, namespace: definition.namespace, displayName: entry.displayName ?? definition.displayName, modName: definition.modName, sourceId: definition.sourceId, sourceName: definition.sourceName, defaultState, ...(previewState ? { previewState } : {}), concreteBlockIds, ...(placementVariants ? { placementVariants } : {}), placementKind: entry.kind, previewRecipe: entry.recipe, support: definition.support, visualSupport: definition.visualSupport, capabilities: addBlockCapability(definition.capabilities, { kind: 'item-backed', evidence: itemEvidence }), previewBlocks };
}

function previewFor(entry: ManifestEntry, definition: BlockDefinition, itemState: BlockState): readonly PlacedBlock[] {
  const state = { ...itemState };
  const make = (position: VoxelCoordinate, overrides: BlockState = {}, concreteId = definition.id): PlacedBlock => ({ kind: 'resolved', id: concreteId, namespace: concreteId.split(':')[0] ?? 'minecraft', position, state: { ...state, ...overrides } });
  if (entry.recipe === 'bed') return [make({ x: 0, y: 0, z: 0 }, { part: 'foot', facing: 'south', occupied: 'false' }), make({ x: 0, y: 0, z: 1 }, { part: 'head', facing: 'south', occupied: 'false' })];
  if (entry.recipe === 'door') return [make({ x: 0, y: 0, z: 0 }, { half: 'lower' }), make({ x: 0, y: 1, z: 0 }, { half: 'upper' })];
  if (entry.recipe === 'tall-plant') return [make({ x: 0, y: 0, z: 0 }, { half: 'lower' }), make({ x: 0, y: 1, z: 0 }, { half: 'upper' })];
  return [make({ x: 0, y: 0, z: 0 })];
}

export function canonicalPlaceableItemId(concreteId: string, items?: readonly PlaceableItemDefinition[]): string {
  const dynamic = items?.find((item) => item.concreteBlockIds.includes(concreteId));
  return dynamic?.itemId ?? MANIFEST_BY_CONCRETE.get(concreteId)?.itemId ?? concreteId;
}

export function resolveConcreteBlockId(item: PlaceableItemDefinition, context?: PlacementContext): string {
  const variants = item.placementVariants;
  const normal = variants?.standing ?? item.displayBlockId;
  const side = !!context?.faceNormal && Math.abs(context.faceNormal.x) + Math.abs(context.faceNormal.z) > 0 && context.faceNormal.y === 0;
  if (item.placementKind === 'hanging-sign') {
    if (side) return variants?.wallHanging ?? normal;
    if (context?.faceNormal?.y === -1) return variants?.hanging ?? normal;
    return normal;
  }
  return side ? variants?.wall ?? normal : normal;
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
  const matches: PlaceableItemDefinition[] = [];
  for (const item of items) {
    const indexed = placementSearchIndex.get(item) ?? placementSearchIndex.set(item, placementSearchText(item)).get(item)!;
    if (indexed.includes(normalized)) matches.push(item);
  }
  return matches;
}

function placementSearchText(item: PlaceableItemDefinition): string {
  return [item.displayName, item.itemId, item.namespace, item.modName ?? '', item.sourceName ?? ''].map(normalizeSearchText).join('\u0000');
}

function directionOffset(direction: string): VoxelCoordinate { return ({ north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 } } as Record<string, VoxelCoordinate>)[direction] ?? { x: 0, y: 0, z: 0 }; }
function add(position: VoxelCoordinate, offset: VoxelCoordinate): VoxelCoordinate { return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z }; }
