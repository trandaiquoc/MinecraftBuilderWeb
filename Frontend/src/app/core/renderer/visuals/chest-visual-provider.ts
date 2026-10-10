import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type { SpecialBlockVisualAdapter, SpecialVisualContext } from './special-visual-contracts';
import type { SpecialModelDescriptor } from './special-model-descriptor';

const CHEST_IDS = new Set(['minecraft:chest', 'minecraft:trapped_chest', 'minecraft:ender_chest']);

/** Static closed-container ModelPart visuals selected from vanilla chest state. */
export class ChestVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'chests';
  readonly staticBatchable = true;

  matches(block: PlacedBlock): boolean {
    return CHEST_IDS.has(block.id);
  }
  textureResource(block: PlacedBlock): string {
    return chestTextureResource(block);
  }

  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const model = chestModelFor(block);
    const root = createSpecialModel(model, context?.texture);
    const orientation = new THREE.Group();
    orientation.position.set(0.5, 0.5, 0.5);
    orientation.rotation.y = -chestRotationRadians(block.state['facing']);
    const content = new THREE.Group();
    content.position.set(-0.5, -0.5, -0.5);
    while (root.children.length) content.add(root.children[0]);
    orientation.add(content);
    root.add(orientation);
    root.userData['specialModel'] = model.id;
    root.userData['chestType'] =
      block.id === 'minecraft:ender_chest' ? 'single' : (block.state['type'] ?? 'single');
    root.userData['chestTexture'] = chestTextureResource(block);
    return root;
  }
}

const chestSingleModel: SpecialModelDescriptor = {
  id: 'minecraft-java-chest-single-1.21.1',
  textureSize: [64, 64],
  parts: [
    { id: 'bottom', cuboids: [{ id: 'bottom', uv: [0, 19], from: [1, 0, 1], size: [14, 10, 14] }] },
    {
      id: 'lid',
      pivot: [0, 9, 1],
      applyPivot: true,
      cuboids: [{ id: 'lid', uv: [0, 0], from: [1, 0, 0], size: [14, 5, 14] }],
    },
    {
      id: 'lock',
      pivot: [0, 9, 1],
      applyPivot: true,
      cuboids: [{ id: 'lock', uv: [0, 0], from: [7, -2, 14], size: [2, 4, 1] }],
    },
  ],
};
const chestRightModel: SpecialModelDescriptor = {
  id: 'minecraft-java-chest-right-1.21.1',
  textureSize: [64, 64],
  parts: [
    { id: 'bottom', cuboids: [{ id: 'bottom', uv: [0, 19], from: [1, 0, 1], size: [15, 10, 14] }] },
    {
      id: 'lid',
      pivot: [0, 9, 1],
      applyPivot: true,
      cuboids: [{ id: 'lid', uv: [0, 0], from: [1, 0, 0], size: [15, 5, 14] }],
    },
    {
      id: 'lock',
      pivot: [0, 9, 1],
      applyPivot: true,
      cuboids: [{ id: 'lock', uv: [0, 0], from: [15, -2, 14], size: [1, 4, 1] }],
    },
  ],
};
const chestLeftModel: SpecialModelDescriptor = {
  id: 'minecraft-java-chest-left-1.21.1',
  textureSize: [64, 64],
  parts: [
    { id: 'bottom', cuboids: [{ id: 'bottom', uv: [0, 19], from: [0, 0, 1], size: [15, 10, 14] }] },
    {
      id: 'lid',
      pivot: [0, 9, 1],
      applyPivot: true,
      cuboids: [{ id: 'lid', uv: [0, 0], from: [0, 0, 0], size: [15, 5, 14] }],
    },
    {
      id: 'lock',
      pivot: [0, 9, 1],
      applyPivot: true,
      cuboids: [{ id: 'lock', uv: [0, 0], from: [0, -2, 14], size: [1, 4, 1] }],
    },
  ],
};

export function chestModelFor(block: PlacedBlock): SpecialModelDescriptor {
  if (block.id === 'minecraft:ender_chest') return chestSingleModel;
  return block.state['type'] === 'left'
    ? chestLeftModel
    : block.state['type'] === 'right'
      ? chestRightModel
      : chestSingleModel;
}

export function chestTextureResource(block: PlacedBlock): string {
  if (block.id === 'minecraft:ender_chest') return 'minecraft:entity/chest/ender';
  const base = block.id === 'minecraft:trapped_chest' ? 'trapped' : 'normal';
  const suffix =
    block.state['type'] === 'left' ? '_left' : block.state['type'] === 'right' ? '_right' : '';
  return `minecraft:entity/chest/${base}${suffix}`;
}

export function chestRotationRadians(facing: string | undefined): number {
  return (
    (
      { south: 0, west: Math.PI / 2, north: Math.PI, east: Math.PI * 1.5 } as Record<string, number>
    )[facing ?? 'north'] ?? Math.PI
  );
}
