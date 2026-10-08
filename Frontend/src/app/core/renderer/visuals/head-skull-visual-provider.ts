import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type { SpecialBlockVisualAdapter, SpecialVisualContext } from './special-visual-contracts';
import type { SpecialModelDescriptor } from './special-model-descriptor';

type SkullVariant = 'skeleton' | 'wither_skeleton' | 'zombie' | 'creeper' | 'dragon' | 'piglin' | 'player';

const HEAD_IDS = new Set([
  'minecraft:creeper_head', 'minecraft:creeper_wall_head', 'minecraft:dragon_head', 'minecraft:dragon_wall_head',
  'minecraft:piglin_head', 'minecraft:piglin_wall_head', 'minecraft:player_head', 'minecraft:player_wall_head',
  'minecraft:skeleton_skull', 'minecraft:skeleton_wall_skull', 'minecraft:wither_skeleton_skull', 'minecraft:wither_skeleton_wall_skull',
  'minecraft:zombie_head', 'minecraft:zombie_wall_head',
]);

/** Verified vanilla head/skull model, texture, and placement transforms. */
export class HeadSkullVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'heads-skulls';

  matches(block: PlacedBlock): boolean { return HEAD_IDS.has(block.id); }

  matchesItemVisual(itemId: string, components?: Readonly<Record<string, unknown>>): boolean {
    const block: PlacedBlock = {
      kind: 'resolved', id: itemId, namespace: itemId.split(':')[0] ?? 'minecraft',
      position: { x: 0, y: 0, z: 0 }, state: { rotation: '0' },
    };
    if (!this.matches(block)) return false;
    const resource = this.textureResource(block) ?? '';
    return !(resource.includes('/player/') && hasProfileComponent(components));
  }

  textureResource(block: PlacedBlock): string { return skullTexture(block.id); }

  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const descriptor = skullModel(block.id);
    const root = createSpecialModel(descriptor, context?.texture);
    const wall = block.id.endsWith('_wall_head') || block.id.endsWith('_wall_skull');
    applySkullTransform(root, block, wall);
    root.userData['specialModel'] = descriptor.id;
    root.userData['skullVariant'] = skullVariant(block.id);
    return root;
  }
}

function hasProfileComponent(components: Readonly<Record<string, unknown>> | undefined): boolean {
  return !!components && Object.keys(components).some((key) => key === 'minecraft:profile' || key.endsWith(':profile') || key === 'profile');
}

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
  return ({
    skeleton: 'minecraft:entity/skeleton/skeleton',
    wither_skeleton: 'minecraft:entity/skeleton/wither_skeleton',
    zombie: 'minecraft:entity/zombie/zombie',
    creeper: 'minecraft:entity/creeper/creeper',
    dragon: 'minecraft:entity/enderdragon/dragon',
    piglin: 'minecraft:entity/piglin/piglin',
    player: 'minecraft:entity/player/slim/steve',
  } as Record<SkullVariant, string>)[skullVariant(id)];
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
  rotation.rotation.y = wall
    ? wallSkullRotation(block.state['facing'])
    : Number.isInteger(Number(block.state['rotation'])) ? Number(block.state['rotation']) * Math.PI / 8 : 0;
  while (root.children.length) rotation.add(root.children[0]);
  const scale = new THREE.Group();
  scale.scale.set(-1, -1, 1);
  scale.add(rotation);
  root.add(scale);
  root.position.set(wall ? .5 - direction.x * .25 : .5, wall ? .25 : 0, wall ? .5 - direction.z * .25 : .5);
}

function directionVector(facing: string | undefined): { x: number; z: number } {
  return ({ north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } } as Record<string, { x: number; z: number }>)[facing ?? 'north'] ?? { x: 0, z: -1 };
}

function wallSkullRotation(facing: string | undefined): number {
  return ({ north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 } as Record<string, number>)[facing ?? 'north'] ?? 0;
}

function skullModelDescriptor(variant: SkullVariant): SpecialModelDescriptor {
  return { id: `minecraft-java-${variant}-skull-1.21.1`, textureSize: [64, 32], parts: [{ id: 'head', cuboids: [{ id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }] }] };
}

function humanSkullModel(variant: 'player' | 'zombie'): SpecialModelDescriptor {
  return { id: `minecraft-java-${variant}-skull-1.21.1`, textureSize: [64, 64], parts: [{ id: 'head', cuboids: [
    { id: 'head', uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] },
    { id: 'hat', uv: [32, 0], from: [-4, -8, -4], size: [8, 8, 8], dilation: .25 },
  ] }] };
}

const dragonHeadModel: SpecialModelDescriptor = {
  id: 'minecraft-java-dragon-head-1.21.1', textureSize: [256, 256],
  localTransform: { translation: [0, -.374375, 0], scale: [.75, .75, .75] },
  parts: [{ id: 'head', cuboids: [
    { id: 'upper_lip', uv: [176, 44], from: [-6, -1, -24], size: [12, 5, 16] },
    { id: 'upper_head', uv: [112, 30], from: [-8, -8, -10], size: [16, 16, 16] },
    { id: 'left_scale', uv: [0, 0], from: [-5, -12, -4], size: [2, 4, 6], mirror: true },
    { id: 'left_nostril', uv: [112, 0], from: [-5, -3, -22], size: [2, 2, 4] },
    { id: 'right_scale', uv: [0, 0], from: [3, -12, -4], size: [2, 4, 6] },
    { id: 'right_nostril', uv: [112, 0], from: [3, -3, -22], size: [2, 2, 4] },
  ], children: [{ id: 'jaw', pivot: [0, 4, -8], applyPivot: true, rotation: [11.459156, 0, 0], cuboids: [{ id: 'jaw', uv: [176, 65], from: [-6, 0, -16], size: [12, 4, 16] }] }] }],
};

const piglinHeadModel: SpecialModelDescriptor = {
  id: 'minecraft-java-piglin-head-1.21.1', textureSize: [64, 64], parts: [
    { id: 'head', cuboids: [
      { id: 'head', uv: [0, 0], from: [-5, -8, -4], size: [10, 8, 8] },
      { id: 'snout', uv: [31, 1], from: [-2, -4, -5], size: [4, 4, 1] },
      { id: 'right_nostril', uv: [2, 4], from: [2, -2, -5], size: [1, 2, 1] },
      { id: 'left_nostril', uv: [2, 0], from: [-3, -2, -5], size: [1, 2, 1] },
    ] },
    { id: 'left_ear', pivot: [4.5, -6, 0], applyPivot: true, rotation: [0, 0, -30], cuboids: [{ id: 'left_ear', uv: [51, 6], from: [0, 0, -2], size: [1, 5, 4] }] },
    { id: 'right_ear', pivot: [-4.5, -6, 0], applyPivot: true, rotation: [0, 0, 30], cuboids: [{ id: 'right_ear', uv: [39, 6], from: [-1, 0, -2], size: [1, 5, 4] }] },
  ],
};
