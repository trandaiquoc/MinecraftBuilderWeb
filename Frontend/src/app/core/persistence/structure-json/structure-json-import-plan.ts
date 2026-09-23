import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { isBlockLocked } from '../../editor/groups/group-membership';
import { nextGroupId, uniqueGroupName } from '../../editor/groups/group-naming';
import { coordinateKey } from '../../domain/coordinates';
import type { ProjectDocument, PlacedBlock, ProjectGroup, VoxelCoordinate } from '../../domain/project.types';
import { decorationAabb, decorationOverlaps, directionVector } from '../../decorations/placement/decoration-placement';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import type { StructureJsonBlockV1, StructureJsonDecorationV2, StructureJsonDocument } from './structure-json';
import { validateParsedStructureJsonPreview, type StructureJsonValidationPreview } from './structure-json-import';

export type StructureJsonImportMode = 'replace' | 'merge' | 'new-group';
export type StructureJsonImportBlockerCode = 'structural-invalid' | 'out-of-bounds' | 'invalid-state' | 'duplicate-coordinate' | 'locked-current-blocks' | 'locked-current-decorations' | 'existing-coordinate-conflict' | 'decoration-conflict' | 'invalid-decoration' | 'empty-import';
export interface StructureJsonImportBlocker { readonly code: StructureJsonImportBlockerCode; readonly count?: number; }
export interface StructureJsonProjectConflict { readonly coordinate: VoxelCoordinate; readonly importedIndexes: readonly number[]; readonly existingBlockIds: readonly string[]; }
export interface StructureJsonDecorationConflict { readonly importedIndex: number; readonly kind: StructureJsonDecorationV2['kind']; readonly anchor: VoxelCoordinate; readonly reason: 'block' | 'decoration'; readonly existingId?: string; }
export interface StructureJsonImportGroupPreview { readonly id: string; readonly name: string; }

export interface StructureJsonImportPlan {
  readonly mode: StructureJsonImportMode;
  readonly source: StructureJsonDocument;
  readonly importedBlocks: readonly PlacedBlock[];
  readonly importedDecorations: readonly PlacedDecoration[];
  readonly importedBlockCount: number;
  readonly resolvedBlockCount: number;
  readonly missingBlockCount: number;
  readonly importedDecorationCount: number;
  readonly missingDecorationAssetCount: number;
  readonly currentConflictCount: number;
  readonly currentConflicts: readonly StructureJsonProjectConflict[];
  readonly decorationConflictCount: number;
  readonly decorationConflicts: readonly StructureJsonDecorationConflict[];
  readonly blockingIssues: readonly StructureJsonImportBlocker[];
  readonly newGroup?: StructureJsonImportGroupPreview;
  readonly applicable: boolean;
  readonly emptyImport: boolean;
}

export function buildStructureJsonImportPlan(source: StructureJsonDocument, validation: StructureJsonValidationPreview, project: ProjectDocument, getDefinition: (id: string) => BlockDefinition | undefined, mode: StructureJsonImportMode, fallbackGroupName = 'Imported Structure'): StructureJsonImportPlan {
  const importedBlocks = source.blocks.map((block) => toPlacedBlock(block, getDefinition(block.id)));
  const importedDecorations = source.formatVersion === 2 ? source.decorations.map((decoration, index) => toPlacedDecoration(decoration, index, project.decorations ?? [])) : [];
  const blockers: StructureJsonImportBlocker[] = [];
  if (!validation.structuralValid) blockers.push({ code: 'structural-invalid' });
  if (validation.outOfBounds > 0) blockers.push({ code: 'out-of-bounds', count: validation.outOfBounds });
  if (validation.invalidStates > 0) blockers.push({ code: 'invalid-state', count: validation.invalidStates });
  if (validation.duplicateCoordinates > 0) blockers.push({ code: 'duplicate-coordinate', count: validation.duplicateCoordinates });
  if (validation.invalidDecorations > 0) blockers.push({ code: 'invalid-decoration', count: validation.invalidDecorations });
  const currentConflicts = mode === 'replace' ? [] : findCurrentConflicts(source.blocks, project);
  if (currentConflicts.length > 0) blockers.push({ code: 'existing-coordinate-conflict', count: currentConflicts.length });
  const decorationConflicts = mode === 'replace' ? [] : findDecorationConflicts(importedBlocks, importedDecorations, project);
  if (decorationConflicts.length > 0) blockers.push({ code: 'decoration-conflict', count: decorationConflicts.length });
  if (mode === 'replace') {
    const lockedCount = project.blocks.filter((block) => isBlockLocked(block, project.groups)).length;
    const lockedDecorations = (project.decorations ?? []).filter((decoration) => decoration.groupIds?.some((id) => project.groups.find((group) => group.id === id)?.locked)).length;
    if (lockedCount > 0) blockers.push({ code: 'locked-current-blocks', count: lockedCount });
    if (lockedDecorations > 0 && source.formatVersion === 2) blockers.push({ code: 'locked-current-decorations', count: lockedDecorations });
  }
  if (source.blocks.length === 0 && importedDecorations.length === 0 && mode !== 'replace') blockers.push({ code: 'empty-import' });
  const newGroup = mode === 'new-group' ? { id: nextGroupId(project.groups), name: uniqueGroupName(source.name ?? '', project.groups, fallbackGroupName) } : undefined;
  return { mode, source, importedBlocks, importedDecorations, importedBlockCount: importedBlocks.length, resolvedBlockCount: importedBlocks.filter((block) => block.kind === 'resolved').length, missingBlockCount: importedBlocks.filter((block) => block.kind === 'missing').length, importedDecorationCount: importedDecorations.length, missingDecorationAssetCount: validation.missingDecorationAssets, currentConflictCount: currentConflicts.length, currentConflicts, decorationConflictCount: decorationConflicts.length, decorationConflicts, blockingIssues: blockers, newGroup, applicable: blockers.length === 0, emptyImport: source.blocks.length === 0 && importedDecorations.length === 0 };
}

export function applyStructureJsonImportPlan(current: ProjectDocument, plan: StructureJsonImportPlan, getDefinition: (id: string) => BlockDefinition | undefined, fallbackGroupName = 'Imported Structure'): ProjectDocument | undefined {
  // Validate decorations against the layout they will actually occupy. This keeps
  // imported paintings/frames from being rejected simply because their support
  // block is part of the same import operation.
  const seedValidation = validateParsedStructureJsonPreview(plan.source, current.size, getDefinition, undefined, current);
  const seedPlan = buildStructureJsonImportPlan(plan.source, seedValidation, current, getDefinition, plan.mode, fallbackGroupName);
  const candidateBlocks = plan.mode === 'replace' ? seedPlan.importedBlocks : [...current.blocks, ...seedPlan.importedBlocks];
  const candidateDecorations = plan.mode === 'replace' ? [] : (current.decorations ?? []);
  const validation = validateParsedStructureJsonPreview(plan.source, current.size, getDefinition, undefined, { ...current, blocks: candidateBlocks, decorations: candidateDecorations });
  const freshPlan = buildStructureJsonImportPlan(plan.source, validation, current, getDefinition, plan.mode, fallbackGroupName);
  if (!freshPlan.applicable || freshPlan.mode !== plan.mode) return undefined;
  if (freshPlan.emptyImport && freshPlan.mode !== 'replace') return undefined;
  if (freshPlan.emptyImport && freshPlan.mode === 'replace' && current.blocks.length === 0 && (current.decorations ?? []).length === 0) return undefined;
  const updatedAt = new Date().toISOString();
  if (freshPlan.mode === 'replace') return { ...current, blocks: freshPlan.importedBlocks, decorations: freshPlan.source.formatVersion === 2 ? freshPlan.importedDecorations : current.decorations, metadata: { ...current.metadata, updatedAt } };
  if (freshPlan.mode === 'merge') return { ...current, blocks: [...current.blocks, ...freshPlan.importedBlocks], decorations: [...(current.decorations ?? []), ...freshPlan.importedDecorations], metadata: { ...current.metadata, updatedAt } };
  if (!freshPlan.newGroup) return undefined;
  const group: ProjectGroup = { id: freshPlan.newGroup.id, name: freshPlan.newGroup.name, visible: true, locked: false };
  const blocks = freshPlan.importedBlocks.map((block) => ({ ...block, groupIds: [group.id] }));
  const decorations = freshPlan.importedDecorations.map((decoration) => ({ ...decoration, groupIds: [group.id] }));
  return { ...current, blocks: [...current.blocks, ...blocks], decorations: [...(current.decorations ?? []), ...decorations], groups: [...current.groups, group], metadata: { ...current.metadata, updatedAt } };
}

function toPlacedBlock(block: StructureJsonBlockV1, definition: BlockDefinition | undefined): PlacedBlock { const position = { x: block.x, y: block.y, z: block.z }; return definition ? { kind: 'resolved', id: block.id, namespace: definition.namespace, position, state: { ...definition.defaultState, ...(block.state ?? {}) } } : { kind: 'missing', id: block.id, namespace: namespaceOf(block.id), position, state: { ...(block.state ?? {}) } }; }
function toPlacedDecoration(decoration: StructureJsonDecorationV2, index: number, existing: readonly PlacedDecoration[]): PlacedDecoration {
  const instanceId = nextDecorationId(index, existing);
  if (decoration.kind === 'painting') return { instanceId, kind: 'painting', entityTypeId: 'minecraft:painting', anchor: decoration.anchor, facing: decoration.facing, variantId: decoration.variantId };
  return { instanceId, kind: decoration.kind, entityTypeId: decoration.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow_item_frame', anchor: decoration.anchor, facing: decoration.facing, ...(decoration.item ? { item: { id: decoration.item.id, count: decoration.item.count ?? 1, ...(decoration.item.components === undefined ? {} : { components: decoration.item.components }) } } : {}), ...(decoration.rotation === undefined ? {} : { rotation: decoration.rotation as PlacedDecoration['rotation'] }), ...(decoration.invisible === undefined ? {} : { invisible: decoration.invisible }), ...(decoration.fixed === undefined ? {} : { fixed: decoration.fixed }), ...(decoration.itemDropChance === undefined ? {} : { itemDropChance: decoration.itemDropChance }) };
}
function nextDecorationId(index: number, existing: readonly PlacedDecoration[]): string { const used = new Set(existing.map((entry) => entry.instanceId)); let id = `imported-decoration-${index + 1}`; let suffix = 2; while (used.has(id)) id = `imported-decoration-${index + 1}-${suffix++}`; return id; }
function findCurrentConflicts(imported: readonly StructureJsonBlockV1[], project: ProjectDocument): readonly StructureJsonProjectConflict[] { const existing = new Map<string, string[]>(); for (const block of project.blocks) { const key = coordinateKey(block.position); existing.set(key, [...(existing.get(key) ?? []), block.id]); } const importedAt = new Map<string, { readonly coordinate: VoxelCoordinate; readonly indexes: number[] }>(); for (let index = 0; index < imported.length; index += 1) { const block = imported[index]; const coordinate = { x: block.x, y: block.y, z: block.z }; const key = coordinateKey(coordinate); const entry = importedAt.get(key) ?? { coordinate, indexes: [] }; entry.indexes.push(index); importedAt.set(key, entry); } const conflicts: StructureJsonProjectConflict[] = []; for (const [key, entry] of importedAt) { const existingIds = existing.get(key); if (existingIds) conflicts.push({ coordinate: entry.coordinate, importedIndexes: entry.indexes, existingBlockIds: existingIds }); } return conflicts; }
function findDecorationConflicts(importedBlocks: readonly PlacedBlock[], importedDecorations: readonly PlacedDecoration[], project: ProjectDocument): readonly StructureJsonDecorationConflict[] { const conflicts: StructureJsonDecorationConflict[] = []; const currentDecorations = project.decorations ?? []; for (let index = 0; index < importedDecorations.length; index += 1) { const decoration = importedDecorations[index]; const box = decorationAabb(decoration); if (project.blocks.some((block) => intersectsBlock(box, block.position))) conflicts.push({ importedIndex: index, kind: decoration.kind, anchor: decoration.anchor, reason: 'block' }); const existing = currentDecorations.find((other) => decorationOverlaps(box, decorationAabb(other))); if (existing) conflicts.push({ importedIndex: index, kind: decoration.kind, anchor: decoration.anchor, reason: 'decoration', existingId: existing.instanceId }); } for (const block of importedBlocks) { if (currentDecorations.some((decoration) => intersectsBlock(decorationAabb(decoration), block.position))) conflicts.push({ importedIndex: -1, kind: 'item-frame', anchor: block.position, reason: 'block' }); } for (let left = 0; left < importedDecorations.length; left += 1) for (let right = left + 1; right < importedDecorations.length; right += 1) if (decorationOverlaps(decorationAabb(importedDecorations[left]), decorationAabb(importedDecorations[right]))) conflicts.push({ importedIndex: right, kind: importedDecorations[right].kind, anchor: importedDecorations[right].anchor, reason: 'decoration', existingId: importedDecorations[left].instanceId }); return conflicts; }
function intersectsBlock(box: ReturnType<typeof decorationAabb>, position: VoxelCoordinate): boolean { return box.min.x < position.x + 1 && box.max.x > position.x && box.min.y < position.y + 1 && box.max.y > position.y && box.min.z < position.z + 1 && box.max.z > position.z; }
function namespaceOf(id: string): string { const separator = id.indexOf(':'); return separator > 0 ? id.slice(0, separator) : 'unknown'; }
