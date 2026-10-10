import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type { SpecialBlockVisualAdapter, SpecialVisualContext } from './special-visual-contracts';
import type { SpecialModelDescriptor } from './special-model-descriptor';

/** Closed vanilla Shulker Box model and six-direction orientation. */
export class ShulkerBoxVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'shulker-boxes';
  readonly staticBatchable = true;

  matches(block: PlacedBlock): boolean {
    return (
      block.namespace === 'minecraft' &&
      (block.id === 'minecraft:shulker_box' || block.id.endsWith('_shulker_box'))
    );
  }

  textureResource(block: PlacedBlock): string {
    return shulkerTextureResource(block);
  }

  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const root = createSpecialModel(shulkerModel, context?.texture);
    const translation = new THREE.Group();
    translation.position.set(0.5, 0.5, 0.5);
    const inset = new THREE.Group();
    inset.scale.setScalar(0.9995);
    const direction = new THREE.Group();
    direction.quaternion.copy(shulkerFacingQuaternion(block.state['facing']));
    const flip = new THREE.Group();
    flip.scale.set(1, -1, -1);
    const localTranslation = new THREE.Group();
    localTranslation.position.set(0, -1, 0);
    while (root.children.length) localTranslation.add(root.children[0]);
    flip.add(localTranslation);
    direction.add(flip);
    inset.add(direction);
    translation.add(inset);
    root.add(translation);
    root.userData['specialModel'] = shulkerModel.id;
    root.userData['shulkerFacing'] = block.state['facing'] ?? 'up';
    root.userData['shulkerTexture'] = shulkerTextureResource(block);
    return root;
  }
}

const shulkerModel: SpecialModelDescriptor = {
  id: 'minecraft-java-shulker-box-1.21.1',
  textureSize: [64, 64],
  parts: [
    {
      id: 'base',
      pivot: [0, 24, 0],
      applyPivot: true,
      cuboids: [{ id: 'base', uv: [0, 28], from: [-8, -8, -8], size: [16, 8, 16] }],
    },
    {
      id: 'lid',
      pivot: [0, 24, 0],
      applyPivot: true,
      cuboids: [{ id: 'lid', uv: [0, 0], from: [-8, -16, -8], size: [16, 12, 16] }],
    },
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
