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

  hasOpaque(position: VoxelCoordinate): boolean { return this.opaque.has(coordinateKey(position)); }
  size(): number { return this.opaque.size; }
  positions(): readonly string[] { return [...this.opaque]; }
  exposedNeighborCount(position: VoxelCoordinate): number { return coordinateNeighbors(position).filter((neighbor) => !this.hasOpaque(neighbor)).length; }
}
