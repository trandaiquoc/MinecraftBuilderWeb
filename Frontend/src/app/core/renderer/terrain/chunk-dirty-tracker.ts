import type { VoxelCoordinate } from '../../domain/project.types';
import { relevantTerrainChunks, terrainChunkKey } from './chunk-coordinate';

/** Returns the containing chunk plus only directly shared-face neighbors. */
export function dirtyTerrainChunkKeys(positions: readonly VoxelCoordinate[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const position of positions)
    for (const chunk of relevantTerrainChunks(position)) result.add(terrainChunkKey(chunk));
  return result;
}
