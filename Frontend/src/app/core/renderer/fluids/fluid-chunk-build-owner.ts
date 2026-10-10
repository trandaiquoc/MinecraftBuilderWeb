import * as THREE from 'three';
import { coordinateKey } from '../../domain/coordinates';
import type { VoxelCoordinate } from '../../domain/project.types';
import { buildFluidFallbackMeshData, buildFluidMeshData, fluidChunkKey, type FluidMeshRecord } from './fluid-mesh-core';
import type { FluidWorldLookup } from './fluid-state';
import type { FluidChunkChange, FluidChunkRecord, FluidChunkSyncResult, FluidChunkVisualProvider } from './fluid-render-contracts';
import { FluidChunkRecordStore } from './fluid-chunk-record-store';
import { FluidChunkResidencyOwner, type FluidResidentChunk } from './fluid-chunk-residency-owner';
import { fluidRecordSignature } from './fluid-record-signature';

export interface FluidChunkBuildEvidence {
  readonly chunkRebuilds: number;
  readonly fullRebuilds: number;
  readonly incrementalRebuilds: number;
  readonly dirtyChunksLastEdit: number;
  readonly descriptorResolutions: number;
}

/** Owns fluid provider generations, serialized chunk builds, and stale build cancellation. */
export class FluidChunkBuildOwner {
  private provider?: FluidChunkVisualProvider;
  private syncQueue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private disposed = false;
  private providerRebuildRequired = false;
  private chunkRebuildCount = 0;
  private fullRebuildCount = 0;
  private incrementalRebuildCount = 0;
  private dirtyChunksLastEdit = 0;
  private descriptorResolutionCount = 0;

  constructor(
    private readonly records: FluidChunkRecordStore,
    private readonly residency: FluidChunkResidencyOwner,
    private readonly chunkSize = 16,
  ) {}

  setProvider(provider: FluidChunkVisualProvider | undefined): void {
    if (this.disposed) return;
    const previousKey = providerContractKey(this.provider);
    const nextKey = providerContractKey(provider);
    this.provider = provider;
    if (previousKey === nextKey) return;
    this.epoch += 1;
    this.providerRebuildRequired = !!provider;
    this.residency.setProviderContractKey(provider ? nextKey : undefined);
  }

  providerSnapshot(): FluidChunkVisualProvider | undefined { return this.provider; }

  sync(records: readonly FluidChunkRecord[], world: FluidWorldLookup, changedPositions?: readonly VoxelCoordinate[]): Promise<FluidChunkSyncResult> {
    const epoch = this.epoch;
    return this.enqueue(() => this.syncNow(records, world, changedPositions, epoch));
  }

  syncDelta(changes: readonly FluidChunkChange[], changedPositions: readonly VoxelCoordinate[], world: FluidWorldLookup): Promise<FluidChunkSyncResult> {
    const epoch = this.epoch;
    return this.enqueue(() => this.syncDeltaNow(changes, changedPositions, world, epoch));
  }

  evidence(): FluidChunkBuildEvidence {
    return {
      chunkRebuilds: this.chunkRebuildCount,
      fullRebuilds: this.fullRebuildCount,
      incrementalRebuilds: this.incrementalRebuildCount,
      dirtyChunksLastEdit: this.dirtyChunksLastEdit,
      descriptorResolutions: this.descriptorResolutionCount,
    };
  }

  cancelPending(): void { this.epoch += 1; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.provider = undefined;
    this.providerRebuildRequired = false;
  }

  private enqueue(operation: () => Promise<FluidChunkSyncResult>): Promise<FluidChunkSyncResult> {
    const task = this.syncQueue.then(operation);
    this.syncQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async syncNow(records: readonly FluidChunkRecord[], world: FluidWorldLookup, changedPositions: readonly VoxelCoordinate[] | undefined, epoch: number): Promise<FluidChunkSyncResult> {
    if (this.disposed || epoch !== this.epoch) return staleResult();
    const provider = this.provider;
    if (!provider) return unavailableResult();
    const reconciliation = this.records.reconcile(records, changedPositions, this.chunkSize, this.residency.currentChunkKeys(), this.providerRebuildRequired);
    const dirty = reconciliation.dirtyChunks;
    if (reconciliation.full) this.fullRebuildCount += 1;
    else this.incrementalRebuildCount += 1;
    this.dirtyChunksLastEdit = dirty.size;
    for (const key of dirty) {
      if (!this.isCurrent(epoch, provider)) return staleResult();
      if (await this.rebuildChunk(key, world, epoch, provider) === 'stale') return staleResult();
    }
    this.providerRebuildRequired = false;
    return this.resultForRecords(records);
  }

  private async syncDeltaNow(changes: readonly FluidChunkChange[], changedPositions: readonly VoxelCoordinate[], world: FluidWorldLookup, epoch: number): Promise<FluidChunkSyncResult> {
    if (this.disposed || epoch !== this.epoch) return staleResult();
    if (!this.provider) return unavailableResult();
    const delta = this.records.applyDelta(changes, changedPositions, this.chunkSize);
    this.incrementalRebuildCount += 1;
    this.dirtyChunksLastEdit = delta.dirtyChunks.size;
    for (const key of delta.dirtyChunks) {
      if (this.disposed || epoch !== this.epoch) return staleResult();
      if (await this.rebuildChunk(key, world, epoch, this.provider) === 'stale') return staleResult();
    }
    return this.resultForKeys(delta.changedKeys);
  }

  private resultForRecords(records: readonly FluidChunkRecord[]): FluidChunkSyncResult {
    return this.resultForKeys(records.map((record) => coordinateKey(record.block.position)));
  }

  private resultForKeys(keys: readonly string[]): FluidChunkSyncResult {
    const providerKey = providerContractKey(this.provider);
    const committedKeys: string[] = [];
    const fallbackKeys: string[] = [];
    for (const key of keys) {
      const record = this.records.get(key);
      if (!record) continue;
      const chunk = this.residency.currentChunk(fluidChunkKey(record.block.position, this.chunkSize));
      if (chunk?.providerContractKey !== providerKey || chunk.signatures.get(key) !== fluidRecordSignature(record)) continue;
      committedKeys.push(key);
      if (chunk.fallbackKeys.has(key)) fallbackKeys.push(key);
    }
    return { status: 'committed', committedKeys, fallbackKeys };
  }

  private async rebuildChunk(key: string, world: FluidWorldLookup, epoch: number, provider: FluidChunkVisualProvider): Promise<'committed' | 'stale'> {
    if (!this.isCurrent(epoch, provider)) return 'stale';
    const chunkRecords = this.records.recordsInChunk(key);
    const previous = this.residency.currentChunk(key);
    if (!chunkRecords.length) {
      if (previous) this.residency.retainCurrent(key);
      return 'committed';
    }
    const contractKey = providerContractKey(provider);
    const signature = world.visualRevisionKey === undefined
      ? undefined
      : fluidChunkSignature(key, chunkRecords, world.visualRevisionKey, contractKey, this.residency.isLayered);
    if (signature && previous?.signature === signature) return 'committed';
    const cached = signature ? this.residency.takeResidentVariant(key, signature) : undefined;
    if (cached) {
      if (previous) this.residency.retainCurrent(key);
      this.residency.installResidentVariant(cached);
      return 'committed';
    }
    const meshRecords: FluidMeshRecord[] = [];
    for (const record of chunkRecords) {
      this.descriptorResolutionCount += 1;
      meshRecords.push({ block: record.block, state: record.state });
    }
    let data;
    let fallbackBuild = false;
    try {
      data = buildFluidMeshData(meshRecords, world, provider.resolver, { layeredPresentation: this.residency.isLayered });
    } catch {
      data = buildFluidFallbackMeshData(meshRecords, { layeredPresentation: this.residency.isLayered });
      fallbackBuild = true;
    }
    const built = await this.residency.createBuildResources(data, provider, () => this.isCurrent(epoch, provider));
    if (!built || !this.isCurrent(epoch, provider)) {
      if (built) this.residency.discardBuildResources(built);
      return 'stale';
    }
    const fallbackKeys = new Set(built.fallbackKeys);
    if (fallbackBuild) for (const record of chunkRecords) fallbackKeys.add(coordinateKey(record.block.position));
    const signatures = new Map(chunkRecords.map((record) => [coordinateKey(record.block.position), fluidRecordSignature(record)] as const));
    const chunkSignature = signature ?? `${key}|uncacheable:${this.chunkRebuildCount}:${epoch}`;
    const chunk: FluidResidentChunk = {
      key,
      keys: new Set(signatures.keys()),
      signatures,
      meshes: [...built.meshes],
      facesPotential: data.fluidFacesPotential,
      facesCulled: data.fluidFacesCulled,
      facesEmitted: data.fluidFacesEmitted,
      fallbackKeys,
      providerContractKey: contractKey,
      signature: chunkSignature,
      estimatedBytes: fluidChunkBytes(built.meshes, chunkSignature),
    };
    if (!this.isCurrent(epoch, provider)) {
      this.residency.discardBuildResources(built);
      return 'stale';
    }
    this.residency.install(chunk);
    this.chunkRebuildCount += 1;
    return 'committed';
  }

  private isCurrent(epoch: number, provider: FluidChunkVisualProvider): boolean {
    return !this.disposed && epoch === this.epoch && providerContractKey(this.provider) === providerContractKey(provider);
  }
}

function fluidChunkSignature(chunkKey: string, records: readonly FluidChunkRecord[], worldRevisionKey: string | number, providerKey: string, layeredPresentation: boolean): string {
  const recordsKey = [...records]
    .sort((left, right) => coordinateKey(left.block.position).localeCompare(coordinateKey(right.block.position)))
    .map(fluidRecordSignature)
    .join(';');
  return `${chunkKey}|world:${worldRevisionKey}|provider:${providerKey}|layered:${layeredPresentation}|${recordsKey}`;
}

function fluidChunkBytes(meshes: readonly THREE.Mesh[], signature: string): number {
  const geometryBytes = meshes.reduce((total, mesh) => {
    let bytes = mesh.geometry.index?.array.byteLength ?? 0;
    for (const attribute of Object.values(mesh.geometry.attributes)) bytes += attribute.array.byteLength;
    return total + bytes;
  }, 0);
  return geometryBytes + signature.length * 2;
}

function providerContractKey(provider: FluidChunkVisualProvider | undefined): string {
  return provider?.contractKey ?? (provider ? 'fluid-provider-default' : '');
}

function staleResult(): FluidChunkSyncResult { return { status: 'stale', committedKeys: [], fallbackKeys: [] }; }
function unavailableResult(): FluidChunkSyncResult { return { status: 'unavailable', committedKeys: [], fallbackKeys: [] }; }
