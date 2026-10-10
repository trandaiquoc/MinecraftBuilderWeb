import { coordinateKey } from '../../domain/coordinates';
import type { ProjectDocument, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { decorationAabb } from '../../decorations/placement/decoration-placement';
import {
  addDecorationToSpatialIndex,
  blocksIntersectingAabb,
  buildDecorationSpatialIndex,
  buildStructureImportSpatialContext,
  buildStructureImportSpatialContextAsync,
  queryDecorationSpatialIndex,
} from './structure-json-spatial';
import type { StructureJsonBlock } from './structure-json';
import type { StructureJsonValidationCancellation } from './structure-json-import';
export interface StructureJsonProjectConflict {
  readonly coordinate: VoxelCoordinate;
  readonly importedIndexes: readonly number[];
  readonly existingBlockIds: readonly string[];
}
export interface StructureJsonDecorationConflict {
  readonly importedIndex: number;
  readonly kind: PlacedDecoration['kind'];
  readonly anchor: VoxelCoordinate;
  readonly reason: 'block' | 'decoration';
  readonly existingId?: string;
}
import { CooperativeWorkBudget, yieldToBrowser } from '../../assets/cooperative-yield';

/** Owns conflict detection; import-plan construction and application stay separate. */
export function findCurrentConflicts(
  imported: readonly StructureJsonBlock[],
  project: ProjectDocument,
): readonly StructureJsonProjectConflict[] {
  const existing = new Map<string, string[]>();
  for (const block of project.blocks) {
    const key = coordinateKey(block.position);
    existing.set(key, [...(existing.get(key) ?? []), block.id]);
  }
  const importedAt = new Map<
    string,
    { readonly coordinate: VoxelCoordinate; readonly indexes: number[] }
  >();
  for (let index = 0; index < imported.length; index += 1) {
    const block = imported[index];
    const coordinate = { x: block.x, y: block.y, z: block.z };
    const key = coordinateKey(coordinate);
    const entry = importedAt.get(key) ?? { coordinate, indexes: [] };
    entry.indexes.push(index);
    importedAt.set(key, entry);
  }
  const conflicts: StructureJsonProjectConflict[] = [];
  for (const [key, entry] of importedAt) {
    const existingIds = existing.get(key);
    if (existingIds)
      conflicts.push({
        coordinate: entry.coordinate,
        importedIndexes: entry.indexes,
        existingBlockIds: existingIds,
      });
  }
  return conflicts;
}

export function findDecorationConflicts(
  importedBlocks: readonly PlacedBlock[],
  importedDecorations: readonly PlacedDecoration[],
  project: ProjectDocument,
): readonly StructureJsonDecorationConflict[] {
  const conflicts: StructureJsonDecorationConflict[] = [];
  const context = buildStructureImportSpatialContext(project.blocks, project.decorations ?? []);
  const importedIndex = buildDecorationSpatialIndex([]);
  for (let index = 0; index < importedDecorations.length; index += 1) {
    const decoration = importedDecorations[index];
    const box = decorationAabb(decoration);
    if (blocksIntersectingAabb(box, context).length > 0)
      conflicts.push({
        importedIndex: index,
        kind: decoration.kind,
        anchor: decoration.anchor,
        reason: 'block',
      });
    const existing = queryDecorationSpatialIndex(context.decorations, box)[0];
    if (existing)
      conflicts.push({
        importedIndex: index,
        kind: decoration.kind,
        anchor: decoration.anchor,
        reason: 'decoration',
        existingId: existing.decoration.instanceId,
      });
    const importedExisting = queryDecorationSpatialIndex(importedIndex, box)[0];
    if (importedExisting)
      conflicts.push({
        importedIndex: index,
        kind: decoration.kind,
        anchor: decoration.anchor,
        reason: 'decoration',
        existingId: importedExisting.decoration.instanceId,
      });
    addDecorationToSpatialIndex(importedIndex, decoration);
  }
  for (const block of importedBlocks) {
    const collisions = queryDecorationSpatialIndex(context.decorations, {
      min: block.position,
      max: { x: block.position.x + 1, y: block.position.y + 1, z: block.position.z + 1 },
    });
    for (const decoration of collisions)
      conflicts.push({
        importedIndex: -1,
        kind: 'item-frame',
        anchor: block.position,
        reason: 'block',
        existingId: decoration.decoration.instanceId,
      });
  }
  return conflicts;
}

export async function findCurrentConflictsAsync(
  imported: readonly StructureJsonBlock[],
  project: ProjectDocument,
  cancellation?: StructureJsonValidationCancellation,
  onProgress?: (completed: number, total: number) => void,
): Promise<readonly StructureJsonProjectConflict[] | undefined> {
  const budget = new CooperativeWorkBudget(8, 4096);
  const existing = new Map<string, string[]>();
  for (let index = 0; index < project.blocks.length; index += 1) {
    const block = project.blocks[index];
    const key = coordinateKey(block.position);
    existing.set(key, [...(existing.get(key) ?? []), block.id]);
    if (await conflictCheckpoint(budget, cancellation)) return undefined;
  }
  const importedAt = new Map<
    string,
    { readonly coordinate: VoxelCoordinate; readonly indexes: number[] }
  >();
  for (let index = 0; index < imported.length; index += 1) {
    const block = imported[index];
    const coordinate = { x: block.x, y: block.y, z: block.z };
    const entry = importedAt.get(coordinateKey(coordinate)) ?? { coordinate, indexes: [] };
    entry.indexes.push(index);
    importedAt.set(coordinateKey(coordinate), entry);
    onProgress?.(index + 1, imported.length);
    if (await conflictCheckpoint(budget, cancellation)) return undefined;
  }
  const conflicts: StructureJsonProjectConflict[] = [];
  let processed = 0;
  for (const [key, entry] of importedAt) {
    const existingIds = existing.get(key);
    if (existingIds)
      conflicts.push({
        coordinate: entry.coordinate,
        importedIndexes: entry.indexes,
        existingBlockIds: existingIds,
      });
    processed += 1;
    if (await conflictCheckpoint(budget, cancellation)) return undefined;
  }
  return conflicts;
}

export async function findDecorationConflictsAsync(
  importedBlocks: readonly PlacedBlock[],
  importedDecorations: readonly PlacedDecoration[],
  project: ProjectDocument,
  cancellation?: StructureJsonValidationCancellation,
  onProgress?: (completed: number, total: number) => void,
): Promise<readonly StructureJsonDecorationConflict[] | undefined> {
  const budget = new CooperativeWorkBudget(8, 4096);
  const conflicts: StructureJsonDecorationConflict[] = [];
  const context = await buildStructureImportSpatialContextAsync(
    project.blocks,
    project.decorations ?? [],
    cancellation,
  );
  if (!context) return undefined;
  const importedIndex = buildDecorationSpatialIndex([]);
  for (let index = 0; index < importedDecorations.length; index += 1) {
    const decoration = importedDecorations[index];
    const box = decorationAabb(decoration);
    if (blocksIntersectingAabb(box, context).length > 0)
      conflicts.push({
        importedIndex: index,
        kind: decoration.kind,
        anchor: decoration.anchor,
        reason: 'block',
      });
    const existing = queryDecorationSpatialIndex(context.decorations, box)[0];
    if (existing)
      conflicts.push({
        importedIndex: index,
        kind: decoration.kind,
        anchor: decoration.anchor,
        reason: 'decoration',
        existingId: existing.decoration.instanceId,
      });
    const importedExisting = queryDecorationSpatialIndex(importedIndex, box)[0];
    if (importedExisting)
      conflicts.push({
        importedIndex: index,
        kind: decoration.kind,
        anchor: decoration.anchor,
        reason: 'decoration',
        existingId: importedExisting.decoration.instanceId,
      });
    addDecorationToSpatialIndex(importedIndex, decoration);
    onProgress?.(index + 1, importedDecorations.length + importedBlocks.length);
    if (await conflictCheckpoint(budget, cancellation)) return undefined;
  }
  for (let index = 0; index < importedBlocks.length; index += 1) {
    const block = importedBlocks[index];
    const collisions = queryDecorationSpatialIndex(context.decorations, {
      min: block.position,
      max: { x: block.position.x + 1, y: block.position.y + 1, z: block.position.z + 1 },
    });
    for (const decoration of collisions)
      conflicts.push({
        importedIndex: -1,
        kind: 'item-frame',
        anchor: block.position,
        reason: 'block',
        existingId: decoration.decoration.instanceId,
      });
    onProgress?.(
      importedDecorations.length + index + 1,
      importedDecorations.length + importedBlocks.length,
    );
    if (await conflictCheckpoint(budget, cancellation)) return undefined;
  }
  return conflicts;
}

async function conflictCheckpoint(
  budget: CooperativeWorkBudget,
  cancellation?: StructureJsonValidationCancellation,
): Promise<boolean> {
  if (cancellation?.signal?.aborted || cancellation?.isCancelled?.()) return true;
  if (!budget.shouldYieldNow()) return false;
  budget.reset();
  await yieldToBrowser();
  return Boolean(cancellation?.signal?.aborted || cancellation?.isCancelled?.());
}
