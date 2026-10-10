import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type {
  BedVisualDescriptor,
  SpecialBlockVisualAdapter,
  SpecialVisualContext,
} from './special-visual-contracts';
import type { SpecialModelDescriptor } from './special-model-descriptor';

/** Static Java bed ModelPart visuals and descriptor selection. */
export class BedVisualProvider implements SpecialBlockVisualAdapter {
  readonly staticBatchable = true;
  readonly family = 'beds';
  private readonly descriptors: BedVisualDescriptor[];

  constructor(descriptors: readonly BedVisualDescriptor[] = [vanillaBedDescriptor]) {
    this.descriptors = [...descriptors];
  }

  register(descriptor: BedVisualDescriptor): void {
    this.descriptors.push(descriptor);
  }
  matches(block: PlacedBlock): boolean {
    return !!this.resolve(block);
  }
  textureResource(block: PlacedBlock): string | undefined {
    return this.resolve(block)?.textureResource(block);
  }

  create(block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const descriptor = this.resolve(block);
    if (!descriptor) return new THREE.Group();
    const model = descriptor.model(block);
    if (!model) return new THREE.Group();
    const root = createSpecialModel(model, context?.texture);
    descriptor.transform(block, root);
    root.userData['specialModel'] = model.id;
    root.userData['providerId'] = descriptor.metadata.providerId;
    return root;
  }

  private resolve(block: PlacedBlock): BedVisualDescriptor | undefined {
    return this.descriptors
      .filter(
        (descriptor) =>
          descriptor.metadata.namespace === block.namespace && descriptor.matches(block),
      )
      .sort((left, right) => right.metadata.priority - left.metadata.priority)[0];
  }
}

const CLASSIC_BED_COLORS = new Set([
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
]);

const vanillaBedDescriptor: BedVisualDescriptor = {
  metadata: {
    providerId: 'minecraft-java-bed-common',
    gameEdition: 'java',
    gameVersion: 'common',
    namespace: 'minecraft',
    family: 'bed',
    priority: 100,
  },
  matches: (block) =>
    block.namespace === 'minecraft' &&
    CLASSIC_BED_COLORS.has(bedColor(block.id)) &&
    block.id.endsWith('_bed'),
  textureResource: (block) => `minecraft:entity/bed/${bedColor(block.id)}`,
  model: (block) => (block.state['part'] === 'head' ? vanillaBedHead : vanillaBedFoot),
  transform: (block, root) => applyBedTransform(root, block.state['facing']),
};

const vanillaBedHead: SpecialModelDescriptor = {
  id: 'minecraft-java-bed-head-1.21.1',
  textureSize: [64, 64],
  parts: [
    { id: 'main', cuboids: [{ id: 'main', uv: [0, 0], from: [0, 0, 0], size: [16, 16, 6] }] },
    {
      id: 'left_leg',
      pivot: [0, 6, 0],
      rotation: [90, 0, 90],
      cuboids: [{ id: 'left_leg', uv: [50, 6], from: [0, 6, 0], size: [3, 3, 3] }],
    },
    {
      id: 'right_leg',
      pivot: [0, 6, 0],
      rotation: [90, 0, 180],
      cuboids: [{ id: 'right_leg', uv: [50, 18], from: [-16, 6, 0], size: [3, 3, 3] }],
    },
  ],
};

const vanillaBedFoot: SpecialModelDescriptor = {
  id: 'minecraft-java-bed-foot-1.21.1',
  textureSize: [64, 64],
  parts: [
    { id: 'main', cuboids: [{ id: 'main', uv: [0, 22], from: [0, 0, 0], size: [16, 16, 6] }] },
    {
      id: 'left_leg',
      pivot: [0, 6, 0],
      rotation: [90, 0, 0],
      cuboids: [{ id: 'left_leg', uv: [50, 0], from: [0, 6, -16], size: [3, 3, 3] }],
    },
    {
      id: 'right_leg',
      pivot: [0, 6, 0],
      rotation: [90, 0, 270],
      cuboids: [{ id: 'right_leg', uv: [50, 12], from: [-16, 6, -16], size: [3, 3, 3] }],
    },
  ],
};

function applyBedTransform(root: THREE.Group, facing: string | undefined): void {
  // Keep the adapter root identity-transform so static and direct rendering share matrices.
  const placement = new THREE.Group();
  placement.position.set(0, 0.5625, 0);
  placement.rotation.x = Math.PI / 2;
  const orientation = new THREE.Group();
  orientation.position.set(0.5, 0.5, 0.5);
  orientation.rotation.z = THREE.MathUtils.degToRad(180 + directionRotation(facing));
  const content = new THREE.Group();
  content.position.set(-0.5, -0.5, -0.5);
  while (root.children.length) content.add(root.children[0]);
  orientation.add(content);
  placement.add(orientation);
  root.add(placement);
  root.userData['bedGeometry'] = 'minecraft-java-bed-1.21.1-modelpart';
  root.userData['bedWorldFootOffset'] = 0;
}

function bedColor(id: string): string {
  return (id.split(':').at(-1) ?? 'red_bed').replace(/_bed$/, '') || 'red';
}
function directionRotation(facing: string | undefined): number {
  return (
    ({ south: 0, west: 90, north: 180, east: 270 } as Record<string, number>)[facing ?? 'north'] ??
    180
  );
}
