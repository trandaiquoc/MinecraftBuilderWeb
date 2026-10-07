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
  surfaceFaceMemberships?: readonly SurfaceFaceMembership[];
  surfaceExposedFaceCount?: number;
  surfaceNeighborFacesCulled?: number;
}

export interface SurfaceFaceBatch {
  readonly key: string;
  readonly regionKey: string;
  readonly segment: number;
  readonly capacity: number;
  readonly template: SurfaceFaceTemplate;
  readonly mesh: THREE.InstancedMesh;
  readonly keys: string[];
  readonly positions: VoxelCoordinate[];
  readonly directions: SurfaceFaceDirection[];
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
}

/** Owns the legacy exposed-face InstancedMesh representation. */
export class SurfaceFaceBatchRenderer {
  readonly batches = new Map<string, SurfaceFaceBatch>();
  readonly ownership = new Map<string, SurfaceFaceMembership[]>();
  readonly templateCache = new Map<string, readonly SurfaceFaceTemplate[]>();
  private readonly translation = new THREE.Matrix4();

  constructor(private readonly options: SurfaceFaceBatchRendererOptions) {}

  add(block: { readonly position: VoxelCoordinate }, key: string, templates: readonly SurfaceFaceTemplate[], exposed: ReadonlySet<SurfaceFaceDirection>): readonly SurfaceFaceMembership[] | undefined {
    if (templates.length !== 6) return undefined;
    const memberships: SurfaceFaceMembership[] = [];
    for (const template of templates) {
      if (!exposed.has(template.direction)) continue;
      const region = this.options.regionPolicy?.key(block.position) ?? this.options.chunkKey(block.position);
      const baseKey = `${region}|surface|${instanceMaterialCompatibilityKey(template.material)}|${surfaceFaceGeometrySignature(template.geometry)}`;
      let segment = 0;
      let batchKey = `${baseKey}|segment:${segment}`;
      let batch = this.batches.get(batchKey);
      while (batch && batch.keys.length >= batch.capacity) {
        segment += 1;
        batchKey = `${baseKey}|segment:${segment}`;
        batch = this.batches.get(batchKey);
      }
      if (!batch) {
        const mesh = new THREE.InstancedMesh(template.geometry, template.material.clone(), this.options.capacity);
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.userData['instanceVoxels'] = [];
        mesh.userData['instanceKeys'] = [];
        mesh.userData['instanceFaceDirections'] = [];
        mesh.userData['surfaceFaceBatch'] = true;
        mesh.userData['realModel'] = true;
        mesh.userData['instanceBatchKey'] = batchKey;
        this.options.blocksGroup.add(mesh);
        mesh.boundingBox = this.options.regionPolicy?.bounds(region, this.options.unitEnvelope()) ?? this.options.stableBounds(region, this.options.unitEnvelope());
        mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
        this.options.record('instancedBoundsComputations');
        batch = { key: batchKey, regionKey: region, segment, capacity: this.options.capacity, template, mesh, keys: [], positions: [], directions: [] };
        this.batches.set(batchKey, batch);
      }
      if (batch.keys.length >= batch.capacity) return undefined;
      const index = batch.keys.length;
      const position = { ...block.position };
      batch.keys.push(key);
      batch.positions.push(position);
      batch.directions.push(template.direction);
      batch.mesh.setMatrixAt(index, this.translation.makeTranslation(position.x, position.y, position.z).multiply(template.matrix));
      batch.mesh.count = index + 1;
      batch.mesh.instanceMatrix.needsUpdate = true;
      (batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[]).push(position);
      (batch.mesh.userData['instanceKeys'] as string[]).push(key);
      (batch.mesh.userData['instanceFaceDirections'] as SurfaceFaceDirection[]).push(template.direction);
      memberships.push({ batchKey, index });
    }
    this.ownership.set(key, memberships);
    this.options.record('surfaceFastPathBlocks');
    this.options.record('exposedFaceInstances', memberships.length);
    this.options.record('neighborFacesCulled', 6 - memberships.length);
    return memberships;
  }

  remove(key: string, entry?: SurfaceFaceEntry): void {
    const memberships = this.ownership.get(key) ?? entry?.surfaceFaceMemberships ?? [];
    for (const membership of [...memberships].sort((left, right) => right.index - left.index)) this.removeMembership(membership.batchKey, membership.index, key);
    this.ownership.delete(key);
    if (entry?.surfaceFaceMemberships !== undefined) {
      this.options.record('surfaceFastPathBlocks', -1);
      this.options.record('exposedFaceInstances', -(entry.surfaceExposedFaceCount ?? memberships.length));
      this.options.record('neighborFacesCulled', -(entry.surfaceNeighborFacesCulled ?? 6 - memberships.length));
      entry.surfaceFaceMemberships = undefined;
      entry.surfaceExposedFaceCount = undefined;
      entry.surfaceNeighborFacesCulled = undefined;
    }
  }

  removeMembership(batchKey: string, requestedIndex: number, expectedKey: string): void {
    const batch = this.batches.get(batchKey);
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
      const voxels = batch.mesh.userData['instanceVoxels'] as VoxelCoordinate[];
      const keys = batch.mesh.userData['instanceKeys'] as string[];
      const directions = batch.mesh.userData['instanceFaceDirections'] as SurfaceFaceDirection[];
      voxels[index] = movedPosition;
      keys[index] = movedKey;
      directions[index] = movedDirection;
      const movedMemberships = this.ownership.get(movedKey);
      const movedMembershipIndex = movedMemberships?.findIndex((membership) => membership.batchKey === batchKey && membership.index === last) ?? -1;
      if (movedMemberships && movedMembershipIndex >= 0) movedMemberships[movedMembershipIndex] = { batchKey, index };
      const movedEntry = this.options.getEntry(movedKey);
      if (movedEntry?.surfaceFaceMemberships) movedEntry.surfaceFaceMemberships = movedMemberships;
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
      this.batches.delete(batchKey);
    }
  }

  clear(entries: Iterable<SurfaceFaceEntry>): void {
    for (const entry of entries) if (entry.surfaceFaceMemberships !== undefined) {
      this.options.record('surfaceFastPathBlocks', -1);
      this.options.record('exposedFaceInstances', -(entry.surfaceExposedFaceCount ?? entry.surfaceFaceMemberships.length));
      this.options.record('neighborFacesCulled', -(entry.surfaceNeighborFacesCulled ?? 6 - entry.surfaceFaceMemberships.length));
      entry.surfaceFaceMemberships = undefined;
      entry.surfaceExposedFaceCount = undefined;
      entry.surfaceNeighborFacesCulled = undefined;
    }
    for (const batch of this.batches.values()) {
      this.options.blocksGroup.remove(batch.mesh);
      batch.mesh.dispose();
      const materials = Array.isArray(batch.mesh.material) ? batch.mesh.material : [batch.mesh.material];
      for (const material of materials) material.dispose();
    }
    this.batches.clear();
    this.ownership.clear();
    for (const templates of this.templateCache.values()) for (const template of templates) { template.geometry.dispose(); template.material.dispose(); }
    this.templateCache.clear();
  }
}

function surfaceFaceGeometrySignature(geometry: THREE.BufferGeometry): string {
  return Object.entries(geometry.attributes).sort(([left], [right]) => left.localeCompare(right)).map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${Array.from(attribute.array).join(',')}`).join('|');
}
