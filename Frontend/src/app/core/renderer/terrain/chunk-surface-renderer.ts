import * as THREE from 'three';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { terrainChunkKey, worldToTerrainChunk } from './chunk-coordinate';
import type { CompiledTerrainChunk } from './chunk-surface-mesher';
import type { TerrainClassificationEntry } from './terrain-classifier';
import type { TerrainAtlasEvidence } from './atlas/terrain-texture-atlas';
import type { TerrainAtlasMode } from './atlas/terrain-texture-atlas';
import type { TerrainMeshWorkerPoolEvidence, TerrainWorkerLike } from './terrain-mesh-worker-pool';
import type { TerrainCommitSchedulerEvidence } from './terrain-commit-scheduler';
import type { TerrainCommitDiagnosticsEvidence } from './terrain-commit-diagnostics';
import { TerrainChunkLogicalStore } from './terrain-chunk-logical-store';
import type {
  TerrainApplyDisposition,
  TerrainApplyResult,
  TerrainBlockChange,
  TerrainSurfaceRecord,
} from './terrain-render-contracts';
import {
  TerrainChunkResidencyOwner,
  type TerrainOwnershipEvidence,
} from './terrain-chunk-residency-owner';
import { TerrainHydrationSettlementOwner } from './terrain-hydration-settlement-owner';
import type {
  TerrainRepresentationCommitCallbacks,
  TerrainRepresentationCommitStatus,
  TerrainSettlement,
} from './terrain-render-contracts';
import { TerrainChunkWorkOwner } from './terrain-chunk-work-owner';
import { TerrainChunkResultCommitOwner } from './terrain-chunk-result-commit-owner';
import { TerrainTemplateResourceOwner } from './terrain-template-resource-owner';

export type {
  TerrainApplyDisposition,
  TerrainApplyResult,
  TerrainBlockChange,
  TerrainSurfaceRecord,
} from './terrain-render-contracts';
export type {
  TerrainRepresentationCommitCallbacks,
  TerrainRepresentationCommitStatus,
  TerrainSettlement,
} from './terrain-render-contracts';

export type { TerrainOwnershipEvidence } from './terrain-chunk-residency-owner';

export interface TerrainRendererEvidence {
  readonly terrainChunks: number;
  readonly terrainChunkMeshes: number;
  readonly terrainChunkRebuilds: number;
  readonly terrainResidentVariantHits: number;
  readonly terrainResidentVariantEvictions: number;
  readonly terrainResidentVariantCount: number;
  readonly terrainResidentVariantBytes: number;
  readonly terrainBlocksCompiled: number;
  readonly terrainFacesEmitted: number;
  readonly terrainFacesCulled: number;
  readonly terrainTemplateResolutions: number;
  readonly terrainTemplateCacheHits: number;
  readonly terrainLogicalBlocks: number;
  readonly terrainBulkBatches: number;
  readonly terrainCandidateOwnershipTotal: number;
  readonly terrainCandidateFanoutTotal: number;
  readonly maxHydrationCandidatesPerChunk: number;
  readonly maxRecordsPerChunk: number;
  readonly terrainCommitCandidateChecks: number;
  readonly terrainCommitRepresentedLookupChecks: number;
  readonly terrainPendingHydrationCandidates: number;
  readonly terrainPendingHydrationCandidateChunks?: number;
  readonly terrainAtlas: TerrainAtlasEvidence;
  readonly terrainWorker: TerrainMeshWorkerPoolEvidence;
  readonly terrainCommit: TerrainCommitSchedulerEvidence;
  readonly terrainCommitDiagnostics: TerrainCommitDiagnosticsEvidence;
}

export interface ChunkSurfaceRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly record: (name: string, delta?: number) => void;
  readonly terrainAtlasMode?: TerrainAtlasMode;
  /** Test seam for proving that logical records are not committed early. */
  readonly shouldCommitChunk?: (chunkKey: string, compiled: CompiledTerrainChunk) => boolean;
  readonly onTiming?: (stage: string, durationMs: number) => void;
  readonly isTimingEnabled?: () => boolean;
  readonly workerCount?: number;
  readonly workerFactory?: () => TerrainWorkerLike;
  readonly terrainGeneration?: () => number;
  readonly providerGeneration?: () => number;
  readonly isCameraInteracting?: () => boolean;
  readonly onAsyncApply?: (
    records: readonly TerrainSurfaceRecord[],
    result: TerrainApplyResult,
  ) => void;
}

export { TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES } from './terrain-chunk-residency-owner';

/** Owns compiled opaque terrain meshes while leaving project/editor data elsewhere. */
export class ChunkSurfaceRenderer {
  private disposed = false;
  private readonly settlement = new TerrainHydrationSettlementOwner();
  private readonly templateResources: TerrainTemplateResourceOwner;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private bulkBatches = 0;
  private readonly logicalStore: TerrainChunkLogicalStore;
  private readonly residency: TerrainChunkResidencyOwner;
  private readonly resultCommitter: TerrainChunkResultCommitOwner;
  private readonly work: TerrainChunkWorkOwner;

  constructor(private readonly options: ChunkSurfaceRendererOptions) {
    this.templateResources = new TerrainTemplateResourceOwner(
      options.terrainAtlasMode,
      options.record,
    );
    this.logicalStore = new TerrainChunkLogicalStore({ record: options.record });
    this.residency = new TerrainChunkResidencyOwner({
      blocksGroup: options.blocksGroup,
      record: options.record,
    });
    this.resultCommitter = new TerrainChunkResultCommitOwner(
      this.logicalStore,
      this.residency,
      this.templateResources,
      this.settlement,
      {
        record: options.record,
        onTiming: options.onTiming,
        isTimingEnabled: options.isTimingEnabled,
        shouldCommitChunk: options.shouldCommitChunk,
        onAsyncApply: options.onAsyncApply,
        onComplete: () => this.notifySettlementIfReady(),
      },
    );
    this.work = new TerrainChunkWorkOwner(
      this.logicalStore,
      this.templateResources,
      this.settlement,
      this.resultCommitter,
      {
        record: options.record,
        onTiming: options.onTiming,
        workerCount: options.workerCount,
        workerFactory: options.workerFactory,
        terrainGeneration: options.terrainGeneration,
        providerGeneration: options.providerGeneration,
        isCameraInteracting: options.isCameraInteracting,
        scheduleDirtyWork: () => this.scheduleFlush(),
        onComplete: () => this.notifySettlementIfReady(),
      },
    );
  }

  get chunkCount(): number {
    return this.residency.chunkCount;
  }
  get chunkMeshCount(): number {
    return this.residency.meshCount;
  }
  get residentVariantCount(): number {
    return this.residency.residentVariantCount;
  }
  get logicalBlockCount(): number {
    return this.logicalStore.size;
  }
  has(key: string): boolean {
    return this.logicalStore.has(key);
  }
  ownershipFor(key: string): TerrainOwnershipEvidence | undefined {
    return this.residency.ownershipFor(key);
  }
  isRepresented(key: string): boolean {
    return this.residency.isRepresented(key);
  }

  setRecordRole(key: string, role: 'normal' | 'reference'): boolean {
    const record = this.logicalStore.record(key);
    if (!record || (record.role ?? 'normal') === role) return !!record;
    const chunkKey = terrainChunkKey(worldToTerrainChunk(record.block.position));
    const updated = { ...record, role };
    if (!this.logicalStore.upsert(updated)) return false;
    this.scheduleFlush();
    return true;
  }

  /** Resolves when the current batch has reached a terminal worker/commit state. */
  whenSettled(): Promise<TerrainSettlement> {
    if (this.disposed) return Promise.resolve({ status: 'cancelled', failedKeys: [] });
    return this.settlement.whenSettled(() => this.isSettlementReady());
  }

  /** Returns immutable record references for a presentation-only subset. */
  recordsForKeys(keys: ReadonlySet<string>): readonly TerrainSurfaceRecord[] {
    return this.logicalStore.recordsForKeys(keys);
  }

  syncOccupancy(
    entries: readonly TerrainClassificationEntry[],
    affectedPositions: readonly VoxelCoordinate[],
    initial = false,
  ): void {
    if (this.disposed) return;
    this.logicalStore.replaceOccupancy(entries, affectedPositions, initial);
    this.scheduleFlush();
  }

  cacheTemplates(key: string, templates: readonly SurfaceFaceTemplate[]): void {
    if (this.disposed) return;
    this.templateResources.cacheTemplates(key, templates);
  }

  /** Registers one generation/batch and compiles its dirty chunks exactly once. */
  bulkUpsert(
    records: readonly TerrainSurfaceRecord[],
    occupancyEntries?: readonly TerrainClassificationEntry[],
    affectedPositions: readonly VoxelCoordinate[] = [],
    options: { readonly initial?: boolean; readonly flush?: boolean } = {},
  ): TerrainApplyResult {
    if (this.disposed) return emptyTerrainApplyResult(records.map((record) => record.key));
    this.settlement.beginBatch();
    this.bulkBatches += 1;
    this.options.record('terrainBulkBatches');
    if (options.initial) {
      this.settlement.cancelRepresentationCommits();
      this.residency.clear();
      this.logicalStore.clearRecords();
      this.work.clearWork();
      this.settlement.clearHydrationCandidatesForAllChunks();
      this.logicalStore.takeDirtyChunks();
    }
    this.logicalStore.upsertMany(records, occupancyEntries, affectedPositions, options.initial);
    if (options.flush === false) {
      this.scheduleFlush();
      return emptyTerrainApplyResult(records.map((record) => record.key));
    }
    return this.flushNow(records.map((record) => record.key));
  }

  /** Applies a bounded local voxel delta without replacing records or occupancy. */
  applyBlockChanges(
    changes: readonly TerrainBlockChange[],
    flush = true,
    hydrationCandidateKeys: readonly string[] = changes.map((change) => change.key),
    deferFlush = false,
  ): TerrainApplyResult {
    if (this.disposed) return emptyTerrainApplyResult(changes.map((change) => change.key));
    if (!changes.length) return emptyTerrainApplyResult();
    this.beginSettlement();
    this.logicalStore.applyChanges(changes);
    if (flush)
      return this.flushNow(
        changes.map((change) => change.key),
        1,
        hydrationCandidateKeys,
      );
    if (deferFlush && hydrationCandidateKeys.length) {
      for (const [chunkKey, candidates] of this.logicalStore.indexHydrationCandidates(
        hydrationCandidateKeys,
      )) {
        this.retainHydrationCandidates(chunkKey, candidates);
      }
    }
    if (!deferFlush) this.scheduleFlush();
    return emptyTerrainApplyResult(changes.map((change) => change.key));
  }

  /** Dispatches accumulated dirty chunks once a cooperative projection is complete. */
  flushPending(): TerrainApplyResult {
    if (this.disposed || !this.logicalStore.dirtyChunkCount) return emptyTerrainApplyResult();
    return this.flushNow();
  }

  templatesFor(key: string): readonly SurfaceFaceTemplate[] | undefined {
    return this.templateResources.templatesFor(key);
  }

  hasTemplates(key: string): boolean {
    return this.templateResources.hasTemplates(key);
  }

  upsert(record: TerrainSurfaceRecord, flush = false): boolean {
    if (this.disposed) return false;
    if (record.templates.length !== 6) return false;
    this.cancelPendingRepresentationCommit(record.key);
    this.beginSettlement();
    this.logicalStore.upsert(record);
    if (flush) return this.flushNow([record.key]).representedKeys.includes(record.key);
    this.scheduleFlush();
    return true;
  }

  upsertAndCommit(
    record: TerrainSurfaceRecord,
    callbacks?: TerrainRepresentationCommitCallbacks,
  ): TerrainRepresentationCommitStatus {
    if (this.disposed) return 'failed';
    if (record.templates.length !== 6) return 'failed';
    const committed = this.upsert(record, true);
    if (committed) return 'committed';
    const terminalCallbacks = callbacks ?? {
      onCommitted: () => undefined,
      onFailed: () => undefined,
    };
    const chunkKey = terrainChunkKeyForPosition(record.block.position);
    const work = this.work.workFor(chunkKey);
    if (!work || work.completed) return 'failed';
    this.settlement.registerRepresentationCommit(chunkKey, record.key, terminalCallbacks);
    return 'pending';
  }

  remove(key: string): void {
    if (this.disposed) return;
    this.cancelPendingRepresentationCommit(key);
    const previous = this.logicalStore.record(key);
    if (!previous) return;
    this.beginSettlement();
    this.logicalStore.remove(key);
    this.scheduleFlush();
  }

  flushNow(
    changedKeys: readonly string[] = [],
    priority = 0,
    hydrationCandidateKeys: readonly string[] = changedKeys,
  ): TerrainApplyResult {
    if (this.disposed) return emptyTerrainApplyResult(changedKeys);
    const timing = !!this.options.onTiming && (this.options.isTimingEnabled?.() ?? true);
    const started = timing ? performance.now() : 0;
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    const dirty = this.logicalStore.takeDirtyChunks();
    const localChangedKeys = this.logicalStore.indexKeysByOwningChunk(changedKeys);
    const localCandidates = this.logicalStore.indexHydrationCandidates(hydrationCandidateKeys);
    const result = this.work.flush(
      dirty,
      changedKeys,
      hydrationCandidateKeys,
      priority,
      localChangedKeys,
      localCandidates,
    );
    if (timing) this.options.onTiming?.('terrain.flushNow', performance.now() - started);
    this.notifySettlementIfReady();
    return result;
  }

  applyMaterial(callback: (material: THREE.Material) => void): void {
    this.residency.applyMaterial(callback);
  }

  setReferenceOpacity(opacity: number): void {
    this.residency.setReferenceOpacity(opacity);
  }

  evidence(): TerrainRendererEvidence {
    const residency = this.residency.evidence();
    const work = this.work.evidence();
    return {
      terrainChunks: residency.chunks,
      terrainChunkMeshes: this.chunkMeshCount,
      terrainChunkRebuilds: residency.rebuilds,
      terrainResidentVariantHits: residency.residentVariantHits,
      terrainResidentVariantEvictions: residency.residentVariantEvictions,
      terrainResidentVariantCount: residency.residentVariantCount,
      terrainResidentVariantBytes: residency.residentVariantBytes,
      terrainBlocksCompiled: residency.blocksCompiled,
      terrainFacesEmitted: residency.facesEmitted,
      terrainFacesCulled: residency.facesCulled,
      terrainTemplateResolutions: this.templateResources.evidence().templateResolutions,
      terrainTemplateCacheHits: this.templateResources.evidence().templateCacheHits,
      terrainLogicalBlocks: this.logicalStore.size,
      terrainBulkBatches: this.bulkBatches,
      terrainCandidateOwnershipTotal: this.logicalStore.candidateOwnershipChecks,
      terrainCandidateFanoutTotal: this.logicalStore.candidateFanout,
      maxHydrationCandidatesPerChunk: work.maxHydrationCandidatesPerChunk,
      maxRecordsPerChunk: work.maxRecordsPerChunk,
      terrainCommitCandidateChecks: work.candidateChecks,
      terrainCommitRepresentedLookupChecks: work.representedLookupChecks,
      terrainPendingHydrationCandidates: this.settlement.pendingCandidateCount,
      terrainPendingHydrationCandidateChunks: this.settlement.pendingCandidateChunkCount,
      terrainWorker: work.worker,
      terrainCommit: work.commit,
      terrainCommitDiagnostics: work.diagnostics,
      terrainAtlas: {
        ...(this.templateResources.atlas?.evidence() ?? {
          terrainAtlasPages: 0,
          terrainAtlasSprites: 0,
          terrainAtlasCacheHits: 0,
          terrainAtlasInsertions: 0,
          terrainAtlasMaterials: 0,
          terrainAtlasCompatibleFaces: 0,
          terrainAtlasFallbackFaces: 0,
        }),
        terrainAtlasChunkBuckets: this.chunkMeshCount,
      },
    };
  }

  /** O(1) maintained counters for high-frequency runtime trace sampling. */
  lightEvidence(): Readonly<Record<string, unknown>> {
    const residency = this.residency.evidence();
    return {
      terrainChunks: residency.chunks,
      terrainChunkMeshes: this.chunkMeshCount,
      terrainChunkRebuilds: residency.rebuilds,
      terrainResidentVariantHits: residency.residentVariantHits,
      terrainResidentVariantEvictions: residency.residentVariantEvictions,
      terrainResidentVariantCount: residency.residentVariantCount,
      terrainResidentVariantBytes: residency.residentVariantBytes,
      terrainBlocksCompiled: residency.blocksCompiled,
      terrainFacesEmitted: residency.facesEmitted,
      terrainFacesCulled: residency.facesCulled,
      terrainTemplateResolutions: this.templateResources.evidence().templateResolutions,
      terrainTemplateCacheHits: this.templateResources.evidence().templateCacheHits,
      terrainLogicalBlocks: this.logicalStore.size,
      terrainBulkBatches: this.bulkBatches,
      terrainPendingHydrationCandidateChunks: this.settlement.pendingCandidateChunkCount,
    };
  }

  clear(): void {
    if (this.disposed) return;
    this.clearContents();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearContents();
    this.work.dispose();
  }

  private clearContents(): void {
    this.cancelPendingRepresentationCommits();
    this.cancelSettlement();
    if (this.flushTimer !== undefined) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.residency.clear();
    this.work.clearWork();
    this.settlement.clearHydrationCandidatesForAllChunks();
    this.logicalStore.clear();
    this.templateResources.clear();
    this.bulkBatches = 0;
    this.work.clear();
  }

  private beginSettlement(): void {
    this.settlement.beginBatch();
  }

  private cancelSettlement(): void {
    this.settlement.cancel();
  }

  private isSettlementReady(): boolean {
    if (this.flushTimer !== undefined || this.logicalStore.dirtyChunkCount > 0) return false;
    return !this.work.hasPendingWork && !this.work.hasQueuedWork;
  }

  private notifySettlementIfReady(): void {
    this.settlement.notifyIfReady(() => this.isSettlementReady());
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushNow();
    }, 0);
  }

  private cancelPendingRepresentationCommit(key: string): void {
    this.settlement.cancelRepresentationCommit(key);
  }

  private cancelPendingRepresentationCommits(): void {
    this.settlement.cancelRepresentationCommits();
  }

  private retainHydrationCandidates(
    chunkKey: string,
    candidates: readonly string[],
  ): readonly string[] {
    return this.settlement.retainHydrationCandidates(chunkKey, candidates);
  }
}

function terrainChunkKeyForPosition(position: VoxelCoordinate): string {
  return terrainChunkKey(worldToTerrainChunk(position));
}

function emptyTerrainApplyResult(changedKeys: readonly string[] = []): TerrainApplyResult {
  return {
    changedKeys: [...new Set(changedKeys)],
    rebuiltChunks: [],
    representedKeys: [],
    failedKeys: [],
  };
}
