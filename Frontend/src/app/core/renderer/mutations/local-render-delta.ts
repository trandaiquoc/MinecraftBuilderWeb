import { coordinateKey } from '../../domain/coordinates';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import { coordinateNeighbors } from '../visibility/interior-occlusion';

export interface LocalRenderDelta {
  readonly hintedKeys: ReadonlySet<string>;
  readonly changedKeys: ReadonlySet<string>;
  readonly affectedPositions: ReadonlyMap<string, VoxelCoordinate>;
}

/** Renderer dependency policy for one persisted local mutation. */
export function planLocalRenderDelta(hint: ProjectMutationHint): LocalRenderDelta {
  const hintedKeys = new Set<string>();
  const changedKeys = new Set<string>();
  const affectedPositions = new Map<string, VoxelCoordinate>();
  for (const change of hint.changes) {
    const positions = [change.position, change.before?.position, change.after?.position].filter((position): position is VoxelCoordinate => !!position);
    for (const position of positions) {
      const key = coordinateKey(position);
      affectedPositions.set(key, position);
      changedKeys.add(key);
      for (const neighbor of coordinateNeighbors(position)) {
        const neighborKey = coordinateKey(neighbor);
        affectedPositions.set(neighborKey, neighbor);
        changedKeys.add(neighborKey);
      }
    }
    hintedKeys.add(change.before ? coordinateKey(change.before.position) : coordinateKey(change.position));
    hintedKeys.add(change.after ? coordinateKey(change.after.position) : coordinateKey(change.position));
  }
  return { hintedKeys, changedKeys, affectedPositions };
}
