import * as THREE from 'three';
import { VoxelCoordinate } from '../../domain/project.types';
import { fluidChunkKey } from './fluid-mesh-core';
import type { FluidWorldLookup } from './fluid-state';
import { FluidChunkRecordStore } from './fluid-chunk-record-store';
import type {
  FluidChunkChange,
  FluidChunkRecord,
  FluidChunkSyncResult,
  FluidChunkVisualProvider,
  FluidLayerPresentation,
} from './fluid-render-contracts';
import { FluidChunkResidencyOwner } from './fluid-chunk-residency-owner';
import { FluidChunkBuildOwner } from './fluid-chunk-build-owner';

export type {
  FluidChunkChange,
  FluidChunkRecord,
  FluidChunkSyncResult,
  FluidChunkVisualProvider,
  FluidLayerPresentation,
} from './fluid-render-contracts';

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
  readonly fluidResidentVariantHits: number;
  readonly fluidResidentVariantEvictions: number;
  readonly fluidResidentVariantCount: number;
  readonly fluidResidentVariantBytes: number;
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
  readonly fluidPresentationUpdates: number;
  readonly fluidMeshVisibilityUpdates: number;
  readonly fluidMeshRoleUpdates: number;
}

export { FLUID_RESIDENT_VARIANT_BUDGET_BYTES } from './fluid-chunk-residency-owner';

/** Public fluid rendering API; records, build work, and GPU residency have dedicated owners. */
export class FluidChunkRenderer {
  private readonly residency: FluidChunkResidencyOwner;
  private readonly recordStore = new FluidChunkRecordStore();
  private readonly buildOwner: FluidChunkBuildOwner;
  private disposed = false;

  constructor(
    private readonly blocksGroup: THREE.Group,
    chunkSize = 16,
  ) {
    this.residency = new FluidChunkResidencyOwner(blocksGroup);
    this.buildOwner = new FluidChunkBuildOwner(this.recordStore, this.residency, chunkSize);
  }

  get group(): THREE.Group {
    return this.residency.group;
  }
  get logicalRecordCount(): number {
    return this.recordStore.size;
  }
  get layeredPresentationReady(): boolean {
    return this.residency.layeredPresentationReady;
  }

  setLayerPresentation(presentation: FluidLayerPresentation | undefined): void {
    if (!this.disposed) this.residency.setLayerPresentation(presentation);
  }

  setProvider(provider: FluidChunkVisualProvider | undefined): void {
    if (this.disposed) return;
    this.buildOwner.setProvider(provider);
    if (!provider) this.clear();
  }

  recordsForKeys(keys: ReadonlySet<string>): readonly FluidChunkRecord[] {
    return this.recordStore.recordsForKeys(keys);
  }
  providerSnapshot(): FluidChunkVisualProvider | undefined {
    return this.buildOwner.providerSnapshot();
  }

  sync(
    records: readonly FluidChunkRecord[],
    world: FluidWorldLookup,
    changedPositions?: readonly VoxelCoordinate[],
  ): Promise<FluidChunkSyncResult> {
    if (this.disposed) return staleResult();
    return this.buildOwner.sync(records, world, changedPositions).then((result) => {
      if (result.status === 'committed') this.residency.detachGroupIfEmpty();
      return result;
    });
  }

  syncDelta(
    changes: readonly FluidChunkChange[],
    changedPositions: readonly VoxelCoordinate[],
    world: FluidWorldLookup,
  ): Promise<FluidChunkSyncResult> {
    if (this.disposed) return staleResult();
    return this.buildOwner.syncDelta(changes, changedPositions, world).then((result) => {
      if (result.status === 'committed') this.residency.detachGroupIfEmpty();
      return result;
    });
  }

  objectsForVoxel(key: string): readonly THREE.Object3D[] {
    return this.residency.currentChunk(fluidChunkKey(parseKey(key)))?.meshes ?? [];
  }

  hasVoxel(key: string): boolean {
    return this.recordStore.has(key);
  }

  diagnostics(): FluidChunkDiagnostics {
    const resource = this.residency.evidence();
    const build = this.buildOwner.evidence();
    const logicalByType = new Map<string, number>();
    for (const record of this.recordStore.values()) {
      logicalByType.set(
        record.state.fluidTypeId,
        (logicalByType.get(record.state.fluidTypeId) ?? 0) + 1,
      );
    }
    const meshesByLayer = new Map<string, number>();
    let facesPotential = 0;
    let facesCulled = 0;
    let facesEmitted = 0;
    const chunks = [...this.residency.currentChunks()];
    for (const chunk of chunks) {
      facesPotential += chunk.facesPotential;
      facesCulled += chunk.facesCulled;
      facesEmitted += chunk.facesEmitted;
      for (const mesh of chunk.meshes) {
        const layer = String(mesh.userData['fluidRenderLayer']);
        meshesByLayer.set(layer, (meshesByLayer.get(layer) ?? 0) + 1);
      }
    }
    const fallbackKeys = new Set(chunks.flatMap((chunk) => [...chunk.fallbackKeys]));
    return {
      fluidLogicalVoxels: this.recordStore.size,
      fluidChunks: resource.chunks,
      fluidChunkMeshes: resource.meshes,
      fluidMaterialBuckets: resource.materialBuckets,
      fluidStandaloneMeshes: 0,
      fluidFacesPotential: facesPotential,
      fluidFacesCulled: facesCulled,
      fluidFacesEmitted: facesEmitted,
      fluidChunkRebuilds: build.chunkRebuilds,
      fluidResidentVariantHits: resource.residentVariantHits,
      fluidResidentVariantEvictions: resource.residentVariantEvictions,
      fluidResidentVariantCount: resource.residentVariantCount,
      fluidResidentVariantBytes: resource.residentVariantBytes,
      fluidFullRebuilds: build.fullRebuilds,
      fluidIncrementalRebuilds: build.incrementalRebuilds,
      fluidDirtyChunksLastEdit: build.dirtyChunksLastEdit,
      fluidDescriptorResolutions: build.descriptorResolutions,
      fluidDescriptorCacheHits: resource.materialCacheHits,
      fluidDescriptorCacheMisses: resource.materialCacheMisses,
      fluidFallbackVoxels: fallbackKeys.size,
      fluidFallbackMeshes: chunks.filter((chunk) => chunk.fallbackKeys.size > 0).length,
      fluidByType: Object.fromEntries(logicalByType),
      fluidMeshesByRenderLayer: Object.fromEntries(meshesByLayer),
      fluidPresentationUpdates: resource.presentationUpdates,
      fluidMeshVisibilityUpdates: resource.meshVisibilityUpdates,
      fluidMeshRoleUpdates: resource.meshRoleUpdates,
    };
  }

  /** O(1) counters for the high-frequency viewport trace sample. */
  lightDiagnostics(): Readonly<Record<string, unknown>> {
    const resource = this.residency.lightEvidence();
    const build = this.buildOwner.evidence();
    return {
      fluidLogicalVoxels: this.recordStore.size,
      ...resource,
      fluidStandaloneMeshes: 0,
      fluidChunkRebuilds: build.chunkRebuilds,
      fluidFullRebuilds: build.fullRebuilds,
      fluidIncrementalRebuilds: build.incrementalRebuilds,
      fluidDirtyChunksLastEdit: build.dirtyChunksLastEdit,
      fluidDescriptorResolutions: build.descriptorResolutions,
    };
  }

  clear(): void {
    if (this.disposed) return;
    this.buildOwner.cancelPending();
    this.recordStore.clear();
    this.residency.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buildOwner.dispose();
    this.recordStore.clear();
    this.residency.dispose();
  }
}

function parseKey(key: string): VoxelCoordinate {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

function staleResult(): Promise<FluidChunkSyncResult> {
  return Promise.resolve({ status: 'stale', committedKeys: [], fallbackKeys: [] });
}
