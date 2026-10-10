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
  readonly layer: number;
  readonly groupIds: readonly string[];
  readonly capacity: number;
  readonly templates: readonly InstancePartTemplate[];
  readonly parts: readonly THREE.InstancedMesh[];
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
  renderRole: 'normal' | 'reference';
}

export interface InstanceBatchRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly capacity: number;
  /** Capacity for layer-scoped batches, bounded by one horizontal render region. */
  readonly layerCapacity?: number;
  readonly chunkKey: (position: VoxelCoordinate) => string;
  readonly stableBounds: (chunk: string, envelope: THREE.Box3) => THREE.Box3;
  readonly regionPolicy?: RenderRegionPolicy;
  readonly record: (name: string, delta?: number) => void;
  readonly getEntry: (key: string) => InstanceBatchEntry | undefined;
  readonly setEntryObject?: (key: string, batchKey: string | undefined, index: number | undefined, object: THREE.Object3D | undefined) => void;
  readonly disposeMergedTemplateGeometry?: (template: InstancePartTemplate, batches: ReadonlyMap<string, InstanceBatch>) => void;
  readonly trace?: (phase: 'before-insert' | 'after-insert' | 'before-remove' | 'after-remove' | 'after-remove-entry', key: string, source: 'cached-template' | 'provider-async' | 'rollback' | 'reconcile') => void;
}

/** Owns reusable InstancedMesh batches and their swap-back ownership index. */
export class InstanceBatchRenderer {
  private readonly batchStore = new Map<string, InstanceBatch>();
  private readonly ownershipStore = new Map<string, { readonly batchKey: string; readonly index: number }>();
  private readonly hiddenKeys = new Set<string>();
  private readonly translation = new THREE.Matrix4();
  private readonly transformed = new THREE.Matrix4();
  private visibleLayers?: ReadonlySet<number>;
  private layerPresentation?: {
    readonly currentY: number;
    readonly hiddenGroupIds: ReadonlySet<string>;
    readonly isolatedGroupId?: string;
  };

  constructor(private readonly options: InstanceBatchRendererOptions) {}

  get batches(): ReadonlyMap<string, InstanceBatch> { return this.batchStore; }
  get ownershipIndex(): ReadonlyMap<string, { readonly batchKey: string; readonly index: number }> { return this.ownershipStore; }

  addFromTemplates(
    templates: readonly InstancePartTemplate[],
    position: VoxelCoordinate,
    key: string,
    source: 'provider-async' | 'cached-template' = 'provider-async',
    compiled?: CompiledInstanceTemplates,
    renderRole: 'normal' | 'reference' = 'normal',
    groupIds: readonly string[] = [],
  ): { readonly batchKey: string; readonly index: number } | undefined {
    const resolved = compiled ?? compileInstanceTemplates(templates);
    if (this.options.capacity <= 0 || !resolved.templates.length) return undefined;
    const region = this.options.regionPolicy?.key(position) ?? this.options.chunkKey(position);
    const layer = this.layerPresentation ? Math.trunc(position.y) : -1;
    const roleKey = this.layerPresentation ? '' : `|role:${renderRole}`;
    const normalizedGroupIds = this.layerPresentation ? [...new Set(groupIds)].sort() : [];
    const groupKey = normalizedGroupIds.join('\u001f');
    const capacity = this.layerPresentation ? this.options.layerCapacity ?? this.options.capacity : this.options.capacity;
    const baseKey = `${region}|layer:${layer}|${resolved.signature}${roleKey}|groups:${groupKey}`;
    const existingEntry = this.options.getEntry(key);
    const existingMembership = existingEntry?.instanceBatchKey
      ? this.batchStore.get(existingEntry.instanceBatchKey)
      : this.ownershipStore.get(key) ? this.batchStore.get(this.ownershipStore.get(key)!.batchKey) : undefined;
    let segment = 0;
    let batchKey = `${baseKey}|segment:${segment}`;
    let batch = this.batchStore.get(batchKey);
    // Do not select a one-member batch that is also the old membership: removing
    // its last member disposes its meshes before the replacement is inserted.
    while (batch && (batch.keys.length >= batch.capacity || batch === existingMembership && batch.keys.length === 1)) {
      segment += 1;
      batchKey = `${baseKey}|segment:${segment}`;
      batch = this.batchStore.get(batchKey);
    }
    if (!batch) {
      const parts = resolved.templates.map((template) => {
        const material = template.material.clone();
        material.transparent = renderRole === 'reference';
        material.opacity = renderRole === 'reference' ? this.referenceOpacity : 1;
        material.depthWrite = true;
        const mesh = new THREE.InstancedMesh(template.geometry, material, capacity);
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
      batch = { key: batchKey, regionKey: region, segment, layer, groupIds: normalizedGroupIds, capacity, templates: resolved.templates, parts, keys: [], positions: [], renderRole };
      this.batchStore.set(batchKey, batch);
      if (this.visibleLayers) for (const part of parts) part.visible = this.isBatchVisible(batch);
      if (this.layerPresentation) this.setBatchRole(batch, layer === this.layerPresentation.currentY ? 'normal' : 'reference');
      this.options.record('instancedBatchCreations');
      this.options.record('instancedMeshCount', parts.length);
    }
    if (this.layerPresentation) this.setBatchRole(batch, layer === this.layerPresentation.currentY ? 'normal' : 'reference');
    if (batch.keys.length >= batch.capacity) return undefined;
    this.options.trace?.('before-insert', key, source);
    if (existingEntry?.instanceBatchKey) this.remove(key, existingEntry, 'reconcile');
    else if (this.ownershipStore.has(key)) this.removeOrphaned(key, 'reconcile', existingEntry);
    this.hiddenKeys.delete(key);
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
    this.options.record('instanceMatrixWrites', batch.parts.length);
    this.options.record('instancedBlockAdds');
    this.options.record('instancedMembers');
    this.ownershipStore.set(key, { batchKey, index });
    this.options.setEntryObject?.(key, batchKey, index, batch.parts[0]);
    this.options.trace?.('after-insert', key, source);
    return { batchKey, index };
  }

  private referenceOpacity = .28;

  setReferenceOpacity(opacity: number): void {
    this.referenceOpacity = Math.max(0, Math.min(1, opacity));
    for (const batch of this.batchStore.values()) {
      if (batch.renderRole !== 'reference') continue;
      for (const part of batch.parts) {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of materials) { material.transparent = true; material.opacity = this.referenceOpacity; material.needsUpdate = true; }
      }
    }
  }

  setMemberVisible(key: string, visible: boolean): boolean {
    const membership = this.ownershipStore.get(key);
    const batch = membership ? this.batchStore.get(membership.batchKey) : undefined;
    if (!membership || !batch) return false;
    if (visible) this.hiddenKeys.delete(key);
    else this.hiddenKeys.add(key);
    this.writeMemberMatrices(batch, membership.index, key, visible);
    return true;
  }

  setMemberRole(key: string, role: 'normal' | 'reference'): boolean {
    const membership = this.ownershipStore.get(key);
    const batch = membership ? this.batchStore.get(membership.batchKey) : undefined;
    if (!membership || !batch) return false;
    if (this.layerPresentation) return true;
    if (batch.renderRole === role) return true;
    const wasHidden = this.hiddenKeys.has(key);
    const moved = this.addFromTemplates(batch.templates, batch.positions[membership.index], key, 'cached-template', undefined, role, batch.groupIds);
    if (!moved) return false;
    if (wasHidden) this.setMemberVisible(key, false);
    return true;
  }

  /** Applies Y-layer presentation without rewriting per-voxel instance matrices. */
  setLayerPresentation(
    visibleLayers: ReadonlySet<number>,
    currentY: number,
    referenceOpacity: number,
    hiddenGroupIds: ReadonlySet<string> = new Set(),
    isolatedGroupId?: string,
  ): void {
    this.visibleLayers = visibleLayers;
    this.referenceOpacity = Math.max(0, Math.min(1, referenceOpacity));
    this.layerPresentation = { currentY, hiddenGroupIds, isolatedGroupId };
    for (const batch of this.batchStore.values()) {
      for (const part of batch.parts) {
        const visible = this.isBatchVisible(batch);
        if (part.visible !== visible) {
          part.visible = visible;
          this.options.record('yLayerBatchVisibilityUpdates');
        }
      }
      this.setBatchRole(batch, batch.layer === currentY ? 'normal' : 'reference');
    }
  }

  clearLayerPresentation(): void {
    this.visibleLayers = undefined;
    this.layerPresentation = undefined;
    for (const batch of this.batchStore.values()) {
      for (const part of batch.parts) part.visible = true;
      this.setBatchRole(batch, 'normal');
    }
  }

  private isBatchVisible(batch: InstanceBatch): boolean {
    if (!this.visibleLayers?.has(batch.layer)) return false;
    const presentation = this.layerPresentation;
    if (!presentation) return true;
    if (batch.groupIds.some((id) => presentation.hiddenGroupIds.has(id))) return false;
    return !presentation.isolatedGroupId || batch.groupIds.includes(presentation.isolatedGroupId);
  }

  private setLayerRole(layer: number, role: 'normal' | 'reference'): void {
    for (const batch of this.batchStore.values()) if (batch.layer === layer) this.setBatchRole(batch, role);
  }

  private setBatchRole(batch: InstanceBatch, role: 'normal' | 'reference'): void {
    if (batch.renderRole === role) return;
    batch.renderRole = role;
    for (const part of batch.parts) {
      const materials = Array.isArray(part.material) ? part.material : [part.material];
      for (const material of materials) {
        material.transparent = role === 'reference';
        material.opacity = role === 'reference' ? this.referenceOpacity : 1;
        material.needsUpdate = true;
      }
    }
    this.options.record(this.layerPresentation ? 'yLayerBatchRoleUpdates' : 'renderBatchRoleUpdates');
  }

  remove(key: string, entry: InstanceBatchEntry | undefined, source: 'rollback' | 'reconcile' = 'reconcile'): void {
    this.options.trace?.('before-remove', key, 'reconcile');
    this.removeOrphaned(key, source, entry);
    this.options.setEntryObject?.(key, undefined, undefined, entry?.object);
    this.options.trace?.('after-remove', key, 'reconcile');
  }

  memberships(key: string, scanAll = false): readonly { readonly batchKey: string; readonly index: number }[] {
    if (!scanAll) {
      const indexed = this.ownershipStore.get(key);
      return indexed ? [{ ...indexed }] : [];
    }
    const memberships: { batchKey: string; index: number }[] = [];
    for (const [batchKey, batch] of this.batchStore) for (const [index, memberKey] of batch.keys.entries()) if (memberKey === key) memberships.push({ batchKey, index });
    return memberships;
  }

  removeOrphaned(key: string, source: 'rollback' | 'reconcile', entry?: InstanceBatchEntry): void {
    const indexed = this.ownershipStore.get(key);
    const knownBatchKey = entry?.instanceBatchKey ?? indexed?.batchKey;
    const knownIndex = entry?.instanceIndex ?? indexed?.index;
    // A missing canonical/index entry is not evidence that this key exists in
    // some batch. Fresh hydration calls this before insertion; scanning every
    // batch there turns N-block hydration into O(N * batches).
    if (!knownBatchKey) {
      this.ownershipStore.delete(key);
      this.options.setEntryObject?.(key, undefined, undefined, entry?.object);
      if (source === 'rollback') this.options.trace?.('after-remove-entry', key, source);
      return;
    }
    const knownRemoved = knownBatchKey !== undefined && knownIndex !== undefined ? this.removeMembership(knownBatchKey, knownIndex, key) : false;
    let memberships = !knownRemoved ? this.memberships(key, true) : [];
    while (memberships.length) {
      for (const membership of memberships.slice().sort((left, right) => right.index - left.index)) this.removeMembership(membership.batchKey, membership.index, key);
      const next = this.memberships(key, true);
      if (next.length >= memberships.length) break;
      memberships = next;
    }
    this.ownershipStore.delete(key);
    this.options.setEntryObject?.(key, undefined, undefined, entry?.object);
    if (source === 'rollback') this.options.trace?.('after-remove-entry', key, source);
  }

  removeMembership(batchKey: string, requestedIndex: number, expectedKey: string): boolean {
    const batch = this.batchStore.get(batchKey);
    if (!batch) return false;
    const index = requestedIndex >= 0 && requestedIndex < batch.keys.length && batch.keys[requestedIndex] === expectedKey ? requestedIndex : batch.keys.indexOf(expectedKey);
    if (index < 0) return false;
    const last = batch.keys.length - 1;
    if (index !== last) {
      const movedKey = batch.keys[last];
      const movedPosition = batch.positions[last];
      batch.keys[index] = movedKey;
      batch.positions[index] = movedPosition;
      for (const part of batch.parts) {
        const keys = part.userData['instanceKeys'] as string[];
        const voxels = part.userData['instanceVoxels'] as VoxelCoordinate[];
        keys[index] = movedKey;
        voxels[index] = { ...movedPosition };
      }
      const movedEntry = this.options.getEntry(movedKey);
      if (movedEntry?.instanceBatchKey === batchKey) this.options.setEntryObject?.(movedKey, batchKey, index, batch.parts[0]);
      this.ownershipStore.set(movedKey, { batchKey, index });
      this.writeMemberMatrices(batch, index, movedKey, !this.hiddenKeys.has(movedKey));
      batch.parts.forEach((part) => {
        const voxels = part.userData['instanceVoxels'] as VoxelCoordinate[];
        voxels[index] = { ...movedPosition };
        part.instanceMatrix.needsUpdate = true;
      });
    }
    batch.keys.pop();
    batch.positions.pop();
    this.ownershipStore.delete(expectedKey);
    this.hiddenKeys.delete(expectedKey);
    batch.parts.forEach((part) => {
      (part.userData['instanceVoxels'] as VoxelCoordinate[]).pop();
      (part.userData['instanceKeys'] as string[]).pop();
      part.count = batch.keys.length;
      part.instanceMatrix.needsUpdate = true;
    });
    this.options.record('instancedBlockRemovals');
    this.options.record('instancedMembers', -1);
    if (!batch.keys.length) {
      for (const part of batch.parts) { this.options.blocksGroup.remove(part); part.dispose(); const materials = Array.isArray(part.material) ? part.material : [part.material]; for (const material of materials) material.dispose(); }
      this.batchStore.delete(batchKey);
      for (const template of batch.templates) this.disposeMergedTemplateGeometry(template);
      this.options.record('instancedMeshCount', -batch.parts.length);
    }
    return true;
  }

  reconcile(entries: ReadonlyMap<string, InstanceBatchEntry>): void {
    const memberships = new Map<string, { batchKey: string; index: number }[]>();
    for (const [batchKey, batch] of this.batchStore) for (const [index, key] of batch.keys.entries()) {
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
    this.ownershipStore.clear();
    for (const [batchKey, batch] of this.batchStore) for (const [index, key] of batch.keys.entries()) {
      if (this.ownershipStore.has(key)) continue;
      this.ownershipStore.set(key, { batchKey, index });
      this.options.setEntryObject?.(key, batchKey, index, batch.parts[0]);
    }
    for (const [key, entry] of entries) if (entry.instanceBatchKey && !this.ownershipStore.has(key)) this.options.setEntryObject?.(key, undefined, undefined, entry.object);
  }

  clear(): void {
    for (const batch of [...this.batchStore.values()]) {
      for (const part of batch.parts) { this.options.blocksGroup.remove(part); part.dispose(); const materials = Array.isArray(part.material) ? part.material : [part.material]; for (const material of materials) material.dispose(); }
      this.batchStore.delete(batch.key);
      for (const template of batch.templates) this.disposeMergedTemplateGeometry(template);
    }
    this.batchStore.clear();
    this.ownershipStore.clear();
    this.hiddenKeys.clear();
  }

  private writeMemberMatrices(batch: InstanceBatch, index: number, key: string, visible: boolean): void {
    if (!visible) {
      this.transformed.makeScale(0, 0, 0);
      for (const part of batch.parts) part.setMatrixAt(index, this.transformed);
    } else {
      const position = batch.positions[index];
      const translation = this.translation.makeTranslation(position.x, position.y, position.z);
      batch.parts.forEach((part, partIndex) => {
        this.transformed.copy(translation).multiply(batch.templates[partIndex].matrix);
        part.setMatrixAt(index, this.transformed);
      });
    }
    for (const part of batch.parts) {
      part.instanceMatrix.needsUpdate = true;
      const keys = part.userData['instanceKeys'] as string[];
      if (keys[index] !== key) throw new Error(`Instance membership changed while toggling ${key}`);
    }
    this.options.record('instanceMatrixWrites', batch.parts.length);
  }

  private disposeMergedTemplateGeometry(template: InstancePartTemplate): void {
    if (this.options.disposeMergedTemplateGeometry) { this.options.disposeMergedTemplateGeometry(template, this.batchStore); return; }
    if ([...this.batchStore.values()].some((batch) => batch.templates.includes(template))) return;
    if (template.ownsGeometry && template.geometry.userData['mergedInstanceTemplateGeometry']) template.geometry.dispose();
  }
}
