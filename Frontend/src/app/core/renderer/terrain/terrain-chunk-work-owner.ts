import { terrainChunkKey, type TerrainChunkCoordinate } from './chunk-coordinate';
import { terrainPresentationBucketKey } from './chunk-surface-mesher';
import { TerrainCommitScheduler, type TerrainCommitSchedulerEvidence } from './terrain-commit-scheduler';
import { TerrainChunkLogicalStore } from './terrain-chunk-logical-store';
import { TerrainHydrationSettlementOwner } from './terrain-hydration-settlement-owner';
import type { TerrainApplyResult, TerrainSurfaceRecord } from './terrain-render-contracts';
import { TerrainMeshWorkerPool, type TerrainMeshWorkerPoolEvidence, type TerrainWorkerLike } from './terrain-mesh-worker-pool';
import type { TerrainMeshFace, TerrainMeshJob, TerrainMeshResult, TerrainMeshTemplateData } from './terrain-mesh-protocol';
import { TerrainChunkResultCommitOwner } from './terrain-chunk-result-commit-owner';
import { TerrainTemplateResourceOwner } from './terrain-template-resource-owner';
import { terrainChunkVariantSignature } from './terrain-chunk-variant-signature';

interface TerrainChunkWorkState {
  readonly revision: number;
  readonly jobId: number;
  readonly signature: string;
  replacementRequested: boolean;
  completed: boolean;
}

export interface TerrainChunkWorkEvidence {
  readonly maxHydrationCandidatesPerChunk: number;
  readonly maxRecordsPerChunk: number;
  readonly candidateChecks: number;
  readonly representedLookupChecks: number;
  readonly worker: TerrainMeshWorkerPoolEvidence;
  readonly commit: TerrainCommitSchedulerEvidence;
  readonly diagnostics: ReturnType<TerrainChunkResultCommitOwner['evidence']>['diagnostics'];
}

export interface TerrainChunkWorkOwnerOptions {
  readonly record: (name: string, delta?: number) => void;
  readonly onTiming?: (stage: string, durationMs: number) => void;
  readonly workerCount?: number;
  readonly workerFactory?: () => TerrainWorkerLike;
  readonly terrainGeneration?: () => number;
  readonly providerGeneration?: () => number;
  readonly isCameraInteracting?: () => boolean;
  readonly scheduleDirtyWork: () => void;
  readonly onComplete: () => void;
}

/** Owns terrain job revisions, worker/commit scheduling, result validation and chunk work settlement. */
export class TerrainChunkWorkOwner {
  private disposed = false;
  private readonly chunkRevisions = new Map<string, number>();
  private readonly chunkWork = new Map<string, TerrainChunkWorkState>();
  private readonly workerPool: TerrainMeshWorkerPool;
  private readonly commitScheduler: TerrainCommitScheduler;
  private readonly resultCommitter: TerrainChunkResultCommitOwner;
  private workerJobSequence = 0;
  private maxHydrationCandidates = 0;
  private maxRecords = 0;

  constructor(
    private readonly logicalStore: TerrainChunkLogicalStore,
    private readonly templateResources: TerrainTemplateResourceOwner,
    private readonly settlement: TerrainHydrationSettlementOwner,
    resultCommitter: TerrainChunkResultCommitOwner,
    private readonly options: TerrainChunkWorkOwnerOptions,
  ) {
    this.resultCommitter = resultCommitter;
    this.workerPool = new TerrainMeshWorkerPool({ workerCount: options.workerCount, workerFactory: options.workerFactory });
    this.commitScheduler = new TerrainCommitScheduler(2, 5, () => options.isCameraInteracting?.() ?? false);
  }

  get supported(): boolean { return this.workerPool.supported; }
  get workerEvidence(): TerrainMeshWorkerPoolEvidence { return this.workerPool.evidence(); }
  get commitEvidence(): TerrainCommitSchedulerEvidence { return this.commitScheduler.evidence(); }
  get hasPendingWork(): boolean { return [...this.chunkWork.values()].some((work) => !work.completed); }
  get hasQueuedWork(): boolean { return this.workerEvidence.terrainWorkerQueued > 0 || this.workerEvidence.terrainWorkerRunning > 0 || this.commitEvidence.terrainCommitQueueDepth > 0; }

  workFor(chunkKey: string): Readonly<TerrainChunkWorkState> | undefined { return this.chunkWork.get(chunkKey); }

  flush(
    dirtyChunks: readonly string[],
    changedKeys: readonly string[],
    hydrationCandidateKeys: readonly string[],
    priority: number,
    changedKeysByChunk: ReadonlyMap<string, readonly string[]>,
    hydrationCandidatesByChunk: ReadonlyMap<string, readonly string[]>,
  ): TerrainApplyResult {
    if (this.supported) {
      for (const key of dirtyChunks) this.queueWorkerChunk(key, changedKeysByChunk.get(key) ?? [], priority, hydrationCandidatesByChunk.get(key) ?? []);
      this.options.onComplete();
      return { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: [], failedKeys: [], hydrationCandidateKeys: [...new Set(hydrationCandidateKeys)], pending: dirtyChunks.length > 0 };
    }
    const rebuiltChunks: string[] = [];
    const representedKeys = new Set<string>();
    const failedKeys = new Set<string>();
    for (const key of dirtyChunks) {
      const revision = (this.chunkRevisions.get(key) ?? 0) + 1;
      this.chunkRevisions.set(key, revision);
      const result = this.resultCommitter.rebuildSynchronously(key, hydrationCandidatesByChunk.get(key) ?? [], revision, this.options.providerGeneration?.() ?? 0);
      const records = this.logicalStore.recordsInChunk(key);
      this.maxRecords = Math.max(this.maxRecords, records.length);
      this.maxHydrationCandidates = Math.max(this.maxHydrationCandidates, hydrationCandidatesByChunk.get(key)?.length ?? 0);
      if (!result) continue;
      rebuiltChunks.push(key);
      for (const item of result.representedKeys) representedKeys.add(item);
      for (const item of result.failedKeys) failedKeys.add(item);
    }
    const result = { changedKeys: [...new Set(changedKeys)], rebuiltChunks, representedKeys: [...representedKeys], failedKeys: [...failedKeys], hydrationCandidateKeys: [...new Set(hydrationCandidateKeys)] };
    this.settlement.reportFailures([...failedKeys]);
    this.options.onComplete();
    return result;
  }

  clearWork(): void {
    this.chunkRevisions.clear();
    this.chunkWork.clear();
  }

  clear(): void {
    this.clearWork();
    this.maxHydrationCandidates = 0;
    this.maxRecords = 0;
    this.resultCommitter.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.commitScheduler.dispose();
    this.workerPool.dispose();
  }

  evidence(): TerrainChunkWorkEvidence {
    return {
      maxHydrationCandidatesPerChunk: this.maxHydrationCandidates,
      maxRecordsPerChunk: this.maxRecords,
      candidateChecks: this.resultCommitter.evidence().candidateChecks,
      representedLookupChecks: this.resultCommitter.evidence().representedLookupChecks,
      worker: this.workerPool.evidence(),
      commit: this.commitScheduler.evidence(),
      diagnostics: this.resultCommitter.evidence().diagnostics,
    };
  }

  private queueWorkerChunk(key: string, changedKeys: readonly string[], priority = 0, hydrationCandidateKeys: readonly string[] = changedKeys): void {
    if (this.disposed) return;
    const chunk = parseChunkKey(key);
    if (!chunk) return;
    const entries = this.logicalStore.recordsInChunk(key);
    const signature = terrainChunkVariantSignature(key, chunk, entries, this.options.providerGeneration?.() ?? 0, this.templateResources, this.logicalStore.occupancyLookup);
    if (!entries.length) this.settlement.clearHydrationCandidates(key);
    const attemptHydrationCandidates = entries.length ? this.settlement.retainHydrationCandidates(key, hydrationCandidateKeys) : [];
    this.maxRecords = Math.max(this.maxRecords, entries.length);
    this.maxHydrationCandidates = Math.max(this.maxHydrationCandidates, attemptHydrationCandidates.length);
    const previousRevision = this.chunkRevisions.get(key) ?? 0;
    const revision = previousRevision + 1;
    this.chunkRevisions.set(key, revision);
    const currentGeneration = this.options.terrainGeneration?.() ?? 0;
    const currentProviderGeneration = this.options.providerGeneration?.() ?? 0;
    if (!entries.length) {
      this.chunkWork.delete(key);
      this.resultCommitter.removeChunk(key, changedKeys);
      return;
    }
    this.chunkWork.set(key, { revision, jobId: 0, signature, replacementRequested: false, completed: true });
    if (this.resultCommitter.tryInstallResidentVariant(key, signature, revision, attemptHydrationCandidates)) return;
    const templateIndexes = new WeakMap<readonly import('./chunk-surface-mesher').PrecompiledTerrainFace[], number>();
    const templates: TerrainMeshTemplateData[] = [];
    const jobEntries = entries.map((entry) => {
      const compiled = this.templateResources.compiledTemplates(entry);
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
      occupancy: this.logicalStore.occupancyHalo(chunk),
      priority,
    };
    this.chunkWork.set(key, { revision, jobId: job.jobId, signature, replacementRequested: false, completed: false });
    void this.workerPool.submit(job).then((result) => {
      if (this.disposed) return;
      this.options.onTiming?.('terrain.worker', result.cpuMs);
      this.commitScheduler.enqueue(() => {
        const started = performance.now();
        this.commitWorkerResult(key, entries, result, priority, changedKeys, attemptHydrationCandidates);
        this.options.onTiming?.('terrain.commit', performance.now() - started);
      }, 1);
    }).catch(() => { if (!this.disposed) this.commitWorkerFailure(key, entries, changedKeys, job); });
  }

  private commitWorkerResult(key: string, records: readonly TerrainSurfaceRecord[], result: TerrainMeshResult, priority: number, changedKeys: readonly string[], hydrationCandidateKeys: readonly string[]): void {
    if (this.disposed) return;
    const currentRevision = this.chunkRevisions.get(key);
    const generation = this.options.terrainGeneration?.() ?? 0;
    const providerGeneration = this.options.providerGeneration?.() ?? 0;
    const work = this.chunkWork.get(key);
    const staleRevision = currentRevision !== result.revision;
    const staleGeneration = generation !== result.generation;
    const staleProvider = providerGeneration !== result.providerGeneration;
    const replacementPending = this.logicalStore.isDirty(key) && work?.jobId === result.jobId;
    const superseded = work?.jobId !== result.jobId || replacementPending;
    if (!staleRevision && !staleGeneration && !staleProvider && !superseded && work?.completed) return;
    if (staleRevision || staleGeneration || staleProvider || superseded) {
      this.workerPool.markStaleResult();
      if (staleRevision) this.options.record('terrainAsyncStaleRevisionResults');
      if (staleGeneration) this.options.record('terrainAsyncStaleGenerationResults');
      if (staleProvider) this.options.record('terrainAsyncStaleProviderResults');
      if (superseded) this.options.record('terrainAsyncSupersededResults');
      const currentRecords = this.logicalStore.recordsInChunk(key);
      const ownsResult = work?.jobId === result.jobId && work.revision === result.revision;
      if (currentRecords.length && !replacementPending && ownsResult && !work.replacementRequested) {
        work.replacementRequested = true;
        this.logicalStore.markDirty(key);
        this.options.record('terrainAsyncRescheduledChunks');
        this.options.scheduleDirtyWork();
      } else if (ownsResult && (!currentRecords.length || !this.logicalStore.isDirty(key))) {
        work.completed = true;
        this.chunkWork.delete(key);
        this.settlement.clearHydrationCandidates(key);
        this.settlement.settleRepresentationCommits(key, [], records.map((record) => record.key), 'cancelled');
      } else if (currentRecords.length && (staleGeneration || staleProvider) && !work) {
        this.options.record('terrainAsyncRejectedWithoutReplacement');
      }
      this.options.onComplete();
      return;
    }
    if (work) work.completed = true;
    this.resultCommitter.commitWorkerResult({
      key,
      records,
      revision: result.revision,
      signature: work!.signature,
      priority,
      changedKeys,
      hydrationCandidateKeys,
    }, result);
  }

  private commitWorkerFailure(key: string, records: readonly TerrainSurfaceRecord[], changedKeys: readonly string[], job: TerrainMeshJob): void {
    if (this.chunkWork.get(key)?.jobId !== job.jobId || this.chunkRevisions.get(key) !== job.revision) {
      this.options.record('terrainAsyncSupersededResults');
      return;
    }
    const work = this.chunkWork.get(key);
    if (work) work.completed = true;
    this.resultCommitter.failWorkerChunk(key, records, changedKeys);
  }
}

function parseChunkKey(key: string): TerrainChunkCoordinate | undefined {
  const values = key.split(',').map(Number);
  return values.length === 3 && values.every(Number.isInteger) ? { x: values[0], y: values[1], z: values[2] } : undefined;
}
