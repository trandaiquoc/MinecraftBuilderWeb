import * as THREE from 'three';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { TerrainOccupancy } from './chunk-occupancy';
import { relevantTerrainChunks, terrainChunkBounds, terrainChunkKey, worldToTerrainChunk, type TerrainChunkCoordinate } from './chunk-coordinate';
import { dirtyTerrainChunkKeys } from './chunk-dirty-tracker';
import { meshTerrainChunk, precompileTerrainTemplates, terrainPresentationBucketKey, terrainPresentationRole, type CompiledTerrainChunk, type PrecompiledTerrainFace } from './chunk-surface-mesher';
import type { TerrainClassificationEntry } from './terrain-classifier';
import { TerrainTextureAtlas, type TerrainAtlasEvidence } from './atlas/terrain-texture-atlas';
import type { TerrainAtlasMode } from './atlas/terrain-texture-atlas';
import { TerrainMeshWorkerPool, type TerrainMeshWorkerPoolEvidence, type TerrainWorkerLike } from './terrain-mesh-worker-pool';
import type { TerrainMeshFace, TerrainMeshJob, TerrainMeshResult, TerrainMeshTemplateData } from './terrain-mesh-protocol';
import { TerrainCommitScheduler, type TerrainCommitSchedulerEvidence } from './terrain-commit-scheduler';
import { TerrainCommitDiagnostics, type TerrainCommitDiagnosticsEvidence, type TerrainCommitMetrics } from './terrain-commit-diagnostics';

export interface TerrainSurfaceRecord {
  readonly key: string;
  readonly block: PlacedBlock;
  readonly templates: readonly SurfaceFaceTemplate[];
  readonly compiledTemplates?: readonly PrecompiledTerrainFace[];
  readonly role?: 'normal' | 'reference';
}

export interface TerrainBlockChange {
  readonly position: VoxelCoordinate;
  readonly key: string;
  readonly before?: TerrainSurfaceRecord;
  readonly after?: TerrainSurfaceRecord;
  readonly afterOpaque: boolean;
}

export interface TerrainOwnershipEvidence {
  readonly key: string;
  readonly chunkKey: string;
  readonly revision: number;
  readonly facesEmitted: number;
  readonly fullyOccluded: boolean;
}

export interface TerrainApplyResult {
  readonly changedKeys: readonly string[];
  readonly rebuiltChunks: readonly string[];
  readonly representedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  /** Keys whose hydration was invalidated by the originating mutation. */
  readonly hydrationCandidateKeys?: readonly string[];
  readonly commitMetrics?: TerrainCommitMetrics;
  readonly pending?: boolean;
  readonly disposition?: TerrainApplyDisposition;
}

export type TerrainRepresentationCommitStatus = 'committed' | 'pending' | 'failed';

export interface TerrainRepresentationCommitCallbacks {
  readonly onCommitted: () => void;
  readonly onFailed: (status: 'failed' | 'cancelled') => void;
}

export interface TerrainSettlement {
  readonly status: 'settled' | 'failed' | 'cancelled';
  readonly failedKeys: readonly string[];
}

export type TerrainApplyDisposition =
  | 'accepted'
  | 'partial-unrepresented'
  | 'all-unrepresented'
  | 'commit-policy-rejected'
  | 'worker-failure'
  | 'chunk-removed';

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
  readonly onAsyncApply?: (records: readonly TerrainSurfaceRecord[], result: TerrainApplyResult) => void;
}

interface TerrainChunkObject {
  readonly key: string;
  readonly chunk: TerrainChunkCoordinate;
  readonly meshes: THREE.Mesh[];
  readonly signature: string;
  readonly emittedKeys: readonly string[];
  readonly fullyOccludedKeys: readonly string[];
  readonly failedKeys: readonly string[];
  readonly estimatedBytes: number;
}

interface TerrainChunkWorkState {
  readonly revision: number;
  readonly jobId: number;
  readonly signature: string;
  replacementRequested: boolean;
  completed: boolean;
}

interface CachedTerrainVariant extends TerrainChunkObject {}

export const TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES = 96 * 1024 * 1024;

/** Owns compiled opaque terrain meshes while leaving project/editor data elsewhere. */
export class ChunkSurfaceRenderer {
  private disposed = false;
  private readonly templateStore = new Map<string, readonly SurfaceFaceTemplate[]>();
  private readonly compiledTemplateCache = new WeakMap<readonly SurfaceFaceTemplate[], readonly PrecompiledTerrainFace[]>();
  private readonly records = new Map<string, TerrainSurfaceRecord>();
  private readonly recordsByChunk = new Map<string, Map<string, TerrainSurfaceRecord>>();
  private readonly chunks = new Map<string, TerrainChunkObject>();
  private readonly residentVariants = new Map<string, CachedTerrainVariant>();
  private readonly templateIdentity = new WeakMap<readonly SurfaceFaceTemplate[], number>();
  private readonly occupancy = new TerrainOccupancy();
  private readonly dirtyChunks = new Set<string>();
  private readonly ownership = new Map<string, TerrainOwnershipEvidence>();
  private readonly ownershipKeysByChunk = new Map<string, Set<string>>();
  private readonly chunkRevisions = new Map<string, number>();
  private readonly chunkWork = new Map<string, TerrainChunkWorkState>();
  private readonly pendingHydrationCandidatesByChunk = new Map<string, Set<string>>();
  private readonly pendingRepresentationCommitsByChunk = new Map<string, Map<string, TerrainRepresentationCommitCallbacks>>();
  private readonly pendingRepresentationCommitChunks = new Map<string, string>();
  private settlementGeneration = 0;
  private settlementFailedKeys = new Set<string>();
  private readonly settlementWaiters = new Map<number, Array<(result: TerrainSettlement) => void>>();
  private readonly workerPool: TerrainMeshWorkerPool;
  private readonly commitScheduler: TerrainCommitScheduler;
  private readonly commitDiagnostics = new TerrainCommitDiagnostics();
  private workerJobSequence = 0;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private rebuildCount = 0;
  private blocksCompiled = 0;
  private facesEmitted = 0;
  private facesCulled = 0;
  private templateResolutions = 0;
  private templateCacheHits = 0;
  private bulkBatches = 0;
  private terrainCandidateOwnershipTotal = 0;
  private terrainCandidateFanoutTotal = 0;
  private maxHydrationCandidatesPerChunk = 0;
  private maxRecordsPerChunk = 0;
  private terrainCommitCandidateChecks = 0;
  private terrainCommitRepresentedLookupChecks = 0;
  private referenceOpacity = .28;
  private residentVariantBytes = 0;
  private residentVariantHits = 0;
  private residentVariantEvictions = 0;
  private nextTemplateIdentity = 1;
  readonly terrainAtlas?: TerrainTextureAtlas;

  constructor(private readonly options: ChunkSurfaceRendererOptions) {
    this.terrainAtlas = options.terrainAtlasMode === 'on' ? new TerrainTextureAtlas() : undefined;
    this.workerPool = new TerrainMeshWorkerPool({ workerCount: options.workerCount, workerFactory: options.workerFactory });
    this.commitScheduler = new TerrainCommitScheduler(2, 5, () => options.isCameraInteracting?.() ?? false);
  }

  get chunkCount(): number { return this.chunks.size; }
  get chunkMeshCount(): number { return [...this.chunks.values()].reduce((count, chunk) => count + chunk.meshes.length, 0); }
  get residentVariantCount(): number { return this.residentVariants.size; }
  get logicalBlockCount(): number { return this.records.size; }
  has(key: string): boolean { return this.records.has(key); }
  ownershipFor(key: string): TerrainOwnershipEvidence | undefined { return this.ownership.get(key); }
  isRepresented(key: string): boolean { return this.ownership.has(key); }

  /** Resolves when the current batch has reached a terminal worker/commit state. */
  whenSettled(): Promise<TerrainSettlement> {
    if (this.disposed) return Promise.resolve({ status: 'cancelled', failedKeys: [] });
    const generation = this.settlementGeneration;
    if (this.isSettlementReady()) return Promise.resolve(this.settlementResult());
    return new Promise((resolve) => {
      const waiters = this.settlementWaiters.get(generation) ?? [];
      waiters.push(resolve);
      this.settlementWaiters.set(generation, waiters);
    });
  }

  /** Returns immutable record references for a presentation-only subset. */
  recordsForKeys(keys: ReadonlySet<string>): readonly TerrainSurfaceRecord[] {
    return [...keys].map((key) => this.records.get(key)).filter((record): record is TerrainSurfaceRecord => !!record);
  }

  syncOccupancy(entries: readonly TerrainClassificationEntry[], affectedPositions: readonly VoxelCoordinate[], initial = false): void {
    if (this.disposed) return;
    this.occupancy.replace(entries);
    this.options.record('occupancyFullRebuilds');
    if (initial) for (const key of this.chunks.keys()) this.dirtyChunks.add(key);
    for (const position of affectedPositions) for (const chunk of relevantTerrainChunks(position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    this.scheduleFlush();
  }

  cacheTemplates(key: string, templates: readonly SurfaceFaceTemplate[]): void {
    if (this.disposed) return;
    if (this.templateStore.has(key)) return;
    this.templateStore.set(key, templates);
    this.compiledTemplateCache.set(templates, precompileTerrainTemplates(templates, this.terrainAtlas));
    this.templateResolutions += 1;
    this.options.record('terrainTemplateResolutions');
  }

  /** Registers one generation/batch and compiles its dirty chunks exactly once. */
  bulkUpsert(records: readonly TerrainSurfaceRecord[], occupancyEntries?: readonly TerrainClassificationEntry[], affectedPositions: readonly VoxelCoordinate[] = [], options: { readonly initial?: boolean; readonly flush?: boolean } = {}): TerrainApplyResult {
    if (this.disposed) return emptyTerrainApplyResult(records.map((record) => record.key));
    this.beginSettlement();
    this.bulkBatches += 1;
    this.options.record('terrainBulkBatches');
    if (options.initial) {
      this.cancelPendingRepresentationCommits();
      for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
      this.chunks.clear();
      this.clearResidentVariants();
      this.records.clear();
      this.recordsByChunk.clear();
      this.ownership.clear();
      this.ownershipKeysByChunk.clear();
      this.chunkRevisions.clear();
      this.chunkWork.clear();
      this.pendingHydrationCandidatesByChunk.clear();
      this.dirtyChunks.clear();
    }
    if (occupancyEntries) this.occupancy.replace(occupancyEntries);
    for (const record of records) {
      const previous = this.records.get(record.key);
      this.indexRecord(record);
      for (const position of [previous?.block.position, record.block.position]) if (position) for (const chunk of relevantTerrainChunks(position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    }
    if (options.initial) for (const key of this.recordsByChunk.keys()) this.dirtyChunks.add(key);
    for (const position of affectedPositions) for (const chunk of relevantTerrainChunks(position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    if (options.flush === false) { this.scheduleFlush(); return emptyTerrainApplyResult(records.map((record) => record.key)); }
    return this.flushNow(records.map((record) => record.key));
  }

  /** Applies a bounded local voxel delta without replacing records or occupancy. */
  applyBlockChanges(changes: readonly TerrainBlockChange[], flush = true, hydrationCandidateKeys: readonly string[] = changes.map((change) => change.key), deferFlush = false): TerrainApplyResult {
    if (this.disposed) return emptyTerrainApplyResult(changes.map((change) => change.key));
    if (!changes.length) return emptyTerrainApplyResult();
    this.beginSettlement();
    for (const change of changes) {
      if (change.before && (!change.after || change.before.key !== change.after.key)) this.removeRecord(change.before);
      if (change.after) this.indexRecord(change.after);
    }
    this.occupancy.applyDelta(changes.map((change) => ({ position: change.position, opaque: change.afterOpaque })));
    this.options.record('occupancyDeltaUpdates', changes.length);
    const dirty = dirtyTerrainChunkKeys(changes.map((change) => change.position));
    this.options.record('incrementalChunkInvalidations', dirty.size);
    for (const key of dirty) this.dirtyChunks.add(key);
    if (flush) return this.flushNow(changes.map((change) => change.key), 1, hydrationCandidateKeys);
    if (deferFlush && hydrationCandidateKeys.length) {
      for (const [chunkKey, candidates] of this.indexHydrationCandidates(hydrationCandidateKeys)) {
        this.retainHydrationCandidates(chunkKey, candidates);
      }
    }
    if (!deferFlush) this.scheduleFlush();
    return emptyTerrainApplyResult(changes.map((change) => change.key));
  }

  /** Dispatches accumulated dirty chunks once a cooperative projection is complete. */
  flushPending(): TerrainApplyResult {
    if (this.disposed || !this.dirtyChunks.size) return emptyTerrainApplyResult();
    return this.flushNow();
  }

  templatesFor(key: string): readonly SurfaceFaceTemplate[] | undefined {
    const templates = this.templateStore.get(key);
    if (templates) { this.templateCacheHits += 1; this.options.record('terrainTemplateCacheHits'); }
    return templates;
  }

  hasTemplates(key: string): boolean { return this.templateStore.has(key); }

  upsert(record: TerrainSurfaceRecord, flush = false): boolean {
    if (this.disposed) return false;
    if (record.templates.length !== 6) return false;
    this.cancelPendingRepresentationCommit(record.key);
    this.beginSettlement();
    const previous = this.records.get(record.key);
    this.indexRecord(record);
    if (!previous || coordinateKey(previous.block.position) !== coordinateKey(record.block.position)) {
      for (const position of [previous?.block.position, record.block.position]) if (position) for (const chunk of relevantTerrainChunks(position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    } else {
      for (const chunk of relevantTerrainChunks(record.block.position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    }
    if (flush) return this.flushNow([record.key]).representedKeys.includes(record.key);
    this.scheduleFlush();
    return true;
  }

  upsertAndCommit(record: TerrainSurfaceRecord, callbacks?: TerrainRepresentationCommitCallbacks): TerrainRepresentationCommitStatus {
    if (this.disposed) return 'failed';
    if (record.templates.length !== 6) return 'failed';
    const committed = this.upsert(record, true);
    if (committed) return 'committed';
    const terminalCallbacks = callbacks ?? { onCommitted: () => undefined, onFailed: () => undefined };
    const chunkKey = terrainChunkKeyForPosition(record.block.position);
    const work = this.chunkWork.get(chunkKey);
    if (!work || work.completed) return 'failed';
    const pending = this.pendingRepresentationCommitsByChunk.get(chunkKey) ?? new Map<string, TerrainRepresentationCommitCallbacks>();
    pending.set(record.key, terminalCallbacks);
    this.pendingRepresentationCommitsByChunk.set(chunkKey, pending);
    this.pendingRepresentationCommitChunks.set(record.key, chunkKey);
    return 'pending';
  }

  remove(key: string): void {
    if (this.disposed) return;
    this.cancelPendingRepresentationCommit(key);
    const previous = this.records.get(key);
    if (!previous) return;
    this.beginSettlement();
    this.removeRecord(previous);
    for (const chunk of relevantTerrainChunks(previous.block.position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    this.scheduleFlush();
  }

  flushNow(changedKeys: readonly string[] = [], priority = 0, hydrationCandidateKeys: readonly string[] = changedKeys): TerrainApplyResult {
    if (this.disposed) return emptyTerrainApplyResult(changedKeys);
    const timing = !!this.options.onTiming && (this.options.isTimingEnabled?.() ?? true);
    const started = timing ? performance.now() : 0;
    if (this.flushTimer !== undefined) { clearTimeout(this.flushTimer); this.flushTimer = undefined; }
    const dirty = [...this.dirtyChunks];
    this.dirtyChunks.clear();
    const localChangedKeys = this.indexKeysByOwningChunk(changedKeys);
    const localCandidates = this.indexHydrationCandidates(hydrationCandidateKeys);
    if (this.workerPool.supported) {
      for (const key of dirty) this.queueWorkerChunk(key, localChangedKeys.get(key) ?? [], priority, localCandidates.get(key) ?? []);
      if (timing) this.options.onTiming?.('terrain.flushNow', performance.now() - started);
      this.notifySettlementIfReady();
      return { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: [], failedKeys: [], hydrationCandidateKeys: [...new Set(hydrationCandidateKeys)], pending: dirty.length > 0 };
    }
    const rebuiltChunks: string[] = [];
    const representedKeys = new Set<string>();
    const failedKeys = new Set<string>();
    for (const key of dirty) {
      const result = this.rebuildChunk(key, localCandidates.get(key) ?? []);
      if (!result) continue;
      rebuiltChunks.push(key);
      for (const item of result.representedKeys) representedKeys.add(item);
      for (const item of result.failedKeys) failedKeys.add(item);
    }
    const result = { changedKeys: [...new Set(changedKeys)], rebuiltChunks, representedKeys: [...representedKeys], failedKeys: [...failedKeys], hydrationCandidateKeys: [...new Set(hydrationCandidateKeys)] };
    if (timing) this.options.onTiming?.('terrain.flushNow', performance.now() - started);
    for (const key of failedKeys) this.settlementFailedKeys.add(key);
    this.notifySettlementIfReady();
    return result;
  }

  applyMaterial(callback: (material: THREE.Material) => void): void {
    for (const chunk of this.chunks.values()) for (const mesh of chunk.meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) callback(material);
    }
  }

  setReferenceOpacity(opacity: number): void {
    this.referenceOpacity = Math.max(0, Math.min(1, opacity));
    this.applyMaterial((material) => {
      if (material.userData['terrainRole'] !== 'reference') return;
      material.transparent = true;
      material.opacity = this.referenceOpacity;
      material.needsUpdate = true;
    });
  }

  evidence(): TerrainRendererEvidence {
    return {
      terrainChunks: this.chunks.size,
      terrainChunkMeshes: this.chunkMeshCount,
      terrainChunkRebuilds: this.rebuildCount,
      terrainResidentVariantHits: this.residentVariantHits,
      terrainResidentVariantEvictions: this.residentVariantEvictions,
      terrainResidentVariantCount: this.residentVariants.size,
      terrainResidentVariantBytes: this.residentVariantBytes,
      terrainBlocksCompiled: this.blocksCompiled,
      terrainFacesEmitted: this.facesEmitted,
      terrainFacesCulled: this.facesCulled,
      terrainTemplateResolutions: this.templateResolutions,
      terrainTemplateCacheHits: this.templateCacheHits,
      terrainLogicalBlocks: this.records.size,
      terrainBulkBatches: this.bulkBatches,
      terrainCandidateOwnershipTotal: this.terrainCandidateOwnershipTotal,
      terrainCandidateFanoutTotal: this.terrainCandidateFanoutTotal,
      maxHydrationCandidatesPerChunk: this.maxHydrationCandidatesPerChunk,
      maxRecordsPerChunk: this.maxRecordsPerChunk,
      terrainCommitCandidateChecks: this.terrainCommitCandidateChecks,
      terrainCommitRepresentedLookupChecks: this.terrainCommitRepresentedLookupChecks,
      terrainPendingHydrationCandidates: [...this.pendingHydrationCandidatesByChunk.values()].reduce((total, candidates) => total + candidates.size, 0),
      terrainPendingHydrationCandidateChunks: this.pendingHydrationCandidatesByChunk.size,
      terrainWorker: this.workerPool.evidence(),
      terrainCommit: this.commitScheduler.evidence(),
      terrainCommitDiagnostics: this.commitDiagnostics.evidence(),
      terrainAtlas: { ...(this.terrainAtlas?.evidence() ?? { terrainAtlasPages: 0, terrainAtlasSprites: 0, terrainAtlasCacheHits: 0, terrainAtlasInsertions: 0, terrainAtlasMaterials: 0, terrainAtlasCompatibleFaces: 0, terrainAtlasFallbackFaces: 0 }), terrainAtlasChunkBuckets: this.chunkMeshCount },
    };
  }

  /** O(1) maintained counters for high-frequency runtime trace sampling. */
  lightEvidence(): Readonly<Record<string, unknown>> {
    return {
      terrainChunks: this.chunks.size,
      terrainChunkMeshes: this.chunkMeshCount,
      terrainChunkRebuilds: this.rebuildCount,
      terrainResidentVariantHits: this.residentVariantHits,
      terrainResidentVariantEvictions: this.residentVariantEvictions,
      terrainResidentVariantCount: this.residentVariants.size,
      terrainResidentVariantBytes: this.residentVariantBytes,
      terrainBlocksCompiled: this.blocksCompiled,
      terrainFacesEmitted: this.facesEmitted,
      terrainFacesCulled: this.facesCulled,
      terrainTemplateResolutions: this.templateResolutions,
      terrainTemplateCacheHits: this.templateCacheHits,
      terrainLogicalBlocks: this.records.size,
      terrainBulkBatches: this.bulkBatches,
      terrainPendingHydrationCandidateChunks: this.pendingHydrationCandidatesByChunk.size,
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
    this.commitScheduler.dispose();
    this.workerPool.dispose();
  }

  private clearContents(): void {
    this.cancelPendingRepresentationCommits();
    this.cancelSettlement();
    if (this.flushTimer !== undefined) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.clearResidentVariants();
    this.records.clear();
    this.recordsByChunk.clear();
    this.ownership.clear();
    this.ownershipKeysByChunk.clear();
    this.chunkRevisions.clear();
    this.chunkWork.clear();
    this.pendingHydrationCandidatesByChunk.clear();
    this.dirtyChunks.clear();
    for (const templates of this.templateStore.values()) for (const template of templates) { template.geometry.dispose(); template.material.dispose(); }
    this.templateStore.clear();
    this.bulkBatches = 0;
    this.terrainCandidateOwnershipTotal = 0;
    this.terrainCandidateFanoutTotal = 0;
    this.maxHydrationCandidatesPerChunk = 0;
    this.maxRecordsPerChunk = 0;
    this.terrainCommitCandidateChecks = 0;
    this.terrainCommitRepresentedLookupChecks = 0;
    this.terrainAtlas?.clear();
  }

  private beginSettlement(): void {
    const previous = this.settlementWaiters.get(this.settlementGeneration);
    if (previous?.length) for (const resolve of previous) resolve({ status: 'cancelled', failedKeys: [] });
    this.settlementWaiters.delete(this.settlementGeneration);
    this.settlementGeneration += 1;
    this.settlementFailedKeys.clear();
  }

  private cancelSettlement(): void {
    const waiters = this.settlementWaiters.get(this.settlementGeneration);
    if (waiters?.length) for (const resolve of waiters) resolve({ status: 'cancelled', failedKeys: [] });
    this.settlementWaiters.delete(this.settlementGeneration);
    this.settlementGeneration += 1;
    this.settlementFailedKeys.clear();
  }

  private settlementResult(): TerrainSettlement {
    const failedKeys = [...this.settlementFailedKeys];
    return { status: failedKeys.length ? 'failed' : 'settled', failedKeys };
  }

  private isSettlementReady(): boolean {
    if (this.flushTimer !== undefined || this.dirtyChunks.size > 0) return false;
    if ([...this.chunkWork.values()].some((work) => !work.completed)) return false;
    const worker = this.workerPool.evidence();
    const commits = this.commitScheduler.evidence();
    return worker.terrainWorkerQueued === 0 && worker.terrainWorkerRunning === 0 && commits.terrainCommitQueueDepth === 0;
  }

  private notifySettlementIfReady(): void {
    if (!this.isSettlementReady()) return;
    const waiters = this.settlementWaiters.get(this.settlementGeneration);
    if (!waiters?.length) return;
    this.settlementWaiters.delete(this.settlementGeneration);
    const result = this.settlementResult();
    for (const resolve of waiters) resolve(result);
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = undefined; this.flushNow(); }, 0);
  }

  private queueWorkerChunk(key: string, changedKeys: readonly string[], priority = 0, hydrationCandidateKeys: readonly string[] = changedKeys): void {
    const chunk = parseChunkKey(key);
    if (!chunk) return;
    const entries = [...(this.recordsByChunk.get(key)?.values() ?? [])];
    const signature = this.variantSignature(key, chunk, entries);
    if (!entries.length) this.pendingHydrationCandidatesByChunk.delete(key);
    const attemptHydrationCandidates = entries.length ? this.retainHydrationCandidates(key, hydrationCandidateKeys) : [];
    this.maxRecordsPerChunk = Math.max(this.maxRecordsPerChunk, entries.length);
    this.maxHydrationCandidatesPerChunk = Math.max(this.maxHydrationCandidatesPerChunk, attemptHydrationCandidates.length);
    const previousRevision = this.chunkRevisions.get(key) ?? 0;
    const revision = previousRevision + 1;
    this.chunkRevisions.set(key, revision);
    const currentGeneration = this.options.terrainGeneration?.() ?? 0;
    const currentProviderGeneration = this.options.providerGeneration?.() ?? 0;
    if (!entries.length) {
      const previous = this.chunks.get(key);
      if (previous) { this.retainResidentVariant(previous); this.chunks.delete(key); }
      this.clearChunkOwnership(key);
      this.chunkWork.delete(key);
      this.options.onAsyncApply?.([], { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [key], representedKeys: [], failedKeys: [], hydrationCandidateKeys: [], disposition: 'chunk-removed' });
      return;
    }
    const cached = this.takeResidentVariant(key, signature);
    if (cached) {
      const previous = this.chunks.get(key);
      this.installResidentVariant(key, cached, previous, revision);
      this.options.record('terrainResidentVariantHits');
      this.residentVariantHits += 1;
      const represented = [...cached.emittedKeys, ...cached.fullyOccludedKeys];
      const failed = [...cached.failedKeys];
      if (failed.length) for (const failedKey of failed) this.settlementFailedKeys.add(failedKey);
      this.completePendingHydrationCandidates(key, attemptHydrationCandidates, represented);
      this.settlePendingRepresentationCommits(key, represented, failed, 'failed');
      const result: TerrainApplyResult = { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: represented, failedKeys: failed, hydrationCandidateKeys: [...new Set(attemptHydrationCandidates)], disposition: failed.length ? 'partial-unrepresented' : 'accepted' };
      this.options.onAsyncApply?.(entries, result);
      this.notifySettlementIfReady();
      return;
    }
    const templateIndexes = new WeakMap<readonly PrecompiledTerrainFace[], number>();
    const templates: TerrainMeshTemplateData[] = [];
    const jobEntries = entries.map((entry) => {
      const compiled = entry.compiledTemplates ?? this.compiledTemplateCache.get(entry.templates) ?? precompileTerrainTemplates(entry.templates, this.terrainAtlas);
      let templateIndex = templateIndexes.get(compiled);
      if (templateIndex === undefined) {
        templateIndex = templates.length;
        templateIndexes.set(compiled, templateIndex);
        const faces: TerrainMeshFace[] = compiled.map((face) => ({ direction: face.direction, bucketKey: terrainPresentationBucketKey(face.bucketKey, entry.role ?? 'normal'), positions: new Float32Array(face.positions), normals: new Float32Array(face.normals), uvs: new Float32Array(face.uvs) }));
        templates.push({ faces });
      }
      return { key: entry.key, position: [entry.block.position.x, entry.block.position.y, entry.block.position.z] as [number, number, number], templateIndex };
    });
    const job: TerrainMeshJob = {
      jobId: ++this.workerJobSequence,
      generation: currentGeneration,
      providerGeneration: currentProviderGeneration,
      revision,
      chunk,
      templates,
      entries: jobEntries,
      occupancy: this.occupancyHalo(chunk),
      priority,
    };
    this.chunkWork.set(key, { revision, jobId: job.jobId, signature, replacementRequested: false, completed: false });
    void this.workerPool.submit(job).then((result) => {
      this.options.onTiming?.('terrain.worker', result.cpuMs);
      this.commitScheduler.enqueue(() => {
        const started = performance.now();
        this.commitWorkerResult(key, entries, result, priority, changedKeys, attemptHydrationCandidates);
        this.options.onTiming?.('terrain.commit', performance.now() - started);
      }, 1);
    }).catch(() => {
      this.commitWorkerFailure(key, entries, changedKeys, job);
    });
  }

  private occupancyHalo(chunk: TerrainChunkCoordinate): { readonly origin: [number, number, number]; readonly size: 18; readonly opaque: Uint8Array } {
    const origin: [number, number, number] = [chunk.x * 16 - 1, chunk.y * 16 - 1, chunk.z * 16 - 1];
    const opaque = new Uint8Array(18 * 18 * 18);
    for (let y = 0; y < 18; y += 1) for (let z = 0; z < 18; z += 1) for (let x = 0; x < 18; x += 1) {
      if (this.occupancy.hasOpaque({ x: origin[0] + x, y: origin[1] + y, z: origin[2] + z })) opaque[(y * 18 + z) * 18 + x] = 1;
    }
    return { origin, size: 18, opaque };
  }

  private commitWorkerResult(key: string, records: readonly TerrainSurfaceRecord[], result: TerrainMeshResult, priority: number, changedKeys: readonly string[], hydrationCandidateKeys: readonly string[]): void {
    if (this.disposed) return;
    const commitStarted = performance.now();
    const metrics: TerrainCommitMetrics = { chunkKey: key, priority, recordsInChunk: records.length, representedKeys: 0, emittedKeys: result.emittedKeys.length, fullyOccludedKeys: result.fullyOccludedKeys.length, failedKeys: result.unrepresentedExposedKeys.length, meshBucketCount: result.buckets.length, geometryVertices: result.buckets.reduce((count, bucket) => count + bucket.positions.length / 3, 0), geometryIndices: result.buckets.reduce((count, bucket) => count + bucket.indices.length, 0), ownershipRemoved: 0, ownershipInserted: 0, hydrationCandidateKeys: hydrationCandidateKeys.length, hydrationCompletedKeys: 0, hydrationPublishCount: 0 };
    const validateStarted = performance.now();
    const currentRevision = this.chunkRevisions.get(key);
    const generation = this.options.terrainGeneration?.() ?? 0;
    const providerGeneration = this.options.providerGeneration?.() ?? 0;
    const work = this.chunkWork.get(key);
    const staleRevision = currentRevision !== result.revision;
    const staleGeneration = generation !== result.generation;
    const staleProvider = providerGeneration !== result.providerGeneration;
    const replacementPending = this.dirtyChunks.has(key) && work?.jobId === result.jobId;
    const superseded = work?.jobId !== result.jobId || replacementPending;
    this.recordCommitStage('terrain.commit.validate', validateStarted, metrics);
    if (!staleRevision && !staleGeneration && !staleProvider && !superseded && work?.completed) return;
    if (staleRevision || staleGeneration || staleProvider || superseded) {
      this.workerPool.markStaleResult();
      if (staleRevision) this.options.record('terrainAsyncStaleRevisionResults');
      if (staleGeneration) this.options.record('terrainAsyncStaleGenerationResults');
      if (staleProvider) this.options.record('terrainAsyncStaleProviderResults');
      if (superseded) this.options.record('terrainAsyncSupersededResults');
      const currentRecords = this.recordsByChunk.get(key);
      const ownsResult = work?.jobId === result.jobId && work.revision === result.revision;
      if (currentRecords?.size && !replacementPending && ownsResult && !work.replacementRequested) {
        work.replacementRequested = true;
        this.dirtyChunks.add(key);
        this.options.record('terrainAsyncRescheduledChunks');
        this.scheduleFlush();
      } else if (ownsResult && (!currentRecords?.size || !this.dirtyChunks.has(key))) {
        // A stale result that still owns the chunk work must reach a terminal
        // state even when the logical records were removed while it ran.
        // Otherwise settlement waits forever on an obsolete job.
        work.completed = true;
        this.chunkWork.delete(key);
        this.pendingHydrationCandidatesByChunk.delete(key);
        this.settlePendingRepresentationCommits(key, [], records.map((record) => record.key), 'cancelled');
      } else if (currentRecords?.size && (staleGeneration || staleProvider) && !work) {
        this.options.record('terrainAsyncRejectedWithoutReplacement');
      }
      this.notifySettlementIfReady();
      return;
    }
    const materialStarted = performance.now();
    const materials = new Map<string, THREE.Material>();
    for (const record of records) for (const face of record.compiledTemplates ?? this.compiledTemplateCache.get(record.templates) ?? []) {
      const bucketKey = terrainPresentationBucketKey(face.bucketKey, record.role ?? 'normal');
      if (!materials.has(bucketKey)) materials.set(bucketKey, face.material);
    }
    this.recordCommitStage('terrain.commit.materialLookup', materialStarted, metrics);
    const geometryStarted = performance.now();
    const buckets: CompiledTerrainChunk['buckets'][number][] = result.buckets.map((bucket) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(bucket.indices, 1));
      return { key: bucket.key, material: materials.get(bucket.key) ?? new THREE.MeshBasicMaterial({ color: 0xffffff }), geometry, faceCount: bucket.faceCount };
    });
    const compiled: CompiledTerrainChunk = {
      chunk: result.chunk,
      buckets,
      blocksCompiled: result.blocksCompiled,
      facesEmitted: result.facesEmitted,
      facesCulled: result.facesCulled,
      emittedKeys: result.emittedKeys,
      fullyOccludedKeys: result.fullyOccludedKeys,
      unrepresentedExposedKeys: result.unrepresentedExposedKeys,
    };
    this.recordCommitStage('terrain.commit.geometryWrap', geometryStarted, metrics);
    const previous = this.chunks.get(key);
    const shouldCommit = this.options.shouldCommitChunk?.(key, compiled) ?? true;
    const represented = [...compiled.emittedKeys, ...compiled.fullyOccludedKeys];
    const failed = [...compiled.unrepresentedExposedKeys];
    if (!shouldCommit || records.length > 0 && represented.length === 0) {
      for (const bucket of buckets) { bucket.geometry.dispose(); if (!materials.has(bucket.key)) bucket.material.dispose(); }
      const failedKeys = !shouldCommit || records.length && represented.length === 0
        ? records.map((record) => record.key)
        : failed;
      for (const failedKey of failedKeys) this.settlementFailedKeys.add(failedKey);
      if (!shouldCommit) this.options.record('terrainAsyncCommitPolicyRejected');
      else this.options.record('terrainAsyncAllUnrepresentedResults');
      if (work) work.completed = true;
      this.pendingHydrationCandidatesByChunk.delete(key);
      const apply = { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: [], failedKeys: [...new Set(failedKeys)], hydrationCandidateKeys: [...new Set(hydrationCandidateKeys)], commitMetrics: metrics, disposition: !shouldCommit ? 'commit-policy-rejected' as const : 'all-unrepresented' as const };
      this.settlePendingRepresentationCommits(key, [], failedKeys, 'failed');
      const asyncStarted = performance.now();
      this.options.onAsyncApply?.(records, apply);
      this.recordCommitStage('terrain.commit.asyncApply', asyncStarted, metrics);
      this.finishCommitDiagnostics(metrics, commitStarted, apply);
      this.notifySettlementIfReady();
      return;
    }
    const sceneSwapStarted = performance.now();
    const ownership = this.installCompiledChunk(key, compiled, previous, result.revision, work.signature);
    this.recordCommitStage('terrain.commit.sceneSwap', sceneSwapStarted, metrics);
    metrics.ownershipRemoved = ownership.removed;
    metrics.ownershipInserted = ownership.inserted;
    if (work) work.completed = true;
    if (failed.length) {
      this.options.record('terrainAsyncPartialFailureResults');
    } else this.options.record('terrainAsyncAcceptedResults');
    metrics.representedKeys = represented.length;
    this.completePendingHydrationCandidates(key, hydrationCandidateKeys, [...represented, ...failed]);
    const apply: TerrainApplyResult = { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [key], representedKeys: represented, failedKeys: failed, hydrationCandidateKeys: [...new Set(hydrationCandidateKeys)], commitMetrics: metrics, disposition: failed.length ? 'partial-unrepresented' : 'accepted' };
    this.settlePendingRepresentationCommits(key, represented, failed, 'failed');
    for (const failedKey of failed) this.settlementFailedKeys.add(failedKey);
    const asyncStarted = performance.now();
    this.options.onAsyncApply?.(records, apply);
    this.recordCommitStage('terrain.commit.asyncApply', asyncStarted, metrics);
    this.finishCommitDiagnostics(metrics, commitStarted, apply);
    this.notifySettlementIfReady();
  }

  private commitWorkerFailure(key: string, records: readonly TerrainSurfaceRecord[], changedKeys: readonly string[], job: TerrainMeshJob): void {
    if (this.disposed) return;
    if (this.chunkWork.get(key)?.jobId !== job.jobId || this.chunkRevisions.get(key) !== job.revision) {
      this.options.record('terrainAsyncSupersededResults');
      return;
    }
    const work = this.chunkWork.get(key);
    if (work) work.completed = true;
    this.pendingHydrationCandidatesByChunk.delete(key);
    for (const record of records) this.settlementFailedKeys.add(record.key);
    this.options.record('terrainAsyncWorkerFailures');
    this.settlePendingRepresentationCommits(key, [], records.map((record) => record.key), 'failed');
    this.options.onAsyncApply?.(records, { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: [], failedKeys: records.map((record) => record.key), disposition: 'worker-failure' });
    this.notifySettlementIfReady();
  }

  private installCompiledChunk(key: string, compiled: CompiledTerrainChunk, previous: TerrainChunkObject | undefined, revision: number, signature: string): { readonly removed: number; readonly inserted: number } {
    this.rebuildCount += 1;
    this.blocksCompiled += compiled.blocksCompiled;
    this.facesEmitted += compiled.facesEmitted;
    this.facesCulled += compiled.facesCulled;
    this.options.record('terrainChunkRebuilds');
    this.options.record('terrainBlocksCompiled', compiled.blocksCompiled);
    this.options.record('terrainFacesEmitted', compiled.facesEmitted);
    this.options.record('terrainFacesCulled', compiled.facesCulled);
    const meshes: THREE.Mesh[] = [];
    const bounds = terrainChunkBounds(compiled.chunk);
    for (const bucket of compiled.buckets) {
      bucket.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z), new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z));
      bucket.geometry.boundingSphere = bucket.geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(bucket.geometry, bucket.material.clone());
      const material = mesh.material as THREE.Material;
      const role = terrainPresentationRole(bucket.key);
      material.userData['terrainRole'] = role;
      if (role === 'reference') { material.transparent = true; material.opacity = this.referenceOpacity; material.needsUpdate = true; }
      mesh.frustumCulled = true; mesh.userData['terrainChunk'] = key; mesh.userData['terrainBucket'] = bucket.key; mesh.userData['terrainRole'] = role; mesh.userData['terrainFaces'] = bucket.faceCount; mesh.userData['realModel'] = true;
      this.options.blocksGroup.add(mesh); meshes.push(mesh);
    }
    if (previous) this.retainResidentVariant(previous);
    if (meshes.length) this.chunks.set(key, createTerrainChunkObject(key, compiled.chunk, meshes, signature, compiled.emittedKeys, compiled.fullyOccludedKeys, compiled.unrepresentedExposedKeys)); else this.chunks.delete(key);
    const ownershipStarted = performance.now();
    const removed = this.clearChunkOwnership(key);
    const emitted = new Set(compiled.emittedKeys), occluded = new Set(compiled.fullyOccludedKeys);
    const ownershipKeys = new Set<string>();
    for (const item of [...compiled.emittedKeys, ...compiled.fullyOccludedKeys]) { this.ownership.set(item, { key: item, chunkKey: key, revision, facesEmitted: emitted.has(item) ? 1 : 0, fullyOccluded: occluded.has(item) }); ownershipKeys.add(item); }
    this.ownershipKeysByChunk.set(key, ownershipKeys);
    for (const item of compiled.unrepresentedExposedKeys) { this.ownership.delete(item); ownershipKeys.delete(item); }
    this.ownershipKeysByChunk.set(key, ownershipKeys);
    this.commitDiagnostics.recordStage('terrain.commit.ownership', Math.max(0, performance.now() - ownershipStarted));
    this.options.onTiming?.('terrain.commit.ownership', Math.max(0, performance.now() - ownershipStarted));
    return { removed, inserted: ownershipKeys.size };
  }

  private rebuildChunk(key: string, hydrationCandidateKeys: readonly string[] = []): { readonly representedKeys: readonly string[]; readonly failedKeys: readonly string[] } | undefined {
    const timing = !!this.options.onTiming && (this.options.isTimingEnabled?.() ?? true);
    const started = timing ? performance.now() : 0;
    const finish = (result: { readonly representedKeys: readonly string[]; readonly failedKeys: readonly string[] } | undefined) => { if (timing) this.options.onTiming?.('terrain.rebuildChunk', performance.now() - started); return result; };
    const chunk = parseChunkKey(key);
    if (!chunk) return finish(undefined);
    const entries = [...(this.recordsByChunk.get(key)?.values() ?? [])];
    this.maxRecordsPerChunk = Math.max(this.maxRecordsPerChunk, entries.length);
    this.maxHydrationCandidatesPerChunk = Math.max(this.maxHydrationCandidatesPerChunk, hydrationCandidateKeys.length);
    const previous = this.chunks.get(key);
    const previousRevision = this.chunkRevisions.get(key) ?? 0;
    const revision = previousRevision + 1;
    this.chunkRevisions.set(key, revision);
    if (!entries.length) {
      if (previous) { this.retainResidentVariant(previous); this.chunks.delete(key); }
      this.clearChunkOwnership(key);
      return finish({ representedKeys: [], failedKeys: [] });
    }
    const signature = this.variantSignature(key, chunk, entries);
    const cached = this.takeResidentVariant(key, signature);
    if (cached) {
      this.installResidentVariant(key, cached, previous, revision);
      this.residentVariantHits += 1;
      this.options.record('terrainResidentVariantHits');
      return finish({ representedKeys: [...cached.emittedKeys, ...cached.fullyOccludedKeys], failedKeys: [...cached.failedKeys] });
    }
    const meshStarted = timing ? performance.now() : 0;
    const compiled = meshTerrainChunk(chunk, entries.map((entry) => ({ ...entry, position: entry.block.position, role: entry.role ?? 'normal', compiledTemplates: entry.compiledTemplates ?? this.compiledTemplateCache.get(entry.templates) })), this.occupancy, this.terrainAtlas);
    if (timing) this.options.onTiming?.('terrain.meshTerrainChunk', performance.now() - meshStarted);
    this.rebuildCount += 1;
    this.blocksCompiled += compiled.blocksCompiled;
    this.facesEmitted += compiled.facesEmitted;
    this.facesCulled += compiled.facesCulled;
    this.options.record('terrainChunkRebuilds');
    this.options.record('terrainBlocksCompiled', compiled.blocksCompiled);
    this.options.record('terrainFacesEmitted', compiled.facesEmitted);
    this.options.record('terrainFacesCulled', compiled.facesCulled);
    const shouldCommit = this.options.shouldCommitChunk?.(key, compiled) ?? true;
    const represented = [...compiled.emittedKeys, ...compiled.fullyOccludedKeys];
    const failed = [...compiled.unrepresentedExposedKeys];
    if (!shouldCommit || entries.length > 0 && represented.length === 0) {
      for (const bucket of compiled.buckets) { bucket.geometry.dispose(); if (!bucket.material.userData['sharedTerrainAtlasMaterial']) bucket.material.dispose(); }
      return finish({ representedKeys: [], failedKeys: [...new Set(!shouldCommit || represented.length === 0 ? entries.map((entry) => entry.key) : [...failed, ...represented])] });
    }
    const meshes: THREE.Mesh[] = [];
    const bounds = terrainChunkBounds(chunk);
    for (const bucket of compiled.buckets) {
      const geometry = bucket.geometry;
      geometry.boundingBox = new THREE.Box3(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z), new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z));
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, bucket.material.clone());
      const material = mesh.material as THREE.Material;
      const role = terrainPresentationRole(bucket.key);
      material.userData['terrainRole'] = role;
      if (role === 'reference') { material.transparent = true; material.opacity = this.referenceOpacity; material.needsUpdate = true; }
      mesh.frustumCulled = true;
      mesh.userData['terrainChunk'] = key;
      mesh.userData['terrainBucket'] = bucket.key;
      mesh.userData['terrainRole'] = role;
      mesh.userData['terrainFaces'] = bucket.faceCount;
      mesh.userData['realModel'] = true;
      this.options.blocksGroup.add(mesh);
      meshes.push(mesh);
    }
    if (previous) this.retainResidentVariant(previous);
    if (meshes.length) this.chunks.set(key, createTerrainChunkObject(key, chunk, meshes, signature, compiled.emittedKeys, compiled.fullyOccludedKeys, compiled.unrepresentedExposedKeys));
    else this.chunks.delete(key);
    const ownershipStarted = performance.now();
    this.clearChunkOwnership(key);
    const emittedKeys = new Set(compiled.emittedKeys);
    const occludedKeys = new Set(compiled.fullyOccludedKeys);
    const ownershipKeys = new Set<string>();
    for (const item of represented) {
      this.ownership.set(item, { key: item, chunkKey: key, revision, facesEmitted: emittedKeys.has(item) ? 1 : 0, fullyOccluded: occludedKeys.has(item) });
      ownershipKeys.add(item);
    }
    this.ownershipKeysByChunk.set(key, ownershipKeys);
    if (failed.length) for (const item of failed) { this.ownership.delete(item); ownershipKeys.delete(item); }
    this.ownershipKeysByChunk.set(key, ownershipKeys);
    this.recordCommitStage('terrain.commit.ownership', ownershipStarted, { chunkKey: key, priority: 0, recordsInChunk: compiled.emittedKeys.length + compiled.fullyOccludedKeys.length, representedKeys: represented.length, emittedKeys: compiled.emittedKeys.length, fullyOccludedKeys: compiled.fullyOccludedKeys.length, failedKeys: failed.length, meshBucketCount: compiled.buckets.length, geometryVertices: 0, geometryIndices: 0, ownershipRemoved: 0, ownershipInserted: ownershipKeys.size, hydrationCandidateKeys: 0, hydrationCompletedKeys: 0, hydrationPublishCount: 0 });
    if (!meshes.length && represented.some((item) => !occludedKeys.has(item))) {
      return finish({ representedKeys: [], failedKeys: [...new Set([...failed, ...represented.filter((item) => !occludedKeys.has(item))])] });
    }
    return finish({ representedKeys: represented, failedKeys: failed });
  }

  private clearChunkOwnership(chunkKey: string): number {
    const keys = this.ownershipKeysByChunk.get(chunkKey);
    if (!keys) return 0;
    for (const key of keys) this.ownership.delete(key);
    this.ownershipKeysByChunk.delete(chunkKey);
    return keys.size;
  }

  private variantSignature(key: string, chunk: TerrainChunkCoordinate, entries: readonly TerrainSurfaceRecord[]): string {
    const signature: string[] = [`${key}|provider:${this.options.providerGeneration?.() ?? 0}|`];
    const ordered = [...entries].sort((left, right) => left.key.localeCompare(right.key));
    for (const entry of ordered) {
      let templateId = this.templateIdentity.get(entry.templates);
      if (templateId === undefined) { templateId = this.nextTemplateIdentity++; this.templateIdentity.set(entry.templates, templateId); }
      signature.push(`${entry.key}:${entry.block.id}:${JSON.stringify(Object.entries(entry.block.state).sort(([a], [b]) => a.localeCompare(b)))}:${entry.role ?? 'normal'}:${templateId};`);
    }
    signature.push('|occupancy:');
    const originX = chunk.x * 16 - 1;
    const originY = chunk.y * 16 - 1;
    const originZ = chunk.z * 16 - 1;
    for (let y = 0; y < 18; y += 1) for (let z = 0; z < 18; z += 1) for (let x = 0; x < 18; x += 1) {
      signature.push(this.occupancy.hasOpaque({ x: originX + x, y: originY + y, z: originZ + z }) ? '1' : '0');
    }
    return signature.join('');
  }

  private takeResidentVariant(chunkKey: string, signature: string): CachedTerrainVariant | undefined {
    const variantKey = `${chunkKey}|${signature}`;
    const variant = this.residentVariants.get(variantKey);
    if (!variant) return undefined;
    this.residentVariants.delete(variantKey);
    this.residentVariantBytes -= variant.estimatedBytes;
    return variant;
  }

  private retainResidentVariant(chunk: TerrainChunkObject): void {
    for (const mesh of chunk.meshes) this.options.blocksGroup.remove(mesh);
    if (!chunk.meshes.length || chunk.estimatedBytes > TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES) {
      this.disposeChunk(chunk);
      return;
    }
    const variantKey = `${chunk.key}|${chunk.signature}`;
    const existing = this.residentVariants.get(variantKey);
    if (existing) {
      this.residentVariants.delete(variantKey);
      this.residentVariantBytes -= existing.estimatedBytes;
      this.disposeChunk(existing);
    }
    this.residentVariants.set(variantKey, chunk);
    this.residentVariantBytes += chunk.estimatedBytes;
    while (this.residentVariantBytes > TERRAIN_RESIDENT_VARIANT_BUDGET_BYTES && this.residentVariants.size) {
      const oldestKey = this.residentVariants.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.residentVariants.get(oldestKey)!;
      this.residentVariants.delete(oldestKey);
      this.residentVariantBytes -= oldest.estimatedBytes;
      this.disposeChunk(oldest);
      this.residentVariantEvictions += 1;
      this.options.record('terrainResidentVariantEvictions');
    }
  }

  private installResidentVariant(key: string, cached: CachedTerrainVariant, previous: TerrainChunkObject | undefined, revision: number): void {
    if (previous) this.retainResidentVariant(previous);
    for (const mesh of cached.meshes) {
      mesh.userData['terrainChunk'] = key;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material.userData['terrainRole'] !== 'reference') continue;
        material.opacity = this.referenceOpacity;
        material.needsUpdate = true;
      }
      this.options.blocksGroup.add(mesh);
    }
    this.chunks.set(key, cached);
    this.clearChunkOwnership(key);
    const emitted = new Set(cached.emittedKeys);
    const occluded = new Set(cached.fullyOccludedKeys);
    const keys = new Set([...cached.emittedKeys, ...cached.fullyOccludedKeys]);
    for (const item of keys) this.ownership.set(item, { key: item, chunkKey: key, revision, facesEmitted: emitted.has(item) ? 1 : 0, fullyOccluded: occluded.has(item) });
    this.ownershipKeysByChunk.set(key, keys);
    for (const item of cached.failedKeys) { this.ownership.delete(item); keys.delete(item); }
  }

  private clearResidentVariants(): void {
    for (const variant of this.residentVariants.values()) this.disposeChunk(variant);
    this.residentVariants.clear();
    this.residentVariantBytes = 0;
  }

  private settlePendingRepresentationCommits(chunkKey: string, representedKeys: readonly string[], failedKeys: readonly string[], failureStatus: 'failed' | 'cancelled'): void {
    const pending = this.pendingRepresentationCommitsByChunk.get(chunkKey);
    if (!pending) return;
    for (const key of representedKeys) {
      const callbacks = pending.get(key);
      if (!callbacks) continue;
      pending.delete(key);
      this.pendingRepresentationCommitChunks.delete(key);
      try { callbacks.onCommitted(); } catch { /* The pending operation is terminal even if its consumer fails. */ }
    }
    for (const key of failedKeys) {
      const callbacks = pending.get(key);
      if (!callbacks) continue;
      pending.delete(key);
      this.pendingRepresentationCommitChunks.delete(key);
      try { callbacks.onFailed(failureStatus); } catch { /* Keep settling sibling callbacks and the chunk state. */ }
    }
    if (!pending.size) this.pendingRepresentationCommitsByChunk.delete(chunkKey);
  }

  private cancelPendingRepresentationCommit(key: string): void {
    const chunkKey = this.pendingRepresentationCommitChunks.get(key);
    if (!chunkKey) return;
    const pending = this.pendingRepresentationCommitsByChunk.get(chunkKey);
    const callbacks = pending?.get(key);
    if (!callbacks) {
      this.pendingRepresentationCommitChunks.delete(key);
      return;
    }
    pending!.delete(key);
    this.pendingRepresentationCommitChunks.delete(key);
    if (!pending!.size) this.pendingRepresentationCommitsByChunk.delete(chunkKey);
    try { callbacks.onFailed('cancelled'); } catch { /* Cancellation is terminal for the caller. */ }
  }

  private cancelPendingRepresentationCommits(): void {
    for (const key of [...this.pendingRepresentationCommitChunks.keys()]) this.cancelPendingRepresentationCommit(key);
  }

  private recordCommitStage(stage: string, started: number, metrics: TerrainCommitMetrics): void {
    const duration = Math.max(0, performance.now() - started);
    this.commitDiagnostics.recordStage(stage, duration);
    this.options.onTiming?.(stage, duration);
  }

  private finishCommitDiagnostics(metrics: TerrainCommitMetrics, started: number, result: TerrainApplyResult): void {
    const candidates = result.hydrationCandidateKeys ?? result.changedKeys;
    const represented = new Set(result.representedKeys);
    metrics.hydrationCompletedKeys = candidates.filter((key) => represented.has(key)).length;
    this.terrainCommitCandidateChecks += candidates.length;
    this.terrainCommitRepresentedLookupChecks += candidates.length;
    metrics.hydrationPublishCount = metrics.hydrationCompletedKeys > 0 ? 1 : 0;
    this.commitDiagnostics.recordCommit({ ...metrics, totalMs: Math.max(0, performance.now() - started) });
    this.options.onTiming?.('terrain.commit.total', Math.max(0, performance.now() - started));
  }

  private retainHydrationCandidates(chunkKey: string, candidates: readonly string[]): readonly string[] {
    const pending = this.pendingHydrationCandidatesByChunk.get(chunkKey) ?? new Set<string>();
    for (const candidate of candidates) pending.add(candidate);
    if (pending.size) this.pendingHydrationCandidatesByChunk.set(chunkKey, pending);
    return [...pending];
  }

  private completePendingHydrationCandidates(chunkKey: string, candidates: readonly string[], represented: readonly string[]): void {
    const pending = this.pendingHydrationCandidatesByChunk.get(chunkKey);
    if (!pending) return;
    const representedKeys = new Set(represented);
    for (const candidate of candidates) if (representedKeys.has(candidate)) pending.delete(candidate);
    if (pending.size) this.pendingHydrationCandidatesByChunk.set(chunkKey, pending);
    else this.pendingHydrationCandidatesByChunk.delete(chunkKey);
  }

  private indexHydrationCandidates(keys: readonly string[]): ReadonlyMap<string, readonly string[]> {
    const byChunk = this.indexKeysByOwningChunk(keys);
    const ownership = [...byChunk.values()].reduce((total, candidates) => total + candidates.length, 0);
    this.terrainCandidateOwnershipTotal += ownership;
    this.terrainCandidateFanoutTotal += ownership;
    return byChunk;
  }

  private indexKeysByOwningChunk(keys: readonly string[]): Map<string, string[]> {
    const byChunk = new Map<string, string[]>();
    const unique = new Set(keys);
    for (const key of unique) {
      const record = this.records.get(key);
      if (!record) continue;
      const chunkKey = terrainChunkKeyForPosition(record.block.position);
      const local = byChunk.get(chunkKey) ?? [];
      local.push(key);
      byChunk.set(chunkKey, local);
    }
    return byChunk;
  }

  private disposeChunk(chunk: TerrainChunkObject): void {
    for (const mesh of chunk.meshes) {
      this.options.blocksGroup.remove(mesh);
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
  }

  private removeFromChunkIndex(record: TerrainSurfaceRecord): void {
    const key = terrainChunkKeyForPosition(record.block.position);
    const records = this.recordsByChunk.get(key);
    if (!records) return;
    records.delete(record.key);
    if (!records.size) this.recordsByChunk.delete(key);
  }

  private removeRecord(record: TerrainSurfaceRecord): void {
    const current = this.records.get(record.key);
    if (!current) return;
    this.records.delete(record.key);
    this.removeFromChunkIndex(current);
    for (const chunk of relevantTerrainChunks(current.block.position)) this.dirtyChunks.add(terrainChunkKey(chunk));
  }

  private indexRecord(record: TerrainSurfaceRecord): void {
    if (record.templates.length !== 6) return;
    const previous = this.records.get(record.key);
    if (previous) this.removeFromChunkIndex(previous);
    const compiledTemplates = record.compiledTemplates ?? this.compiledTemplateCache.get(record.templates) ?? precompileTerrainTemplates(record.templates, this.terrainAtlas);
    if (!this.compiledTemplateCache.has(record.templates)) this.compiledTemplateCache.set(record.templates, compiledTemplates);
    const indexed = { ...record, compiledTemplates };
    this.records.set(record.key, indexed);
    const chunkKey = terrainChunkKeyForPosition(indexed.block.position);
    const chunkRecords = this.recordsByChunk.get(chunkKey) ?? new Map<string, TerrainSurfaceRecord>();
    chunkRecords.set(indexed.key, indexed);
    this.recordsByChunk.set(chunkKey, chunkRecords);
  }
}

function terrainChunkKeyForPosition(position: VoxelCoordinate): string { return terrainChunkKey(worldToTerrainChunk(position)); }
function createTerrainChunkObject(
  key: string,
  chunk: TerrainChunkCoordinate,
  meshes: THREE.Mesh[],
  signature: string,
  emittedKeys: readonly string[],
  fullyOccludedKeys: readonly string[],
  failedKeys: readonly string[],
): TerrainChunkObject {
  const geometryBytes = meshes.reduce((total, mesh) => total + geometryByteLength(mesh.geometry), 0);
  const estimatedBytes = geometryBytes + signature.length * 2;
  return { key, chunk, meshes, signature, emittedKeys: [...emittedKeys], fullyOccludedKeys: [...fullyOccludedKeys], failedKeys: [...failedKeys], estimatedBytes };
}

function geometryByteLength(geometry: THREE.BufferGeometry): number {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  return bytes;
}

function emptyTerrainApplyResult(changedKeys: readonly string[] = []): TerrainApplyResult {
  return { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: [], failedKeys: [] };
}
function parseChunkKey(key: string): TerrainChunkCoordinate | undefined {
  const values = key.split(',').map(Number);
  return values.length === 3 && values.every(Number.isInteger) ? { x: values[0], y: values[1], z: values[2] } : undefined;
}
