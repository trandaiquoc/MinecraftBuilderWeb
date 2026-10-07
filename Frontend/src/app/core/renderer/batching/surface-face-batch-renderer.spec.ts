import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SurfaceFaceBatchRenderer, SurfaceFaceTemplate } from './surface-face-batch-renderer';
import { RenderRegionPolicy } from './render-region-policy';

describe('SurfaceFaceBatchRenderer', () => {
  it('tracks all exposed memberships and removes them safely', () => {
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial();
    const entries = new Map<string, { surfaceFaceMemberships?: readonly { batchKey: string; index: number }[]; surfaceExposedFaceCount?: number; surfaceNeighborFacesCulled?: number }>();
    const renderer = new SurfaceFaceBatchRenderer({ blocksGroup: group, capacity: 16, chunkKey: () => '0,0,0', stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)), unitEnvelope: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)), record: () => undefined, getEntry: (key) => entries.get(key) });
    const directions = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
    const templates: SurfaceFaceTemplate[] = directions.map((direction) => ({ geometry, material, direction, matrix: new THREE.Matrix4() }));
    const memberships = renderer.add({ position: { x: 0, y: 0, z: 0 } }, 'a', templates, new Set(directions));
    const entry = { surfaceFaceMemberships: memberships, surfaceExposedFaceCount: memberships?.length, surfaceNeighborFacesCulled: 0 };
    entries.set('a', entry);
    const mesh = [...renderer.batches.values()][0].mesh;
    const meshDispose = vi.spyOn(mesh, 'dispose');
    const clonedMaterial = mesh.material as THREE.Material;
    const materialDispose = vi.spyOn(clonedMaterial, 'dispose');
    expect(renderer.batches.size).toBe(1);
    renderer.remove('a', entry);
    expect(renderer.batches.size).toBe(0);
    expect(meshDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    renderer.clear(entries.values());
    expect(meshDispose).toHaveBeenCalledTimes(1);
    geometry.dispose(); material.dispose();
  });

  it('segments exposed faces when a regional segment reaches capacity', () => {
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial();
    const entries = new Map<string, { surfaceFaceMemberships?: readonly { batchKey: string; index: number }[] }>();
    const renderer = new SurfaceFaceBatchRenderer({
      blocksGroup: group,
      capacity: 2,
      chunkKey: () => 'legacy',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      regionPolicy: new RenderRegionPolicy(32),
      unitEnvelope: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)),
      record: () => undefined,
      getEntry: (key) => entries.get(key),
    });
    const templates: SurfaceFaceTemplate[] = (['north', 'east', 'south', 'west', 'up', 'down'] as const).map((direction) => ({ geometry, material, direction, matrix: new THREE.Matrix4() }));
    const exposed = new Set(['north'] as const);
    for (let index = 0; index < 5; index += 1) {
      const memberships = renderer.add({ position: { x: index, y: 0, z: 0 } }, `block-${index}`, templates, exposed);
      entries.set(`block-${index}`, { surfaceFaceMemberships: memberships });
    }
    const batchResources = [...renderer.batches.values()].map((batch) => ({ mesh: batch.mesh, meshDispose: vi.spyOn(batch.mesh, 'dispose'), materialDispose: vi.spyOn(batch.mesh.material as THREE.Material, 'dispose') }));
    expect(renderer.batches.size).toBe(3);
    expect([...renderer.batches.values()].map((batch) => batch.keys.length)).toEqual([2, 2, 1]);
    renderer.remove('block-0', entries.get('block-0'));
    expect(renderer.ownership.get('block-1')?.[0].index).toBe(0);
    renderer.clear(entries.values());
    for (const resource of batchResources) {
      expect(resource.meshDispose).toHaveBeenCalledTimes(1);
      expect(resource.materialDispose).toHaveBeenCalledTimes(1);
    }
    geometry.dispose(); material.dispose();
  });
});
