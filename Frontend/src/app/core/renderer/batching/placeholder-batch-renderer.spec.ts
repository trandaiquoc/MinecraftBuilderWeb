import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
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
    const meshes = [...renderer.batches.values()].map((batch) => batch.mesh);
    const meshDisposals = meshes.map((mesh) => vi.spyOn(mesh, 'dispose'));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    expect(renderer.indices.size).toBe(2);
    renderer.remove('a');
    expect(renderer.indices.get('b')?.index).toBe(0);
    expect(meshDisposals[0]).toHaveBeenCalledTimes(1);
    expect(meshDisposals[1]).not.toHaveBeenCalled();
    renderer.clear();
    expect(renderer.batches.size).toBe(0);
    expect(meshDisposals[1]).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    renderer.clear();
    expect(meshDisposals[0]).toHaveBeenCalledTimes(1);
    expect(meshDisposals[1]).toHaveBeenCalledTimes(1);
    geometry.dispose(); material.dispose();
  });
});
