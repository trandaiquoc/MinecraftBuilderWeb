import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';

export type PlaceholderRole = 'normal' | 'reference' | 'missing';

export interface PlaceholderBatch {
  readonly key: string;
  readonly layer: number;
  readonly groupIds: readonly string[];
  readonly baseRole: PlaceholderRole;
  role: PlaceholderRole;
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
  readonly layerCapacity?: number;
  readonly chunkKey: (position: VoxelCoordinate) => string;
  readonly chunkBounds: (chunk: string) => THREE.Box3;
  readonly recordBounds: () => void;
}

/** Owns coarse occupancy meshes used while real visuals hydrate. */
export class PlaceholderBatchRenderer {
  private readonly batchStore = new Map<string, PlaceholderBatch>();
  private readonly indexStore = new Map<string, { readonly batchKey: string; readonly index: number }>();
  private readonly translation = new THREE.Matrix4();
  private layerPresentation?: {
    readonly visibleLayers: ReadonlySet<number>;
    readonly currentY: number;
    readonly hiddenGroupIds: ReadonlySet<string>;
    readonly isolatedGroupId?: string;
  };

  constructor(private readonly options: PlaceholderBatchRendererOptions) {}

  get batches(): ReadonlyMap<string, PlaceholderBatch> { return this.batchStore; }
  get indices(): ReadonlyMap<string, { readonly batchKey: string; readonly index: number }> { return this.indexStore; }

  ensure(key: string, position: VoxelCoordinate, role: PlaceholderRole, groupIds: readonly string[] = []): void {
    if (this.indexStore.has(key)) return;
    const normalizedGroups = this.layerPresentation ? [...new Set(groupIds)].sort() : [];
    const batchKey = this.batchKey(role, position, normalizedGroups);
    const batch = this.getBatch(batchKey, role, position, normalizedGroups);
    if (batch.keys.length >= batch.capacity) return;
    this.insert(batch, key, position);
    batch.mesh.instanceMatrix.needsUpdate = true;
  }

  ensureBulk(entries: readonly { readonly key: string; readonly position: VoxelCoordinate; readonly role: PlaceholderRole; readonly groupIds?: readonly string[] }[]): void {
    const touched = new Set<string>();
    for (const entry of entries) {
      if (this.indexStore.has(entry.key)) continue;
      const normalizedGroups = this.layerPresentation ? [...new Set(entry.groupIds ?? [])].sort() : [];
      const batchKey = this.batchKey(entry.role, entry.position, normalizedGroups);
      const batch = this.getBatch(batchKey, entry.role, entry.position, normalizedGroups);
      if (batch.keys.length >= batch.capacity) continue;
      this.insert(batch, entry.key, entry.position);
      touched.add(batchKey);
    }
    for (const key of touched) this.batchStore.get(key)?.mesh.instanceMatrix && (this.batchStore.get(key)!.mesh.instanceMatrix.needsUpdate = true);
  }

  remove(key: string): void {
    const reference = this.indexStore.get(key);
    if (!reference) return;
    const batch = this.batchStore.get(reference.batchKey);
    this.indexStore.delete(key);
    if (!batch) return;
    const index = reference.index;
    const last = batch.keys.length - 1;
    if (index !== last) {
      const movedKey = batch.keys[last];
      const movedPosition = batch.positions[last];
      batch.keys[index] = movedKey;
      batch.positions[index] = movedPosition;
      this.setInstance(batch, index, movedKey, movedPosition);
      this.indexStore.set(movedKey, { batchKey: batch.key, index });
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
      this.disposeBatch(batch);
      batch.mesh.dispose();
      this.batchStore.delete(batch.key);
    }
  }

  removeBulk(keys: readonly string[]): void {
    for (const key of keys) this.remove(key);
  }

  clear(): void {
    for (const batch of this.batchStore.values()) {
      this.options.blocksGroup.remove(batch.mesh);
      this.disposeBatch(batch);
      batch.mesh.dispose();
    }
    this.batchStore.clear();
    this.indexStore.clear();
    this.layerPresentation = undefined;
  }

  setLayerPresentation(visibleLayers: ReadonlySet<number>, currentY: number, hiddenGroupIds: ReadonlySet<string>, isolatedGroupId?: string): void {
    this.layerPresentation = { visibleLayers, currentY, hiddenGroupIds, isolatedGroupId };
    for (const batch of this.batchStore.values()) {
      batch.mesh.visible = this.isVisible(batch);
      this.setBatchRole(batch, batch.baseRole === 'missing' ? 'missing' : batch.layer === currentY ? 'normal' : 'reference');
    }
  }

  clearLayerPresentation(): void {
    this.layerPresentation = undefined;
    for (const batch of this.batchStore.values()) {
      batch.mesh.visible = true;
      this.setBatchRole(batch, batch.baseRole === 'missing' ? 'missing' : 'normal');
    }
  }

  private getBatch(batchKey: string, role: PlaceholderRole, position: VoxelCoordinate, groupIds: readonly string[]): PlaceholderBatch {
    const existing = this.batchStore.get(batchKey);
    if (existing) return existing;
    const baseMaterial = this.options.materials[role].clone();
    const capacity = this.layerPresentation ? this.options.layerCapacity ?? this.options.capacity : this.options.capacity;
    const mesh = new THREE.InstancedMesh(this.options.geometry, baseMaterial, capacity);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData['instanceVoxels'] = [];
    mesh.userData['instanceKeys'] = [];
    mesh.userData['placeholder'] = true;
    mesh.userData['instanceBatchKey'] = batchKey;
    const layer = this.layerPresentation ? Math.trunc(position.y) : -1;
    mesh.userData['blockLayer'] = layer;
    mesh.userData['blockGroupIds'] = groupIds;
    this.options.blocksGroup.add(mesh);
    mesh.boundingBox = this.options.chunkBounds(this.options.chunkKey(position));
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.options.recordBounds();
    const batch: PlaceholderBatch = { key: batchKey, layer, groupIds, baseRole: role, role, capacity, mesh, keys: [], positions: [] };
    this.batchStore.set(batchKey, batch);
    if (this.layerPresentation) {
      batch.mesh.visible = this.isVisible(batch);
      this.setBatchRole(batch, role === 'missing' ? 'missing' : layer === this.layerPresentation.currentY ? 'normal' : 'reference');
    }
    return batch;
  }

  private batchKey(role: PlaceholderRole, position: VoxelCoordinate, groupIds: readonly string[]): string {
    const layer = this.layerPresentation ? Math.trunc(position.y) : -1;
    const groupKey = groupIds.join('\u001f');
    const roleKey = this.layerPresentation ? role === 'missing' ? 'missing' : 'block' : role;
    return `${roleKey}|${layer}|${groupKey}|${this.options.chunkKey(position)}`;
  }

  private isVisible(batch: PlaceholderBatch): boolean {
    const presentation = this.layerPresentation;
    if (!presentation) return true;
    if (!presentation.visibleLayers.has(batch.layer)) return false;
    if (batch.groupIds.some((id) => presentation.hiddenGroupIds.has(id))) return false;
    return !presentation.isolatedGroupId || batch.groupIds.includes(presentation.isolatedGroupId);
  }

  private setBatchRole(batch: PlaceholderBatch, role: PlaceholderRole): void {
    if (batch.role === role) return;
    batch.role = role;
    const material = batch.mesh.material as THREE.Material;
    if (role === 'reference') {
      material.transparent = true;
      material.opacity = .24;
      material.depthWrite = false;
    } else if (role !== 'missing') {
      const base = this.options.materials[batch.baseRole];
      material.transparent = base.transparent;
      material.opacity = base.opacity;
      material.depthWrite = base.depthWrite;
    }
    material.needsUpdate = true;
  }

  private disposeBatch(batch: PlaceholderBatch): void {
    const material = batch.mesh.material;
    if (Array.isArray(material)) for (const item of material) item.dispose();
    else material.dispose();
  }

  private insert(batch: PlaceholderBatch, key: string, position: VoxelCoordinate): void {
    const index = batch.keys.length;
    const copy = { ...position };
    batch.keys.push(key);
    batch.positions.push(copy);
    this.setInstance(batch, index, key, copy);
    batch.mesh.count = index + 1;
    this.indexStore.set(key, { batchKey: batch.key, index });
  }

  private setInstance(batch: PlaceholderBatch, index: number, key: string, position: VoxelCoordinate): void {
    batch.mesh.setMatrixAt(index, this.translation.makeTranslation(position.x + .5, position.y + .5, position.z + .5));
    const voxels = batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[];
    const keys = batch.mesh.userData['instanceKeys'] as string[];
    voxels[index] = { ...position };
    keys[index] = key;
  }
}
