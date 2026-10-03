import { coordinateKey } from './coordinates';
import type { PlacedBlock, VoxelCoordinate } from './project.types';

/** Runtime-only voxel lookup. ProjectDocument remains the source of truth. */
export interface ReadonlyBlockLookup {
  get(position: VoxelCoordinate): PlacedBlock | undefined;
  has(position: VoxelCoordinate): boolean;
}

export class ProjectBlockSpatialIndex implements ReadonlyBlockLookup {
  private readonly blocksByPosition = new Map<string, PlacedBlock>();
  private _lookups = 0;

  constructor(readonly blocks: readonly PlacedBlock[]) {
    for (const block of blocks) this.blocksByPosition.set(coordinateKey(block.position), block);
  }

  /** Adds a block while an ephemeral import index is built cooperatively. */
  add(block: PlacedBlock): void { this.blocksByPosition.set(coordinateKey(block.position), block); }

  get(position: VoxelCoordinate): PlacedBlock | undefined {
    this._lookups += 1;
    return this.blocksByPosition.get(coordinateKey(position));
  }

  has(position: VoxelCoordinate): boolean { return this.get(position) !== undefined; }

  get lookups(): number { return this._lookups; }

  keys(): IterableIterator<string> { return this.blocksByPosition.keys(); }
}

/**
 * Mutable, editor-only block index.  ProjectBlockSpatialIndex remains useful
 * for cold import/renderer snapshots; this store is the single live index used
 * by interactive editing and is rebuilt when a project is replaced.
 */
export class RuntimeProjectBlockStore implements ReadonlyBlockLookup {
  static readonly CHUNK_SIZE = 16;
  private readonly blocksByPosition = new Map<string, PlacedBlock>();
  private readonly order: string[] = [];
  private readonly orderIndexes = new Map<string, number>();
  private readonly groupMembers = new Map<string, Set<string>>();
  private readonly chunkMembers = new Map<string, Set<string>>();
  private readonly dirtyChunkKeys = new Set<string>();
  private _lookups = 0;
  private _iterations = 0;
  private _revision = 0;
  private _projectId?: string;

  get projectId(): string | undefined { return this._projectId; }
  get revision(): number { return this._revision; }
  get lookups(): number { return this._lookups; }
  get iterations(): number { return this._iterations; }

  hydrate(projectId: string | undefined, blocks: readonly PlacedBlock[]): void {
    this.clear();
    this._projectId = projectId;
    for (const block of blocks) this.add(block, false);
    this.dirtyChunkKeys.clear();
    this._revision += 1;
  }

  clear(): void {
    this.blocksByPosition.clear(); this.order.length = 0; this.orderIndexes.clear(); this.groupMembers.clear();
    this.chunkMembers.clear(); this.dirtyChunkKeys.clear(); this._projectId = undefined;
  }

  get(position: VoxelCoordinate): PlacedBlock | undefined {
    this._lookups += 1;
    return this.blocksByPosition.get(coordinateKey(position));
  }

  has(position: VoxelCoordinate): boolean { return this.get(position) !== undefined; }

  add(block: PlacedBlock, markDirty = true): boolean {
    const key = coordinateKey(block.position);
    if (this.blocksByPosition.has(key)) return false;
    this.blocksByPosition.set(key, block); this.orderIndexes.set(key, this.order.length); this.order.push(key); this.index(block);
    if (markDirty) { this.touch(block.position); this._revision += 1; }
    return true;
  }

  addMany(blocks: readonly PlacedBlock[]): number {
    let changed = 0; for (const block of blocks) if (this.add(block)) changed += 1;
    return changed;
  }

  update(position: VoxelCoordinate, next: PlacedBlock): boolean {
    const key = coordinateKey(position); const previous = this.blocksByPosition.get(key);
    if (!previous) return false;
    const nextKey = coordinateKey(next.position);
    if (nextKey !== key && this.blocksByPosition.has(nextKey)) return false;
    this.unindex(previous); this.blocksByPosition.delete(key); this.blocksByPosition.set(nextKey, next);
    const orderIndex = this.orderIndexes.get(key); if (orderIndex !== undefined) { this.order[orderIndex] = nextKey; this.orderIndexes.delete(key); this.orderIndexes.set(nextKey, orderIndex); }
    this.index(next); this.touch(position); this.touch(next.position); this._revision += 1; return true;
  }

  remove(position: VoxelCoordinate): PlacedBlock | undefined {
    const key = coordinateKey(position); const previous = this.blocksByPosition.get(key);
    if (!previous) return undefined;
    this.blocksByPosition.delete(key); this.unindex(previous); const orderIndex = this.orderIndexes.get(key); if (orderIndex !== undefined) this.order[orderIndex] = ''; this.orderIndexes.delete(key); this.touch(position); this._revision += 1; this.compactOrderIfNeeded(); return previous;
  }

  removeMany(positions: readonly VoxelCoordinate[]): readonly PlacedBlock[] {
    const removed: PlacedBlock[] = []; for (const position of positions) { const block = this.remove(position); if (block) removed.push(block); }
    return removed;
  }

  /** Moves only the supplied records and permits destinations vacated by the same batch. */
  moveBatch(moves: readonly { readonly before: VoxelCoordinate; readonly after: VoxelCoordinate }[]): boolean {
    const moving = new Map<string, PlacedBlock>();
    for (const move of moves) { const block = this.get(move.before); if (!block || moving.has(coordinateKey(move.after))) return false; moving.set(coordinateKey(move.before), block); }
    for (const move of moves) { const destination = coordinateKey(move.after); const occupant = this.blocksByPosition.get(destination); if (occupant && !moving.has(destination)) return false; }
    for (const move of moves) { const beforeKey = coordinateKey(move.before); const block = moving.get(beforeKey)!; this.unindex(block); this.blocksByPosition.delete(beforeKey); }
    const orderUpdates = moves.map((move) => ({ beforeKey: coordinateKey(move.before), afterKey: coordinateKey(move.after), index: this.orderIndexes.get(coordinateKey(move.before)) }));
    for (const update of orderUpdates) this.orderIndexes.delete(update.beforeKey);
    for (const move of moves) { const beforeKey = coordinateKey(move.before); const afterKey = coordinateKey(move.after); const block = moving.get(beforeKey)!; const moved = { ...block, position: { ...move.after } }; this.blocksByPosition.set(afterKey, moved); this.index(moved); this.touch(move.before); this.touch(move.after); }
    for (const update of orderUpdates) if (update.index !== undefined) { this.order[update.index] = update.afterKey; this.orderIndexes.set(update.afterKey, update.index); }
    if (moves.length) this._revision += 1; return true;
  }

  queryBox(min: VoxelCoordinate, max: VoxelCoordinate): readonly PlacedBlock[] {
    const result: PlacedBlock[] = [];
    const size = RuntimeProjectBlockStore.CHUNK_SIZE;
    for (let chunkX = Math.floor(min.x / size); chunkX <= Math.floor(max.x / size); chunkX += 1) for (let chunkY = Math.floor(min.y / size); chunkY <= Math.floor(max.y / size); chunkY += 1) for (let chunkZ = Math.floor(min.z / size); chunkZ <= Math.floor(max.z / size); chunkZ += 1) {
      for (const key of this.chunkMembers.get(`${chunkX},${chunkY},${chunkZ}`) ?? []) {
        this._iterations += 1;
        const block = this.blocksByPosition.get(key); if (!block) continue;
        const position = block.position; if (position.x >= min.x && position.x <= max.x && position.y >= min.y && position.y <= max.y && position.z >= min.z && position.z <= max.z) result.push(block);
      }
    }
    return result;
  }

  blocksForGroup(groupId: string): readonly PlacedBlock[] {
    const result: PlacedBlock[] = []; for (const key of this.groupMembers.get(groupId) ?? []) { this._iterations += 1; const block = this.blocksByPosition.get(key); if (block) result.push(block); }
    return result;
  }

  chunkKeysFor(position: VoxelCoordinate): readonly string[] {
    const keys = [chunkKey(position)];
    if (position.x % RuntimeProjectBlockStore.CHUNK_SIZE === 0) keys.push(chunkKey({ ...position, x: position.x - 1 }));
    if (position.y % RuntimeProjectBlockStore.CHUNK_SIZE === 0) keys.push(chunkKey({ ...position, y: position.y - 1 }));
    if (position.z % RuntimeProjectBlockStore.CHUNK_SIZE === 0) keys.push(chunkKey({ ...position, z: position.z - 1 }));
    return keys;
  }

  dirtyChunks(): readonly string[] { return [...this.dirtyChunkKeys]; }
  consumeDirtyChunks(): readonly string[] { const keys = [...this.dirtyChunkKeys]; this.dirtyChunkKeys.clear(); return keys; }
  resetCounters(): void { this._lookups = 0; this._iterations = 0; }

  /** Cold boundary only: creates the persisted ordering without exposing internal maps. */
  snapshot(): readonly PlacedBlock[] {
    const result: PlacedBlock[] = []; for (const key of this.order) { if (!key) continue; const block = this.blocksByPosition.get(key); if (block) result.push(block); }
    this._iterations += result.length; return result;
  }

  private index(block: PlacedBlock): void {
    const key = coordinateKey(block.position); for (const groupId of block.groupIds ?? (block.groupId ? [block.groupId] : [])) { let members = this.groupMembers.get(groupId); if (!members) this.groupMembers.set(groupId, members = new Set()); members.add(key); }
    const chunk = chunkKey(block.position); let members = this.chunkMembers.get(chunk); if (!members) this.chunkMembers.set(chunk, members = new Set()); members.add(key);
  }
  private unindex(block: PlacedBlock): void {
    const key = coordinateKey(block.position); for (const groupId of block.groupIds ?? (block.groupId ? [block.groupId] : [])) { const members = this.groupMembers.get(groupId); members?.delete(key); if (members?.size === 0) this.groupMembers.delete(groupId); }
    const chunk = chunkKey(block.position); const members = this.chunkMembers.get(chunk); members?.delete(key); if (members?.size === 0) this.chunkMembers.delete(chunk);
  }
  private touch(position: VoxelCoordinate): void { for (const key of this.chunkKeysFor(position)) this.dirtyChunkKeys.add(key); }
  private compactOrderIfNeeded(): void {
    if (this.order.length <= this.blocksByPosition.size * 2 + 1024) return;
    const compacted = this.order.filter((key) => !!key && this.blocksByPosition.has(key));
    this.order.length = 0; this.order.push(...compacted); this.orderIndexes.clear();
    for (let index = 0; index < this.order.length; index += 1) this.orderIndexes.set(this.order[index], index);
  }
}

export function chunkKey(position: VoxelCoordinate): string {
  const size = RuntimeProjectBlockStore.CHUNK_SIZE;
  return `${Math.floor(position.x / size)},${Math.floor(position.y / size)},${Math.floor(position.z / size)}`;
}
