import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { InstanceBatchRenderer } from './instance-batch-renderer';
import { RenderRegionPolicy } from './render-region-policy';

describe('InstanceBatchRenderer', () => {
  it('toggles a voxel presentation without removing its batch membership', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({ blocksGroup: group, capacity: 16, chunkKey: () => '0,0,0', stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)), record: () => undefined, getEntry: () => undefined });
    renderer.addFromTemplates([{ geometry, material, matrix: new THREE.Matrix4() }], { x: 2, y: 3, z: 4 }, 'voxel');
    const batch = [...renderer.batches.values()][0];
    const matrix = new THREE.Matrix4();

    expect(renderer.setMemberVisible('voxel', false)).toBe(true);
    batch.parts[0].getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    expect(batch.keys).toEqual(['voxel']);
    expect(renderer.ownershipIndex.get('voxel')).toMatchObject({ batchKey: batch.key, index: 0 });

    expect(renderer.setMemberVisible('voxel', true)).toBe(true);
    batch.parts[0].getMatrixAt(0, matrix);
    expect(matrix.determinant()).not.toBe(0);
    expect(batch.keys).toEqual(['voxel']);
    renderer.clear(); geometry.dispose(); material.dispose();
  });

  it('changes Y-layer visibility and role by batch without writing per-voxel matrices', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({ blocksGroup: group, capacity: 16, chunkKey: () => 'region', stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)), record: () => undefined, getEntry: () => undefined });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.setLayerPresentation(new Set([10, 11]), 10, .25);
    renderer.addFromTemplates(templates, { x: 0, y: 10, z: 0 }, 'lower');
    renderer.addFromTemplates(templates, { x: 0, y: 11, z: 0 }, 'upper');
    const batches = [...renderer.batches.values()];
    const matrixVersions = batches.map((batch) => batch.parts.map((part) => part.instanceMatrix.version));

    renderer.setLayerPresentation(new Set([11]), 11, .25);

    expect(batches).toHaveLength(2);
    expect(batches.find((batch) => batch.layer === 10)?.parts[0].visible).toBe(false);
    expect(batches.find((batch) => batch.layer === 11)?.parts[0].visible).toBe(true);
    expect(batches.find((batch) => batch.layer === 10)?.renderRole).toBe('reference');
    expect(batches.find((batch) => batch.layer === 11)?.renderRole).toBe('normal');
    expect(batches.map((batch) => batch.parts.map((part) => part.instanceMatrix.version))).toEqual(matrixVersions);
    renderer.clear(); geometry.dispose(); material.dispose();
  });

  it('preserves a hidden member when swap-back removal moves it to another index', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({ blocksGroup: group, capacity: 16, chunkKey: () => '0,0,0', stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)), record: () => undefined, getEntry: () => undefined });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 0, y: 0, z: 0 }, 'removed');
    renderer.addFromTemplates(templates, { x: 1, y: 0, z: 0 }, 'hidden');
    renderer.setMemberVisible('hidden', false);
    renderer.remove('removed', undefined);

    const batch = [...renderer.batches.values()][0];
    const matrix = new THREE.Matrix4();
    batch.parts[0].getMatrixAt(0, matrix);
    expect(batch.keys).toEqual(['hidden']);
    expect(matrix.determinant()).toBe(0);
    renderer.setMemberVisible('hidden', true);
    batch.parts[0].getMatrixAt(0, matrix);
    expect(matrix.determinant()).not.toBe(0);
    renderer.clear(); geometry.dispose(); material.dispose();
  });

  it('does not scan every batch when asked to clear an unindexed key', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({
      blocksGroup: group,
      capacity: 16,
      chunkKey: () => '0,0,0',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      record: () => undefined,
      getEntry: () => undefined,
      disposeMergedTemplateGeometry: () => undefined,
    });
    renderer.addFromTemplates([{ geometry, material, matrix: new THREE.Matrix4() }], { x: 0, y: 0, z: 0 }, 'existing');
    const scan = vi.spyOn(renderer, 'memberships');

    renderer.removeOrphaned('new-block', 'reconcile');

    expect(scan).not.toHaveBeenCalled();
    expect(renderer.ownershipIndex.has('existing')).toBe(true);
    expect(renderer.batches.values().next().value?.keys).toEqual(['existing']);
    renderer.clear(); geometry.dispose(); material.dispose();
  });

  it('repairs a stale known membership by scanning only after indexed removal fails', () => {
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
      setEntryObject: (key, batchKey, index, object) => entries.set(key, { instanceBatchKey: batchKey, instanceIndex: index, object }),
      disposeMergedTemplateGeometry: () => undefined,
    });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 0, y: 0, z: 0 }, 'stale');
    const old = entries.get('stale')!;
    entries.set('stale', { ...old, instanceBatchKey: 'retired-batch', instanceIndex: 0 });
    const scan = vi.spyOn(renderer, 'memberships');

    renderer.removeOrphaned('stale', 'reconcile', entries.get('stale'));

    expect(scan).toHaveBeenCalledWith('stale', true);
    expect(renderer.ownershipIndex.has('stale')).toBe(false);
    expect(renderer.batches.size).toBe(0);
    expect(group.children).toHaveLength(0);
    renderer.clear(); geometry.dispose(); material.dispose();
  });

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
    const part = [...renderer.batches.values()][0].parts[0];
    const partDispose = vi.spyOn(part, 'dispose');
    const clonedMaterial = part.material as THREE.Material;
    const materialDispose = vi.spyOn(clonedMaterial, 'dispose');
    renderer.remove('a', entries.get('a'));
    expect(renderer.ownershipIndex.get('b')?.index).toBe(0);
    expect(renderer.batches.size).toBe(1);
    renderer.clear();
    expect(partDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    renderer.clear();
    expect(partDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
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

  it('replaces the only member of a batch without inserting into disposed meshes', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const entries = new Map<string, { instanceBatchKey?: string; instanceIndex?: number; object?: THREE.Object3D }>();
    const renderer = new InstanceBatchRenderer({
      blocksGroup: group,
      capacity: 4,
      chunkKey: () => '0,0,0',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      record: () => undefined,
      getEntry: (key) => entries.get(key),
      setEntryObject: (key, batchKey, index, object) => entries.set(key, { instanceBatchKey: batchKey, instanceIndex: index, object }),
      disposeMergedTemplateGeometry: () => undefined,
    });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 0, y: 0, z: 0 }, 'same');
    const oldBatch = [...renderer.batches.values()][0];
    const oldPart = oldBatch.parts[0];
    const oldDispose = vi.spyOn(oldPart, 'dispose');
    const replacement = renderer.addFromTemplates(templates, { x: 1, y: 0, z: 0 }, 'same');
    expect(replacement).toBeDefined();
    expect(renderer.ownershipIndex.get('same')).toEqual(replacement);
    expect(renderer.batches.has(replacement!.batchKey)).toBe(true);
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect((renderer.batches.get(replacement!.batchKey)!.parts[0] as THREE.InstancedMesh).count).toBe(1);
    renderer.clear(); geometry.dispose(); material.dispose();
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

  it('keeps reference members in a separate material batch and updates opacity in place', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({ blocksGroup: group, capacity: 16, chunkKey: () => '0,0,0', stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)), record: () => undefined, getEntry: () => undefined, disposeMergedTemplateGeometry: () => undefined });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 0, y: 0, z: 0 }, 'normal');
    renderer.addFromTemplates(templates, { x: 1, y: 0, z: 0 }, 'reference', 'provider-async', undefined, 'reference');
    expect(renderer.batches.size).toBe(2);
    const reference = [...renderer.batches.values()].find((batch) => batch.renderRole === 'reference');
    expect(reference?.parts[0].material).toMatchObject({ transparent: true, opacity: .28 });
    renderer.setReferenceOpacity(.5);
    expect(reference?.parts[0].material).toMatchObject({ opacity: .5 });
    renderer.clear(); geometry.dispose(); material.dispose();
  });

  it('retargets a retained instance between presentation roles without resolving another visual', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const entry: { instanceBatchKey?: string; instanceIndex?: number; object?: THREE.Object3D } = {};
    const renderer = new InstanceBatchRenderer({
      blocksGroup: group,
      capacity: 16,
      chunkKey: () => '0,0,0',
      stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)),
      record: () => undefined,
      getEntry: () => entry,
      setEntryObject: (_key, batchKey, index, object) => Object.assign(entry, { instanceBatchKey: batchKey, instanceIndex: index, object }),
      disposeMergedTemplateGeometry: () => undefined,
    });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 1, y: 2, z: 3 }, 'voxel');
    const originalGeometry = renderer.batches.values().next().value!.parts[0].geometry;

    expect(renderer.setMemberRole('voxel', 'reference')).toBe(true);
    expect(renderer.batches.size).toBe(1);
    const reference = renderer.batches.values().next().value!;
    expect(reference.renderRole).toBe('reference');
    expect(reference.parts[0].geometry).toBe(originalGeometry);
    expect(reference.positions).toEqual([{ x: 1, y: 2, z: 3 }]);
    renderer.clear(); geometry.dispose(); material.dispose();
  });

  it('changes only the owning 3D role batch when Y-layer presentation is inactive', () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const renderer = new InstanceBatchRenderer({ blocksGroup: group, capacity: 16, chunkKey: () => '0,0,0', stableBounds: () => new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(16, 16, 16)), record: () => undefined, getEntry: () => undefined, disposeMergedTemplateGeometry: () => undefined });
    const templates = [{ geometry, material, matrix: new THREE.Matrix4() }];
    renderer.addFromTemplates(templates, { x: 0, y: 0, z: 0 }, 'normal');
    renderer.addFromTemplates(templates, { x: 2, y: 0, z: 0 }, 'other-normal');
    renderer.addFromTemplates(templates, { x: 1, y: 0, z: 0 }, 'reference', 'provider-async', undefined, 'reference');

    expect(renderer.setMemberRole('normal', 'reference')).toBe(true);
    const batches = [...renderer.batches.values()];
    expect(batches.filter((batch) => batch.keys.includes('normal')).every((batch) => batch.renderRole === 'reference')).toBe(true);
    expect(batches.filter((batch) => batch.keys.includes('other-normal')).every((batch) => batch.renderRole === 'normal')).toBe(true);
    expect(batches.filter((batch) => batch.keys.includes('reference')).every((batch) => batch.renderRole === 'reference')).toBe(true);
    renderer.clear(); geometry.dispose(); material.dispose();
  });
});
