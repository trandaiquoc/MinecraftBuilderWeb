import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { blockCoordinateFromHit, surfaceFaceDirectionFromHit } from './viewport-hit-ownership';

describe('viewport hit ownership', () => {
  it('resolves instanced hits through the authoritative voxel table', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3);
    const voxels = [
      { x: 2, y: 0, z: 0 },
      { x: 7, y: 1, z: 0 },
      { x: 9, y: 2, z: 3 },
    ];
    mesh.userData['instanceVoxels'] = voxels;
    expect(
      blockCoordinateFromHit({ object: mesh, instanceId: 0 } as unknown as THREE.Intersection),
    ).toEqual(voxels[0]);
    expect(
      blockCoordinateFromHit({ object: mesh, instanceId: 1 } as unknown as THREE.Intersection),
    ).toEqual(voxels[1]);
    expect(
      blockCoordinateFromHit({ object: mesh, instanceId: 2 } as unknown as THREE.Intersection),
    ).toEqual(voxels[2]);
    voxels[1] = voxels[2];
    expect(
      blockCoordinateFromHit({ object: mesh, instanceId: 1 } as unknown as THREE.Intersection),
    ).toEqual({ x: 9, y: 2, z: 3 });
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('resolves direct voxel metadata and placeholder/final instance metadata', () => {
    const normal = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    normal.userData['voxel'] = { x: 1, y: 2, z: 3 };
    expect(blockCoordinateFromHit({ object: normal } as unknown as THREE.Intersection)).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
    const placeholder = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      1,
    );
    placeholder.userData['placeholder'] = true;
    placeholder.userData['instanceVoxels'] = [{ x: 4, y: 5, z: 6 }];
    expect(
      blockCoordinateFromHit({
        object: placeholder,
        instanceId: 0,
      } as unknown as THREE.Intersection),
    ).toEqual({ x: 4, y: 5, z: 6 });
    const final = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      1,
    );
    final.userData['realModel'] = true;
    final.userData['instanceVoxels'] = [{ x: 7, y: 8, z: 9 }];
    expect(
      blockCoordinateFromHit({ object: final, instanceId: 0 } as unknown as THREE.Intersection),
    ).toEqual({ x: 7, y: 8, z: 9 });
    normal.geometry.dispose();
    normal.material.dispose();
    placeholder.geometry.dispose();
    placeholder.material.dispose();
    final.geometry.dispose();
    final.material.dispose();
  });

  it('reads explicit face metadata only from surface-face batches', () => {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
      1,
    );
    mesh.userData['surfaceFaceBatch'] = true;
    mesh.userData['instanceVoxels'] = [{ x: 4, y: 5, z: 6 }];
    mesh.userData['instanceFaceDirections'] = ['north'];
    const hit = { object: mesh, instanceId: 0 } as unknown as THREE.Intersection;
    expect(blockCoordinateFromHit(hit)).toEqual({ x: 4, y: 5, z: 6 });
    expect(surfaceFaceDirectionFromHit(hit)).toBe('north');
    expect(
      surfaceFaceDirectionFromHit({ object: mesh } as unknown as THREE.Intersection),
    ).toBeUndefined();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});
