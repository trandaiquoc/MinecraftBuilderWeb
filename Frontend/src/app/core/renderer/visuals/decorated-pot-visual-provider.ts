import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type { SpecialBlockVisualAdapter, SpecialVisualContext } from './special-visual-contracts';
import type { SpecialModelDescriptor } from './special-model-descriptor';

const sherdAssets: Readonly<Record<string, string>> = {
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
const sides = ['back', 'left', 'right', 'front'] as const;
type DecoratedPotSide = (typeof sides)[number];

/** Decorated Pot ModelPart sides and sherd/block-entity texture resolution. */
export class DecoratedPotVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'decorated-pots';
  readonly overrideGeneric = true;

  matches(block: PlacedBlock): boolean {
    return block.namespace === 'minecraft' && block.id === 'minecraft:decorated_pot';
  }
  textureResource(): string {
    return 'minecraft:entity/decorated_pot/decorated_pot_base';
  }

  textureResources(block: PlacedBlock): Readonly<Record<string, string>> {
    const data =
      block.blockEntityData && typeof block.blockEntityData === 'object'
        ? (block.blockEntityData as { decorations?: Partial<Record<DecoratedPotSide, string>> })
        : undefined;
    const decorations = data?.decorations;
    return {
      base: this.textureResource(),
      back: decoratedPotSideTexture(decorations?.back),
      left: decoratedPotSideTexture(decorations?.left),
      right: decoratedPotSideTexture(decorations?.right),
      front: decoratedPotSideTexture(decorations?.front),
    };
  }

  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const root = new THREE.Group();
    root.position.set(0.5, 0, 0.5);
    root.rotation.y = decoratedPotRootRotationRadians(block.state['facing']);
    const content = new THREE.Group();
    content.position.set(-0.5, 0, -0.5);
    content.add(
      createSpecialModel(decoratedPotBaseModel, context?.textures?.['base'] ?? context?.texture),
    );
    for (const side of sides)
      content.add(createSpecialModel(decoratedPotSideModels[side], context?.textures?.[side]));
    root.add(content);
    root.userData['specialModel'] = 'minecraft-java-decorated-pot-1.21.1';
    root.userData['decoratedPotFacing'] = block.state['facing'] ?? 'north';
    return root;
  }
}

function decoratedPotSideTexture(sherd: string | undefined): string {
  return `minecraft:entity/decorated_pot/${sherdAssets[sherd ?? 'minecraft:brick'] ?? 'decorated_pot_side'}`;
}

export function decoratedPotSherdTextureResource(sherd: string | undefined): string {
  return decoratedPotSideTexture(sherd);
}
export function decoratedPotRootRotationRadians(facing: string | undefined): number {
  return (
    ({ north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 } as Record<string, number>)[
      facing ?? 'north'
    ] ?? 0
  );
}

export const decoratedPotBaseModel: SpecialModelDescriptor = {
  id: 'minecraft-java-decorated-pot-base-1.21.1',
  textureSize: [32, 32],
  parts: [
    {
      id: 'neck',
      pivot: [0, 37, 16],
      applyPivot: true,
      rotation: [180, 0, 0],
      cuboids: [
        { id: 'neck', uv: [0, 0], from: [4, 17, 4], size: [8, 3, 8], dilation: -0.1 },
        { id: 'neck-lip', uv: [0, 5], from: [5, 20, 5], size: [6, 1, 6], dilation: 0.2 },
      ],
    },
    {
      id: 'top',
      pivot: [1, 16, 1],
      applyPivot: true,
      cuboids: [{ id: 'top', uv: [-14, 13], from: [0, 0, 0], size: [14, 0, 14] }],
    },
    {
      id: 'bottom',
      pivot: [1, 0, 1],
      applyPivot: true,
      cuboids: [{ id: 'bottom', uv: [-14, 13], from: [0, 0, 0], size: [14, 0, 14] }],
    },
  ],
};

export const decoratedPotSideModels: Readonly<Record<DecoratedPotSide, SpecialModelDescriptor>> = {
  back: decoratedPotSideModel('back', [15, 16, 1], [0, 0, 180]),
  left: decoratedPotSideModel('left', [1, 16, 1], [0, -90, 180]),
  right: decoratedPotSideModel('right', [15, 16, 15], [0, 90, 180]),
  front: decoratedPotSideModel('front', [1, 16, 15], [180, 0, 0]),
};

function decoratedPotSideModel(
  side: DecoratedPotSide,
  pivot: readonly [number, number, number],
  rotation: readonly [number, number, number],
): SpecialModelDescriptor {
  return {
    id: `minecraft-java-decorated-pot-${side}-1.21.1`,
    textureSize: [16, 16],
    parts: [
      {
        id: side,
        pivot,
        applyPivot: true,
        rotation,
        cuboids: [
          { id: `${side}-plane`, uv: [1, 0], from: [0, 0, 0], size: [14, 16, 0], faces: ['north'] },
        ],
      },
    ],
  };
}
