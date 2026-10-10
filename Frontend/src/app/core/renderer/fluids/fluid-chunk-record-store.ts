import { VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { fluidChunkKey } from './fluid-mesh-core';
import type { FluidChunkChange, FluidChunkRecord } from './fluid-render-contracts';
import { fluidRecordSignature } from './fluid-record-signature';

export interface FluidChunkReconcileResult {
  readonly dirtyChunks: ReadonlySet<string>;
  readonly full: boolean;
}

/** Owns canonical fluid records and their chunk index; it never owns render resources. */
export class FluidChunkRecordStore {
  private readonly records = new Map<string, FluidChunkRecord>();
  private readonly recordsByChunk = new Map<string, Map<string, FluidChunkRecord>>();

  get size(): number {
    return this.records.size;
  }
  has(key: string): boolean {
    return this.records.has(key);
  }
  get(key: string): FluidChunkRecord | undefined {
    return this.records.get(key);
  }
  keys(): IterableIterator<string> {
    return this.records.keys();
  }
  values(): IterableIterator<FluidChunkRecord> {
    return this.records.values();
  }
  chunkKeys(): IterableIterator<string> {
    return this.recordsByChunk.keys();
  }
  recordsForKeys(keys: ReadonlySet<string>): readonly FluidChunkRecord[] {
    return [...keys]
      .map((key) => this.records.get(key))
      .filter((record): record is FluidChunkRecord => !!record);
  }
  recordsInChunk(key: string): readonly FluidChunkRecord[] {
    return [...(this.recordsByChunk.get(key)?.values() ?? [])];
  }

  reconcile(
    nextRecords: readonly FluidChunkRecord[],
    changedPositions: readonly VoxelCoordinate[] | undefined,
    chunkSize: number,
    representedChunkKeys: Iterable<string>,
    forceFull: boolean,
  ): FluidChunkReconcileResult {
    const next = new Map(
      nextRecords.map((record) => [coordinateKey(record.block.position), record] as const),
    );
    const full = changedPositions === undefined || this.records.size === 0 || forceFull;
    const dirty = full
      ? new Set([
          ...this.recordsByChunk.keys(),
          ...representedChunkKeys,
          ...nextRecords.map((record) => fluidChunkKey(record.block.position, chunkSize)),
        ])
      : this.dirtyChunkKeys(changedPositions, chunkSize);

    for (const [key, previous] of this.records) {
      const replacement = next.get(key);
      if (!replacement) {
        dirty.add(fluidChunkKey(previous.block.position, chunkSize));
        this.remove(key, previous, chunkSize);
      }
    }
    for (const [key, record] of next) {
      const previous = this.records.get(key);
      if (!previous || fluidRecordSignature(previous) !== fluidRecordSignature(record))
        dirty.add(fluidChunkKey(record.block.position, chunkSize));
      if (
        previous &&
        fluidChunkKey(previous.block.position, chunkSize) !==
          fluidChunkKey(record.block.position, chunkSize)
      )
        this.remove(key, previous, chunkSize);
      this.set(key, record, chunkSize);
    }
    return { dirtyChunks: dirty, full };
  }

  applyDelta(
    changes: readonly FluidChunkChange[],
    changedPositions: readonly VoxelCoordinate[],
    chunkSize: number,
  ): { readonly dirtyChunks: ReadonlySet<string>; readonly changedKeys: readonly string[] } {
    const dirty = this.dirtyChunkKeys(changedPositions, chunkSize);
    const changedKeys: string[] = [];
    for (const change of changes) {
      const key = coordinateKey(
        change.after?.block.position ?? change.before?.block.position ?? change.position,
      );
      const previous = this.records.get(key);
      if (change.after) {
        if (!previous || fluidRecordSignature(previous) !== fluidRecordSignature(change.after))
          dirty.add(fluidChunkKey(change.after.block.position, chunkSize));
        if (
          previous &&
          fluidChunkKey(previous.block.position, chunkSize) !==
            fluidChunkKey(change.after.block.position, chunkSize)
        )
          this.remove(key, previous, chunkSize);
        this.set(key, change.after, chunkSize);
      } else if (previous) {
        dirty.add(fluidChunkKey(previous.block.position, chunkSize));
        this.remove(key, previous, chunkSize);
      }
      changedKeys.push(key);
    }
    return { dirtyChunks: dirty, changedKeys };
  }

  clear(): void {
    this.records.clear();
    this.recordsByChunk.clear();
  }

  private dirtyChunkKeys(changed: readonly VoxelCoordinate[], chunkSize: number): Set<string> {
    const dirty = new Set<string>();
    for (const position of changed)
      for (let dx = -1; dx <= 1; dx += 1)
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dz = -1; dz <= 1; dz += 1) {
            dirty.add(
              fluidChunkKey(
                { x: position.x + dx, y: position.y + dy, z: position.z + dz },
                chunkSize,
              ),
            );
          }
    return dirty;
  }

  private set(key: string, record: FluidChunkRecord, chunkSize: number): void {
    const chunkKey = fluidChunkKey(record.block.position, chunkSize);
    const chunk = this.recordsByChunk.get(chunkKey) ?? new Map<string, FluidChunkRecord>();
    chunk.set(key, record);
    this.recordsByChunk.set(chunkKey, chunk);
    this.records.set(key, record);
  }

  private remove(key: string, record: FluidChunkRecord, chunkSize: number): void {
    const chunkKey = fluidChunkKey(record.block.position, chunkSize);
    const chunk = this.recordsByChunk.get(chunkKey);
    this.records.delete(key);
    if (!chunk) return;
    chunk.delete(key);
    if (!chunk.size) this.recordsByChunk.delete(chunkKey);
  }
}
