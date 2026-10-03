import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InstanceBatchRenderer } from './instance-batch-renderer';

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
});
