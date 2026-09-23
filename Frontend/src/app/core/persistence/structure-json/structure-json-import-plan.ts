import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { isBlockLocked } from '../../editor/groups/group-membership';
import { nextGroupId, uniqueGroupName } from '../../editor/groups/group-naming';
import type { ProjectDocument, PlacedBlock, ProjectGroup, VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';
import type { StructureJsonBlockV1, StructureJsonV1 } from './structure-json';
import { validateParsedStructureJsonPreview, type StructureJsonValidationPreview } from './structure-json-import';

export type StructureJsonImportMode = 'replace' | 'merge' | 'new-group';

export type StructureJsonImportBlockerCode =
  | 'structural-invalid'
  | 'out-of-bounds'
  | 'invalid-state'
  | 'duplicate-coordinate'
  | 'locked-current-blocks'
  | 'existing-coordinate-conflict'
  | 'empty-import';

export interface StructureJsonImportBlocker {
  readonly code: StructureJsonImportBlockerCode;
  readonly count?: number;
}

export interface StructureJsonProjectConflict {
  readonly coordinate: VoxelCoordinate;
  readonly importedIndexes: readonly number[];
  readonly existingBlockIds: readonly string[];
}

export interface StructureJsonImportGroupPreview {
  readonly id: string;
  readonly name: string;
}

export interface StructureJsonImportPlan {
  readonly mode: StructureJsonImportMode;
  readonly source: StructureJsonV1;
  readonly importedBlocks: readonly PlacedBlock[];
  readonly importedBlockCount: number;
  readonly resolvedBlockCount: number;
  readonly missingBlockCount: number;
  readonly currentConflictCount: number;
  readonly currentConflicts: readonly StructureJsonProjectConflict[];
  readonly blockingIssues: readonly StructureJsonImportBlocker[];
  readonly newGroup?: StructureJsonImportGroupPreview;
  readonly applicable: boolean;
  readonly emptyImport: boolean;
}

export function buildStructureJsonImportPlan(
  source: StructureJsonV1,
  validation: StructureJsonValidationPreview,
  project: ProjectDocument,
  getDefinition: (id: string) => BlockDefinition | undefined,
  mode: StructureJsonImportMode,
  fallbackGroupName = 'Imported Structure',
): StructureJsonImportPlan {
  const importedBlocks = source.blocks.map((block) => toPlacedBlock(block, getDefinition(block.id)));
  const blockers: StructureJsonImportBlocker[] = [];
  if (!validation.structuralValid) blockers.push({ code: 'structural-invalid' });
  if (validation.outOfBounds > 0) blockers.push({ code: 'out-of-bounds', count: validation.outOfBounds });
  if (validation.invalidStates > 0) blockers.push({ code: 'invalid-state', count: validation.invalidStates });
  if (validation.duplicateCoordinates > 0) blockers.push({ code: 'duplicate-coordinate', count: validation.duplicateCoordinates });

  const currentConflicts = mode === 'replace' ? [] : findCurrentConflicts(source.blocks, project);
  if (currentConflicts.length > 0) blockers.push({ code: 'existing-coordinate-conflict', count: currentConflicts.length });
  if (mode === 'replace') {
    const lockedCount = project.blocks.filter((block) => isBlockLocked(block, project.groups)).length;
    if (lockedCount > 0) blockers.push({ code: 'locked-current-blocks', count: lockedCount });
  }
  if (source.blocks.length === 0 && mode !== 'replace') blockers.push({ code: 'empty-import' });

  const newGroup = mode === 'new-group'
    ? { id: nextGroupId(project.groups), name: uniqueGroupName(source.name ?? '', project.groups, fallbackGroupName) }
    : undefined;
  return {
    mode,
    source,
    importedBlocks,
    importedBlockCount: importedBlocks.length,
    resolvedBlockCount: importedBlocks.filter((block) => block.kind === 'resolved').length,
    missingBlockCount: importedBlocks.filter((block) => block.kind === 'missing').length,
    currentConflictCount: currentConflicts.length,
    currentConflicts,
    blockingIssues: blockers,
    newGroup,
    applicable: blockers.length === 0,
    emptyImport: source.blocks.length === 0,
  };
}

/** Revalidates against the current document before producing the atomic history result. */
export function applyStructureJsonImportPlan(
  current: ProjectDocument,
  plan: StructureJsonImportPlan,
  getDefinition: (id: string) => BlockDefinition | undefined,
  fallbackGroupName = 'Imported Structure',
): ProjectDocument | undefined {
  const validation = validateParsedStructureJsonPreview(plan.source, current.size, getDefinition);
  const freshPlan = buildStructureJsonImportPlan(plan.source, validation, current, getDefinition, plan.mode, fallbackGroupName);
  if (!freshPlan.applicable || (freshPlan.mode !== plan.mode)) return undefined;
  if (freshPlan.mode !== 'replace' && freshPlan.importedBlockCount === 0) return undefined;
  if (freshPlan.mode === 'replace' && freshPlan.importedBlockCount === 0 && current.blocks.length === 0) return undefined;
  const updatedAt = new Date().toISOString();
  if (freshPlan.mode === 'replace') return { ...current, blocks: freshPlan.importedBlocks, metadata: { ...current.metadata, updatedAt } };
  if (freshPlan.mode === 'merge') return { ...current, blocks: [...current.blocks, ...freshPlan.importedBlocks], metadata: { ...current.metadata, updatedAt } };
  if (!freshPlan.newGroup) return undefined;
  const group: ProjectGroup = { id: freshPlan.newGroup.id, name: freshPlan.newGroup.name, visible: true, locked: false };
  const blocks = freshPlan.importedBlocks.map((block) => ({ ...block, groupIds: [group.id] }));
  return { ...current, blocks: [...current.blocks, ...blocks], groups: [...current.groups, group], metadata: { ...current.metadata, updatedAt } };
}

function toPlacedBlock(block: StructureJsonBlockV1, definition: BlockDefinition | undefined): PlacedBlock {
  const position = { x: block.x, y: block.y, z: block.z };
  if (!definition) return { kind: 'missing', id: block.id, namespace: namespaceOf(block.id), position, state: { ...(block.state ?? {}) } };
  return { kind: 'resolved', id: block.id, namespace: definition.namespace, position, state: { ...definition.defaultState, ...(block.state ?? {}) } };
}

function findCurrentConflicts(imported: readonly StructureJsonBlockV1[], project: ProjectDocument): readonly StructureJsonProjectConflict[] {
  const existing = new Map<string, string[]>();
  for (const block of project.blocks) {
    const key = coordinateKey(block.position); const ids = existing.get(key) ?? []; ids.push(block.id); existing.set(key, ids);
  }
  const importedAt = new Map<string, { readonly coordinate: VoxelCoordinate; readonly indexes: number[] }>();
  for (let index = 0; index < imported.length; index += 1) {
    const block = imported[index]; const coordinate = { x: block.x, y: block.y, z: block.z }; const key = coordinateKey(coordinate); const entry = importedAt.get(key) ?? { coordinate, indexes: [] };
    entry.indexes.push(index); importedAt.set(key, entry);
  }
  const conflicts: StructureJsonProjectConflict[] = [];
  for (const [key, entry] of importedAt) {
    const existingIds = existing.get(key);
    if (existingIds) conflicts.push({ coordinate: entry.coordinate, importedIndexes: entry.indexes, existingBlockIds: existingIds });
  }
  return conflicts;
}

function namespaceOf(id: string): string {
  const separator = id.indexOf(':');
  return separator > 0 ? id.slice(0, separator) : 'unknown';
}
