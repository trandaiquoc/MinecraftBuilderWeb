import * as THREE from 'three';
import { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { buildFluidMeshData, FluidMeshRecord, fluidChunkKey } from './fluid-mesh-core';
import { FluidRenderResolver, FluidWorldLookup, ResolvedFluidRenderState } from './fluid-state';

export interface FluidChunkRecord { readonly block: PlacedBlock; readonly state: ResolvedFluidRenderState; readonly role?: 'normal' | 'reference'; }
export interface FluidChunkVisualProvider {
  readonly resolver: FluidRenderResolver;
  readonly texture: (resource: string) => Promise<THREE.Texture | undefined>;
}
export interface FluidChunkDiagnostics {
  readonly fluidLogicalVoxels: number;
  readonly fluidChunks: number;
  readonly fluidChunkMeshes: number;
  readonly fluidMaterialBuckets: number;
  readonly fluidStandaloneMeshes: number;
  readonly fluidFacesPotential: number;
  readonly fluidFacesCulled: number;
  readonly fluidFacesEmitted: number;
  readonly fluidChunkRebuilds: number;
  readonly fluidFullRebuilds: number;
  readonly fluidIncrementalRebuilds: number;
  readonly fluidDirtyChunksLastEdit: number;
  readonly fluidDescriptorResolutions: number;
  readonly fluidDescriptorCacheHits: number;
  readonly fluidDescriptorCacheMisses: number;
  readonly fluidFallbackVoxels: number;
  readonly fluidFallbackMeshes: number;
  readonly fluidByType: Readonly<Record<string, number>>;
  readonly fluidMeshesByRenderLayer: Readonly<Record<string, number>>;
}

interface FluidChunk { readonly key: string; readonly keys: Set<string>; readonly meshes: THREE.Mesh[]; readonly facesPotential: number; readonly facesCulled: number; readonly facesEmitted: number; }

/** Owns chunk geometry/material buckets and logical voxel ownership for fluids. */
export class FluidChunkRenderer {
  readonly group = new THREE.Group();
  private readonly records = new Map<string, FluidChunkRecord>();
  private readonly chunks = new Map<string, FluidChunk>();
  private readonly materialCache = new Map<string, THREE.Material>();
  private provider?: FluidChunkVisualProvider;
  private descriptorResolutions = 0;
  private descriptorCacheHits = 0;
  private descriptorCacheMisses = 0;
  private fullRebuilds = 0;
  private incrementalRebuilds = 0;
  private chunkRebuilds = 0;
  private dirtyChunksLastEdit = 0;
  private fallbackVoxels = 0;
  private fallbackMeshes = 0;
  private syncQueue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private byType = new Map<string, number>();
  private byLayer = new Map<string, number>();

  constructor(private readonly blocksGroup: THREE.Group, private readonly chunkSize = 16) {
    this.group.name = 'fluidChunks'; this.group.userData['fluidChunks'] = true;
  }

  setProvider(provider: FluidChunkVisualProvider | undefined): void {
    if (this.provider === provider) return;
    this.provider = provider;
    this.epoch += 1;
    this.clear();
    for (const material of this.materialCache.values()) material.dispose();
    this.materialCache.clear();
  }

  sync(records: readonly FluidChunkRecord[], world: FluidWorldLookup, changedPositions?: readonly VoxelCoordinate[]): Promise<void> {
    const epoch = this.epoch;
    const task = this.syncQueue.then(() => this.syncNow(records, world, changedPositions, epoch));
    this.syncQueue = task.catch(() => undefined);
    return task;
  }

  private async syncNow(records: readonly FluidChunkRecord[], world: FluidWorldLookup, changedPositions: readonly VoxelCoordinate[] | undefined, epoch: number): Promise<void> {
    if (epoch !== this.epoch) return;
    if (records.length && this.provider && this.group.parent !== this.blocksGroup) this.blocksGroup.add(this.group);
    const next = new Map(records.map((record) => [coordinateKey(record.block.position), record] as const));
    const full = changedPositions === undefined || this.records.size === 0;
    const dirty = full ? new Set([...this.chunks.keys(), ...records.map((record) => fluidChunkKey(record.block.position, this.chunkSize))]) : this.dirtyChunkKeys(changedPositions);
    for (const [key] of this.records) if (!next.has(key)) dirty.add(fluidChunkKey(parseKey(key), this.chunkSize));
    for (const [key, record] of next) {
      const previous = this.records.get(key);
      if (!previous || previous.block.id !== record.block.id || previous.block.state !== record.block.state || previous.role !== record.role) dirty.add(fluidChunkKey(record.block.position, this.chunkSize));
      this.records.set(key, record);
    }
    for (const key of this.records.keys()) if (!next.has(key)) this.records.delete(key);
    if (full) this.fullRebuilds += 1; else this.incrementalRebuilds += 1;
    this.dirtyChunksLastEdit = dirty.size;
    for (const key of dirty) { if (epoch !== this.epoch) return; await this.rebuildChunk(key, world, epoch); }
  }

  objectsForVoxel(key: string): readonly THREE.Object3D[] {
    const chunk = this.chunks.get(fluidChunkKey(parseKey(key), this.chunkSize));
    return chunk?.meshes ?? [];
  }

  hasVoxel(key: string): boolean { return this.records.has(key); }

  diagnostics(): FluidChunkDiagnostics {
    const logicalByType = new Map<string, number>();
    for (const record of this.records.values()) logicalByType.set(record.state.fluidTypeId, (logicalByType.get(record.state.fluidTypeId) ?? 0) + 1);
    const meshesByLayer = new Map<string, number>();
    let facesPotential = 0; let facesCulled = 0; let facesEmitted = 0;
    for (const chunk of this.chunks.values()) { facesPotential += chunk.facesPotential; facesCulled += chunk.facesCulled; facesEmitted += chunk.facesEmitted; }
    for (const chunk of this.chunks.values()) for (const mesh of chunk.meshes) meshesByLayer.set(String(mesh.userData['fluidRenderLayer']), (meshesByLayer.get(String(mesh.userData['fluidRenderLayer'])) ?? 0) + 1);
    return { fluidLogicalVoxels: this.records.size, fluidChunks: this.chunks.size, fluidChunkMeshes: [...this.chunks.values()].reduce((sum, chunk) => sum + chunk.meshes.length, 0), fluidMaterialBuckets: this.materialCache.size, fluidStandaloneMeshes: 0, fluidFacesPotential: facesPotential, fluidFacesCulled: facesCulled, fluidFacesEmitted: facesEmitted, fluidChunkRebuilds: this.chunkRebuilds, fluidFullRebuilds: this.fullRebuilds, fluidIncrementalRebuilds: this.incrementalRebuilds, fluidDirtyChunksLastEdit: this.dirtyChunksLastEdit, fluidDescriptorResolutions: this.descriptorResolutions, fluidDescriptorCacheHits: this.descriptorCacheHits, fluidDescriptorCacheMisses: this.descriptorCacheMisses, fluidFallbackVoxels: this.fallbackVoxels, fluidFallbackMeshes: this.fallbackMeshes, fluidByType: Object.fromEntries(logicalByType), fluidMeshesByRenderLayer: Object.fromEntries(meshesByLayer) };
  }

  clear(): void {
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
    this.epoch += 1;
    this.records.clear(); this.dirtyChunksLastEdit = 0;
    if (!this.records.size && this.group.parent === this.blocksGroup) this.blocksGroup.remove(this.group);
  }

  dispose(): void {
    this.clear();
    for (const material of this.materialCache.values()) material.dispose();
    this.materialCache.clear();
    this.blocksGroup.remove(this.group);
  }

  private async rebuildChunk(key: string, world: FluidWorldLookup, epoch: number): Promise<void> {
    if (epoch !== this.epoch) return;
    this.removeChunk(key);
    const records = [...this.records.values()].filter((record) => fluidChunkKey(record.block.position, this.chunkSize) === key);
    if (!records.length || !this.provider) return;
    const meshRecords: FluidMeshRecord[] = [];
    for (const record of records) {
      this.descriptorResolutions += 1;
      meshRecords.push({ block: record.block, state: record.role === 'reference' ? { ...record.state, opacity: .28 } : record.state });
      this.byType.set(record.state.fluidTypeId, (this.byType.get(record.state.fluidTypeId) ?? 0) + 1);
    }
    const data = buildFluidMeshData(meshRecords, world, this.provider.resolver);
    const chunk: FluidChunk = { key, keys: new Set(records.map((record) => coordinateKey(record.block.position))), meshes: [], facesPotential: data.fluidFacesPotential, facesCulled: data.fluidFacesCulled, facesEmitted: data.fluidFacesEmitted };
    for (const bucket of data.buckets) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2)); geometry.setIndex(bucket.indices);
      const materialKey = `${bucket.materialKey}|${bucket.texture}|${bucket.renderLayer}`;
      let material = this.materialCache.get(materialKey);
      if (!material) {
        this.descriptorCacheMisses += 1;
        let texture: THREE.Texture | undefined;
        try { texture = await this.provider.texture(bucket.texture); } catch { texture = undefined; }
        if (epoch !== this.epoch) { geometry.dispose(); return; }
        if (!texture) { this.fallbackVoxels += records.length; this.fallbackMeshes += 1; }
        material = new THREE.MeshLambertMaterial({ map: texture, color: bucket.tint ?? 0xffffff, transparent: bucket.renderLayer === 'translucent', opacity: bucket.opacity ?? (bucket.renderLayer === 'translucent' ? .8 : 1), depthWrite: bucket.depthWrite, side: bucket.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
        material.userData['fluidMaterialKey'] = materialKey; this.materialCache.set(materialKey, material);
      } else this.descriptorCacheHits += 1;
      const mesh = new THREE.Mesh(geometry, material); mesh.userData['fluidChunk'] = true; mesh.userData['fluidRenderLayer'] = bucket.renderLayer; mesh.userData['fluidVoxelKeys'] = [...chunk.keys]; mesh.userData['fluidMaterialKey'] = materialKey; mesh.frustumCulled = true; this.group.add(mesh); chunk.meshes.push(mesh);
    }
    this.chunks.set(key, chunk); this.chunkRebuilds += 1;
  }

  private dirtyChunkKeys(changed: readonly VoxelCoordinate[]): Set<string> {
    const dirty = new Set<string>();
    for (const position of changed) for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) dirty.add(fluidChunkKey({ x: position.x + dx, y: position.y + dy, z: position.z + dz }, this.chunkSize));
    return dirty;
  }

  private removeChunk(key: string): void {
    const chunk = this.chunks.get(key); if (!chunk) return;
    for (const mesh of chunk.meshes) { this.group.remove(mesh); mesh.geometry.dispose(); }
    this.chunks.delete(key);
  }
}

function parseKey(key: string): VoxelCoordinate { const [x, y, z] = key.split(',').map(Number); return { x, y, z }; }
