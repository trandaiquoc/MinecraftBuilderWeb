import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';

export type PlaceholderRole = 'normal' | 'reference' | 'missing';

export interface PlaceholderBatch {
  readonly key: string;
  readonly capacity: number;
  readonly mesh: THREE.InstancedMesh;
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
}

export interface PlaceholderBatchRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly geometry: THREE.BufferGeometry;
  readonly materials: Readonly<Record<PlaceholderRole, THREE.Material>>;
  readonly capacity: number;
  readonly chunkKey: (position: VoxelCoordinate) => string;
  readonly chunkBounds: (chunk: string) => THREE.Box3;
  readonly recordBounds: () => void;
}

/** Owns coarse occupancy meshes used while real visuals hydrate. */
export class PlaceholderBatchRenderer {
  readonly batches = new Map<string, PlaceholderBatch>();
  readonly indices = new Map<string, { readonly batchKey: string; readonly index: number }>();
  private readonly translation = new THREE.Matrix4();

  constructor(private readonly options: PlaceholderBatchRendererOptions) {}

  ensure(key: string, position: VoxelCoordinate, role: PlaceholderRole): void {
    if (this.indices.has(key)) return;
    const batchKey = `${role}|${this.options.chunkKey(position)}`;
    const batch = this.getBatch(batchKey, role, position);
    if (batch.keys.length >= batch.capacity) return;
    this.insert(batch, key, position);
    batch.mesh.instanceMatrix.needsUpdate = true;
  }

  ensureBulk(entries: readonly { readonly key: string; readonly position: VoxelCoordinate; readonly role: PlaceholderRole }[]): void {
    const touched = new Set<string>();
    for (const entry of entries) {
      if (this.indices.has(entry.key)) continue;
      const batchKey = `${entry.role}|${this.options.chunkKey(entry.position)}`;
      const batch = this.getBatch(batchKey, entry.role, entry.position);
      if (batch.keys.length >= batch.capacity) continue;
      this.insert(batch, entry.key, entry.position);
      touched.add(batchKey);
    }
    for (const key of touched) this.batches.get(key)?.mesh.instanceMatrix && (this.batches.get(key)!.mesh.instanceMatrix.needsUpdate = true);
  }

  remove(key: string): void {
    const reference = this.indices.get(key);
    if (!reference) return;
    const batch = this.batches.get(reference.batchKey);
    this.indices.delete(key);
    if (!batch) return;
    const index = reference.index;
    const last = batch.keys.length - 1;
    if (index !== last) {
      const movedKey = batch.keys[last];
      const movedPosition = batch.positions[last];
      batch.keys[index] = movedKey;
      batch.positions[index] = movedPosition;
      this.setInstance(batch, index, movedKey, movedPosition);
      this.indices.set(movedKey, { batchKey: batch.key, index });
    }
    batch.keys.pop();
    batch.positions.pop();
    const voxels = batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[];
    const keys = batch.mesh.userData['instanceKeys'] as string[];
    voxels.pop();
    keys.pop();
    batch.mesh.count = batch.keys.length;
    batch.mesh.instanceMatrix.needsUpdate = true;
    if (!batch.keys.length) {
      this.options.blocksGroup.remove(batch.mesh);
      this.batches.delete(batch.key);
    }
  }

  removeBulk(keys: readonly string[]): void {
    for (const key of keys) this.remove(key);
  }

  clear(): void {
    for (const batch of this.batches.values()) this.options.blocksGroup.remove(batch.mesh);
    this.batches.clear();
    this.indices.clear();
  }

  private getBatch(batchKey: string, role: PlaceholderRole, position: VoxelCoordinate): PlaceholderBatch {
    const existing = this.batches.get(batchKey);
    if (existing) return existing;
    const mesh = new THREE.InstancedMesh(this.options.geometry, this.options.materials[role], this.options.capacity);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData['instanceVoxels'] = [];
    mesh.userData['instanceKeys'] = [];
    mesh.userData['placeholder'] = true;
    mesh.userData['instanceBatchKey'] = batchKey;
    this.options.blocksGroup.add(mesh);
    mesh.boundingBox = this.options.chunkBounds(this.options.chunkKey(position));
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.options.recordBounds();
    const batch = { key: batchKey, capacity: this.options.capacity, mesh, keys: [], positions: [] };
    this.batches.set(batchKey, batch);
    return batch;
  }

  private insert(batch: PlaceholderBatch, key: string, position: VoxelCoordinate): void {
    const index = batch.keys.length;
    const copy = { ...position };
    batch.keys.push(key);
    batch.positions.push(copy);
    this.setInstance(batch, index, key, copy);
    batch.mesh.count = index + 1;
    this.indices.set(key, { batchKey: batch.key, index });
  }

  private setInstance(batch: PlaceholderBatch, index: number, key: string, position: VoxelCoordinate): void {
    batch.mesh.setMatrixAt(index, this.translation.makeTranslation(position.x + .5, position.y + .5, position.z + .5));
    const voxels = batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[];
    const keys = batch.mesh.userData['instanceKeys'] as string[];
    voxels[index] = { ...position };
    keys[index] = key;
  }
}
