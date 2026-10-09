import { coordinateKey } from '../../domain/coordinates';
import type { VoxelCoordinate } from '../../domain/project.types';
import { coordinateNeighbors } from '../visibility/interior-occlusion';
import type { VisibleBlockProjectionEntry } from './y-layer-projection-coordinator';

export interface ReconciliationRepresentation {
  readonly block: VisibleBlockProjectionEntry['block'];
  readonly signature: string;
  readonly role: VisibleBlockProjectionEntry['role'];
}

export interface StructureReconciliationPlanInput {
  readonly visibleByKey: ReadonlyMap<string, VisibleBlockProjectionEntry>;
  readonly representations: ReadonlyMap<string, ReconciliationRepresentation>;
  readonly previousVisiblePositions: ReadonlyMap<string, VoxelCoordinate>;
  readonly pendingSignatureMatches: (key: string, signature: string) => boolean;
  readonly placeholderSignatures: Pick<ReadonlyMap<string, string>, 'get'>;
  readonly providerAvailable: boolean;
  readonly full: boolean;
}

export interface StructureReconciliationPlan {
  readonly changedKeys: Set<string>;
  readonly terrainAffectedPositions: readonly VoxelCoordinate[];
}

/** Plans structural reconciliation keys without mutating viewport or representation ownership. */
export function planStructureReconciliation(input: StructureReconciliationPlanInput): StructureReconciliationPlan {
  const changed = new Set<string>();
  for (const [key, entry] of input.representations) {
    if (input.visibleByKey.has(key)) continue;
    changed.add(key);
    for (const neighbor of coordinateNeighbors(entry.block.position)) changed.add(coordinateKey(neighbor));
  }
  for (const [key, position] of input.previousVisiblePositions) {
    if (input.visibleByKey.has(key)) continue;
    changed.add(key);
    for (const neighbor of coordinateNeighbors(position)) changed.add(coordinateKey(neighbor));
  }
  for (const [key, entry] of input.visibleByKey) {
    const current = input.representations.get(key);
    if (!input.full && current && current.signature === entry.signature && current.role === entry.role) continue;
    if (!current && input.pendingSignatureMatches(key, entry.signature)) continue;
    if (!current && !input.providerAvailable && input.placeholderSignatures.get(key) === entry.signature) continue;
    changed.add(key);
  }
  if (!input.full) for (const key of [...changed]) {
    const position = input.visibleByKey.get(key)?.block.position
      ?? input.previousVisiblePositions.get(key)
      ?? input.representations.get(key)?.block.position;
    if (!position) continue;
    for (const neighbor of coordinateNeighbors(position)) {
      const neighborKey = coordinateKey(neighbor);
      if (input.visibleByKey.has(neighborKey)) changed.add(neighborKey);
    }
  }
  const terrainAffectedPositions = [...changed]
    .map((key) => input.visibleByKey.get(key)?.block.position ?? input.previousVisiblePositions.get(key))
    .filter((position): position is VoxelCoordinate => !!position);
  return { changedKeys: changed, terrainAffectedPositions };
}
