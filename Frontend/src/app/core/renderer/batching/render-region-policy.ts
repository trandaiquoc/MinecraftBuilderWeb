import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';

export interface RenderRegionCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Spatial policy for static presentation batches.  It deliberately has no
 * ownership or scene state so instance/surface renderers can share it.
 */
export class RenderRegionPolicy {
  constructor(readonly size = 32) {
    if (!Number.isInteger(size) || size <= 0)
      throw new Error('Render region size must be a positive integer');
  }

  coordinate(position: VoxelCoordinate): RenderRegionCoordinate {
    return {
      x: Math.floor(position.x / this.size),
      y: Math.floor(position.y / this.size),
      z: Math.floor(position.z / this.size),
    };
  }

  key(position: VoxelCoordinate): string {
    return this.keyFor(this.coordinate(position));
  }

  keyFor(region: RenderRegionCoordinate): string {
    return `${region.x},${region.y},${region.z}`;
  }

  bounds(key: string, envelope: THREE.Box3): THREE.Box3 {
    const region = parseRenderRegionKey(key);
    if (!region) return new THREE.Box3().makeEmpty();
    const origin = new THREE.Vector3(
      region.x * this.size,
      region.y * this.size,
      region.z * this.size,
    );
    return new THREE.Box3(
      origin.clone().add(envelope.min),
      origin
        .clone()
        .add(new THREE.Vector3(this.size - 1, this.size - 1, this.size - 1))
        .add(envelope.max),
    );
  }
}

export function parseRenderRegionKey(key: string): RenderRegionCoordinate | undefined {
  const values = key.split(',').map(Number);
  return values.length === 3 && values.every(Number.isInteger)
    ? { x: values[0], y: values[1], z: values[2] }
    : undefined;
}
