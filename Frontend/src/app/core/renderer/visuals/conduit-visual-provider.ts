import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import { createSpecialModel } from './special-model-geometry';
import type { SpecialBlockVisualAdapter, SpecialVisualContext } from './special-visual-contracts';
import type { SpecialModelDescriptor } from './special-model-descriptor';

/** Vanilla conduit fallback model and inactive-state presentation. */
export class ConduitVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'conduits';
  readonly staticBatchable = true;
  readonly overrideGeneric = true;

  matches(block: PlacedBlock): boolean { return block.namespace === 'minecraft' && block.id === 'minecraft:conduit'; }
  textureResource(): string { return 'minecraft:entity/conduit/base'; }

  create(_block: PlacedBlock, context?: SpecialVisualContext): THREE.Group {
    const root = new THREE.Group();
    root.position.set(.5, .5, .5);
    root.add(createSpecialModel(conduitInactiveModel, context?.texture));
    root.userData['specialModel'] = conduitInactiveModel.id;
    root.userData['conduitState'] = 'inactive';
    return root;
  }
}

export const conduitInactiveModel: SpecialModelDescriptor = {
  id: 'minecraft-java-conduit-inactive-1.21.1', textureSize: [32, 16],
  parts: [{ id: 'shell', cuboids: [{ id: 'shell', uv: [0, 0], from: [-3, -3, -3], size: [6, 6, 6] }] }],
};
