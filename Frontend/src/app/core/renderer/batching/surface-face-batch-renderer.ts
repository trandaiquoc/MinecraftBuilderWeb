import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceDirection } from '../visibility/exposed-face-rendering';
import { instanceMaterialCompatibilityKey } from './instance-template-cache';
import type { RenderRegionPolicy } from './render-region-policy';

export interface SurfaceFaceTemplate {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly direction: SurfaceFaceDirection;
  readonly matrix: THREE.Matrix4;
}

export interface SurfaceFaceMembership {
  readonly batchKey: string;
  readonly index: number;
}

export interface SurfaceFaceEntry {
  readonly key?: string;
  readonly surfaceFaceMemberships?: readonly SurfaceFaceMembership[];
  readonly surfaceExposedFaceCount?: number;
  readonly surfaceNeighborFacesCulled?: number;
}

export interface SurfaceFaceBatch {
  readonly key: string;
  readonly regionKey: string;
  readonly segment: number;
  readonly layer: number;
  readonly capacity: number;
  readonly template: SurfaceFaceTemplate;
  readonly mesh: THREE.InstancedMesh;
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
  readonly directions: SurfaceFaceDirection[];
  renderRole: 'normal' | 'reference';
}

export interface SurfaceFaceBatchRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly capacity: number;
  readonly chunkKey: (position: VoxelCoordinate) => string;
  readonly stableBounds: (chunk: string, envelope: THREE.Box3) => THREE.Box3;
  readonly regionPolicy?: RenderRegionPolicy;
  readonly unitEnvelope: () => THREE.Box3;
  readonly record: (name: string, delta?: number) => void;
  readonly getEntry: (key: string) => SurfaceFaceEntry | undefined;
  readonly setMemberships?: (key: string, memberships: readonly SurfaceFaceMembership[] | undefined) => boolean;
}

/** Owns the legacy exposed-face InstancedMesh representation. */
export class SurfaceFaceBatchRenderer {
  private readonly batchStore = new Map<string, SurfaceFaceBatch>();
  private readonly ownershipStore = new Map<string, SurfaceFaceMembership[]>();
  private readonly hiddenKeys = new Set<string>();
  private readonly templateStore = new Map<string, readonly SurfaceFaceTemplate[]>();
  private readonly templatesByKey = new Map<string, readonly SurfaceFaceTemplate[]>();
  private readonly translation = new THREE.Matrix4();
  private readonly hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly swapMatrix = new THREE.Matrix4();
  private visibleLayers?: ReadonlySet<number>;
  private layerPresentation?: { readonly currentY: number; readonly referenceOpacity: number };

  constructor(private readonly options: SurfaceFaceBatchRendererOptions) {}

  get batches(): ReadonlyMap<string, SurfaceFaceBatch> { return this.batchStore; }
  get ownership(): ReadonlyMap<string, SurfaceFaceMembership[]> { return this.ownershipStore; }
  get templateCache(): ReadonlyMap<string, readonly SurfaceFaceTemplate[]> { return this.templateStore; }
  templatesFor(key: string): readonly SurfaceFaceTemplate[] | undefined { return this.templateStore.get(key); }
  cacheTemplates(key: string, templates: readonly SurfaceFaceTemplate[]): void { this.templateStore.set(key, templates); }

  setMemberVisible(key: string, visible: boolean): boolean {
    const memberships = this.ownershipStore.get(key);
    if (!memberships) return false;
    if (visible) this.hiddenKeys.delete(key);
    else this.hiddenKeys.add(key);
    for (const membership of memberships) {
      const batch = this.batchStore.get(membership.batchKey);
      if (!batch) continue;
      if (visible) {
        const position = batch.positions[membership.index];
        batch.mesh.setMatrixAt(membership.index, this.translation.makeTranslation(position.x, position.y, position.z).multiply(batch.template.matrix));
      } else batch.mesh.setMatrixAt(membership.index, this.hiddenMatrix);
      batch.mesh.instanceMatrix.needsUpdate = true;
      this.options.record('instanceMatrixWrites');
    }
    return true;
  }

  add(block: { readonly position: VoxelCoordinate }, key: string, templates: readonly SurfaceFaceTemplate[], exposed: ReadonlySet<SurfaceFaceDirection>, role: 'normal' | 'reference' = 'normal', referenceOpacity = .28): readonly SurfaceFaceMembership[] | undefined {
    if (templates.length !== 6) return undefined;
    const memberships: SurfaceFaceMembership[] = [];
    for (const template of templates) {
      if (!exposed.has(template.direction)) continue;
      const region = this.options.regionPolicy?.key(block.position) ?? this.options.chunkKey(block.position);
      const layer = this.layerPresentation ? Math.trunc(block.position.y) : -1;
      const roleKey = this.layerPresentation ? '' : `|role:${role}`;
      const baseKey = `${region}|layer:${layer}|surface${roleKey}|${instanceMaterialCompatibilityKey(template.material)}|${surfaceFaceGeometrySignature(template.geometry)}`;
      let segment = 0;
      let batchKey = `${baseKey}|segment:${segment}`;
      let batch = this.batchStore.get(batchKey);
      while (batch && batch.keys.length >= batch.capacity) {
        segment += 1;
        batchKey = `${baseKey}|segment:${segment}`;
        batch = this.batchStore.get(batchKey);
      }
      if (!batch) {
        const material = template.material.clone();
        material.transparent = role === 'reference' || template.material.transparent;
        material.opacity = role === 'reference' ? referenceOpacity : template.material.opacity;
        const mesh = new THREE.InstancedMesh(template.geometry, material, this.options.capacity);
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.userData['instanceVoxels'] = [];
        mesh.userData['instanceKeys'] = [];
        mesh.userData['instanceFaceDirections'] = [];
        mesh.userData['surfaceFaceBatch'] = true;
        mesh.userData['realModel'] = true;
        mesh.userData['instanceBatchKey'] = batchKey;
        this.options.blocksGroup.add(mesh);
        if (this.visibleLayers) mesh.visible = this.visibleLayers.has(layer);
        mesh.boundingBox = this.options.regionPolicy?.bounds(region, this.options.unitEnvelope()) ?? this.options.stableBounds(region, this.options.unitEnvelope());
        mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
        this.options.record('instancedBoundsComputations');
        batch = { key: batchKey, regionKey: region, segment, layer, capacity: this.options.capacity, template, mesh, keys: [], positions: [], directions: [], renderRole: role };
        this.batchStore.set(batchKey, batch);
      }
      if (this.layerPresentation) this.setBatchRole(batch, layer === this.layerPresentation.currentY ? 'normal' : 'reference', this.layerPresentation.referenceOpacity);
      if (batch.keys.length >= batch.capacity) return undefined;
      const index = batch.keys.length;
      const position = { ...block.position };
      batch.keys.push(key);
      batch.positions.push(position);
      batch.directions.push(template.direction);
      batch.mesh.setMatrixAt(index, this.translation.makeTranslation(position.x, position.y, position.z).multiply(template.matrix));
      batch.mesh.count = index + 1;
      batch.mesh.instanceMatrix.needsUpdate = true;
      this.options.record('instanceMatrixWrites');
      (batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[]).push(position);
      (batch.mesh.userData['instanceKeys'] as string[]).push(key);
      (batch.mesh.userData['instanceFaceDirections'] as SurfaceFaceDirection[]).push(template.direction);
      memberships.push({ batchKey, index });
    }
    this.ownershipStore.set(key, memberships);
    this.templatesByKey.set(key, templates);
    this.hiddenKeys.delete(key);
    this.options.record('surfaceFastPathBlocks');
    this.options.record('exposedFaceInstances', memberships.length);
    this.options.record('neighborFacesCulled', 6 - memberships.length);
    if (role === 'reference') for (const membership of memberships) {
      const material = this.batchStore.get(membership.batchKey)?.mesh.material;
      if (material) for (const item of Array.isArray(material) ? material : [material]) { item.transparent = true; item.opacity = referenceOpacity; item.needsUpdate = true; }
    }
    return memberships;
  }

  setMemberRole(key: string, role: 'normal' | 'reference', referenceOpacity = .28): boolean {
    const memberships = this.ownershipStore.get(key);
    const templates = this.templatesByKey.get(key);
    if (!memberships?.length || !templates) return false;
    if (this.layerPresentation) return true;
    const firstMembership = memberships[0];
    const firstBatch = this.batchStore.get(firstMembership.batchKey);
    const position = firstBatch?.positions[firstMembership.index];
    if (!position) return false;
    if (memberships.every((membership) => this.batchStore.get(membership.batchKey)?.renderRole === role)) return true;
    const exposed = new Set(memberships.flatMap((membership) => {
      const batch = this.batchStore.get(membership.batchKey);
      return batch ? [batch.directions[membership.index]] : [];
    }));
    const wasHidden = this.hiddenKeys.has(key);
    this.remove(key, this.options.getEntry(key));
    const moved = this.add({ position }, key, templates, exposed, role, referenceOpacity);
    if (!moved) return false;
    if (wasHidden) this.setMemberVisible(key, false);
    return true;
  }

  /** Applies Y-layer visibility and role at batch granularity. */
  setLayerPresentation(visibleLayers: ReadonlySet<number>, currentY: number, referenceOpacity: number): void {
    this.visibleLayers = visibleLayers;
    this.layerPresentation = { currentY, referenceOpacity };
    for (const batch of this.batchStore.values()) {
      const visible = visibleLayers.has(batch.layer);
      if (batch.mesh.visible !== visible) {
        batch.mesh.visible = visible;
        this.options.record('yLayerBatchVisibilityUpdates');
      }
      this.setBatchRole(batch, batch.layer === currentY ? 'normal' : 'reference', referenceOpacity);
    }
  }

  clearLayerPresentation(): void {
    this.visibleLayers = undefined;
    this.layerPresentation = undefined;
    for (const batch of this.batchStore.values()) {
      batch.mesh.visible = true;
      this.setBatchRole(batch, 'normal', 1);
    }
  }

  private setLayerRole(layer: number, role: 'normal' | 'reference', opacity: number): void {
    for (const batch of this.batchStore.values()) if (batch.layer === layer) this.setBatchRole(batch, role, opacity);
  }

  private setBatchRole(batch: SurfaceFaceBatch, role: 'normal' | 'reference', referenceOpacity: number): void {
    if (batch.renderRole === role) return;
    batch.renderRole = role;
    const materials = Array.isArray(batch.mesh.material) ? batch.mesh.material : [batch.mesh.material];
    for (const material of materials) {
      material.transparent = role === 'reference' || batch.template.material.transparent;
      material.opacity = role === 'reference' ? referenceOpacity : batch.template.material.opacity;
      material.needsUpdate = true;
    }
    this.options.record(this.layerPresentation ? 'yLayerBatchRoleUpdates' : 'renderBatchRoleUpdates');
  }

  setReferenceOpacity(opacity: number): void {
    for (const batch of this.batchStore.values()) {
      if (batch.renderRole !== 'reference') continue;
      for (const material of Array.isArray(batch.mesh.material) ? batch.mesh.material : [batch.mesh.material]) {
        material.transparent = true;
        material.opacity = Math.max(0, Math.min(1, opacity));
        material.needsUpdate = true;
      }
    }
  }

  remove(key: string, entry?: SurfaceFaceEntry): void {
    const memberships = this.ownershipStore.get(key) ?? entry?.surfaceFaceMemberships ?? [];
    for (const membership of [...memberships].sort((left, right) => right.index - left.index)) this.removeMembership(membership.batchKey, membership.index, key);
    this.ownershipStore.delete(key);
    this.hiddenKeys.delete(key);
    this.templatesByKey.delete(key);
    if (entry?.surfaceFaceMemberships !== undefined) {
      this.options.record('surfaceFastPathBlocks', -1);
      this.options.record('exposedFaceInstances', -(entry.surfaceExposedFaceCount ?? memberships.length));
      this.options.record('neighborFacesCulled', -(entry.surfaceNeighborFacesCulled ?? 6 - memberships.length));
      this.options.setMemberships?.(key, undefined);
    }
  }

  removeMembership(batchKey: string, requestedIndex: number, expectedKey: string): void {
    const batch = this.batchStore.get(batchKey);
    if (!batch) return;
    const index = requestedIndex >= 0 && requestedIndex < batch.keys.length && batch.keys[requestedIndex] === expectedKey ? requestedIndex : batch.keys.indexOf(expectedKey);
    if (index < 0) return;
    const last = batch.keys.length - 1;
    if (index !== last) {
      const movedKey = batch.keys[last];
      const movedPosition = batch.positions[last];
      const movedDirection = batch.directions[last];
      batch.keys[index] = movedKey;
      batch.positions[index] = movedPosition;
      batch.directions[index] = movedDirection;
      batch.mesh.getMatrixAt(last, this.swapMatrix);
      batch.mesh.setMatrixAt(index, this.swapMatrix);
      this.options.record('instanceMatrixWrites');
      const voxels = batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[];
      const keys = batch.mesh.userData['instanceKeys'] as string[];
      const directions = batch.mesh.userData['instanceFaceDirections'] as SurfaceFaceDirection[];
      voxels[index] = movedPosition;
      keys[index] = movedKey;
      directions[index] = movedDirection;
      const movedMemberships = this.ownershipStore.get(movedKey);
      const movedMembershipIndex = movedMemberships?.findIndex((membership) => membership.batchKey === batchKey && membership.index === last) ?? -1;
      if (movedMemberships && movedMembershipIndex >= 0) movedMemberships[movedMembershipIndex] = { batchKey, index };
      const movedEntry = this.options.getEntry(movedKey);
      if (movedEntry?.surfaceFaceMemberships) this.options.setMemberships?.(movedKey, movedMemberships);
    }
    batch.keys.pop();
    batch.positions.pop();
    batch.directions.pop();
    (batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[]).pop();
    (batch.mesh.userData['instanceKeys'] as string[]).pop();
    (batch.mesh.userData['instanceFaceDirections'] as SurfaceFaceDirection[]).pop();
    batch.mesh.count = batch.keys.length;
    batch.mesh.instanceMatrix.needsUpdate = true;
    if (!batch.keys.length) {
      this.options.blocksGroup.remove(batch.mesh);
      batch.mesh.dispose();
      const materials = Array.isArray(batch.mesh.material) ? batch.mesh.material : [batch.mesh.material];
      for (const material of materials) material.dispose();
      this.batchStore.delete(batchKey);
    }
  }

  clear(entries: Iterable<SurfaceFaceEntry>): void {
    for (const entry of entries) if (entry.surfaceFaceMemberships !== undefined) {
      this.options.record('surfaceFastPathBlocks', -1);
      this.options.record('exposedFaceInstances', -(entry.surfaceExposedFaceCount ?? entry.surfaceFaceMemberships.length));
      this.options.record('neighborFacesCulled', -(entry.surfaceNeighborFacesCulled ?? 6 - entry.surfaceFaceMemberships.length));
      if (entry.key) this.options.setMemberships?.(entry.key, undefined);
    }
    for (const batch of this.batchStore.values()) {
      this.options.blocksGroup.remove(batch.mesh);
      batch.mesh.dispose();
      const materials = Array.isArray(batch.mesh.material) ? batch.mesh.material : [batch.mesh.material];
      for (const material of materials) material.dispose();
    }
    this.batchStore.clear();
    this.ownershipStore.clear();
    this.hiddenKeys.clear();
    this.templatesByKey.clear();
    for (const templates of this.templateStore.values()) for (const template of templates) { template.geometry.dispose(); template.material.dispose(); }
    this.templateStore.clear();
  }
}

function surfaceFaceGeometrySignature(geometry: THREE.BufferGeometry): string {
  return Object.entries(geometry.attributes).sort(([left], [right]) => left.localeCompare(right)).map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${Array.from(attribute.array).join(',')}`).join('|');
}
