import { coordinateKey } from '../../domain/coordinates';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { decorationAabb, decorationOverlaps } from '../../decorations/placement/decoration-placement';

export type SpatialAabb = ReturnType<typeof decorationAabb>;

/** Ephemeral occupancy indexes used while validating or planning an import. */
export interface StructureImportSpatialContext {
  readonly blockByCoordinate: ReadonlyMap<string, PlacedBlock>;
  readonly occupiedCoordinates: ReadonlySet<string>;
  readonly decorations: DecorationSpatialIndex;
}

export interface DecorationSpatialEntry {
  readonly decoration: PlacedDecoration;
  readonly box: SpatialAabb;
}

export interface DecorationSpatialIndex {
  readonly byCell: Map<string, DecorationSpatialEntry[]>;
}

export function buildStructureImportSpatialContext(blocks: readonly PlacedBlock[], decorations: readonly PlacedDecoration[]): StructureImportSpatialContext {
  const blockByCoordinate = new Map<string, PlacedBlock>();
  for (const block of blocks) blockByCoordinate.set(coordinateKey(block.position), block);
  return { blockByCoordinate, occupiedCoordinates: new Set(blockByCoordinate.keys()), decorations: buildDecorationSpatialIndex(decorations) };
}

export function buildDecorationSpatialIndex(decorations: readonly PlacedDecoration[]): DecorationSpatialIndex {
  const byCell = new Map<string, DecorationSpatialEntry[]>();
  const index = { byCell } satisfies DecorationSpatialIndex;
  for (const decoration of decorations) addDecorationToSpatialIndex(index, decoration);
  return { byCell };
}

export function addDecorationToSpatialIndex(index: DecorationSpatialIndex, decoration: PlacedDecoration): void {
  const entry = { decoration, box: decorationAabb(decoration) } satisfies DecorationSpatialEntry;
  for (const cell of aabbCells(entry.box)) {
    const entries = index.byCell.get(cell) ?? [];
    entries.push(entry);
    index.byCell.set(cell, entries);
  }
}

export function queryDecorationSpatialIndex(index: DecorationSpatialIndex, box: SpatialAabb): readonly DecorationSpatialEntry[] {
  const seen = new Set<string>();
  const result: DecorationSpatialEntry[] = [];
  for (const cell of aabbCells(box)) for (const entry of index.byCell.get(cell) ?? []) {
    if (seen.has(entry.decoration.instanceId)) continue;
    seen.add(entry.decoration.instanceId);
    if (decorationOverlaps(box, entry.box)) result.push(entry);
  }
  return result;
}

export function blocksIntersectingAabb(box: SpatialAabb, context: Pick<StructureImportSpatialContext, 'blockByCoordinate'>): readonly PlacedBlock[] {
  const result: PlacedBlock[] = [];
  const seen = new Set<string>();
  for (const cell of aabbCells(box)) {
    const block = context.blockByCoordinate.get(cell);
    if (!block || seen.has(cell) || !intersectsBlock(box, block.position)) continue;
    seen.add(cell); result.push(block);
  }
  return result;
}

export function aabbCells(box: SpatialAabb): readonly string[] {
  const minX = Math.floor(box.min.x); const minY = Math.floor(box.min.y); const minZ = Math.floor(box.min.z);
  const maxX = Math.ceil(box.max.x) - 1; const maxY = Math.ceil(box.max.y) - 1; const maxZ = Math.ceil(box.max.z) - 1;
  const cells: string[] = [];
  for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) for (let z = minZ; z <= maxZ; z += 1) cells.push(`${x},${y},${z}`);
  return cells;
}

export function intersectsBlock(box: SpatialAabb, position: VoxelCoordinate): boolean {
  return box.min.x < position.x + 1 && box.max.x > position.x && box.min.y < position.y + 1 && box.max.y > position.y && box.min.z < position.z + 1 && box.max.z > position.z;
}
