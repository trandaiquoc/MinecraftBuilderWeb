import * as THREE from 'three';
import { PlacedBlock } from '../domain/project.types';
import { modelPartCuboidUv, SpecialCuboidDescriptor, SpecialModelDescriptor, SpecialModelPartDescriptor } from './special-model-descriptor';

export interface SpecialVisualContext { readonly texture?: THREE.Texture; }
export interface SpecialVisualProviderMetadata { readonly providerId: string; readonly gameEdition: 'java'; readonly gameVersion: string; readonly namespace: string; readonly family: string; readonly priority: number; }
export interface BedVisualDescriptor { readonly metadata: SpecialVisualProviderMetadata; matches(block: PlacedBlock): boolean; textureResource(block: PlacedBlock): string | undefined; model(block: PlacedBlock): SpecialModelDescriptor | undefined; transform(block: PlacedBlock, root: THREE.Group): void; }
export interface SpecialBlockVisualAdapter { readonly family: string; matches(block: PlacedBlock): boolean; textureResource?(block: PlacedBlock): string | undefined; create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group; }

/** Static editor visuals for vanilla blocks which have no generic JSON elements. */
export class SpecialBlockVisualRegistry {
  private readonly beds: BedVisualProvider;
  private readonly signs: SignVisualProvider;
  private readonly adapters: readonly SpecialBlockVisualAdapter[];
  constructor(gameVersion = '1.21.1') { this.beds = new BedVisualProvider(gameVersion, [vanillaBedDescriptor]); this.signs = new SignVisualProvider(gameVersion); this.adapters = [this.beds, chestAdapter, barrelAdapter, this.signs, bannerAdapter, headAdapter, shulkerAdapter]; }
  registerBed(descriptor: BedVisualDescriptor): void { this.beds.register(descriptor); }
  resolve(block: PlacedBlock): SpecialBlockVisualAdapter | undefined { return this.adapters.find((adapter) => adapter.matches(block)); }
}

/** Extension point for a normalized mod bed descriptor; it never infers Java runtime renderers. */
export class BedVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'beds';
  constructor(private readonly gameVersion: string, private readonly descriptors: BedVisualDescriptor[]) {}
  register(descriptor: BedVisualDescriptor): void { this.descriptors.push(descriptor); }
  matches(block: PlacedBlock): boolean { return !!this.resolve(block); }
  textureResource(block: PlacedBlock): string | undefined { return this.resolve(block)?.textureResource(block); }
  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group { const descriptor = this.resolve(block); if (!descriptor) return new THREE.Group(); const model = descriptor.model(block); if (!model) return new THREE.Group(); const root = createSpecialModel(model, context?.texture); descriptor.transform(block, root); root.userData['specialModel'] = model.id; root.userData['providerId'] = descriptor.metadata.providerId; return root; }
  private resolve(block: PlacedBlock): BedVisualDescriptor | undefined { return this.descriptors.filter((descriptor) => descriptor.metadata.gameVersion === this.gameVersion && descriptor.metadata.namespace === block.namespace && descriptor.matches(block)).sort((left, right) => right.metadata.priority - left.metadata.priority)[0]; }
}

/** Java 1.21.1 block-entity sign renderer represented as ModelPart descriptors. */
export class SignVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'signs';
  constructor(private readonly gameVersion: string) {}
  matches(block: PlacedBlock): boolean { return this.gameVersion === '1.21.1' && block.namespace === 'minecraft' && signVariant(block.id) !== undefined; }
  textureResource(block: PlacedBlock): string | undefined {
    const wood = signWood(block.id); const variant = signVariant(block.id);
    return wood && variant ? `minecraft:entity/signs/${variant.includes('hanging') ? 'hanging/' : ''}${wood}` : undefined;
  }
  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const variant = signVariant(block.id);
    if (!variant) return new THREE.Group();
    const model = variant === 'standing' || variant === 'wall'
      ? normalSignModel(variant === 'standing')
      : hangingSignModel(variant, block.state['attached'] === 'true');
    const root = new THREE.Group();
    const modelRoot = createSpecialModel(model, context?.texture);
    const modelBranch = new THREE.Group();
    while (modelRoot.children.length) modelBranch.add(modelRoot.children[0]);
    const textBranch = addSignText(block, variant);
    const placement = new THREE.Group();
    placement.add(modelBranch, textBranch);
    root.add(placement);
    if (variant === 'standing' || variant === 'wall') applyNormalSignTransform(root, placement, modelBranch, block, variant === 'wall');
    else applyHangingSignTransform(root, modelBranch, block);
    root.userData['specialModel'] = model.id;
    root.userData['providerId'] = 'minecraft-java-sign-1.21.1-modelpart';
    root.userData['signVariant'] = variant;
    return root;
  }
}

const material = (color: number, texture?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: texture, transparent: true, opacity: .98 });
const box = (root: THREE.Group, size: readonly [number, number, number], at: readonly [number, number, number], color: number, texture?: THREE.Texture) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, texture)); mesh.position.set(...at); root.add(mesh); };
const named = (family: string, match: (id: string) => boolean, build: (block: PlacedBlock) => THREE.Group): SpecialBlockVisualAdapter => ({ family, matches: (block) => match(block.id), create: build });
const colorFromId = (id: string, fallback: number): number => { const name = id.split(':').at(-1) ?? ''; const colors: Record<string, number> = { red: 0xb83832, blue: 0x3f61b7, green: 0x4f8c4e, black: 0x252525, white: 0xe8e6df, yellow: 0xd6b432, purple: 0x744a9c, orange: 0xcb7b32, pink: 0xd47aa4, cyan: 0x4aa7ae, gray: 0x6b6b6b, brown: 0x6e4a31 }; return Object.entries(colors).find(([key]) => name.startsWith(key))?.[1] ?? fallback; };

const vanillaBedIds = new Set(['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'].map((color) => `minecraft:${color}_bed`));
const vanillaBedDescriptor: BedVisualDescriptor = {
  metadata: { providerId: 'minecraft-java-bed-1.21.1', gameEdition: 'java', gameVersion: '1.21.1', namespace: 'minecraft', family: 'bed', priority: 100 },
  matches: (block) => vanillaBedIds.has(block.id),
  textureResource: (block) => `minecraft:entity/bed/${bedColor(block.id)}`,
  model: (block) => block.state['part'] === 'head' ? vanillaBedHead : vanillaBedFoot,
  transform: (block, root) => applyBedTransform(root, block.state['facing']),
};
const chestIds = new Set(['minecraft:chest', 'minecraft:trapped_chest', 'minecraft:ender_chest']);
const chestAdapter: SpecialBlockVisualAdapter = {
  family: 'chests',
  matches: (block) => chestIds.has(block.id),
  textureResource: (block) => chestTextureResource(block),
  create: (block, context) => createChestVisual(block, context?.texture),
};
const barrelAdapter = named('containers', (id) => /(?:^|_)barrel$/.test(id.split(':').at(-1) ?? id), (block) => { const root = new THREE.Group(); box(root, [.92, .58, .92], [.5, .29, .5], 0x8c6035); box(root, [.94, .12, .94], [.5, .64, .5], 0xc28a47); return root; });

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
const vanillaShulkerBoxIds = new Set([
  'minecraft:shulker_box', 'minecraft:white_shulker_box', 'minecraft:orange_shulker_box', 'minecraft:magenta_shulker_box',
  'minecraft:light_blue_shulker_box', 'minecraft:yellow_shulker_box', 'minecraft:lime_shulker_box', 'minecraft:pink_shulker_box',
  'minecraft:gray_shulker_box', 'minecraft:light_gray_shulker_box', 'minecraft:cyan_shulker_box', 'minecraft:purple_shulker_box',
  'minecraft:blue_shulker_box', 'minecraft:brown_shulker_box', 'minecraft:green_shulker_box', 'minecraft:red_shulker_box',
  'minecraft:black_shulker_box',
]);
const shulkerAdapter: SpecialBlockVisualAdapter = {
  family: 'shulker-boxes',
  matches: (block) => vanillaShulkerBoxIds.has(block.id),
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
function bedColor(id: string): string { return (id.split(':').at(-1) ?? 'red_bed').replace(/_bed$/, '') || 'red'; }

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

const vanillaBedHead: SpecialModelDescriptor = { id: 'minecraft-java-bed-head-1.21.1', textureSize: [64, 64], parts: [
  { id: 'main', cuboids: [{ id: 'main', uv: [0, 0], from: [0, 0, 0], size: [16, 16, 6] }] },
  { id: 'left_leg', pivot: [0, 6, 0], rotation: [90, 0, 90], cuboids: [{ id: 'left_leg', uv: [50, 6], from: [0, 6, 0], size: [3, 3, 3] }] },
  { id: 'right_leg', pivot: [0, 6, 0], rotation: [90, 0, 180], cuboids: [{ id: 'right_leg', uv: [50, 18], from: [-16, 6, 0], size: [3, 3, 3] }] },
] };
const vanillaBedFoot: SpecialModelDescriptor = { id: 'minecraft-java-bed-foot-1.21.1', textureSize: [64, 64], parts: [
  { id: 'main', cuboids: [{ id: 'main', uv: [0, 22], from: [0, 0, 0], size: [16, 16, 6] }] },
  { id: 'left_leg', pivot: [0, 6, 0], rotation: [90, 0, 0], cuboids: [{ id: 'left_leg', uv: [50, 0], from: [0, 6, -16], size: [3, 3, 3] }] },
  { id: 'right_leg', pivot: [0, 6, 0], rotation: [90, 0, 270], cuboids: [{ id: 'right_leg', uv: [50, 12], from: [-16, 6, -16], size: [3, 3, 3] }] },
] };

function applyBedTransform(root: THREE.Group, facing: string | undefined): void {
  root.position.set(0, .5625, 0); root.rotation.x = Math.PI / 2;
  const orientation = new THREE.Group(); orientation.position.set(.5, .5, .5); orientation.rotation.z = THREE.MathUtils.degToRad(180 + directionRotation(facing));
  const content = new THREE.Group(); content.position.set(-.5, -.5, -.5); while (root.children.length) content.add(root.children[0]); orientation.add(content); root.add(orientation);
  root.userData['bedGeometry'] = 'minecraft-java-bed-1.21.1-modelpart'; root.userData['bedWorldFootOffset'] = 0;
}
function directionRotation(facing: string | undefined): number { return ({ south: 0, west: 90, north: 180, east: 270 } as Record<string, number>)[facing ?? 'north'] ?? 180; }

/**
 * Evaluates Java ModelPart transforms as T(pivot / 16) * rotationZYX(roll, yaw, pitch).
 * Cuboid vertices remain model-space values divided by 16 exactly once.
 */
export function createSpecialModel(descriptor: SpecialModelDescriptor, texture?: THREE.Texture): THREE.Group {
  const root = new THREE.Group();
  const content = descriptor.localTransform ? new THREE.Group() : root;
  for (const part of descriptor.parts) content.add(createModelPart(part, descriptor.textureSize, texture));
  if (descriptor.localTransform) {
    const transform = descriptor.localTransform;
    // Renderer-level translations are already in world/block units; cuboid geometry is the part scaled from pixels.
    if (transform.translation) content.position.set(...transform.translation);
    if (transform.rotation) content.rotation.set(...transform.rotation.map((value) => THREE.MathUtils.degToRad(value)) as [number, number, number]);
    if (transform.scale) content.scale.set(...transform.scale);
    root.add(content);
  }
  return root;
}
function createModelPart(part: SpecialModelPartDescriptor, textureSize: readonly [number, number], texture: THREE.Texture | undefined): THREE.Group {
  const group = new THREE.Group();
  group.visible = part.visible ?? true;
  const pivot = part.pivot ?? [0, 0, 0];
  group.position.set(part.applyPivot ? pivot[0] / 16 : 0, part.applyPivot ? pivot[1] / 16 : 0, part.applyPivot ? pivot[2] / 16 : 0);
  const [pitch = 0, yaw = 0, roll = 0] = part.rotation ?? [];
  // JOML Quaternionf.rotationZYX(roll, yaw, pitch) maps directly to Three's
  // explicit ZYX order when the ModelPart values remain pitch/yaw/roll.
  group.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(roll), 'ZYX'));
  for (const cuboid of part.cuboids) group.add(createModelPartCuboid(cuboid, textureSize, texture, pivot));
  for (const child of part.children ?? []) group.add(createModelPart(child, textureSize, texture));
  return group;
}
function createModelPartCuboid(cuboid: SpecialCuboidDescriptor, textureSize: readonly [number, number], texture: THREE.Texture | undefined, _pivot: readonly [number, number, number]): THREE.Group {
  const group = new THREE.Group(); const [x, y, z] = cuboid.from; const [width, height, depth] = cuboid.size; const dilation = cuboid.dilation ?? 0; const uv = modelPartCuboidUv(cuboid);
  // Dilation expands geometry only; UVs remain based on the source cuboid size.
  const minX = (x - dilation) / 16; const maxX = (x + width + dilation) / 16;
  const min: readonly [number, number, number] = [cuboid.mirror ? maxX : minX, (y - dilation) / 16, (z - dilation) / 16]; const max: readonly [number, number, number] = [cuboid.mirror ? minX : maxX, (y + height + dilation) / 16, (z + depth + dilation) / 16];
  for (const direction of ['north', 'south', 'east', 'west', 'up', 'down'] as const) {
    const geometry = specialFaceGeometry(min, max, direction, uv[direction], textureSize, cuboid.mirror === true); const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ ...(texture ? { map: texture } : {}), color: texture ? 0xffffff : 0xaf3d35, transparent: true, alphaTest: .1, side: THREE.DoubleSide })); group.add(mesh);
  }
  return group;
}
function specialFaceGeometry(min: readonly [number, number, number], max: readonly [number, number, number], direction: 'north' | 'south' | 'east' | 'west' | 'up' | 'down', uv: readonly [number, number, number, number], textureSize: readonly [number, number], mirror: boolean): THREE.BufferGeometry {
  const [x1, y1, z1] = min; const [x2, y2, z2] = max; const facePositions = specialFacePositions(direction, x1, y1, z1, x2, y2, z2); const positions = (mirror ? [...facePositions].reverse() : facePositions).flat(); const [u1, v1, u2, v2] = uv; const [tw, th] = textureSize;
  // ModelPart.Polygon maps its ordered vertices to (u2,v1), (u1,v1), (u1,v2), (u2,v2).
  const uvCoordinates = mirror
    ? [u2 / tw, 1 - v2 / th, u1 / tw, 1 - v2 / th, u1 / tw, 1 - v1 / th, u2 / tw, 1 - v1 / th]
    : [u2 / tw, 1 - v1 / th, u1 / tw, 1 - v1 / th, u1 / tw, 1 - v2 / th, u2 / tw, 1 - v2 / th];
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvCoordinates, 2)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals(); return geometry;
}
function specialFacePositions(direction: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): readonly (readonly [number, number, number])[] { switch (direction) { case 'north': return [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]]; case 'south': return [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]]; case 'west': return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]]; case 'east': return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]]; case 'down': return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]]; default: return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]]; } }
export type SignVariant = 'standing' | 'wall' | 'hanging' | 'wall-hanging';
export interface SignTextLayout { readonly y: number; readonly z: number; readonly scale: number; readonly lineHeight: number; readonly maxWidth: number; }
export function signTextLayout(variant: SignVariant): SignTextLayout {
  return variant === 'hanging' || variant === 'wall-hanging'
    ? { y: -.32, z: .073, scale: .9, lineHeight: 9, maxWidth: 60 }
    : { y: .33333334, z: .046666667, scale: 2 / 3, lineHeight: 10, maxWidth: 90 };
}
const signWoods = new Set(['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped']);
function signVariant(id: string): SignVariant | undefined {
  if (id.endsWith('_wall_hanging_sign')) return 'wall-hanging';
  if (id.endsWith('_hanging_sign')) return 'hanging';
  if (id.endsWith('_wall_sign')) return 'wall';
  if (id.endsWith('_sign')) return 'standing';
  return undefined;
}
function signWood(id: string): string | undefined {
  const name = id.split(':').at(-1) ?? '';
  const wood = name.replace(/_(?:wall_)?(?:hanging_)?sign$/, '');
  return signWoods.has(wood) ? wood : undefined;
}
function normalSignModel(showStick: boolean): SpecialModelDescriptor {
  return { id: `minecraft-java-normal-sign-1.21.1-${showStick ? 'standing' : 'wall'}`, textureSize: [64, 32], parts: [
    { id: 'sign', cuboids: [{ id: 'board', uv: [0, 0], from: [-12, -14, -1], size: [24, 12, 2] }] },
    { id: 'stick', visible: showStick, cuboids: [{ id: 'stick', uv: [0, 14], from: [-1, -2, -1], size: [2, 14, 2] }] },
  ] };
}
function hangingSignModel(variant: 'hanging' | 'wall-hanging', attached: boolean): SpecialModelDescriptor {
  const wall = variant === 'wall-hanging';
  return { id: `minecraft-java-hanging-sign-1.21.1-${variant}-${attached ? 'attached' : 'chains'}`, textureSize: [64, 32], parts: [
    { id: 'board', cuboids: [{ id: 'board', uv: [0, 12], from: [-7, 0, -1], size: [14, 10, 2] }] },
    { id: 'plank', visible: wall, cuboids: [{ id: 'plank', uv: [0, 0], from: [-8, -6, -2], size: [16, 2, 4] }] },
    { id: 'normal-chains', visible: wall || !attached, cuboids: [], children: [
      { id: 'left-one', pivot: [-5, -6, 0], applyPivot: true, rotation: [0, -45, 0], cuboids: [{ id: 'chain-l1', uv: [0, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
      { id: 'left-two', pivot: [-5, -6, 0], applyPivot: true, rotation: [0, 45, 0], cuboids: [{ id: 'chain-l2', uv: [6, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
      { id: 'right-one', pivot: [5, -6, 0], applyPivot: true, rotation: [0, -45, 0], cuboids: [{ id: 'chain-r1', uv: [0, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
      { id: 'right-two', pivot: [5, -6, 0], applyPivot: true, rotation: [0, 45, 0], cuboids: [{ id: 'chain-r2', uv: [6, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
    ] },
    { id: 'v-chains', visible: !wall && attached, cuboids: [{ id: 'v-chains', uv: [14, 6], from: [-6, -6, 0], size: [12, 6, 0] }] },
  ] };
}
function applyNormalSignTransform(root: THREE.Group, placement: THREE.Group, modelBranch: THREE.Group, block: PlacedBlock, wall: boolean): void {
  root.position.set(.5, .5, .5);
  root.rotation.y = -signRotationRadians(block);
  modelBranch.scale.set(2 / 3, -2 / 3, -2 / 3);
  // The 2px board depth is scaled to 1/12 block. Centering its support edge
  // on the adjacent voxel face leaves the board in front of, not inside, the
  // supporting block for every horizontal facing.
  if (wall) {
    placement.position.set(0, -.3125, -.4375);
  }
}
function applyHangingSignTransform(root: THREE.Group, modelBranch: THREE.Group, block: PlacedBlock): void {
  root.position.set(.5, .9375, .5);
  root.rotation.y = -signRotationRadians(block);
  modelBranch.scale.set(1, -1, -1);
  root.children[0]?.position.set(0, -.3125, 0);
}
function signRotationRadians(block: PlacedBlock): number {
  const rotation = Number(block.state['rotation']);
  if (Number.isInteger(rotation)) return rotation * Math.PI / 8;
  return signFacingRotation(block.state['facing']);
}
function signFacingRotation(facing: string | undefined): number {
  return ({ south: 0, west: Math.PI / 2, north: Math.PI, east: Math.PI * 1.5 } as Record<string, number>)[facing ?? 'north'] ?? Math.PI;
}
function addSignText(block: PlacedBlock, variant: SignVariant): THREE.Group {
  const root = new THREE.Group();
  const data = block.blockEntityData as { front?: { lines?: readonly string[]; color?: string }; back?: { lines?: readonly string[]; color?: string } } | undefined;
  const offset = signTextLayout(variant);
  addSignTextSide(root, data?.front, offset, false, 'front');
  addSignTextSide(root, data?.back, offset, true, 'back');
  root.userData['signTextScale'] = .015625 * offset.scale;
  root.userData['signTextOffset'] = [0, offset.y, offset.z];
  root.userData['signTextLineHeight'] = offset.lineHeight;
  root.userData['signTextMaxWidth'] = offset.maxWidth;
  return root;
}
function addSignTextSide(root: THREE.Group, side: { lines?: readonly string[]; color?: string; glowing?: boolean } | undefined, offset: { readonly y: number; readonly z: number; readonly scale: number; readonly lineHeight: number; readonly maxWidth: number }, back: boolean, sideName: 'front' | 'back'): void {
  const sideBranch = new THREE.Group(); sideBranch.name = `${sideName}TextSide`; sideBranch.userData['signTextSide'] = sideName;
  if (back) sideBranch.rotation.y = Math.PI;
  const textOffset = new THREE.Group(); textOffset.name = `${sideName}TextOffset`; textOffset.position.set(0, offset.y, offset.z); textOffset.userData['signTextOffset'] = [0, offset.y, offset.z];
  const textScale = new THREE.Group(); textScale.name = `${sideName}TextScale`; const worldScale = .015625 * offset.scale; textScale.scale.set(worldScale, -worldScale, worldScale); textScale.userData['signTextScale'] = worldScale;
  sideBranch.add(textOffset); textOffset.add(textScale); root.add(sideBranch);
  if (typeof document === 'undefined' || !side) return;
  const pixelsPerUnit = 8;
  const canvas = document.createElement('canvas'); canvas.width = offset.maxWidth * pixelsPerUnit; canvas.height = offset.lineHeight * 4 * pixelsPerUnit;
  const context = canvas.getContext('2d'); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = signTextColor(side.color, side.glowing === true); context.font = `${Math.max(12, offset.lineHeight * pixelsPerUnit * .75)}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
  for (let index = 0; index < 4; index++) context.fillText(side.lines?.[index] ?? '', canvas.width / 2, (index + .5) * offset.lineHeight * pixelsPerUnit);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.userData['ownedSignTexture'] = true;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(offset.maxWidth, offset.lineHeight * 4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.name = `${sideName}SignText`; mesh.userData['signTextSide'] = sideName; textScale.add(mesh);
}
function signTextColor(color: string | undefined, glowing: boolean): string {
  const palette: Readonly<Record<string, string>> = { white: '#f9fffe', orange: '#f9801d', magenta: '#c74ebd', light_blue: '#3ab3da', yellow: '#fed83d', lime: '#80c71f', pink: '#f38baa', gray: '#474f52', light_gray: '#9d9d97', cyan: '#169c9c', purple: '#8932b8', blue: '#3c44aa', brown: '#835432', green: '#5e7c16', red: '#b02e26', black: '#181818' };
  const value = palette[color ?? 'black'] ?? palette['black'];
  if (!glowing) return value;
  const glowPalette: Readonly<Record<string, string>> = { white: '#ffffff', orange: '#ffb25c', magenta: '#f09be8', light_blue: '#8fe5ff', yellow: '#fff4a3', lime: '#c8ff62', pink: '#ffc2d8', gray: '#aab3b6', light_gray: '#e6e6de', cyan: '#69eeee', purple: '#d78aff', blue: '#8d96ff', brown: '#d6a36e', green: '#a8d65e', red: '#ff7770', black: '#777777' };
  return glowPalette[color ?? 'black'] ?? value;
}
