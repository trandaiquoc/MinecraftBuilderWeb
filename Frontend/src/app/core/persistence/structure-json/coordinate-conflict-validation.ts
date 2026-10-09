import { coordinateKey } from '../../domain/coordinates';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { StructureJsonBlock } from './structure-json';
import type { MutableStructureJsonIssues } from './structure-json-validation.types';

export interface CoordinateGroup {
  readonly position: VoxelCoordinate;
  readonly indexes: number[];
  readonly ids: string[];
}

export function createCoordinateConflictAccumulator(): Map<string, CoordinateGroup> { return new Map(); }

export function recordCoordinate(accumulator: Map<string, CoordinateGroup>, block: StructureJsonBlock, index: number): void {
  const position = { x: block.x, y: block.y, z: block.z };
  const key = coordinateKey(position);
  const group = accumulator.get(key) ?? { position, indexes: [], ids: [] };
  group.indexes.push(index);
  group.ids.push(block.id);
  accumulator.set(key, group);
}

export function collectDuplicateCoordinates(blocks: readonly StructureJsonBlock[]): { readonly duplicateIndexes: Set<number>; readonly conflicts: MutableStructureJsonIssues['duplicate'] } {
  const coordinates = createCoordinateConflictAccumulator();
  for (let index = 0; index < blocks.length; index += 1) recordCoordinate(coordinates, blocks[index], index);
  return finalizeCoordinateConflicts(coordinates);
}

export function finalizeCoordinateConflicts(coordinates: ReadonlyMap<string, CoordinateGroup>): { readonly duplicateIndexes: Set<number>; readonly conflicts: MutableStructureJsonIssues['duplicate'] } {
  const duplicateIndexes = new Set<number>();
  const conflicts: MutableStructureJsonIssues['duplicate'] = [];
  for (const group of coordinates.values()) {
    if (group.indexes.length <= 1) continue;
    group.indexes.forEach((index) => duplicateIndexes.add(index));
    conflicts.push({ category: 'duplicate', coordinate: group.position, blockIndexes: group.indexes, blockIds: group.ids });
  }
  return { duplicateIndexes, conflicts };
}
