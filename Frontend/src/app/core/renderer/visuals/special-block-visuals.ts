import * as THREE from 'three';
import { PlacedBlock } from '../../domain/project.types';
import { SpecialModelDescriptor } from './special-model-descriptor';
import { createSpecialModel } from './special-model-geometry';
import { resolveResourceLocation } from '../../content/resource-location';
import { createCommonSignAdapter, SignVisualProvider } from './sign-visual-provider';
import { BedVisualProvider } from './bed-visual-provider';
import type { BedVisualDescriptor, NormalizedSpecialVisualDescriptor, SpecialBlockVisualAdapter, SpecialVisualCompatibility, SpecialVisualContext, SpecialVisualResourceProvider } from './special-visual-contracts';
import { SPECIAL_VISUAL_COMPATIBILITY } from './special-visual-contracts';

/** Static editor visuals for vanilla blocks which have no generic JSON elements. */
export class SpecialBlockVisualRegistry {
  private readonly beds: BedVisualProvider;
  private readonly signs: SignVisualProvider;
  private readonly adapters: SpecialBlockVisualAdapter[];
  private readonly descriptorAdapters = new Map<string, SpecialBlockVisualAdapter>();
  private readonly resources?: SpecialVisualResourceProvider;
  constructor(gameVersionOrResources: string | SpecialVisualResourceProvider = '1.21.1') {
    this.resources = typeof gameVersionOrResources === 'string' ? undefined : gameVersionOrResources;
    this.beds = new BedVisualProvider(); this.signs = new SignVisualProvider();
    this.adapters = [this.beds, chestAdapter, barrelAdapter, this.signs, bannerAdapter, headAdapter, shulkerAdapter, decoratedPotAdapter, conduitAdapter];
  }
  registerBed(descriptor: BedVisualDescriptor): void { this.beds.register(descriptor); }
  /** Replace transient content descriptors with the current authoritative set. */
  setDescriptors(descriptors: readonly NormalizedSpecialVisualDescriptor[]): void {
    this.descriptorAdapters.clear();
    for (const descriptor of descriptors) this.registerDescriptor(descriptor);
  }
  registerDescriptor(descriptor: NormalizedSpecialVisualDescriptor): void {
    const adapter = createCommonSignAdapter(descriptor);
    if (!adapter) return;
    const texture = descriptor.resources['default'] ?? descriptor.resources['front']!;
    const key = `${descriptor.contentId}|${descriptor.contractId}|${texture}`;
    if (this.descriptorAdapters.has(key)) return;
    this.descriptorAdapters.set(key, adapter);
  }
  private candidates(): readonly SpecialBlockVisualAdapter[] { return [...this.descriptorAdapters.values(), ...this.adapters]; }
  resolve(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.resolveCompatible(block) ?? this.resolveDiagnosticFallback(block);
  }
  resolveCompatible(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.inspect(block).adapter;
  }
  reusableVisualKey(block: PlacedBlock): string | undefined {
    const adapter = this.resolveCompatible(block);
    if (!adapter?.staticBatchable) return undefined;
    const state = Object.entries(block.state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',');
    return `special-template-v1|${adapter.family}|${block.id}|${state}`;
  }
  resolveDiagnosticFallback(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.candidates().find((candidate) => candidate.matches(block));
  }
  /** Resolve only verified static item-backed special visuals. This is a
   * capability boundary, not a namespace/name heuristic for arbitrary items. */
  resolveItemVisual(itemId: string, components?: Readonly<Record<string, unknown>>): SpecialBlockVisualAdapter | undefined {
    const block: PlacedBlock = { kind: 'resolved', id: itemId, namespace: itemId.split(':')[0] ?? 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { rotation: '0' } };
    return this.candidates().find((candidate) => {
      if (candidate.family !== 'heads-skulls' || !candidate.matches(block)) return false;
      const resource = candidate.textureResource?.(block) ?? '';
      return !(resource.includes('/player/') && hasProfileComponent(components));
    });
  }
  inspect(block: PlacedBlock): SpecialVisualCompatibility {
    const adapter = this.candidates().find((candidate) => candidate.matches(block));
    if (!adapter) return { missingResources: [] };
    const missingResources = this.resourcesSupport(adapter, block);
    return { adapter: missingResources.length ? undefined : adapter, family: adapter.family, missingResources };
  }
  private resourcesSupport(adapter: SpecialBlockVisualAdapter, block: PlacedBlock): readonly string[] {
    if (!this.resources) return [];
    const resources = adapter.textureResources?.(block) ?? (adapter.textureResource?.(block) ? { default: adapter.textureResource(block)! } : {});
    return Object.values(resources).map(resourcePath).filter((path) => !this.resources?.readBinary(path));
  }
}

const material = (color: number, texture?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: texture, transparent: true, opacity: .98 });
const box = (root: THREE.Group, size: readonly [number, number, number], at: readonly [number, number, number], color: number, texture?: THREE.Texture) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, texture)); mesh.position.set(...at); root.add(mesh); };
const named = (family: string, match: (id: string) => boolean, build: (block: PlacedBlock) => THREE.Group): SpecialBlockVisualAdapter => ({ family, matches: (block) => match(block.id), create: build });
const colorFromId = (id: string, fallback: number): number => { const name = id.split(':').at(-1) ?? ''; const colors: Record<string, number> = { red: 0xb83832, blue: 0x3f61b7, green: 0x4f8c4e, black: 0x252525, white: 0xe8e6df, yellow: 0xd6b432, purple: 0x744a9c, orange: 0xcb7b32, pink: 0xd47aa4, cyan: 0x4aa7ae, gray: 0x6b6b6b, brown: 0x6e4a31 }; return Object.entries(colors).find(([key]) => name.startsWith(key))?.[1] ?? fallback; };

const chestIds = new Set(['minecraft:chest', 'minecraft:trapped_chest', 'minecraft:ender_chest']);
const chestAdapter: SpecialBlockVisualAdapter = {
  family: 'chests',
  staticBatchable: true,
  matches: (block) => chestIds.has(block.id),
  textureResource: (block) => chestTextureResource(block),
  create: (block, context) => createChestVisual(block, context?.texture),
};
/** Diagnostic-only fallback. A barrel with usable JSON elements stays on the generic path. */
const barrelAdapter: SpecialBlockVisualAdapter = { family: 'containers', staticBatchable: true, matches: (block) => block.namespace === 'minecraft' && /(?:^|_)barrel$/.test(block.id.split(':').at(-1) ?? block.id), create: (block) => { const root = new THREE.Group(); root.userData['visualFallback'] = 'diagnostic'; root.userData['fallbackReason'] = 'BARREL_GENERIC_RESOURCE_UNAVAILABLE'; box(root, [.92, .58, .92], [.5, .29, .5], 0x8c6035); box(root, [.94, .12, .94], [.5, .64, .5], 0xc28a47); return root; } };

const chestSingleModel: SpecialModelDescriptor = {
  id: 'minecraft-java-chest-single-1.21.1', textureSize: [64, 64], parts: [
    { id: 'bottom', cuboids: [{ id: 'bottom', uv: [0, 19], from: [1, 0, 1], size: [14, 10, 14] }] },
    { id: 'lid', pivot: [0, 9, 1], applyPivot: true, cuboids: [{ id: 'lid', uv: [0, 0], from: [1, 0, 0], size: [14, 5, 14] }] },
    { id: 'lock', pivot: [0, 9, 1], applyPivot: true, cuboids: [{ id: 'lock', uv: [0, 0], from: [7, -2, 14], size: [2, 4, 1] }] },
  ],
};
const chestRightModel: SpecialModelDescriptor = {
  id: 'minecraft-java-chest-right-1.21.1', textureSize: [64, 64], parts: [
    { id: 'bottom', cuboids: [{ id: 'bottom', uv: [0, 19], from: [1, 0, 1], size: [15, 10, 14] }] },
    { id: 'lid', pivot: [0, 9, 1], applyPivot: true, cuboids: [{ id: 'lid', uv: [0, 0], from: [1, 0, 0], size: [15, 5, 14] }] },
    { id: 'lock', pivot: [0, 9, 1], applyPivot: true, cuboids: [{ id: 'lock', uv: [0, 0], from: [15, -2, 14], size: [1, 4, 1] }] },
  ],
};
const chestLeftModel: SpecialModelDescriptor = {
  id: 'minecraft-java-chest-left-1.21.1', textureSize: [64, 64], parts: [
    { id: 'bottom', cuboids: [{ id: 'bottom', uv: [0, 19], from: [0, 0, 1], size: [15, 10, 14] }] },
    { id: 'lid', pivot: [0, 9, 1], applyPivot: true, cuboids: [{ id: 'lid', uv: [0, 0], from: [0, 0, 0], size: [15, 5, 14] }] },
    { id: 'lock', pivot: [0, 9, 1], applyPivot: true, cuboids: [{ id: 'lock', uv: [0, 0], from: [0, -2, 14], size: [1, 4, 1] }] },
  ],
};

export function chestModelFor(block: PlacedBlock): SpecialModelDescriptor {
  if (block.id === 'minecraft:ender_chest') return chestSingleModel;
  return block.state['type'] === 'left' ? chestLeftModel : block.state['type'] === 'right' ? chestRightModel : chestSingleModel;
}
export function chestTextureResource(block: PlacedBlock): string {
  if (block.id === 'minecraft:ender_chest') return 'minecraft:entity/chest/ender';
  const base = block.id === 'minecraft:trapped_chest' ? 'trapped' : 'normal';
  const suffix = block.state['type'] === 'left' ? '_left' : block.state['type'] === 'right' ? '_right' : '';
  return `minecraft:entity/chest/${base}${suffix}`;
}
export function chestRotationRadians(facing: string | undefined): number {
  return ({ south: 0, west: Math.PI / 2, north: Math.PI, east: Math.PI * 1.5 } as Record<string, number>)[facing ?? 'north'] ?? Math.PI;
}
function createChestVisual(block: PlacedBlock, texture?: THREE.Texture): THREE.Group {
  const model = chestModelFor(block);
  const root = createSpecialModel(model, texture);
  const orientation = new THREE.Group();
  orientation.position.set(.5, .5, .5);
  orientation.rotation.y = -chestRotationRadians(block.state['facing']);
  const content = new THREE.Group();
  content.position.set(-.5, -.5, -.5);
  while (root.children.length) content.add(root.children[0]);
  orientation.add(content);
  root.add(orientation);
  root.userData['specialModel'] = model.id;
  root.userData['chestType'] = block.id === 'minecraft:ender_chest' ? 'single' : block.state['type'] ?? 'single';
  root.userData['chestTexture'] = chestTextureResource(block);
  return root;
}
const bannerAdapter: SpecialBlockVisualAdapter = {
  family: 'banners',
  staticBatchable: true,
  matches: (block) => block.namespace === 'minecraft' && (block.id.endsWith('_banner') || block.id.endsWith('_wall_banner')),
  create: (block) => createBannerVisual(block),
};

function createBannerVisual(block: PlacedBlock): THREE.Group {
  const root = new THREE.Group();
  const color = colorFromId(block.id, 0xa23d3d);
  const wall = block.id.endsWith('_wall_banner');
  if (!wall) {
    box(root, [.62, .92, .05], [.5, .57, .5], color);
    box(root, [.07, .2, .07], [.5, .1, .5], 0x55514b);
    return root;
  }
  // Wall banner geometry is authored along +Z, the support side for the
  // north-facing state. Rotating this local group keeps all four facings on
  // the same support plane instead of applying a screen-space offset.
  const orientation = new THREE.Group();
  orientation.position.set(.5, 0, .5);
  orientation.rotation.y = wallFacingRotation(block.state['facing']);
  box(orientation, [.62, .92, .05], [0, .57, .465], color);
  box(orientation, [.07, .2, .07], [0, .1, .465], 0x55514b);
  root.add(orientation);
  root.userData['wallFacing'] = block.state['facing'] ?? 'north';
  return root;
}

function wallFacingRotation(facing: string | undefined): number { return ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 } as Record<string, number>)[facing ?? 'north'] ?? 0; }
const headIds = new Set([
  'minecraft:creeper_head', 'minecraft:creeper_wall_head', 'minecraft:dragon_head', 'minecraft:dragon_wall_head',
  'minecraft:piglin_head', 'minecraft:piglin_wall_head', 'minecraft:player_head', 'minecraft:player_wall_head',
  'minecraft:skeleton_skull', 'minecraft:skeleton_wall_skull', 'minecraft:wither_skeleton_skull', 'minecraft:wither_skeleton_wall_skull',
  'minecraft:zombie_head', 'minecraft:zombie_wall_head',
]);

function hasProfileComponent(components: Readonly<Record<string, unknown>> | undefined): boolean {
  return !!components && Object.keys(components).some((key) => key === 'minecraft:profile' || key.endsWith(':profile') || key === 'profile');
}
const headAdapter: SpecialBlockVisualAdapter = {
  family: 'heads-skulls',
  matches: (block) => headIds.has(block.id),
  textureResource: (block) => skullTexture(block.id),
  create: (block, context) => {
    const root = createSpecialModel(skullModel(block.id), context?.texture);
    const wall = block.id.endsWith('_wall_head') || block.id.endsWith('_wall_skull');
    applySkullTransform(root, block, wall);
    root.userData['specialModel'] = skullModel(block.id).id;
    root.userData['skullVariant'] = skullVariant(block.id);
    return root;
  },
};

const decoratedPotSherdAssets: Readonly<Record<string, string>> = {
  'minecraft:brick': 'decorated_pot_side',
  'minecraft:angler_pottery_sherd': 'angler_pottery_pattern',
  'minecraft:archer_pottery_sherd': 'archer_pottery_pattern',
  'minecraft:arms_up_pottery_sherd': 'arms_up_pottery_pattern',
  'minecraft:blade_pottery_sherd': 'blade_pottery_pattern',
  'minecraft:brewer_pottery_sherd': 'brewer_pottery_pattern',
  'minecraft:burn_pottery_sherd': 'burn_pottery_pattern',
  'minecraft:danger_pottery_sherd': 'danger_pottery_pattern',
  'minecraft:explorer_pottery_sherd': 'explorer_pottery_pattern',
  'minecraft:flow_pottery_sherd': 'flow_pottery_pattern',
  'minecraft:friend_pottery_sherd': 'friend_pottery_pattern',
  'minecraft:guster_pottery_sherd': 'guster_pottery_pattern',
  'minecraft:heart_pottery_sherd': 'heart_pottery_pattern',
  'minecraft:heartbreak_pottery_sherd': 'heartbreak_pottery_pattern',
  'minecraft:howl_pottery_sherd': 'howl_pottery_pattern',
  'minecraft:miner_pottery_sherd': 'miner_pottery_pattern',
  'minecraft:mourner_pottery_sherd': 'mourner_pottery_pattern',
  'minecraft:plenty_pottery_sherd': 'plenty_pottery_pattern',
  'minecraft:prize_pottery_sherd': 'prize_pottery_pattern',
  'minecraft:scrape_pottery_sherd': 'scrape_pottery_pattern',
  'minecraft:sheaf_pottery_sherd': 'sheaf_pottery_pattern',
  'minecraft:shelter_pottery_sherd': 'shelter_pottery_pattern',
  'minecraft:skull_pottery_sherd': 'skull_pottery_pattern',
  'minecraft:snort_pottery_sherd': 'snort_pottery_pattern',
};
const decoratedPotSides = ['back', 'left', 'right', 'front'] as const;
type DecoratedPotSide = typeof decoratedPotSides[number];
const decoratedPotAdapter: SpecialBlockVisualAdapter = {
  family: 'decorated-pots',
  overrideGeneric: true,
  matches: (block) => block.namespace === 'minecraft' && block.id === 'minecraft:decorated_pot',
  textureResource: () => 'minecraft:entity/decorated_pot/decorated_pot_base',
  textureResources: (block) => {
    const data = block.blockEntityData && typeof block.blockEntityData === 'object' ? block.blockEntityData as { decorations?: Partial<Record<DecoratedPotSide, string>> } : undefined;
    const decorations = data?.decorations;
    return {
      base: 'minecraft:entity/decorated_pot/decorated_pot_base',
      back: decoratedPotSideTexture(decorations?.back),
      left: decoratedPotSideTexture(decorations?.left),
      right: decoratedPotSideTexture(decorations?.right),
      front: decoratedPotSideTexture(decorations?.front),
    };
  },
  create: (block, context) => createDecoratedPotVisual(block, context),
};
function decoratedPotSideTexture(sherd: string | undefined): string { return `minecraft:entity/decorated_pot/${decoratedPotSherdAssets[sherd ?? 'minecraft:brick'] ?? 'decorated_pot_side'}`; }
export function decoratedPotSherdTextureResource(sherd: string | undefined): string { return decoratedPotSideTexture(sherd); }
export function decoratedPotRootRotationRadians(facing: string | undefined): number { return ({ north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 } as Record<string, number>)[facing ?? 'north'] ?? 0; }
export const decoratedPotBaseModel: SpecialModelDescriptor = {
  id: 'minecraft-java-decorated-pot-base-1.21.1', textureSize: [32, 32], parts: [
    { id: 'neck', pivot: [0, 37, 16], applyPivot: true, rotation: [180, 0, 0], cuboids: [
      { id: 'neck', uv: [0, 0], from: [4, 17, 4], size: [8, 3, 8], dilation: -.1 },
      { id: 'neck-lip', uv: [0, 5], from: [5, 20, 5], size: [6, 1, 6], dilation: .2 },
    ] },
    { id: 'top', pivot: [1, 16, 1], applyPivot: true, cuboids: [{ id: 'top', uv: [-14, 13], from: [0, 0, 0], size: [14, 0, 14] }] },
    { id: 'bottom', pivot: [1, 0, 1], applyPivot: true, cuboids: [{ id: 'bottom', uv: [-14, 13], from: [0, 0, 0], size: [14, 0, 14] }] },
  ],
};
export const decoratedPotSideModels: Readonly<Record<DecoratedPotSide, SpecialModelDescriptor>> = {
  back: decoratedPotSideModel('back', [15, 16, 1], [0, 0, 180]),
  left: decoratedPotSideModel('left', [1, 16, 1], [0, -90, 180]),
  right: decoratedPotSideModel('right', [15, 16, 15], [0, 90, 180]),
  front: decoratedPotSideModel('front', [1, 16, 15], [180, 0, 0]),
};
function decoratedPotSideModel(side: DecoratedPotSide, pivot: readonly [number, number, number], rotation: readonly [number, number, number]): SpecialModelDescriptor {
  return { id: `minecraft-java-decorated-pot-${side}-1.21.1`, textureSize: [16, 16], parts: [{ id: side, pivot, applyPivot: true, rotation, cuboids: [{ id: `${side}-plane`, uv: [1, 0], from: [0, 0, 0], size: [14, 16, 0], faces: ['north'] }] }] };
}
function createDecoratedPotVisual(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
  const root = new THREE.Group(); root.position.set(.5, 0, .5); root.rotation.y = decoratedPotRootRotationRadians(block.state['facing']);
  const content = new THREE.Group(); content.position.set(-.5, 0, -.5);
  content.add(...[createSpecialModel(decoratedPotBaseModel, context?.textures?.['base'] ?? context?.texture)]);
  for (const side of decoratedPotSides) content.add(createSpecialModel(decoratedPotSideModels[side], context?.textures?.[side]));
  root.add(content);
  root.userData['specialModel'] = 'minecraft-java-decorated-pot-1.21.1'; root.userData['decoratedPotFacing'] = block.state['facing'] ?? 'north';
  return root;
}
export const conduitInactiveModel: SpecialModelDescriptor = {
  id: 'minecraft-java-conduit-inactive-1.21.1', textureSize: [32, 16],
  parts: [{ id: 'shell', cuboids: [{ id: 'shell', uv: [0, 0], from: [-3, -3, -3], size: [6, 6, 6] }] }],
};
const conduitAdapter: SpecialBlockVisualAdapter = {
  family: 'conduits',
  staticBatchable: true,
  overrideGeneric: true,
  matches: (block) => block.namespace === 'minecraft' && block.id === 'minecraft:conduit',
  textureResource: () => 'minecraft:entity/conduit/base',
  create: (_block, context) => {
    const root = new THREE.Group(); root.position.set(.5, .5, .5);
    root.add(createSpecialModel(conduitInactiveModel, context?.texture));
    root.userData['specialModel'] = conduitInactiveModel.id; root.userData['conduitState'] = 'inactive';
    return root;
  },
};
const shulkerAdapter: SpecialBlockVisualAdapter = {
  family: 'shulker-boxes',
  staticBatchable: true,
  matches: (block) => block.namespace === 'minecraft' && (block.id === 'minecraft:shulker_box' || block.id.endsWith('_shulker_box')),
  textureResource: (block) => shulkerTextureResource(block),
  create: (block, context) => createShulkerVisual(block, context?.texture),
};
const shulkerModel: SpecialModelDescriptor = {
  id: 'minecraft-java-shulker-box-1.21.1',
  textureSize: [64, 64],
  parts: [
    { id: 'base', pivot: [0, 24, 0], applyPivot: true, cuboids: [{ id: 'base', uv: [0, 28], from: [-8, -8, -8], size: [16, 8, 16] }] },
    { id: 'lid', pivot: [0, 24, 0], applyPivot: true, cuboids: [{ id: 'lid', uv: [0, 0], from: [-8, -16, -8], size: [16, 12, 16] }] },
  ],
};
export function shulkerTextureResource(block: PlacedBlock): string {
  const name = block.id.split(':').at(-1) ?? 'shulker_box';
  if (name === 'shulker_box') return 'minecraft:entity/shulker/shulker';
  const color = name.replace(/_shulker_box$/, '');
  return `minecraft:entity/shulker/shulker_${color}`;
}
export function shulkerFacingQuaternion(facing: string | undefined): THREE.Quaternion {
  const euler = new THREE.Euler();
  if (facing === 'down') euler.set(Math.PI, 0, 0, 'XYZ');
  else if (facing === 'north') euler.set(Math.PI / 2, 0, Math.PI, 'XYZ');
  else if (facing === 'south') euler.set(Math.PI / 2, 0, 0, 'XYZ');
  else if (facing === 'west') euler.set(Math.PI / 2, 0, Math.PI / 2, 'XYZ');
  else if (facing === 'east') euler.set(Math.PI / 2, 0, -Math.PI / 2, 'XYZ');
  return new THREE.Quaternion().setFromEuler(euler);
}
function createShulkerVisual(block: PlacedBlock, texture?: THREE.Texture): THREE.Group {
  const root = createSpecialModel(shulkerModel, texture);
  const translation = new THREE.Group(); translation.position.set(.5, .5, .5);
  const inset = new THREE.Group(); inset.scale.setScalar(.9995);
  const direction = new THREE.Group(); direction.quaternion.copy(shulkerFacingQuaternion(block.state['facing']));
  const flip = new THREE.Group(); flip.scale.set(1, -1, -1);
  const localTranslation = new THREE.Group(); localTranslation.position.set(0, -1, 0);
  while (root.children.length) localTranslation.add(root.children[0]);
  flip.add(localTranslation); direction.add(flip); inset.add(direction); translation.add(inset); root.add(translation);
  root.userData['specialModel'] = shulkerModel.id;
  root.userData['shulkerFacing'] = block.state['facing'] ?? 'up';
  root.userData['shulkerTexture'] = shulkerTextureResource(block);
  return root;
}
type SkullVariant = 'skeleton' | 'wither_skeleton' | 'zombie' | 'creeper' | 'dragon' | 'piglin' | 'player';
function skullVariant(id: string): SkullVariant {
  const name = id.split(':').at(-1) ?? '';
  if (name.startsWith('wither_skeleton_')) return 'wither_skeleton';
  if (name.startsWith('skeleton_')) return 'skeleton';
  if (name.startsWith('zombie_')) return 'zombie';
  if (name.startsWith('creeper_')) return 'creeper';
  if (name.startsWith('dragon_')) return 'dragon';
  if (name.startsWith('piglin_')) return 'piglin';
  return 'player';
}
function skullTexture(id: string): string {
  return ({ skeleton: 'minecraft:entity/skeleton/skeleton', wither_skeleton: 'minecraft:entity/skeleton/wither_skeleton', zombie: 'minecraft:entity/zombie/zombie', creeper: 'minecraft:entity/creeper/creeper', dragon: 'minecraft:entity/enderdragon/dragon', piglin: 'minecraft:entity/piglin/piglin', player: 'minecraft:entity/player/slim/steve' } as Record<SkullVariant, string>)[skullVariant(id)];
}
function skullModel(id: string): SpecialModelDescriptor {
  const variant = skullVariant(id);
  if (variant === 'dragon') return dragonHeadModel;
  if (variant === 'piglin') return piglinHeadModel;
  if (variant === 'player' || variant === 'zombie') return humanSkullModel(variant);
  return skullModelDescriptor(variant);
}
function applySkullTransform(root: THREE.Group, block: PlacedBlock, wall: boolean): void {
  const direction = directionVector(block.state['facing']);
  const rotation = new THREE.Group();
  rotation.rotation.y = wall ? wallSkullRotation(block.state['facing']) : Number.isInteger(Number(block.state['rotation'])) ? Number(block.state['rotation']) * Math.PI / 8 : 0;
  while (root.children.length) rotation.add(root.children[0]);
  const scale = new THREE.Group();
  scale.scale.set(-1, -1, 1);
  scale.add(rotation);
  root.add(scale);
  if (wall) {
    root.position.set(.5 - direction.x * .25, .25, .5 - direction.z * .25);
  } else {
    root.position.set(.5, 0, .5);
  }
}
function directionVector(facing: string | undefined): { x: number; z: number } { return ({ north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } } as Record<string, { x: number; z: number }>)[facing ?? 'north'] ?? { x: 0, z: -1 }; }
function wallSkullRotation(facing: string | undefined): number { return ({ north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 } as Record<string, number>)[facing ?? 'north'] ?? 0; }
function skullModelDescriptor(variant: SkullVariant): SpecialModelDescriptor { return { id: `minecraft-java-${variant}-skull-1.21.1`, textureSize: [64, 32], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }] }] }; }
function humanSkullModel(variant: 'player' | 'zombie'): SpecialModelDescriptor { return { id: `minecraft-java-${variant}-skull-1.21.1`, textureSize: [64, 64], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }, { id: 'hat', uv: [32, 0], from: [-4, -8, -4], size: [8, 8, 8], dilation: .25 }] }] }; }
const dragonHeadModel: SpecialModelDescriptor = { id: 'minecraft-java-dragon-head-1.21.1', textureSize: [256, 256], localTransform: { translation: [0, -.374375, 0], scale: [.75, .75, .75] }, parts: [{ id: 'head', cuboids: [
  { id: 'upper_lip', uv: [176, 44], from: [-6, -1, -24], size: [12, 5, 16] },
  { id: 'upper_head', uv: [112, 30], from: [-8, -8, -10], size: [16, 16, 16] },
  { id: 'left_scale', uv: [0, 0], from: [-5, -12, -4], size: [2, 4, 6], mirror: true },
  { id: 'left_nostril', uv: [112, 0], from: [-5, -3, -22], size: [2, 2, 4] },
  { id: 'right_scale', uv: [0, 0], from: [3, -12, -4], size: [2, 4, 6] },
  { id: 'right_nostril', uv: [112, 0], from: [3, -3, -22], size: [2, 2, 4] },
], children: [{ id: 'jaw', pivot: [0, 4, -8], applyPivot: true, rotation: [11.459156, 0, 0], cuboids: [{ id: 'jaw', uv: [176, 65], from: [-6, 0, -16], size: [12, 4, 16] }] }] }] };
const piglinHeadModel: SpecialModelDescriptor = { id: 'minecraft-java-piglin-head-1.21.1', textureSize: [64, 64], parts: [
  { id: 'head', cuboids: [
    { id: 'head', uv: [0, 0], from: [-5, -8, -4], size: [10, 8, 8] },
    { id: 'snout', uv: [31, 1], from: [-2, -4, -5], size: [4, 4, 1] },
    { id: 'right_nostril', uv: [2, 4], from: [2, -2, -5], size: [1, 2, 1] },
    { id: 'left_nostril', uv: [2, 0], from: [-3, -2, -5], size: [1, 2, 1] },
  ] },
  { id: 'left_ear', pivot: [4.5, -6, 0], applyPivot: true, rotation: [0, 0, -30], cuboids: [{ id: 'left_ear', uv: [51, 6], from: [0, 0, -2], size: [1, 5, 4] }] },
  { id: 'right_ear', pivot: [-4.5, -6, 0], applyPivot: true, rotation: [0, 0, 30], cuboids: [{ id: 'right_ear', uv: [39, 6], from: [-1, 0, -2], size: [1, 5, 4] }] },
] };

function resourcePath(resource: string): string {
  if (resource.startsWith('assets/')) return resource.endsWith('.png') ? resource : `${resource}.png`;
  const normalized = resolveResourceLocation(resource.replace(/^textures\//, '').replace(/\.png$/, ''));
  if (!normalized) return resource;
  const [namespace, path] = normalized.split(':', 2);
  return `assets/${namespace}/textures/${path}.png`;
}
