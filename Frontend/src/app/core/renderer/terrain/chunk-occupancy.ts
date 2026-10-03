import type { VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import { coordinateNeighbors } from '../visibility/interior-occlusion';
import type { TerrainClassificationEntry } from './terrain-classifier';
import { isCompiledTerrainEntry } from './terrain-classifier';

/** O(1) semantic occupancy queries for the current render dataset. */
export class TerrainOccupancy {
  private readonly opaque = new Set<string>();

  replace(entries: readonly TerrainClassificationEntry[]): void {
    this.opaque.clear();
    for (const entry of entries) if (isCompiledTerrainEntry(entry)) this.opaque.add(coordinateKey(entry.block.position));
  }

  addOpaque(position: VoxelCoordinate): void { this.opaque.add(coordinateKey(position)); }
  removeOpaque(position: VoxelCoordinate): void { this.opaque.delete(coordinateKey(position)); }
  setOpaque(position: VoxelCoordinate, opaque: boolean): void { if (opaque) this.addOpaque(position); else this.removeOpaque(position); }

  applyDelta(changes: readonly { readonly position: VoxelCoordinate; readonly opaque: boolean }[]): void {
    for (const change of changes) this.setOpaque(change.position, change.opaque);
  }

  hasOpaque(position: VoxelCoordinate): boolean { return this.opaque.has(coordinateKey(position)); }
  size(): number { return this.opaque.size; }
  positions(): readonly string[] { return [...this.opaque]; }
  exposedNeighborCount(position: VoxelCoordinate): number { return coordinateNeighbors(position).filter((neighbor) => !this.hasOpaque(neighbor)).length; }
}
