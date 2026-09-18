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
  constructor(gameVersion = '1.21.1') { this.beds = new BedVisualProvider(gameVersion, [vanillaBedDescriptor]); this.signs = new SignVisualProvider(gameVersion); this.adapters = [this.beds, containerAdapter, this.signs, bannerAdapter, headAdapter, shulkerAdapter]; }
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
    const root = createSpecialModel(model, context?.texture);
    addSignText(root, block, variant);
    if (variant === 'standing' || variant === 'wall') applyNormalSignTransform(root, block, variant === 'wall');
    else applyHangingSignTransform(root, block);
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
const containerAdapter = named('containers', (id) => /(?:^|_)(?:chest|barrel)$/.test(id.split(':').at(-1) ?? id), (block) => { const root = new THREE.Group(); box(root, [.92, .58, .92], [.5, .29, .5], block.id.endsWith('barrel') ? 0x8c6035 : 0xa97439); box(root, [.94, .12, .94], [.5, .64, .5], 0xc28a47); return root; });
const bannerAdapter = named('banners', (id) => id.endsWith('_banner'), (block) => { const root = new THREE.Group(); box(root, [.62, .92, .05], [.5, .57, .5], colorFromId(block.id, 0xa23d3d)); box(root, [.07, .2, .07], [.5, .1, .5], 0x55514b); return root; });
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
const shulkerAdapter = named('shulker-boxes', (id) => id.endsWith('_shulker_box'), (block) => { const root = new THREE.Group(); const color = colorFromId(block.id, 0x8b5aa7); box(root, [.9, .45, .9], [.5, .225, .5], color); box(root, [.92, .26, .92], [.5, .58, .5], color); return root; });
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
  return ({ skeleton: 'minecraft:entity/skeleton/skeleton', wither_skeleton: 'minecraft:entity/skeleton/wither_skeleton', zombie: 'minecraft:entity/zombie/zombie', creeper: 'minecraft:entity/creeper/creeper', dragon: 'minecraft:entity/enderdragon/dragon', piglin: 'minecraft:entity/piglin/piglin', player: 'minecraft:entity/player/wide/steve' } as Record<SkullVariant, string>)[skullVariant(id)];
}
function skullModel(id: string): SpecialModelDescriptor {
  const variant = skullVariant(id);
  if (variant === 'dragon') return dragonHeadModel;
  if (variant === 'piglin') return piglinHeadModel;
  return variant === 'player' ? playerSkullModel : skullModelDescriptor(variant);
}
function applySkullTransform(root: THREE.Group, block: PlacedBlock, wall: boolean): void {
  const direction = directionVector(block.state['facing']);
  if (wall) {
    root.position.set(.5 - direction.x * .25, .25, .5 - direction.z * .25);
    root.rotation.y = wallSkullRotation(block.state['facing']);
  } else {
    root.position.set(.5, 0, .5);
    root.rotation.y = Number.isInteger(Number(block.state['rotation'])) ? Number(block.state['rotation']) * Math.PI / 8 : 0;
  }
  root.scale.set(-1, -1, 1);
}
function directionVector(facing: string | undefined): { x: number; z: number } { return ({ north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } } as Record<string, { x: number; z: number }>)[facing ?? 'north'] ?? { x: 0, z: -1 }; }
function wallSkullRotation(facing: string | undefined): number { return ({ north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 } as Record<string, number>)[facing ?? 'north'] ?? 0; }
function skullModelDescriptor(variant: SkullVariant): SpecialModelDescriptor { return { id: `minecraft-java-${variant}-skull-1.21.1`, textureSize: [64, 32], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }] }] }; }
const playerSkullModel: SpecialModelDescriptor = { id: 'minecraft-java-player-skull-1.21.1', textureSize: [64, 64], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }, { id: 'hat', uv: [32, 0], from: [-4.5, -8.5, -4.5], size: [9, 9, 9] }] }] };
const dragonHeadModel: SpecialModelDescriptor = { id: 'minecraft-java-dragon-head-1.21.1', textureSize: [256, 256], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-8, -8, -8], size: [16, 16, 16] }, { id: 'jaw', uv: [0, 64], from: [-8, 0, -8], size: [16, 4, 16] }, { id: 'snout', uv: [64, 0], from: [-4, -4, -12], size: [8, 8, 4] }] }] };
const piglinHeadModel: SpecialModelDescriptor = { id: 'minecraft-java-piglin-head-1.21.1', textureSize: [64, 64], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-5, -8, -4], size: [10, 8, 8] }] }, { id: 'ears', cuboids: [{ id: 'left-ear', uv: [0, 16], from: [-8, -7, -2], size: [3, 4, 4] }, { id: 'right-ear', uv: [0, 24], from: [5, -7, -2], size: [3, 4, 4] }] }] };

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
  for (const part of descriptor.parts) root.add(createModelPart(part, descriptor.textureSize, texture));
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
  const group = new THREE.Group(); const [x, y, z] = cuboid.from; const [width, height, depth] = cuboid.size; const uv = modelPartCuboidUv(cuboid);
  // Vertices are model-space cuboid coordinates, converted to block-local
  // units once. The enclosing ModelPart applies its pivot matrix.
  const min: readonly [number, number, number] = [x / 16, y / 16, z / 16]; const max: readonly [number, number, number] = [(x + width) / 16, (y + height) / 16, (z + depth) / 16];
  for (const direction of ['north', 'south', 'east', 'west', 'up', 'down'] as const) {
    const geometry = specialFaceGeometry(min, max, direction, uv[direction], textureSize); const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ ...(texture ? { map: texture } : {}), color: texture ? 0xffffff : 0xaf3d35, transparent: true, alphaTest: .1, side: THREE.DoubleSide })); group.add(mesh);
  }
  return group;
}
function specialFaceGeometry(min: readonly [number, number, number], max: readonly [number, number, number], direction: 'north' | 'south' | 'east' | 'west' | 'up' | 'down', uv: readonly [number, number, number, number], textureSize: readonly [number, number]): THREE.BufferGeometry {
  const [x1, y1, z1] = min; const [x2, y2, z2] = max; const positions = specialFacePositions(direction, x1, y1, z1, x2, y2, z2).flat(); const [u1, v1, u2, v2] = uv; const [tw, th] = textureSize;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute([u1 / tw, 1 - v2 / th, u2 / tw, 1 - v2 / th, u2 / tw, 1 - v1 / th, u1 / tw, 1 - v1 / th], 2)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals(); return geometry;
}
function specialFacePositions(direction: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): readonly (readonly [number, number, number])[] { switch (direction) { case 'north': return [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]]; case 'south': return [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]]; case 'west': return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]]; case 'east': return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]]; case 'down': return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]]; default: return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]]; } }
type SignVariant = 'standing' | 'wall' | 'hanging' | 'wall-hanging';
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
function applyNormalSignTransform(root: THREE.Group, block: PlacedBlock, wall: boolean): void {
  root.position.set(.5, .5, .5);
  root.rotation.y = -signRotationRadians(block);
  root.scale.set(2 / 3, -2 / 3, -2 / 3);
  if (wall) applyLocalRendererTranslation(root, [0, -.3125, -.4375]);
}
function applyHangingSignTransform(root: THREE.Group, block: PlacedBlock): void {
  root.position.set(.5, .9375, .5);
  root.rotation.y = -signRotationRadians(block);
  root.scale.set(1, -1, -1);
  applyLocalRendererTranslation(root, [0, -.3125, 0]);
}
/** Mirrors a MatrixStack translate performed after renderer-facing rotation. */
function applyLocalRendererTranslation(root: THREE.Group, translation: readonly [number, number, number]): void {
  const content = new THREE.Group();
  content.position.set(...translation);
  while (root.children.length) content.add(root.children[0]);
  root.add(content);
}
function signRotationRadians(block: PlacedBlock): number {
  const rotation = Number(block.state['rotation']);
  if (Number.isInteger(rotation)) return rotation * Math.PI / 8;
  return signFacingRotation(block.state['facing']);
}
function signFacingRotation(facing: string | undefined): number {
  return ({ south: 0, west: Math.PI / 2, north: Math.PI, east: Math.PI * 1.5 } as Record<string, number>)[facing ?? 'north'] ?? Math.PI;
}
function addSignText(root: THREE.Group, block: PlacedBlock, variant: SignVariant): void {
  const data = block.blockEntityData as { front?: { lines?: readonly string[]; color?: string }; back?: { lines?: readonly string[]; color?: string } } | undefined;
  if (typeof document === 'undefined' || !data) return;
  const hanging = variant === 'hanging' || variant === 'wall-hanging';
  const offset = hanging ? { y: -.32, z: .073, scale: .9 } : { y: .33333334, z: .046666667, scale: 2 / 3 };
  addSignTextSide(root, data.front, offset, false);
  addSignTextSide(root, data.back, offset, true);
}
function addSignTextSide(root: THREE.Group, side: { lines?: readonly string[]; color?: string } | undefined, offset: { readonly y: number; readonly z: number; readonly scale: number }, back: boolean): void {
  if (!side) return;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d'); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = side.color === 'black' ? '#181818' : side.color ?? '#181818'; context.font = '20px sans-serif'; context.textAlign = 'center';
  for (let index = 0; index < 4; index++) context.fillText(side.lines?.[index] ?? '', 128, 27 + index * 25);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.userData['ownedSignTexture'] = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.68 * offset.scale, .34 * offset.scale), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(0, offset.y, back ? -offset.z : offset.z); if (back) mesh.rotation.y = Math.PI; root.add(mesh);
}
