import type { VoxelCoordinate } from '../../domain/project.types';
import { TerrainOccupancy } from './chunk-occupancy';
import { relevantTerrainChunks, terrainChunkKey, worldToTerrainChunk, type TerrainChunkCoordinate } from './chunk-coordinate';
import { dirtyTerrainChunkKeys } from './chunk-dirty-tracker';
import type { TerrainClassificationEntry } from './terrain-classifier';
import type { TerrainSurfaceRecord, TerrainBlockChange } from './terrain-render-contracts';

export interface TerrainChunkLogicalStoreOptions {
  readonly record: (name: string, delta?: number) => void;
}

/** Owns logical terrain records, occupancy, chunk indexes, and geometry invalidation keys. */
export class TerrainChunkLogicalStore {
  private readonly records = new Map<string, TerrainSurfaceRecord>();
  private readonly recordsByChunk = new Map<string, Map<string, TerrainSurfaceRecord>>();
  private readonly occupancy = new TerrainOccupancy();
  private readonly dirtyChunks = new Set<string>();
  private candidateOwnershipTotal = 0;
  private candidateFanoutTotal = 0;

  constructor(private readonly options: TerrainChunkLogicalStoreOptions) {}

  get size(): number { return this.records.size; }
  get candidateOwnershipChecks(): number { return this.candidateOwnershipTotal; }
  get candidateFanout(): number { return this.candidateFanoutTotal; }
  get dirtyChunkCount(): number { return this.dirtyChunks.size; }
  get occupancyLookup(): { hasOpaque(position: VoxelCoordinate): boolean } { return this.occupancy; }

  has(key: string): boolean { return this.records.has(key); }
  record(key: string): TerrainSurfaceRecord | undefined { return this.records.get(key); }
  recordsForKeys(keys: ReadonlySet<string>): readonly TerrainSurfaceRecord[] {
    return [...keys].map((key) => this.records.get(key)).filter((record): record is TerrainSurfaceRecord => !!record);
  }
  recordsInChunk(key: string): readonly TerrainSurfaceRecord[] { return [...(this.recordsByChunk.get(key)?.values() ?? [])]; }
  recordValues(): IterableIterator<TerrainSurfaceRecord> { return this.records.values(); }
  chunkKeys(): IterableIterator<string> { return this.recordsByChunk.keys(); }

  replaceOccupancy(entries: readonly TerrainClassificationEntry[], affectedPositions: readonly VoxelCoordinate[], initial = false): void {
    this.occupancy.replace(entries);
    this.options.record('occupancyFullRebuilds');
    if (initial) for (const key of this.recordsByChunk.keys()) this.dirtyChunks.add(key);
    this.markAffected(affectedPositions);
  }

  setOccupancyDelta(changes: readonly TerrainBlockChange[]): void {
    this.occupancy.applyDelta(changes.map((change) => ({ position: change.position, opaque: change.afterOpaque })));
    this.options.record('occupancyDeltaUpdates', changes.length);
    const dirty = dirtyTerrainChunkKeys(changes.map((change) => change.position));
    this.options.record('incrementalChunkInvalidations', dirty.size);
    for (const key of dirty) this.dirtyChunks.add(key);
  }

  upsertMany(records: readonly TerrainSurfaceRecord[], occupancyEntries?: readonly TerrainClassificationEntry[], affectedPositions: readonly VoxelCoordinate[] = [], initial = false): void {
    if (occupancyEntries) this.occupancy.replace(occupancyEntries);
    for (const record of records) {
      const previous = this.records.get(record.key);
      this.indexRecord(record);
      this.markAffected([previous?.block.position, record.block.position].filter((position): position is VoxelCoordinate => !!position));
    }
    if (initial) for (const key of this.recordsByChunk.keys()) this.dirtyChunks.add(key);
    this.markAffected(affectedPositions);
  }

  upsert(record: TerrainSurfaceRecord): boolean {
    if (record.templates.length !== 6) return false;
    const previous = this.records.get(record.key);
    this.indexRecord(record);
    this.markAffected([previous?.block.position, record.block.position].filter((position): position is VoxelCoordinate => !!position));
    return true;
  }

  applyChanges(changes: readonly TerrainBlockChange[]): void {
    for (const change of changes) {
      if (change.before && (!change.after || change.before.key !== change.after.key)) this.removeRecord(change.before.key);
      if (change.after) this.indexRecord(change.after);
    }
    this.setOccupancyDelta(changes);
  }

  remove(key: string): TerrainSurfaceRecord | undefined {
    const previous = this.records.get(key);
    if (previous) this.removeRecord(key);
    return previous;
  }

  removeRecord(key: string): void {
    const current = this.records.get(key);
    if (!current) return;
    this.records.delete(key);
    this.removeFromChunkIndex(current);
    this.markAffected([current.block.position]);
  }

  clearRecords(): void {
    this.records.clear();
    this.recordsByChunk.clear();
    this.dirtyChunks.clear();
    this.occupancy.replace([]);
  }

  takeDirtyChunks(): readonly string[] {
    const dirty = [...this.dirtyChunks];
    this.dirtyChunks.clear();
    return dirty;
  }
  isDirty(key: string): boolean { return this.dirtyChunks.has(key); }
  markDirty(key: string): void { this.dirtyChunks.add(key); }

  occupancyHalo(chunk: TerrainChunkCoordinate): { readonly origin: [number, number, number]; readonly size: 18; readonly opaque: Uint8Array } {
    const origin: [number, number, number] = [chunk.x * 16 - 1, chunk.y * 16 - 1, chunk.z * 16 - 1];
    const opaque = new Uint8Array(18 * 18 * 18);
    for (let y = 0; y < 18; y += 1) for (let z = 0; z < 18; z += 1) for (let x = 0; x < 18; x += 1) {
      if (this.occupancy.hasOpaque({ x: origin[0] + x, y: origin[1] + y, z: origin[2] + z })) opaque[(y * 18 + z) * 18 + x] = 1;
    }
    return { origin, size: 18, opaque };
  }

  indexHydrationCandidates(keys: readonly string[]): ReadonlyMap<string, readonly string[]> {
    const byChunk = this.indexKeysByOwningChunk(keys);
    const ownership = [...byChunk.values()].reduce((total, candidates) => total + candidates.length, 0);
    this.candidateOwnershipTotal += ownership;
    this.candidateFanoutTotal += ownership;
    return byChunk;
  }

  indexKeysByOwningChunk(keys: readonly string[]): Map<string, string[]> {
    const byChunk = new Map<string, string[]>();
    for (const key of new Set(keys)) {
      const record = this.records.get(key);
      if (!record) continue;
      const chunkKey = terrainChunkKeyForPosition(record.block.position);
      const local = byChunk.get(chunkKey) ?? [];
      local.push(key);
      byChunk.set(chunkKey, local);
    }
    return byChunk;
  }

  clear(): void {
    this.clearRecords();
    this.candidateOwnershipTotal = 0;
    this.candidateFanoutTotal = 0;
  }

  private markAffected(positions: readonly VoxelCoordinate[]): void {
    for (const position of positions) for (const chunk of relevantTerrainChunks(position)) this.dirtyChunks.add(terrainChunkKey(chunk));
  }

  private removeFromChunkIndex(record: TerrainSurfaceRecord): void {
    const key = terrainChunkKeyForPosition(record.block.position);
    const records = this.recordsByChunk.get(key);
    if (!records) return;
    records.delete(record.key);
    if (!records.size) this.recordsByChunk.delete(key);
  }

  private indexRecord(record: TerrainSurfaceRecord): void {
    if (record.templates.length !== 6) return;
    const previous = this.records.get(record.key);
    if (previous) this.removeFromChunkIndex(previous);
    const indexed = record;
    this.records.set(record.key, indexed);
    const chunkKey = terrainChunkKeyForPosition(indexed.block.position);
    const chunkRecords = this.recordsByChunk.get(chunkKey) ?? new Map<string, TerrainSurfaceRecord>();
    chunkRecords.set(indexed.key, indexed);
    this.recordsByChunk.set(chunkKey, chunkRecords);
  }
}

function terrainChunkKeyForPosition(position: VoxelCoordinate): string {
  return terrainChunkKey(worldToTerrainChunk(position));
}
