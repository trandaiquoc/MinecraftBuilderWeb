import * as THREE from 'three';
import { terrainChunkKey, type TerrainChunkCoordinate } from './chunk-coordinate';
import {
  meshTerrainChunk,
  terrainPresentationBucketKey,
  type CompiledTerrainChunk,
} from './chunk-surface-mesher';
import {
  TerrainCommitDiagnostics,
  type TerrainCommitDiagnosticsEvidence,
  type TerrainCommitMetrics,
} from './terrain-commit-diagnostics';
import { TerrainChunkLogicalStore } from './terrain-chunk-logical-store';
import { TerrainChunkResidencyOwner } from './terrain-chunk-residency-owner';
import { TerrainHydrationSettlementOwner } from './terrain-hydration-settlement-owner';
import type { TerrainApplyResult, TerrainSurfaceRecord } from './terrain-render-contracts';
import type { TerrainMeshResult } from './terrain-mesh-protocol';
import { TerrainTemplateResourceOwner } from './terrain-template-resource-owner';
import { terrainChunkVariantSignature } from './terrain-chunk-variant-signature';

export interface TerrainChunkCommitContext {
  readonly key: string;
  readonly records: readonly TerrainSurfaceRecord[];
  readonly revision: number;
  readonly signature: string;
  readonly priority: number;
  readonly changedKeys: readonly string[];
  readonly hydrationCandidateKeys: readonly string[];
}

export interface TerrainChunkResultCommitOptions {
  readonly record: (name: string, delta?: number) => void;
  readonly onTiming?: (stage: string, durationMs: number) => void;
  readonly isTimingEnabled?: () => boolean;
  readonly shouldCommitChunk?: (chunkKey: string, compiled: CompiledTerrainChunk) => boolean;
  readonly onAsyncApply?: (
    records: readonly TerrainSurfaceRecord[],
    result: TerrainApplyResult,
  ) => void;
  readonly onComplete: () => void;
}

export interface TerrainChunkCommitEvidence {
  readonly candidateChecks: number;
  readonly representedLookupChecks: number;
  readonly diagnostics: TerrainCommitDiagnosticsEvidence;
}

/** Owns worker-result conversion, chunk installation, and terminal hydration publication. */
export class TerrainChunkResultCommitOwner {
  private readonly diagnostics = new TerrainCommitDiagnostics();
  private candidateChecks = 0;
  private representedLookupChecks = 0;

  constructor(
    private readonly logicalStore: Pick<
      TerrainChunkLogicalStore,
      'recordsInChunk' | 'occupancyLookup'
    >,
    private readonly residency: TerrainChunkResidencyOwner,
    private readonly templateResources: TerrainTemplateResourceOwner,
    private readonly settlement: TerrainHydrationSettlementOwner,
    private readonly options: TerrainChunkResultCommitOptions,
  ) {}

  evidence(): TerrainChunkCommitEvidence {
    return {
      candidateChecks: this.candidateChecks,
      representedLookupChecks: this.representedLookupChecks,
      diagnostics: this.diagnostics.evidence(),
    };
  }

  tryInstallResidentVariant(
    key: string,
    records: readonly TerrainSurfaceRecord[],
    signature: string,
    revision: number,
    changedKeys: readonly string[],
    hydrationCandidates: readonly string[],
  ): boolean {
    const cached = this.residency.takeResidentVariant(key, signature);
    if (!cached) return false;
    this.residency.installResidentVariant(key, cached, revision);
    this.options.record('terrainResidentVariantHits');
    const represented = unique([...cached.emittedKeys, ...cached.fullyOccludedKeys]);
    const failed = unique(cached.failedKeys);
    this.completeHydrationCandidates(key, hydrationCandidates, [...represented, ...failed]);
    this.settlement.settleRepresentationCommits(key, represented, failed, 'failed');
    this.settlement.reportFailures(failed);
    const result: TerrainApplyResult = {
      changedKeys: unique(changedKeys),
      rebuiltChunks: [],
      representedKeys: represented,
      failedKeys: failed,
      hydrationCandidateKeys: unique(hydrationCandidates),
      disposition: failed.length ? 'partial-unrepresented' : 'accepted',
    };
    this.options.onAsyncApply?.(records, result);
    this.options.onComplete();
    return true;
  }

  commitWorkerResult(context: TerrainChunkCommitContext, result: TerrainMeshResult): void {
    const commitStarted = performance.now();
    const metrics = createCommitMetrics(context, result);
    const buckets = this.materializeBuckets(context.records, result, metrics);
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
    const represented = [...compiled.emittedKeys, ...compiled.fullyOccludedKeys];
    const failed = [...compiled.unrepresentedExposedKeys];
    const shouldCommit = this.options.shouldCommitChunk?.(context.key, compiled) ?? true;
    if (!shouldCommit || (context.records.length > 0 && represented.length === 0)) {
      this.disposeUninstalledBuckets(buckets, context.records);
      const failedKeys =
        !shouldCommit || (context.records.length > 0 && represented.length === 0)
          ? context.records.map((record) => record.key)
          : failed;
      this.settlement.reportFailures(failedKeys);
      this.options.record(
        !shouldCommit ? 'terrainAsyncCommitPolicyRejected' : 'terrainAsyncAllUnrepresentedResults',
      );
      this.settlement.clearHydrationCandidates(context.key);
      const apply: TerrainApplyResult = {
        changedKeys: unique(context.changedKeys),
        rebuiltChunks: [],
        representedKeys: [],
        failedKeys: unique(failedKeys),
        hydrationCandidateKeys: unique(context.hydrationCandidateKeys),
        commitMetrics: metrics,
        disposition: !shouldCommit ? 'commit-policy-rejected' : 'all-unrepresented',
      };
      this.settlement.settleRepresentationCommits(context.key, [], failedKeys, 'failed');
      this.publishAsyncResult(context.records, apply, metrics, commitStarted);
      return;
    }

    const sceneSwapStarted = performance.now();
    const ownership = this.residency.installCompiled(
      context.key,
      compiled,
      context.revision,
      context.signature,
    );
    this.recordStage('terrain.commit.sceneSwap', sceneSwapStarted);
    metrics.ownershipRemoved = ownership.removed;
    metrics.ownershipInserted = ownership.inserted;
    this.diagnostics.recordStage('terrain.commit.ownership', ownership.ownershipDurationMs);
    this.options.onTiming?.('terrain.commit.ownership', ownership.ownershipDurationMs);
    this.disposeTemporaryMaterials(buckets, context.records);

    if (failed.length) this.options.record('terrainAsyncPartialFailureResults');
    else this.options.record('terrainAsyncAcceptedResults');
    metrics.representedKeys = represented.length;
    this.completeHydrationCandidates(context.key, context.hydrationCandidateKeys, [
      ...represented,
      ...failed,
    ]);
    const apply: TerrainApplyResult = {
      changedKeys: unique(context.changedKeys),
      rebuiltChunks: [context.key],
      representedKeys: represented,
      failedKeys: failed,
      hydrationCandidateKeys: unique(context.hydrationCandidateKeys),
      commitMetrics: metrics,
      disposition: failed.length ? 'partial-unrepresented' : 'accepted',
    };
    this.settlement.settleRepresentationCommits(context.key, represented, failed, 'failed');
    this.settlement.reportFailures(failed);
    this.publishAsyncResult(context.records, apply, metrics, commitStarted);
  }

  removeChunk(key: string, changedKeys: readonly string[]): void {
    this.residency.retainCurrent(key);
    this.residency.clearOwnership(key);
    this.settlement.clearHydrationCandidates(key);
    this.options.onAsyncApply?.([], {
      changedKeys: unique(changedKeys),
      rebuiltChunks: [key],
      representedKeys: [],
      failedKeys: [],
      hydrationCandidateKeys: [],
      disposition: 'chunk-removed',
    });
    this.options.onComplete();
  }

  failWorkerChunk(
    key: string,
    records: readonly TerrainSurfaceRecord[],
    changedKeys: readonly string[],
  ): void {
    const failedKeys = records.map((record) => record.key);
    this.settlement.clearHydrationCandidates(key);
    this.settlement.reportFailures(failedKeys);
    this.options.record('terrainAsyncWorkerFailures');
    this.settlement.settleRepresentationCommits(key, [], failedKeys, 'failed');
    this.options.onAsyncApply?.(records, {
      changedKeys: unique(changedKeys),
      rebuiltChunks: [],
      representedKeys: [],
      failedKeys,
      disposition: 'worker-failure',
    });
    this.options.onComplete();
  }

  rebuildSynchronously(
    key: string,
    hydrationCandidateKeys: readonly string[],
    revision: number,
    providerGeneration: number,
  ):
    | {
        readonly representedKeys: readonly string[];
        readonly failedKeys: readonly string[];
        readonly rebuilt: boolean;
      }
    | undefined {
    const timing = !!this.options.onTiming && (this.options.isTimingEnabled?.() ?? true);
    const started = timing ? performance.now() : 0;
    const finish = (
      result:
        | {
            readonly representedKeys: readonly string[];
            readonly failedKeys: readonly string[];
            readonly rebuilt: boolean;
          }
        | undefined,
    ) => {
      if (timing) this.options.onTiming?.('terrain.rebuildChunk', performance.now() - started);
      return result;
    };
    const chunk = parseChunkKey(key);
    if (!chunk) return finish(undefined);
    const entries = this.logicalStore.recordsInChunk(key);
    if (!entries.length) {
      this.residency.retainCurrent(key);
      this.residency.clearOwnership(key);
      return finish({ representedKeys: [], failedKeys: [], rebuilt: false });
    }
    const signature = terrainChunkVariantSignature(
      key,
      chunk,
      entries,
      providerGeneration,
      this.templateResources,
      this.logicalStore.occupancyLookup,
    );
    const cached = this.residency.takeResidentVariant(key, signature);
    if (cached) {
      this.residency.installResidentVariant(key, cached, revision);
      this.options.record('terrainResidentVariantHits');
      const representedKeys = [...cached.emittedKeys, ...cached.fullyOccludedKeys];
      this.completeHydrationCandidates(key, hydrationCandidateKeys, [
        ...representedKeys,
        ...cached.failedKeys,
      ]);
      return finish({ representedKeys, failedKeys: [...cached.failedKeys], rebuilt: false });
    }
    const result = meshTerrainChunk(
      chunk,
      entries.map((entry) => ({
        key: entry.key,
        position: entry.block.position,
        templates: entry.templates,
        compiledTemplates: this.templateResources.compiledTemplates(entry),
        role: entry.role,
      })),
      this.logicalStore.occupancyLookup,
      this.templateResources.atlas,
    );
    const represented = [...result.emittedKeys, ...result.fullyOccludedKeys];
    const failed = [...result.unrepresentedExposedKeys];
    if (!represented.length && entries.length)
      return finish({
        representedKeys: [],
        failedKeys: entries.map((entry) => entry.key),
        rebuilt: false,
      });
    if (!(this.options.shouldCommitChunk?.(key, result) ?? true)) {
      this.options.record('terrainSyncCommitPolicyRejected');
      return finish({
        representedKeys: [],
        failedKeys: entries.map((entry) => entry.key),
        rebuilt: false,
      });
    }
    const installed = this.residency.installCompiled(key, result, revision, signature);
    this.diagnostics.recordStage('terrain.commit.ownership', installed.ownershipDurationMs);
    this.options.onTiming?.('terrain.commit.ownership', installed.ownershipDurationMs);
    this.options.record('terrainSyncChunkRebuilds');
    for (const failedKey of failed) this.options.record('terrainUnrepresentedBlocks');
    this.completeHydrationCandidates(key, hydrationCandidateKeys, [...represented, ...failed]);
    return finish({ representedKeys: represented, failedKeys: failed, rebuilt: true });
  }

  clear(): void {
    this.candidateChecks = 0;
    this.representedLookupChecks = 0;
  }

  private materializeBuckets(
    records: readonly TerrainSurfaceRecord[],
    result: TerrainMeshResult,
    metrics: TerrainCommitMetrics,
  ): CompiledTerrainChunk['buckets'] {
    const lookupStarted = performance.now();
    const materials = new Map<string, THREE.Material>();
    for (const record of records)
      for (const face of this.templateResources.compiledTemplates(record)) {
        const bucketKey = terrainPresentationBucketKey(face.bucketKey, record.role ?? 'normal');
        if (!materials.has(bucketKey)) materials.set(bucketKey, face.material);
      }
    this.recordStage('terrain.commit.materialLookup', lookupStarted);
    const geometryStarted = performance.now();
    const buckets = result.buckets.map((bucket) => ({
      key: bucket.key,
      material: materials.get(bucket.key) ?? new THREE.MeshBasicMaterial({ color: 0xffffff }),
      geometry: geometryFromResult(bucket),
      faceCount: bucket.faceCount,
    }));
    this.recordStage('terrain.commit.geometryWrap', geometryStarted);
    return buckets;
  }

  private disposeUninstalledBuckets(
    buckets: CompiledTerrainChunk['buckets'],
    records: readonly TerrainSurfaceRecord[],
  ): void {
    const ownedMaterials = this.temporaryMaterials(buckets, records);
    for (const bucket of buckets) bucket.geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
  }

  private disposeTemporaryMaterials(
    buckets: CompiledTerrainChunk['buckets'],
    records: readonly TerrainSurfaceRecord[],
  ): void {
    for (const material of this.temporaryMaterials(buckets, records)) material.dispose();
  }

  private temporaryMaterials(
    buckets: CompiledTerrainChunk['buckets'],
    records: readonly TerrainSurfaceRecord[],
  ): Set<THREE.Material> {
    const borrowed = new Set<THREE.Material>();
    for (const record of records)
      for (const face of this.templateResources.compiledTemplates(record))
        borrowed.add(face.material);
    return new Set(
      buckets.map((bucket) => bucket.material).filter((material) => !borrowed.has(material)),
    );
  }

  private publishAsyncResult(
    records: readonly TerrainSurfaceRecord[],
    result: TerrainApplyResult,
    metrics: TerrainCommitMetrics,
    commitStarted: number,
  ): void {
    const applyStarted = performance.now();
    this.options.onAsyncApply?.(records, result);
    this.recordStage('terrain.commit.asyncApply', applyStarted);
    const totalMs = Math.max(0, performance.now() - commitStarted);
    const candidates = result.hydrationCandidateKeys ?? result.changedKeys;
    const represented = new Set(result.representedKeys);
    metrics.hydrationCompletedKeys = candidates.filter((key) => represented.has(key)).length;
    metrics.hydrationPublishCount = metrics.hydrationCompletedKeys > 0 ? 1 : 0;
    this.diagnostics.recordCommit({ ...metrics, totalMs });
    this.options.onTiming?.('terrain.commit.total', totalMs);
    this.candidateChecks += candidates.length;
    this.representedLookupChecks += candidates.length;
    const failed = new Set(result.failedKeys);
    for (const key of candidates) {
      if (represented.has(key)) this.options.record('terrainCommitCandidatesRepresented');
      else if (failed.has(key)) this.options.record('terrainCommitCandidatesFailed');
      else this.options.record('terrainCommitCandidatesUnchanged');
    }
    this.options.onComplete();
  }

  private recordStage(stage: string, started: number): void {
    const duration = Math.max(0, performance.now() - started);
    this.diagnostics.recordStage(stage, duration);
    this.options.onTiming?.(stage, duration);
  }

  private completeHydrationCandidates(
    chunkKey: string,
    candidates: readonly string[],
    represented: readonly string[],
  ): void {
    const pendingBefore = this.settlement.pendingCandidateCount;
    this.settlement.completeHydrationCandidates(chunkKey, candidates, represented);
    const completed = pendingBefore - this.settlement.pendingCandidateCount;
    if (completed) this.options.record('terrainHydrationCandidateKeysCompleted', completed);
    if (candidates.length) this.options.record('terrainHydrationCandidateChunksCompleted');
  }
}

function createCommitMetrics(
  context: TerrainChunkCommitContext,
  result: TerrainMeshResult,
): TerrainCommitMetrics {
  return {
    chunkKey: context.key,
    priority: context.priority,
    recordsInChunk: context.records.length,
    representedKeys: 0,
    emittedKeys: result.emittedKeys.length,
    fullyOccludedKeys: result.fullyOccludedKeys.length,
    failedKeys: result.unrepresentedExposedKeys.length,
    meshBucketCount: result.buckets.length,
    geometryVertices: 0,
    geometryIndices: 0,
    ownershipRemoved: 0,
    ownershipInserted: 0,
    hydrationCandidateKeys: context.hydrationCandidateKeys.length,
    hydrationCompletedKeys: 0,
    hydrationPublishCount: 0,
  };
}

function geometryFromResult(bucket: TerrainMeshResult['buckets'][number]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(bucket.indices, 1));
  return geometry;
}

function parseChunkKey(key: string): TerrainChunkCoordinate | undefined {
  const values = key.split(',').map(Number);
  return values.length === 3 && values.every(Number.isInteger)
    ? { x: values[0], y: values[1], z: values[2] }
    : undefined;
}

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}
