import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import { compileInstanceTemplates, type CompiledInstanceTemplates, type InstancePartTemplate } from './instance-template-cache';
import type { RenderRegionPolicy } from './render-region-policy';

export interface InstanceBatchEntry {
  instanceBatchKey?: string;
  instanceIndex?: number;
  object?: THREE.Object3D;
}

export interface InstanceBatch {
  readonly key: string;
  readonly regionKey: string;
  readonly segment: number;
  readonly capacity: number;
  readonly templates: readonly InstancePartTemplate[];
  readonly parts: readonly THREE.InstancedMesh[];
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
}

export interface InstanceBatchRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly capacity: number;
  readonly chunkKey: (position: VoxelCoordinate) => string;
  readonly stableBounds: (chunk: string, envelope: THREE.Box3) => THREE.Box3;
  readonly regionPolicy?: RenderRegionPolicy;
  readonly record: (name: string, delta?: number) => void;
  readonly getEntry: (key: string) => InstanceBatchEntry | undefined;
  readonly setEntryObject?: (key: string, batchKey: string | undefined, index: number | undefined, object: THREE.Object3D | undefined) => void;
  readonly disposeMergedTemplateGeometry: (template: InstancePartTemplate, batches: ReadonlyMap<string, InstanceBatch>) => void;
  readonly trace?: (phase: 'before-insert' | 'after-insert' | 'before-remove' | 'after-remove' | 'after-remove-entry', key: string, source: 'cached-template' | 'provider-async' | 'rollback' | 'reconcile') => void;
}

/** Owns reusable InstancedMesh batches and their swap-back ownership index. */
export class InstanceBatchRenderer {
  readonly batches = new Map<string, InstanceBatch>();
  readonly ownershipIndex = new Map<string, { readonly batchKey: string; readonly index: number }>();
  private readonly translation = new THREE.Matrix4();
  private readonly transformed = new THREE.Matrix4();

  constructor(private readonly options: InstanceBatchRendererOptions) {}

  addFromTemplates(
    templates: readonly InstancePartTemplate[],
    position: VoxelCoordinate,
    key: string,
    source: 'provider-async' | 'cached-template' = 'provider-async',
    compiled?: CompiledInstanceTemplates,
  ): { readonly batchKey: string; readonly index: number } | undefined {
    const resolved = compiled ?? compileInstanceTemplates(templates);
    const existingEntry = this.options.getEntry(key);
    this.options.trace?.('before-insert', key, source);
    if (existingEntry?.instanceBatchKey) this.remove(key, existingEntry, 'reconcile');
    else if (this.ownershipIndex.has(key)) this.removeOrphaned(key, 'reconcile', existingEntry);
    const region = this.options.regionPolicy?.key(position) ?? this.options.chunkKey(position);
    const baseKey = `${region}|${resolved.signature}`;
    let segment = 0;
    let batchKey = `${baseKey}|segment:${segment}`;
    let batch = this.batches.get(batchKey);
    while (batch && batch.keys.length >= batch.capacity) {
      segment += 1;
      batchKey = `${baseKey}|segment:${segment}`;
      batch = this.batches.get(batchKey);
    }
    if (!batch) {
      const parts = resolved.templates.map((template) => {
        const material = template.material.clone();
        material.transparent = false;
        material.depthWrite = true;
        const mesh = new THREE.InstancedMesh(template.geometry, material, this.options.capacity);
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.userData['instanceVoxels'] = [];
        mesh.userData['instanceKeys'] = [];
        mesh.userData['realModel'] = true;
        mesh.userData['instanceBatchKey'] = batchKey;
        this.options.blocksGroup.add(mesh);
        mesh.boundingBox = this.options.regionPolicy?.bounds(region, resolved.envelope) ?? this.options.stableBounds(region, resolved.envelope);
        mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
        return mesh;
      });
      this.options.record('instancedBoundsComputations', parts.length);
      batch = { key: batchKey, regionKey: region, segment, capacity: this.options.capacity, templates: resolved.templates, parts, keys: [], positions: [] };
      this.batches.set(batchKey, batch);
      this.options.record('instancedBatchCreations');
      this.options.record('instancedMeshCount', parts.length);
    }
    if (batch.keys.length >= batch.capacity) return undefined;
    const index = batch.keys.length;
    const copiedPosition = { ...position };
    batch.keys.push(key);
    batch.positions.push(copiedPosition);
    const translation = this.translation.makeTranslation(position.x, position.y, position.z);
    batch.parts.forEach((part, partIndex) => {
      this.transformed.copy(translation).multiply(batch.templates[partIndex].matrix);
      part.setMatrixAt(index, this.transformed);
      part.count = index + 1;
      (part.userData['instanceVoxels'] as VoxelCoordinate[]).push({ ...position });
      (part.userData['instanceKeys'] as string[]).push(key);
      part.instanceMatrix.needsUpdate = true;
    });
    this.options.record('instancedBlockAdds');
    this.options.record('instancedMembers');
    this.ownershipIndex.set(key, { batchKey, index });
    this.options.setEntryObject?.(key, batchKey, index, batch.parts[0]);
    this.options.trace?.('after-insert', key, source);
    return { batchKey, index };
  }

  remove(key: string, entry: InstanceBatchEntry | undefined, source: 'rollback' | 'reconcile' = 'reconcile'): void {
    this.options.trace?.('before-remove', key, 'reconcile');
    this.removeOrphaned(key, source, entry);
    this.options.setEntryObject?.(key, undefined, undefined, entry?.object);
    this.options.trace?.('after-remove', key, 'reconcile');
  }

  memberships(key: string, scanAll = false): readonly { readonly batchKey: string; readonly index: number }[] {
    if (!scanAll) {
      const indexed = this.ownershipIndex.get(key);
      return indexed ? [{ ...indexed }] : [];
    }
    const memberships: { batchKey: string; index: number }[] = [];
    for (const [batchKey, batch] of this.batches) for (const [index, memberKey] of batch.keys.entries()) if (memberKey === key) memberships.push({ batchKey, index });
    return memberships;
  }

  removeOrphaned(key: string, source: 'rollback' | 'reconcile', entry?: InstanceBatchEntry): void {
    const indexed = this.ownershipIndex.get(key);
    const knownBatchKey = entry?.instanceBatchKey ?? indexed?.batchKey;
    const knownIndex = entry?.instanceIndex ?? indexed?.index;
    const knownRemoved = knownBatchKey !== undefined && knownIndex !== undefined ? this.removeMembership(knownBatchKey, knownIndex, key) : false;
    let memberships = !knownBatchKey || !knownRemoved ? this.memberships(key, true) : [];
    while (memberships.length) {
      for (const membership of memberships.slice().sort((left, right) => right.index - left.index)) this.removeMembership(membership.batchKey, membership.index, key);
      const next = this.memberships(key, true);
      if (next.length >= memberships.length) break;
      memberships = next;
    }
    this.ownershipIndex.delete(key);
    this.options.setEntryObject?.(key, undefined, undefined, entry?.object);
    if (source === 'rollback') this.options.trace?.('after-remove-entry', key, source);
  }

  removeMembership(batchKey: string, requestedIndex: number, expectedKey: string): boolean {
    const batch = this.batches.get(batchKey);
    if (!batch) return false;
    const index = requestedIndex >= 0 && requestedIndex < batch.keys.length && batch.keys[requestedIndex] === expectedKey ? requestedIndex : batch.keys.indexOf(expectedKey);
    if (index < 0) return false;
    const last = batch.keys.length - 1;
    if (index !== last) {
      const movedKey = batch.keys[last];
      const movedPosition = batch.positions[last];
      batch.keys[index] = movedKey;
      batch.positions[index] = movedPosition;
      const movedEntry = this.options.getEntry(movedKey);
      if (movedEntry?.instanceBatchKey === batchKey) this.options.setEntryObject?.(movedKey, batchKey, index, batch.parts[0]);
      this.ownershipIndex.set(movedKey, { batchKey, index });
      const translation = this.translation.makeTranslation(movedPosition.x, movedPosition.y, movedPosition.z);
      batch.parts.forEach((part, partIndex) => {
        this.transformed.copy(translation).multiply(batch.templates[partIndex].matrix);
        part.setMatrixAt(index, this.transformed);
        const voxels = part.userData['instanceVoxels'] as VoxelCoordinate[];
        const keys = part.userData['instanceKeys'] as string[];
        voxels[index] = { ...movedPosition };
        keys[index] = movedKey;
        part.instanceMatrix.needsUpdate = true;
      });
    }
    batch.keys.pop();
    batch.positions.pop();
    this.ownershipIndex.delete(expectedKey);
    batch.parts.forEach((part) => {
      (part.userData['instanceVoxels'] as VoxelCoordinate[]).pop();
      (part.userData['instanceKeys'] as string[]).pop();
      part.count = batch.keys.length;
      part.instanceMatrix.needsUpdate = true;
    });
    this.options.record('instancedBlockRemovals');
    this.options.record('instancedMembers', -1);
    if (!batch.keys.length) {
      for (const part of batch.parts) { this.options.blocksGroup.remove(part); const materials = Array.isArray(part.material) ? part.material : [part.material]; for (const material of materials) material.dispose(); }
      this.batches.delete(batchKey);
      for (const template of batch.templates) this.options.disposeMergedTemplateGeometry(template, this.batches);
      this.options.record('instancedMeshCount', -batch.parts.length);
    }
    return true;
  }

  reconcile(entries: ReadonlyMap<string, InstanceBatchEntry>): void {
    const memberships = new Map<string, { batchKey: string; index: number }[]>();
    for (const [batchKey, batch] of this.batches) for (const [index, key] of batch.keys.entries()) {
      const list = memberships.get(key) ?? [];
      list.push({ batchKey, index });
      memberships.set(key, list);
    }
    for (const [key, list] of memberships) {
      const entry = entries.get(key);
      const preferred = entry?.instanceBatchKey && entry.instanceIndex !== undefined ? list.find((membership) => membership.batchKey === entry.instanceBatchKey && membership.index === entry.instanceIndex) ?? list[0] : list[0];
      const extras = (entry ? list.filter((membership) => membership !== preferred) : list).sort((left, right) => right.index - left.index);
      for (const membership of extras) this.removeMembership(membership.batchKey, membership.index, key);
    }
    this.ownershipIndex.clear();
    for (const [batchKey, batch] of this.batches) for (const [index, key] of batch.keys.entries()) {
      if (this.ownershipIndex.has(key)) continue;
      this.ownershipIndex.set(key, { batchKey, index });
      this.options.setEntryObject?.(key, batchKey, index, batch.parts[0]);
    }
    for (const [key, entry] of entries) if (entry.instanceBatchKey && !this.ownershipIndex.has(key)) this.options.setEntryObject?.(key, undefined, undefined, entry.object);
  }

  clear(): void {
    for (const batch of [...this.batches.values()]) {
      for (const part of batch.parts) { this.options.blocksGroup.remove(part); const materials = Array.isArray(part.material) ? part.material : [part.material]; for (const material of materials) material.dispose(); }
      this.batches.delete(batch.key);
      for (const template of batch.templates) this.options.disposeMergedTemplateGeometry(template, this.batches);
    }
    this.batches.clear();
    this.ownershipIndex.clear();
  }
}
