import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { SpecialBlockVisualAdapter } from './special-visual-contracts';

/** Diagnostic fallback for vanilla barrels when usable generic JSON is unavailable. */
export class BarrelFallbackVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'containers';
  readonly staticBatchable = true;

  matches(block: PlacedBlock): boolean {
    return (
      block.namespace === 'minecraft' &&
      /(?:^|_)barrel$/.test(block.id.split(':').at(-1) ?? block.id)
    );
  }

  create(): THREE.Group {
    const root = new THREE.Group();
    root.userData['visualFallback'] = 'diagnostic';
    root.userData['fallbackReason'] = 'BARREL_GENERIC_RESOURCE_UNAVAILABLE';
    addBox(root, [0.92, 0.58, 0.92], [0.5, 0.29, 0.5], 0x8c6035);
    addBox(root, [0.94, 0.12, 0.94], [0.5, 0.64, 0.5], 0xc28a47);
    return root;
  }
}

function addBox(
  root: THREE.Group,
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  color: number,
): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.98 }),
  );
  mesh.position.set(...at);
  root.add(mesh);
}
