import * as THREE from 'three';
import { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { buildFluidFallbackMeshData, buildFluidMeshData, FluidMeshRecord, fluidChunkKey } from './fluid-mesh-core';
import { FluidRenderResolver, FluidWorldLookup, ResolvedFluidRenderState } from './fluid-state';
import { fluidMaterialCacheKey, fluidMaterialDescriptor } from './fluid-material-key';

export interface FluidChunkRecord { readonly block: PlacedBlock; readonly state: ResolvedFluidRenderState; readonly role?: 'normal' | 'reference'; }
export interface FluidChunkChange { readonly position: VoxelCoordinate; readonly before?: FluidChunkRecord; readonly after?: FluidChunkRecord; }
export interface FluidChunkVisualProvider {
  readonly contractKey?: string;
  readonly resolver: FluidRenderResolver;
  readonly texture: (resource: string) => Promise<THREE.Texture | undefined>;
}
export interface FluidChunkSyncResult {
  readonly status: 'committed' | 'stale' | 'unavailable';
  readonly committedKeys: readonly string[];
  readonly fallbackKeys: readonly string[];
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

interface FluidChunk {
  readonly key: string;
  readonly keys: Set<string>;
  readonly signatures: ReadonlyMap<string, string>;
  readonly meshes: THREE.Mesh[];
  readonly facesPotential: number;
  readonly facesCulled: number;
  readonly facesEmitted: number;
  readonly fallbackKeys: ReadonlySet<string>;
  readonly providerContractKey: string;
}

/** Owns chunk geometry/material buckets and logical voxel ownership for fluids. */
export class FluidChunkRenderer {
  readonly group = new THREE.Group();
  private readonly records = new Map<string, FluidChunkRecord>();
  private readonly recordsByChunk = new Map<string, Map<string, FluidChunkRecord>>();
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
  private providerRebuildRequired = false;

  constructor(private readonly blocksGroup: THREE.Group, private readonly chunkSize = 16) {
    this.group.name = 'fluidChunks'; this.group.userData['fluidChunks'] = true;
  }

  setProvider(provider: FluidChunkVisualProvider | undefined): void {
    if (this.provider && provider && providerContractKey(this.provider) === providerContractKey(provider)) {
      this.provider = provider;
      return;
    }
    if (!provider) {
      this.provider = undefined;
      this.clear();
      return;
    }
    this.provider = provider;
    this.epoch += 1;
    this.providerRebuildRequired = true;
  }

  sync(records: readonly FluidChunkRecord[], world: FluidWorldLookup, changedPositions?: readonly VoxelCoordinate[]): Promise<FluidChunkSyncResult> {
    const epoch = this.epoch;
    const task = this.syncQueue.then(() => this.syncNow(records, world, changedPositions, epoch));
    this.syncQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  /** Patches logical fluid ownership and rebuilds only the affected chunks. */
  syncDelta(changes: readonly FluidChunkChange[], changedPositions: readonly VoxelCoordinate[], world: FluidWorldLookup): Promise<FluidChunkSyncResult> {
    const epoch = this.epoch;
    const task = this.syncQueue.then(() => this.syncDeltaNow(changes, changedPositions, world, epoch));
    this.syncQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async syncNow(records: readonly FluidChunkRecord[], world: FluidWorldLookup, changedPositions: readonly VoxelCoordinate[] | undefined, epoch: number): Promise<FluidChunkSyncResult> {
    if (epoch !== this.epoch) return { status: 'stale', committedKeys: [], fallbackKeys: [] };
    if (!this.provider) return { status: 'unavailable', committedKeys: [], fallbackKeys: [] };
    if (records.length && this.group.parent !== this.blocksGroup) this.blocksGroup.add(this.group);
    const next = new Map(records.map((record) => [coordinateKey(record.block.position), record] as const));
    const full = changedPositions === undefined || this.records.size === 0 || this.providerRebuildRequired;
    const dirty = full ? new Set([...this.chunks.keys(), ...records.map((record) => fluidChunkKey(record.block.position, this.chunkSize))]) : this.dirtyChunkKeys(changedPositions);
    for (const [key] of this.records) if (!next.has(key)) dirty.add(fluidChunkKey(parseKey(key), this.chunkSize));
    for (const [key, record] of next) {
      const previous = this.records.get(key);
      if (!previous || fluidRecordSignature(previous) !== fluidRecordSignature(record)) dirty.add(fluidChunkKey(record.block.position, this.chunkSize));
      if (previous && fluidChunkKey(previous.block.position, this.chunkSize) !== fluidChunkKey(record.block.position, this.chunkSize)) this.deleteChunkRecord(key);
      this.records.set(key, record);
      this.setChunkRecord(key, record);
    }
    for (const key of [...this.records.keys()]) if (!next.has(key)) { this.records.delete(key); this.deleteChunkRecord(key); }
    if (full) this.fullRebuilds += 1; else this.incrementalRebuilds += 1;
    this.dirtyChunksLastEdit = dirty.size;
    for (const key of dirty) {
      if (epoch !== this.epoch) return { status: 'stale', committedKeys: [], fallbackKeys: [] };
      const result = await this.rebuildChunk(key, world, epoch);
      if (result === 'stale') return { status: 'stale', committedKeys: [], fallbackKeys: [] };
    }
    this.providerRebuildRequired = false;
    const committedKeys: string[] = [];
    const fallbackKeys: string[] = [];
    for (const record of records) {
      const key = coordinateKey(record.block.position);
      const chunk = this.chunks.get(fluidChunkKey(record.block.position, this.chunkSize));
      if (chunk?.providerContractKey === providerContractKey(this.provider) && chunk.signatures.get(key) === fluidRecordSignature(record)) {
        committedKeys.push(key);
        if (chunk.fallbackKeys.has(key)) fallbackKeys.push(key);
      }
    }
    return { status: 'committed', committedKeys, fallbackKeys };
  }

  private async syncDeltaNow(changes: readonly FluidChunkChange[], changedPositions: readonly VoxelCoordinate[], world: FluidWorldLookup, epoch: number): Promise<FluidChunkSyncResult> {
    if (epoch !== this.epoch) return { status: 'stale', committedKeys: [], fallbackKeys: [] };
    if (!this.provider) return { status: 'unavailable', committedKeys: [], fallbackKeys: [] };
    const dirty = this.dirtyChunkKeys(changedPositions);
    const changedKeys: string[] = [];
    for (const change of changes) {
      const key = coordinateKey(change.after?.block.position ?? change.before?.block.position ?? change.position);
      if (change.after) {
        const previous = this.records.get(key);
        if (!previous || fluidRecordSignature(previous) !== fluidRecordSignature(change.after)) dirty.add(fluidChunkKey(change.after.block.position, this.chunkSize));
        if (previous && fluidChunkKey(previous.block.position, this.chunkSize) !== fluidChunkKey(change.after.block.position, this.chunkSize)) this.deleteChunkRecord(key);
        this.records.set(key, change.after);
        this.setChunkRecord(key, change.after);
      } else if (this.records.delete(key)) {
        dirty.add(fluidChunkKey(change.before?.block.position ?? change.position, this.chunkSize));
        this.deleteChunkRecord(key);
      }
      changedKeys.push(key);
    }
    this.incrementalRebuilds += 1;
    this.dirtyChunksLastEdit = dirty.size;
    for (const key of dirty) {
      if (epoch !== this.epoch) return { status: 'stale', committedKeys: [], fallbackKeys: [] };
      const result = await this.rebuildChunk(key, world, epoch);
      if (result === 'stale') return { status: 'stale', committedKeys: [], fallbackKeys: [] };
    }
    const committedKeys: string[] = [];
    const fallbackKeys: string[] = [];
    for (const key of changedKeys) {
      const record = this.records.get(key);
      if (!record) continue;
      const chunk = this.chunks.get(fluidChunkKey(record.block.position, this.chunkSize));
      if (chunk?.providerContractKey === providerContractKey(this.provider) && chunk.signatures.get(key) === fluidRecordSignature(record)) {
        committedKeys.push(key);
        if (chunk.fallbackKeys.has(key)) fallbackKeys.push(key);
      }
    }
    if (!this.records.size && this.group.parent === this.blocksGroup) this.blocksGroup.remove(this.group);
    return { status: 'committed', committedKeys, fallbackKeys };
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
    const fallbackKeys = new Set([...this.chunks.values()].flatMap((chunk) => [...chunk.fallbackKeys]));
    return { fluidLogicalVoxels: this.records.size, fluidChunks: this.chunks.size, fluidChunkMeshes: [...this.chunks.values()].reduce((sum, chunk) => sum + chunk.meshes.length, 0), fluidMaterialBuckets: this.materialCache.size, fluidStandaloneMeshes: 0, fluidFacesPotential: facesPotential, fluidFacesCulled: facesCulled, fluidFacesEmitted: facesEmitted, fluidChunkRebuilds: this.chunkRebuilds, fluidFullRebuilds: this.fullRebuilds, fluidIncrementalRebuilds: this.incrementalRebuilds, fluidDirtyChunksLastEdit: this.dirtyChunksLastEdit, fluidDescriptorResolutions: this.descriptorResolutions, fluidDescriptorCacheHits: this.descriptorCacheHits, fluidDescriptorCacheMisses: this.descriptorCacheMisses, fluidFallbackVoxels: fallbackKeys.size, fluidFallbackMeshes: [...this.chunks.values()].filter((chunk) => chunk.fallbackKeys.size > 0).length, fluidByType: Object.fromEntries(logicalByType), fluidMeshesByRenderLayer: Object.fromEntries(meshesByLayer) };
  }

  clear(): void {
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
    this.epoch += 1;
    this.records.clear(); this.recordsByChunk.clear(); this.dirtyChunksLastEdit = 0;
    if (!this.records.size && this.group.parent === this.blocksGroup) this.blocksGroup.remove(this.group);
  }

  dispose(): void {
    this.clear();
    for (const material of this.materialCache.values()) material.dispose();
    this.materialCache.clear();
    this.blocksGroup.remove(this.group);
  }

  private async rebuildChunk(key: string, world: FluidWorldLookup, epoch: number): Promise<'committed' | 'stale'> {
    if (epoch !== this.epoch || !this.provider) return 'stale';
    const records = [...(this.recordsByChunk.get(key)?.values() ?? [])];
    const previous = this.chunks.get(key);
    if (!records.length) {
      this.removeChunk(key);
      return 'committed';
    }
    const meshRecords: FluidMeshRecord[] = [];
    for (const record of records) {
      this.descriptorResolutions += 1;
      meshRecords.push({ block: record.block, state: record.role === 'reference' ? { ...record.state, opacity: .28 } : record.state });
    }
    const provider = this.provider;
    let data;
    let buildFallback = false;
    try {
      data = buildFluidMeshData(meshRecords, world, provider.resolver);
    } catch {
      data = buildFluidFallbackMeshData(meshRecords);
      buildFallback = true;
    }
    const replacementMeshes: THREE.Mesh[] = [];
    const replacementMaterials: THREE.Material[] = [];
    const replacementMaterialKeys: string[] = [];
    const fallbackKeys = new Set<string>();
    if (buildFallback) for (const record of records) fallbackKeys.add(coordinateKey(record.block.position));
    for (const bucket of data.buckets) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2)); geometry.setIndex(bucket.indices);
      const materialKey = fluidMaterialCacheKey(providerContractKey(provider), fluidMaterialDescriptor(bucket, bucket.texture));
      let material = this.materialCache.get(materialKey);
      if (!material) {
        this.descriptorCacheMisses += 1;
        let texture: THREE.Texture | undefined;
        try { texture = await provider.texture(bucket.texture); } catch { texture = undefined; }
        if (epoch !== this.epoch || this.provider !== provider) { geometry.dispose(); this.disposeUncommittedMaterials(replacementMaterials, replacementMaterialKeys); return 'stale'; }
        if (!texture) for (const record of records) fallbackKeys.add(coordinateKey(record.block.position));
        material = new THREE.MeshLambertMaterial({ map: texture, color: bucket.tint ?? 0xffffff, transparent: bucket.renderLayer === 'translucent', opacity: bucket.opacity ?? (bucket.renderLayer === 'translucent' ? .8 : 1), depthWrite: bucket.depthWrite, side: bucket.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
        material.userData['fluidMaterialKey'] = materialKey; material.userData['fluidFallback'] = !texture; this.materialCache.set(materialKey, material); replacementMaterials.push(material); replacementMaterialKeys.push(materialKey);
      } else {
        this.descriptorCacheHits += 1;
        if (material.userData['fluidFallback']) for (const record of records) fallbackKeys.add(coordinateKey(record.block.position));
      }
      const mesh = new THREE.Mesh(geometry, material); mesh.userData['fluidChunk'] = true; mesh.userData['fluidRenderLayer'] = bucket.renderLayer; mesh.userData['fluidMaterialKey'] = materialKey; mesh.frustumCulled = true; replacementMeshes.push(mesh);
    }
    if (epoch !== this.epoch || this.provider !== provider) { for (const mesh of replacementMeshes) mesh.geometry.dispose(); this.disposeUncommittedMaterials(replacementMaterials, replacementMaterialKeys); return 'stale'; }
    const signatures = new Map(records.map((record) => [coordinateKey(record.block.position), fluidRecordSignature(record)] as const));
    const chunk: FluidChunk = { key, keys: new Set(signatures.keys()), signatures, meshes: replacementMeshes, facesPotential: data.fluidFacesPotential, facesCulled: data.fluidFacesCulled, facesEmitted: data.fluidFacesEmitted, fallbackKeys, providerContractKey: providerContractKey(provider) };
    for (const mesh of replacementMeshes) { mesh.userData['fluidVoxelKeys'] = [...chunk.keys]; this.group.add(mesh); }
    if (previous) for (const mesh of previous.meshes) { this.group.remove(mesh); mesh.geometry.dispose(); }
    this.chunks.set(key, chunk); this.chunkRebuilds += 1;
    this.disposeUnusedMaterials();
    return 'committed';
  }

  private dirtyChunkKeys(changed: readonly VoxelCoordinate[]): Set<string> {
    const dirty = new Set<string>();
    for (const position of changed) for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) dirty.add(fluidChunkKey({ x: position.x + dx, y: position.y + dy, z: position.z + dz }, this.chunkSize));
    return dirty;
  }

  private setChunkRecord(key: string, record: FluidChunkRecord): void {
    const chunkKey = fluidChunkKey(record.block.position, this.chunkSize);
    const chunk = this.recordsByChunk.get(chunkKey) ?? new Map<string, FluidChunkRecord>();
    chunk.set(key, record); this.recordsByChunk.set(chunkKey, chunk);
  }

  private deleteChunkRecord(key: string): void {
    const position = parseKey(key); const chunkKey = fluidChunkKey(position, this.chunkSize);
    const chunk = this.recordsByChunk.get(chunkKey); if (!chunk) return;
    chunk.delete(key); if (!chunk.size) this.recordsByChunk.delete(chunkKey);
  }

  private removeChunk(key: string): void {
    const chunk = this.chunks.get(key); if (!chunk) return;
    for (const mesh of chunk.meshes) { this.group.remove(mesh); mesh.geometry.dispose(); }
    this.chunks.delete(key);
    this.disposeUnusedMaterials();
  }

  private disposeUnusedMaterials(): void {
    const used = new Set<THREE.Material>();
    for (const chunk of this.chunks.values()) for (const mesh of chunk.meshes) used.add(mesh.material as THREE.Material);
    for (const [key, material] of this.materialCache) if (!used.has(material)) { material.dispose(); this.materialCache.delete(key); }
  }

  private disposeUncommittedMaterials(materials: readonly THREE.Material[], keys: readonly string[]): void {
    for (let index = 0; index < materials.length; index += 1) {
      const key = keys[index];
      if (key && this.materialCache.get(key) === materials[index]) this.materialCache.delete(key);
      materials[index].dispose();
    }
  }
}

function parseKey(key: string): VoxelCoordinate { const [x, y, z] = key.split(',').map(Number); return { x, y, z }; }
function fluidRecordSignature(record: FluidChunkRecord): string { return `${record.block.id}|${JSON.stringify(Object.entries(record.block.state).sort(([left], [right]) => left.localeCompare(right)))}|${record.role ?? 'normal'}|${record.state.fluidTypeId}|${record.state.connectivityKey}`; }
function providerContractKey(provider: FluidChunkVisualProvider): string { return provider.contractKey ?? 'fluid-provider-default'; }
