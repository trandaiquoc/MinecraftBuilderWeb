import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlaceholderBatchRenderer } from './placeholder-batch-renderer';

describe('PlaceholderBatchRenderer', () => {
  it('bulk inserts, swap-removes and clears coarse occupancy', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new PlaceholderBatchRenderer({
      blocksGroup: group,
      geometry,
      materials: { normal: material, reference: material, missing: material },
      capacity: 16,
      chunkKey: (position) => `${position.x},${position.y},${position.z}`,
      chunkBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)),
      recordBounds: () => undefined,
    });
    renderer.ensureBulk([{ key: 'a', position: { x: 0, y: 0, z: 0 }, role: 'normal' }, { key: 'b', position: { x: 1, y: 0, z: 0 }, role: 'normal' }]);
    expect(renderer.indices.size).toBe(2);
    renderer.remove('a');
    expect(renderer.indices.get('b')?.index).toBe(0);
    renderer.clear();
    expect(renderer.batches.size).toBe(0);
    geometry.dispose(); material.dispose();
  });
});
