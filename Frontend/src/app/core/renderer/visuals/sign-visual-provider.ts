import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type { SpecialModelDescriptor } from './special-model-descriptor';
import type { NormalizedSpecialVisualDescriptor, SpecialBlockVisualAdapter, SpecialVisualContext } from './special-visual-contracts';

export type SignVariant = 'standing' | 'wall' | 'hanging' | 'wall-hanging';

export interface SignTextLayout {
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly lineHeight: number;
  readonly maxWidth: number;
}

export function signTextLayout(variant: SignVariant): SignTextLayout {
  return variant === 'hanging' || variant === 'wall-hanging'
    ? { y: -.32, z: .073, scale: .9, lineHeight: 9, maxWidth: 60 }
    : { y: .33333334, z: .046666667, scale: 2 / 3, lineHeight: 10, maxWidth: 90 };
}

/** Java sign model parts, orientation, and block-entity text presentation. */
export class SignVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'signs';

  matches(block: PlacedBlock): boolean {
    return block.namespace === 'minecraft' && signVariant(block.id) !== undefined;
  }

  textureResource(block: PlacedBlock): string | undefined {
    const wood = signWood(block.id);
    const variant = signVariant(block.id);
    return wood && variant ? `minecraft:entity/signs/${variant.includes('hanging') ? 'hanging/' : ''}${wood}` : undefined;
  }

  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const variant = signVariant(block.id);
    return variant ? createSignVisual(block, variant, context) : new THREE.Group();
  }
}

/** Builds the same Java sign visual from verified external sign descriptors. */
export function createCommonSignAdapter(descriptor: NormalizedSpecialVisualDescriptor): SpecialBlockVisualAdapter | undefined {
  if (descriptor.contractId !== 'common-sign') return undefined;
  const texture = descriptor.resources['default'] ?? descriptor.resources['front'];
  if (!texture) return undefined;

  return {
    family: 'signs',
    matches: (block) => block.id === descriptor.contentId && (descriptor.variant !== undefined || descriptor.stateDependencies.every((property) => block.state[property] !== undefined)),
    textureResource: () => texture,
    create: (block, context) => {
      const variant = descriptor.variant ?? (block.state['facing'] !== undefined && block.state['rotation'] === undefined ? 'wall' : 'standing');
      return createSignVisual(descriptor.variant ? withSignDefaults(block, variant) : block, variant, context, 'minecraftbuilder:common-sign-descriptor');
    },
  };
}

function createSignVisual(block: PlacedBlock, variant: SignVariant, context?: SpecialVisualContext, providerId = 'minecraft-java-sign-1.21.1-modelpart'): THREE.Group {
  const wall = variant === 'wall' || variant === 'wall-hanging';
  const model = variant === 'standing' || variant === 'wall'
    ? normalSignModel(variant === 'standing')
    : hangingSignModel(variant, block.state['attached'] === 'true');
  const root = new THREE.Group();
  const modelRoot = createSpecialModel(model, context?.texture);
  const modelBranch = new THREE.Group();
  while (modelRoot.children.length) modelBranch.add(modelRoot.children[0]);
  const placement = new THREE.Group();
  placement.add(modelBranch, addSignText(block, variant));
  root.add(placement);
  if (variant === 'hanging' || variant === 'wall-hanging') applyHangingSignTransform(root, modelBranch, block);
  else applyNormalSignTransform(root, placement, modelBranch, block, wall);
  root.userData['specialModel'] = model.id;
  root.userData['providerId'] = providerId;
  root.userData['signVariant'] = variant;
  return root;
}

function withSignDefaults(block: PlacedBlock, variant: SignVariant): PlacedBlock {
  const state = { ...block.state };
  if (variant === 'standing' || variant === 'hanging') state['rotation'] ??= '0';
  else state['facing'] ??= 'north';
  if (variant === 'hanging') state['attached'] ??= 'false';
  state['waterlogged'] ??= 'false';
  return { ...block, state };
}

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
  return wood && /^[a-z0-9_]+$/.test(wood) ? wood : undefined;
}

function normalSignModel(showStick: boolean): SpecialModelDescriptor {
  return {
    id: `minecraft-java-normal-sign-1.21.1-${showStick ? 'standing' : 'wall'}`,
    textureSize: [64, 32],
    parts: [
      { id: 'sign', cuboids: [{ id: 'board', uv: [0, 0], from: [-12, -14, -1], size: [24, 12, 2] }] },
      { id: 'stick', visible: showStick, cuboids: [{ id: 'stick', uv: [0, 14], from: [-1, -2, -1], size: [2, 14, 2] }] },
    ],
  };
}

function hangingSignModel(variant: 'hanging' | 'wall-hanging', attached: boolean): SpecialModelDescriptor {
  const wall = variant === 'wall-hanging';
  return {
    id: `minecraft-java-hanging-sign-1.21.1-${variant}-${attached ? 'attached' : 'chains'}`,
    textureSize: [64, 32],
    parts: [
      { id: 'board', cuboids: [{ id: 'board', uv: [0, 12], from: [-7, 0, -1], size: [14, 10, 2] }] },
      { id: 'plank', visible: wall, cuboids: [{ id: 'plank', uv: [0, 0], from: [-8, -6, -2], size: [16, 2, 4] }] },
      {
        id: 'normal-chains',
        visible: wall || !attached,
        cuboids: [],
        children: [
          { id: 'left-one', pivot: [-5, -6, 0], applyPivot: true, rotation: [0, -45, 0], cuboids: [{ id: 'chain-l1', uv: [0, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
          { id: 'left-two', pivot: [-5, -6, 0], applyPivot: true, rotation: [0, 45, 0], cuboids: [{ id: 'chain-l2', uv: [6, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
          { id: 'right-one', pivot: [5, -6, 0], applyPivot: true, rotation: [0, -45, 0], cuboids: [{ id: 'chain-r1', uv: [0, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
          { id: 'right-two', pivot: [5, -6, 0], applyPivot: true, rotation: [0, 45, 0], cuboids: [{ id: 'chain-r2', uv: [6, 6], from: [-1.5, 0, 0], size: [3, 6, 0] }] },
        ],
      },
      { id: 'v-chains', visible: !wall && attached, cuboids: [{ id: 'v-chains', uv: [14, 6], from: [-6, -6, 0], size: [12, 6, 0] }] },
    ],
  };
}

function applyNormalSignTransform(root: THREE.Group, placement: THREE.Group, modelBranch: THREE.Group, block: PlacedBlock, wall: boolean): void {
  root.position.set(.5, .5, .5);
  root.rotation.y = -signRotationRadians(block);
  modelBranch.scale.set(2 / 3, -2 / 3, -2 / 3);
  if (wall) {
    // Center the board's support edge on the adjacent voxel face for every facing.
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

function addSignTextSide(
  root: THREE.Group,
  side: { lines?: readonly string[]; color?: string; glowing?: boolean } | undefined,
  offset: SignTextLayout,
  back: boolean,
  sideName: 'front' | 'back',
): void {
  const sideBranch = new THREE.Group();
  sideBranch.name = `${sideName}TextSide`;
  sideBranch.userData['signTextSide'] = sideName;
  if (back) sideBranch.rotation.y = Math.PI;
  const textOffset = new THREE.Group();
  textOffset.name = `${sideName}TextOffset`;
  textOffset.position.set(0, offset.y, offset.z);
  textOffset.userData['signTextOffset'] = [0, offset.y, offset.z];
  const textScale = new THREE.Group();
  textScale.name = `${sideName}TextScale`;
  const worldScale = .015625 * offset.scale;
  textScale.scale.set(worldScale, -worldScale, worldScale);
  textScale.userData['signTextScale'] = worldScale;
  sideBranch.add(textOffset);
  textOffset.add(textScale);
  root.add(sideBranch);
  if (typeof document === 'undefined' || !side) return;

  const pixelsPerUnit = 8;
  const canvas = document.createElement('canvas');
  canvas.width = offset.maxWidth * pixelsPerUnit;
  canvas.height = offset.lineHeight * 4 * pixelsPerUnit;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = signTextColor(side.color, side.glowing === true);
  context.font = `${Math.max(12, offset.lineHeight * pixelsPerUnit * .75)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < 4; index++) context.fillText(side.lines?.[index] ?? '', canvas.width / 2, (index + .5) * offset.lineHeight * pixelsPerUnit);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData['ownedSignTexture'] = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(offset.maxWidth, offset.lineHeight * 4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.name = `${sideName}SignText`;
  mesh.userData['signTextSide'] = sideName;
  textScale.add(mesh);
}

function signTextColor(color: string | undefined, glowing: boolean): string {
  const palette: Readonly<Record<string, string>> = { white: '#f9fffe', orange: '#f9801d', magenta: '#c74ebd', light_blue: '#3ab3da', yellow: '#fed83d', lime: '#80c71f', pink: '#f38baa', gray: '#474f52', light_gray: '#9d9d97', cyan: '#169c9c', purple: '#8932b8', blue: '#3c44aa', brown: '#835432', green: '#5e7c16', red: '#b02e26', black: '#181818' };
  const value = palette[color ?? 'black'] ?? palette['black'];
  if (!glowing) return value;
  const glowPalette: Readonly<Record<string, string>> = { white: '#ffffff', orange: '#ffb25c', magenta: '#f09be8', light_blue: '#8fe5ff', yellow: '#fff4a3', lime: '#c8ff62', pink: '#ffc2d8', gray: '#aab3b6', light_gray: '#e6e6de', cyan: '#69eeee', purple: '#d78aff', blue: '#8d96ff', brown: '#d6a36e', green: '#a8d65e', red: '#ff7770', black: '#777777' };
  return glowPalette[color ?? 'black'] ?? value;
}
