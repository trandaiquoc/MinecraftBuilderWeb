import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SurfaceFaceBatchRenderer, SurfaceFaceTemplate } from './surface-face-batch-renderer';

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
    expect(renderer.batches.size).toBe(1);
    renderer.remove('a', entry);
    expect(renderer.batches.size).toBe(0);
    geometry.dispose(); material.dispose();
  });
});
