import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InstanceBatchRenderer } from './instance-batch-renderer';
import { RenderRegionPolicy } from './render-region-policy';

describe('InstanceBatchRenderer', () => {
  it('corrects ownership after swap-back removal', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const entries = new Map<string, { instanceBatchKey?: string; instanceIndex?: number; object?: THREE.Object3D }>();
    const renderer = new InstanceBatchRenderer({
      blocksGroup: group,
      capacity: 16,
      chunkKey: () => '0,0,0',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      record: () => undefined,
      getEntry: (key) => entries.get(key),
      setEntryObject: (key, batchKey, index, object) => { const entry = entries.get(key) ?? {}; entry.instanceBatchKey = batchKey; entry.instanceIndex = index; entry.object = object; entries.set(key, entry); },
      disposeMergedTemplateGeometry: () => undefined,
    });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 0, y: 0, z: 0 }, 'a');
    renderer.addFromTemplates(templates, { x: 1, y: 0, z: 0 }, 'b');
    renderer.remove('a', entries.get('a'));
    expect(renderer.ownershipIndex.get('b')?.index).toBe(0);
    expect(renderer.batches.size).toBe(1);
    renderer.clear();
    geometry.dispose(); material.dispose();
  });

  it('segments a regional batch at capacity without falling back to standalone objects', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const entries = new Map<string, { instanceBatchKey?: string; instanceIndex?: number; object?: THREE.Object3D }>();
    const renderer = new InstanceBatchRenderer({
      blocksGroup: group,
      capacity: 4,
      chunkKey: () => 'legacy',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      regionPolicy: new RenderRegionPolicy(32),
      record: () => undefined,
      getEntry: (key) => entries.get(key),
      setEntryObject: (key, batchKey, index, object) => entries.set(key, { instanceBatchKey: batchKey, instanceIndex: index, object }),
      disposeMergedTemplateGeometry: () => undefined,
    });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    for (let index = 0; index < 10; index += 1) renderer.addFromTemplates(templates, { x: index, y: 0, z: 0 }, `block-${index}`);
    expect(renderer.batches.size).toBe(3);
    expect([...renderer.batches.values()].map((batch) => batch.keys.length)).toEqual([4, 4, 2]);
    renderer.remove('block-1', entries.get('block-1'));
    expect(renderer.ownershipIndex.get('block-9')?.index).toBe(1);
    renderer.clear();
    geometry.dispose(); material.dispose();
  });

  it('keeps members on separate regions for local frustum culling', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({
      blocksGroup: group,
      capacity: 16,
      chunkKey: () => 'legacy',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      regionPolicy: new RenderRegionPolicy(32),
      record: () => undefined,
      getEntry: () => undefined,
      disposeMergedTemplateGeometry: () => undefined,
    });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 31, y: 0, z: 0 }, 'a');
    renderer.addFromTemplates(templates, { x: 32, y: 0, z: 0 }, 'b');
    expect(renderer.batches.size).toBe(2);
    expect([...renderer.batches.values()].map((batch) => batch.regionKey)).toEqual(['0,0,0', '1,0,0']);
    renderer.clear();
    geometry.dispose(); material.dispose();
  });
});
