import * as THREE from 'three';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { TerrainOccupancy } from './chunk-occupancy';
import { relevantTerrainChunks, terrainChunkBounds, terrainChunkKey, worldToTerrainChunk, type TerrainChunkCoordinate } from './chunk-coordinate';
import { dirtyTerrainChunkKeys } from './chunk-dirty-tracker';
import { meshTerrainChunk, precompileTerrainTemplates, type CompiledTerrainChunk, type PrecompiledTerrainFace } from './chunk-surface-mesher';
import type { TerrainClassificationEntry } from './terrain-classifier';
import { TerrainTextureAtlas, type TerrainAtlasEvidence } from './atlas/terrain-texture-atlas';
import type { TerrainAtlasMode } from './atlas/terrain-texture-atlas';

export interface TerrainSurfaceRecord {
  readonly key: string;
  readonly block: PlacedBlock;
  readonly templates: readonly SurfaceFaceTemplate[];
  readonly compiledTemplates?: readonly PrecompiledTerrainFace[];
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
}

export interface TerrainRendererEvidence {
  readonly terrainChunks: number;
  readonly terrainChunkMeshes: number;
  readonly terrainChunkRebuilds: number;
  readonly terrainBlocksCompiled: number;
  readonly terrainFacesEmitted: number;
  readonly terrainFacesCulled: number;
  readonly terrainTemplateResolutions: number;
  readonly terrainTemplateCacheHits: number;
  readonly terrainLogicalBlocks: number;
  readonly terrainBulkBatches: number;
  readonly terrainAtlas: TerrainAtlasEvidence;
}

export interface ChunkSurfaceRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly record: (name: string, delta?: number) => void;
  readonly terrainAtlasMode?: TerrainAtlasMode;
  /** Test seam for proving that logical records are not committed early. */
  readonly shouldCommitChunk?: (chunkKey: string, compiled: CompiledTerrainChunk) => boolean;
}

interface TerrainChunkObject {
  readonly key: string;
  readonly chunk: TerrainChunkCoordinate;
  readonly meshes: THREE.Mesh[];
}

/** Owns compiled opaque terrain meshes while leaving project/editor data elsewhere. */
export class ChunkSurfaceRenderer {
  readonly templateCache = new Map<string, readonly SurfaceFaceTemplate[]>();
  private readonly compiledTemplateCache = new WeakMap<readonly SurfaceFaceTemplate[], readonly PrecompiledTerrainFace[]>();
  private readonly records = new Map<string, TerrainSurfaceRecord>();
  private readonly recordsByChunk = new Map<string, Map<string, TerrainSurfaceRecord>>();
  private readonly chunks = new Map<string, TerrainChunkObject>();
  private readonly occupancy = new TerrainOccupancy();
  private readonly dirtyChunks = new Set<string>();
  private readonly ownership = new Map<string, TerrainOwnershipEvidence>();
  private readonly chunkRevisions = new Map<string, number>();
  private flushTimer?: ReturnType<typeof setTimeout>;
  private rebuildCount = 0;
  private blocksCompiled = 0;
  private facesEmitted = 0;
  private facesCulled = 0;
  private templateResolutions = 0;
  private templateCacheHits = 0;
  private bulkBatches = 0;
  readonly terrainAtlas?: TerrainTextureAtlas;

  constructor(private readonly options: ChunkSurfaceRendererOptions) { this.terrainAtlas = options.terrainAtlasMode === 'on' ? new TerrainTextureAtlas() : undefined; }

  get chunkCount(): number { return this.chunks.size; }
  get chunkMeshCount(): number { return [...this.chunks.values()].reduce((count, chunk) => count + chunk.meshes.length, 0); }
  get logicalBlockCount(): number { return this.records.size; }
  has(key: string): boolean { return this.records.has(key); }
  ownershipFor(key: string): TerrainOwnershipEvidence | undefined { return this.ownership.get(key); }
  isRepresented(key: string): boolean { return this.ownership.has(key); }

  syncOccupancy(entries: readonly TerrainClassificationEntry[], affectedPositions: readonly VoxelCoordinate[], initial = false): void {
    this.occupancy.replace(entries);
    this.options.record('occupancyFullRebuilds');
    if (initial) for (const key of this.chunks.keys()) this.dirtyChunks.add(key);
    for (const position of affectedPositions) for (const chunk of relevantTerrainChunks(position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    this.scheduleFlush();
  }

  cacheTemplates(key: string, templates: readonly SurfaceFaceTemplate[]): void {
    if (this.templateCache.has(key)) return;
    this.templateCache.set(key, templates);
    this.compiledTemplateCache.set(templates, precompileTerrainTemplates(templates, this.terrainAtlas));
    this.templateResolutions += 1;
    this.options.record('terrainTemplateResolutions');
  }

  /** Registers one generation/batch and compiles its dirty chunks exactly once. */
  bulkUpsert(records: readonly TerrainSurfaceRecord[], occupancyEntries?: readonly TerrainClassificationEntry[], affectedPositions: readonly VoxelCoordinate[] = [], options: { readonly initial?: boolean; readonly flush?: boolean } = {}): TerrainApplyResult {
    this.bulkBatches += 1;
    this.options.record('terrainBulkBatches');
    if (options.initial) {
      for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
      this.chunks.clear();
      this.records.clear();
      this.recordsByChunk.clear();
      this.ownership.clear();
      this.chunkRevisions.clear();
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
  applyBlockChanges(changes: readonly TerrainBlockChange[], flush = true): TerrainApplyResult {
    if (!changes.length) return emptyTerrainApplyResult();
    for (const change of changes) {
      if (change.before && (!change.after || change.before.key !== change.after.key)) this.removeRecord(change.before);
      if (change.after) this.indexRecord(change.after);
    }
    this.occupancy.applyDelta(changes.map((change) => ({ position: change.position, opaque: change.afterOpaque })));
    this.options.record('occupancyDeltaUpdates', changes.length);
    const dirty = dirtyTerrainChunkKeys(changes.map((change) => change.position));
    this.options.record('incrementalChunkInvalidations', dirty.size);
    for (const key of dirty) this.dirtyChunks.add(key);
    if (flush) return this.flushNow(changes.map((change) => change.key));
    this.scheduleFlush();
    return emptyTerrainApplyResult(changes.map((change) => change.key));
  }

  templatesFor(key: string): readonly SurfaceFaceTemplate[] | undefined {
    const templates = this.templateCache.get(key);
    if (templates) { this.templateCacheHits += 1; this.options.record('terrainTemplateCacheHits'); }
    return templates;
  }

  upsert(record: TerrainSurfaceRecord, flush = false): boolean {
    if (record.templates.length !== 6) return false;
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

  upsertAndCommit(record: TerrainSurfaceRecord): boolean { return this.upsert(record, true); }

  remove(key: string): void {
    const previous = this.records.get(key);
    if (!previous) return;
    this.removeRecord(previous);
    for (const chunk of relevantTerrainChunks(previous.block.position)) this.dirtyChunks.add(terrainChunkKey(chunk));
    this.scheduleFlush();
  }

  flushNow(changedKeys: readonly string[] = []): TerrainApplyResult {
    if (this.flushTimer !== undefined) { clearTimeout(this.flushTimer); this.flushTimer = undefined; }
    const dirty = [...this.dirtyChunks];
    this.dirtyChunks.clear();
    const rebuiltChunks: string[] = [];
    const representedKeys = new Set<string>();
    const failedKeys = new Set<string>();
    for (const key of dirty) {
      const result = this.rebuildChunk(key);
      if (!result) continue;
      rebuiltChunks.push(key);
      for (const item of result.representedKeys) representedKeys.add(item);
      for (const item of result.failedKeys) failedKeys.add(item);
    }
    return { changedKeys: [...new Set(changedKeys)], rebuiltChunks, representedKeys: [...representedKeys], failedKeys: [...failedKeys] };
  }

  applyMaterial(callback: (material: THREE.Material) => void): void {
    for (const chunk of this.chunks.values()) for (const mesh of chunk.meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) callback(material);
    }
  }

  evidence(): TerrainRendererEvidence {
    return {
      terrainChunks: this.chunks.size,
      terrainChunkMeshes: this.chunkMeshCount,
      terrainChunkRebuilds: this.rebuildCount,
      terrainBlocksCompiled: this.blocksCompiled,
      terrainFacesEmitted: this.facesEmitted,
      terrainFacesCulled: this.facesCulled,
      terrainTemplateResolutions: this.templateResolutions,
      terrainTemplateCacheHits: this.templateCacheHits,
      terrainLogicalBlocks: this.records.size,
      terrainBulkBatches: this.bulkBatches,
      terrainAtlas: { ...(this.terrainAtlas?.evidence() ?? { terrainAtlasPages: 0, terrainAtlasSprites: 0, terrainAtlasCacheHits: 0, terrainAtlasInsertions: 0, terrainAtlasMaterials: 0, terrainAtlasCompatibleFaces: 0, terrainAtlasFallbackFaces: 0 }), terrainAtlasChunkBuckets: this.chunkMeshCount },
    };
  }

  clear(): void {
    if (this.flushTimer !== undefined) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.records.clear();
    this.recordsByChunk.clear();
    this.ownership.clear();
    this.chunkRevisions.clear();
    this.dirtyChunks.clear();
    for (const templates of this.templateCache.values()) for (const template of templates) { template.geometry.dispose(); template.material.dispose(); }
    this.templateCache.clear();
    this.bulkBatches = 0;
    this.terrainAtlas?.clear();
  }

  dispose(): void { this.clear(); }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = undefined; this.flushNow(); }, 0);
  }

  private rebuildChunk(key: string): { readonly representedKeys: readonly string[]; readonly failedKeys: readonly string[] } | undefined {
    const chunk = parseChunkKey(key);
    if (!chunk) return undefined;
    const entries = [...(this.recordsByChunk.get(key)?.values() ?? [])];
    const previous = this.chunks.get(key);
    const previousRevision = this.chunkRevisions.get(key) ?? 0;
    const revision = previousRevision + 1;
    this.chunkRevisions.set(key, revision);
    if (!entries.length) {
      if (previous) { this.disposeChunk(previous); this.chunks.delete(key); }
      this.clearChunkOwnership(key);
      return { representedKeys: [], failedKeys: [] };
    }
    const compiled = meshTerrainChunk(chunk, entries.map((entry) => ({ ...entry, position: entry.block.position, compiledTemplates: entry.compiledTemplates ?? this.compiledTemplateCache.get(entry.templates) })), this.occupancy, this.terrainAtlas);
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
    if (!shouldCommit || failed.length > 0 && represented.length === 0) {
      for (const bucket of compiled.buckets) { bucket.geometry.dispose(); if (!bucket.material.userData['sharedTerrainAtlasMaterial']) bucket.material.dispose(); }
      if (previous) { this.disposeChunk(previous); this.chunks.delete(key); }
      this.clearChunkOwnership(key);
      return { representedKeys: [], failedKeys: [...new Set([...failed, ...represented])] };
    }
    const meshes: THREE.Mesh[] = [];
    const bounds = terrainChunkBounds(chunk);
    for (const bucket of compiled.buckets) {
      const geometry = bucket.geometry;
      geometry.boundingBox = new THREE.Box3(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z), new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z));
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, bucket.material.clone());
      mesh.frustumCulled = true;
      mesh.userData['terrainChunk'] = key;
      mesh.userData['terrainBucket'] = bucket.key;
      mesh.userData['terrainFaces'] = bucket.faceCount;
      mesh.userData['realModel'] = true;
      this.options.blocksGroup.add(mesh);
      meshes.push(mesh);
    }
    if (meshes.length) {
      if (previous) this.disposeChunk(previous);
      this.chunks.set(key, { key, chunk, meshes });
    } else if (previous) {
      this.disposeChunk(previous);
      this.chunks.delete(key);
    }
    this.clearChunkOwnership(key);
    const emittedKeys = new Set(compiled.emittedKeys);
    const occludedKeys = new Set(compiled.fullyOccludedKeys);
    for (const item of represented) {
      this.ownership.set(item, { key: item, chunkKey: key, revision, facesEmitted: emittedKeys.has(item) ? 1 : 0, fullyOccluded: occludedKeys.has(item) });
    }
    if (failed.length) for (const item of failed) this.ownership.delete(item);
    if (!meshes.length && represented.some((item) => !occludedKeys.has(item))) {
      return { representedKeys: [], failedKeys: [...new Set([...failed, ...represented.filter((item) => !occludedKeys.has(item))])] };
    }
    return { representedKeys: represented, failedKeys: failed };
  }

  private clearChunkOwnership(chunkKey: string): void {
    for (const [key, ownership] of this.ownership) if (ownership.chunkKey === chunkKey) this.ownership.delete(key);
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
function emptyTerrainApplyResult(changedKeys: readonly string[] = []): TerrainApplyResult {
  return { changedKeys: [...new Set(changedKeys)], rebuiltChunks: [], representedKeys: [], failedKeys: [] };
}
function parseChunkKey(key: string): TerrainChunkCoordinate | undefined {
  const values = key.split(',').map(Number);
  return values.length === 3 && values.every(Number.isInteger) ? { x: values[0], y: values[1], z: values[2] } : undefined;
}
