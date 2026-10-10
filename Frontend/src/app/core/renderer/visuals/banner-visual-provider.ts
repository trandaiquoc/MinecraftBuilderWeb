import * as THREE from 'three';
import type { PlacedBlock } from '../../domain/project.types';
import type { SpecialBlockVisualAdapter } from './special-visual-contracts';

/** Static banner fallback visuals for vanilla standing and wall banners. */
export class BannerVisualProvider implements SpecialBlockVisualAdapter {
  readonly family = 'banners';
  readonly staticBatchable = true;

  matches(block: PlacedBlock): boolean {
    return block.namespace === 'minecraft' && block.id.endsWith('_banner');
  }

  create(block: PlacedBlock): THREE.Group {
    const root = new THREE.Group();
    const color = bannerColor(block.id);
    const wall = block.id.endsWith('_wall_banner');
    if (!wall) {
      addBox(root, [0.62, 0.92, 0.05], [0.5, 0.57, 0.5], color);
      addBox(root, [0.07, 0.2, 0.07], [0.5, 0.1, 0.5], 0x55514b);
      return root;
    }

    const orientation = new THREE.Group();
    orientation.position.set(0.5, 0, 0.5);
    orientation.rotation.y = wallFacingRotation(block.state['facing']);
    addBox(orientation, [0.62, 0.92, 0.05], [0, 0.57, 0.465], color);
    addBox(orientation, [0.07, 0.2, 0.07], [0, 0.1, 0.465], 0x55514b);
    root.add(orientation);
    root.userData['wallFacing'] = block.state['facing'] ?? 'north';
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

function bannerColor(id: string): number {
  const name = id.split(':').at(-1) ?? '';
  const colors: Readonly<Record<string, number>> = {
    red: 0xb83832,
    blue: 0x3f61b7,
    green: 0x4f8c4e,
    black: 0x252525,
    white: 0xe8e6df,
    yellow: 0xd6b432,
    purple: 0x744a9c,
    orange: 0xcb7b32,
    pink: 0xd47aa4,
    cyan: 0x4aa7ae,
    gray: 0x6b6b6b,
    brown: 0x6e4a31,
  };
  return Object.entries(colors).find(([key]) => name.startsWith(key))?.[1] ?? 0xa23d3d;
}

function wallFacingRotation(facing: string | undefined): number {
  return (
    ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 } as Record<string, number>)[
      facing ?? 'north'
    ] ?? 0
  );
}
