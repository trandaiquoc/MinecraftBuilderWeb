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

  get(position: VoxelCoordinate): PlacedBlock | undefined {
    this._lookups += 1;
    return this.blocksByPosition.get(coordinateKey(position));
  }

  has(position: VoxelCoordinate): boolean { return this.get(position) !== undefined; }

  get lookups(): number { return this._lookups; }

  keys(): IterableIterator<string> { return this.blocksByPosition.keys(); }
}
