import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { isBlockLocked } from '../../editor/groups/group-membership';
import { nextGroupId, uniqueGroupName } from '../../editor/groups/group-naming';
import type { ProjectDocument, PlacedBlock, ProjectGroup } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { projectBlockEntityDataFromStructureJson, type StructureJsonBlock, type StructureJsonDecoration, type StructureJson } from './structure-json';
import { validateStructureJsonDecorations, validateStructureJsonDecorationsAsync, type StructureJsonValidationCancellation, type StructureJsonValidationOptions, type StructureJsonValidationPreview } from './structure-json-import';
import { findCurrentConflicts, findCurrentConflictsAsync, findDecorationConflicts, findDecorationConflictsAsync } from './structure-json-import-conflicts';
import type { StructureJsonDecorationConflict, StructureJsonProjectConflict } from './structure-json-import-conflicts';
export type { StructureJsonDecorationConflict, StructureJsonProjectConflict } from './structure-json-import-conflicts';
import { CooperativeWorkBudget, yieldToBrowser } from '../../assets/cooperative-yield';

export type StructureJsonImportMode = 'replace' | 'merge' | 'new-group';
export type StructureJsonImportBlockerCode = 'structural-invalid' | 'out-of-bounds' | 'invalid-state' | 'duplicate-coordinate' | 'content-limit' | 'missing-support' | 'locked-current-blocks' | 'locked-current-decorations' | 'existing-coordinate-conflict' | 'decoration-conflict' | 'invalid-decoration' | 'empty-import';
export interface StructureJsonImportBlocker { readonly code: StructureJsonImportBlockerCode; readonly count?: number; }
export interface StructureJsonImportGroupPreview { readonly id: string; readonly name: string; }

export interface StructureJsonImportPlan {
  readonly mode: StructureJsonImportMode;
  readonly source: StructureJson;
  readonly importedBlocks: readonly PlacedBlock[];
  readonly importedDecorations: readonly PlacedDecoration[];
  readonly importedBlockCount: number;
  readonly resolvedBlockCount: number;
  readonly missingBlockCount: number;
  readonly importedDecorationCount: number;
  readonly validDecorationCount: number;
  readonly missingDecorationAssetCount: number;
  readonly decorationIssues: readonly StructureJsonValidationPreview['decorationIssues'][number][];
  readonly currentConflictCount: number;
  readonly currentConflicts: readonly StructureJsonProjectConflict[];
  readonly decorationConflictCount: number;
  readonly decorationConflicts: readonly StructureJsonDecorationConflict[];
  readonly blockingIssues: readonly StructureJsonImportBlocker[];
  readonly newGroup?: StructureJsonImportGroupPreview;
  readonly applicable: boolean;
  readonly emptyImport: boolean;
  /** Ephemeral freshness anchor; never serialized into project data. */
  readonly baseProject: ProjectDocument;
}

export interface StructureJsonImportPlanBuildOptions {
  readonly cancellation?: StructureJsonValidationCancellation;
  readonly onProgress?: (stage: 'blocks' | 'decorations' | 'conflicts' | 'locks', completed: number, total: number) => void;
}

export function buildStructureJsonImportPlan(source: StructureJson, validation: StructureJsonValidationPreview, project: ProjectDocument, getDefinition: (id: string) => BlockDefinition | undefined, mode: StructureJsonImportMode, fallbackGroupName = 'Imported Structure', validationOptions?: StructureJsonValidationOptions): StructureJsonImportPlan {
  const importedBlocks = source.blocks.map((block) => toPlacedBlock(block, getDefinition(block.id)));
  const usedDecorationIds = new Set((project.decorations ?? []).map((entry) => entry.instanceId));
  const importedDecorations = source.decorations.map((decoration, index) => toPlacedDecoration(decoration, index, usedDecorationIds));
  const decorationValidationProject = mode === 'replace'
    ? { ...project, blocks: importedBlocks, decorations: [] }
    : { ...project, blocks: [...project.blocks, ...importedBlocks] };
  const decorationValidation = validateStructureJsonDecorations(source, decorationValidationProject, validationOptions);
  const blockers: StructureJsonImportBlocker[] = [];
  if (!validation.structuralValid) blockers.push({ code: 'structural-invalid' });
  if (validation.outOfBounds > 0) blockers.push({ code: 'out-of-bounds', count: validation.outOfBounds });
  if (validation.invalidStates > 0) blockers.push({ code: 'invalid-state', count: validation.invalidStates });
  if (validation.duplicateCoordinates > 0) blockers.push({ code: 'duplicate-coordinate', count: validation.duplicateCoordinates });
  const contentLimitCount = validation.issues.contentLimit.length + decorationValidation.decorationIssues.filter((issue) => issue.category === 'content-limit').length;
  if (contentLimitCount > 0) blockers.push({ code: 'content-limit', count: contentLimitCount });
  if (validation.issues.support.length > 0) blockers.push({ code: 'missing-support', count: validation.issues.support.length });
  if (decorationValidation.invalidDecorations > 0) blockers.push({ code: 'invalid-decoration', count: decorationValidation.invalidDecorations });
  const currentConflicts = mode === 'replace' ? [] : findCurrentConflicts(source.blocks, project);
  if (currentConflicts.length > 0) blockers.push({ code: 'existing-coordinate-conflict', count: currentConflicts.length });
  const decorationConflicts = mode === 'replace' ? [] : findDecorationConflicts(importedBlocks, importedDecorations, project);
  if (decorationConflicts.length > 0) blockers.push({ code: 'decoration-conflict', count: decorationConflicts.length });
  if (mode === 'replace') {
    const lockedCount = project.blocks.filter((block) => isBlockLocked(block, project.groups)).length;
    const lockedDecorations = (project.decorations ?? []).filter((decoration) => decoration.groupIds?.some((id) => project.groups.find((group) => group.id === id)?.locked)).length;
    if (lockedCount > 0) blockers.push({ code: 'locked-current-blocks', count: lockedCount });
    if (lockedDecorations > 0) blockers.push({ code: 'locked-current-decorations', count: lockedDecorations });
  }
  if (source.blocks.length === 0 && importedDecorations.length === 0 && mode !== 'replace') blockers.push({ code: 'empty-import' });
  const newGroup = mode === 'new-group' ? { id: nextGroupId(project.groups), name: uniqueGroupName(source.name ?? '', project.groups, fallbackGroupName) } : undefined;
  return { mode, source, importedBlocks, importedDecorations, importedBlockCount: importedBlocks.length, resolvedBlockCount: importedBlocks.filter((block) => block.kind === 'resolved').length, missingBlockCount: importedBlocks.filter((block) => block.kind === 'missing').length, importedDecorationCount: importedDecorations.length, validDecorationCount: decorationValidation.validDecorations, missingDecorationAssetCount: decorationValidation.missingDecorationAssets, decorationIssues: decorationValidation.decorationIssues, currentConflictCount: currentConflicts.length, currentConflicts, decorationConflictCount: decorationConflicts.length, decorationConflicts, blockingIssues: blockers, newGroup, applicable: blockers.length === 0, emptyImport: source.blocks.length === 0 && importedDecorations.length === 0, baseProject: project };
}

/** Cooperative counterpart used by the interactive import dialog for large sources. */
export async function buildStructureJsonImportPlanAsync(source: StructureJson, validation: StructureJsonValidationPreview, project: ProjectDocument, getDefinition: (id: string) => BlockDefinition | undefined, mode: StructureJsonImportMode, fallbackGroupName = 'Imported Structure', validationOptions?: StructureJsonValidationOptions, options?: StructureJsonImportPlanBuildOptions): Promise<StructureJsonImportPlan | undefined> {
  const cancellation = options?.cancellation;
  const budget = new CooperativeWorkBudget(8, 4096);
  const importedBlocks: PlacedBlock[] = [];
  for (let index = 0; index < source.blocks.length; index += 1) {
    importedBlocks.push(toPlacedBlock(source.blocks[index], getDefinition(source.blocks[index].id)));
    options?.onProgress?.('blocks', index + 1, source.blocks.length);
    if (await planCheckpoint(budget, index + 1, cancellation)) return undefined;
  }
  const usedDecorationIds = new Set((project.decorations ?? []).map((entry) => entry.instanceId));
  const importedDecorations: PlacedDecoration[] = [];
  for (let index = 0; index < source.decorations.length; index += 1) {
    importedDecorations.push(toPlacedDecoration(source.decorations[index], index, usedDecorationIds));
    options?.onProgress?.('decorations', index + 1, source.decorations.length);
    if (await planCheckpoint(budget, index + 1, cancellation)) return undefined;
  }
  const decorationValidationProject = mode === 'replace' ? { ...project, blocks: importedBlocks, decorations: [] } : { ...project, blocks: [...project.blocks, ...importedBlocks] };
  const decorationValidation = await validateStructureJsonDecorationsAsync(source, decorationValidationProject, validationOptions, cancellation);
  if (!decorationValidation) return undefined;
  const blockers: StructureJsonImportBlocker[] = [];
  if (!validation.structuralValid) blockers.push({ code: 'structural-invalid' });
  if (validation.outOfBounds > 0) blockers.push({ code: 'out-of-bounds', count: validation.outOfBounds });
  if (validation.invalidStates > 0) blockers.push({ code: 'invalid-state', count: validation.invalidStates });
  if (validation.duplicateCoordinates > 0) blockers.push({ code: 'duplicate-coordinate', count: validation.duplicateCoordinates });
  const contentLimitCount = validation.issues.contentLimit.length + decorationValidation.decorationIssues.filter((issue) => issue.category === 'content-limit').length;
  if (contentLimitCount > 0) blockers.push({ code: 'content-limit', count: contentLimitCount });
  if (validation.issues.support.length > 0) blockers.push({ code: 'missing-support', count: validation.issues.support.length });
  if (decorationValidation.invalidDecorations > 0) blockers.push({ code: 'invalid-decoration', count: decorationValidation.invalidDecorations });
  const currentConflicts = mode === 'replace' ? [] : await findCurrentConflictsAsync(source.blocks, project, cancellation, (completed, total) => options?.onProgress?.('conflicts', completed, total));
  if (!currentConflicts) return undefined;
  if (currentConflicts.length > 0) blockers.push({ code: 'existing-coordinate-conflict', count: currentConflicts.length });
  const decorationConflicts = mode === 'replace' ? [] : await findDecorationConflictsAsync(importedBlocks, importedDecorations, project, cancellation, (completed, total) => options?.onProgress?.('conflicts', completed, total));
  if (!decorationConflicts) return undefined;
  if (decorationConflicts.length > 0) blockers.push({ code: 'decoration-conflict', count: decorationConflicts.length });
  let lockedCount = 0;
  let lockedDecorations = 0;
  if (mode === 'replace') {
    const lockedGroups = new Set(project.groups.filter((group) => group.locked).map((group) => group.id));
    for (let index = 0; index < project.blocks.length; index += 1) {
      if (isBlockLocked(project.blocks[index], project.groups)) lockedCount += 1;
      options?.onProgress?.('locks', index + 1, project.blocks.length + (project.decorations ?? []).length);
      if (await planCheckpoint(budget, index + 1, cancellation)) return undefined;
    }
    for (let index = 0; index < (project.decorations ?? []).length; index += 1) {
      if ((project.decorations?.[index].groupIds ?? []).some((id) => lockedGroups.has(id))) lockedDecorations += 1;
      options?.onProgress?.('locks', project.blocks.length + index + 1, project.blocks.length + (project.decorations ?? []).length);
      if (await planCheckpoint(budget, project.blocks.length + index + 1, cancellation)) return undefined;
    }
    if (lockedCount > 0) blockers.push({ code: 'locked-current-blocks', count: lockedCount });
    if (lockedDecorations > 0) blockers.push({ code: 'locked-current-decorations', count: lockedDecorations });
  }
  if (source.blocks.length === 0 && importedDecorations.length === 0 && mode !== 'replace') blockers.push({ code: 'empty-import' });
  const newGroup = mode === 'new-group' ? { id: nextGroupId(project.groups), name: uniqueGroupName(source.name ?? '', project.groups, fallbackGroupName) } : undefined;
  return { mode, source, importedBlocks, importedDecorations, importedBlockCount: importedBlocks.length, resolvedBlockCount: importedBlocks.filter((block) => block.kind === 'resolved').length, missingBlockCount: importedBlocks.filter((block) => block.kind === 'missing').length, importedDecorationCount: importedDecorations.length, validDecorationCount: decorationValidation.validDecorations, missingDecorationAssetCount: decorationValidation.missingDecorationAssets, decorationIssues: decorationValidation.decorationIssues, currentConflictCount: currentConflicts.length, currentConflicts, decorationConflictCount: decorationConflicts.length, decorationConflicts, blockingIssues: blockers, newGroup, applicable: blockers.length === 0, emptyImport: source.blocks.length === 0 && importedDecorations.length === 0, baseProject: project };
}

export function applyStructureJsonImportPlan(current: ProjectDocument, plan: StructureJsonImportPlan, getDefinition: (id: string) => BlockDefinition | undefined, fallbackGroupName = 'Imported Structure'): ProjectDocument | undefined {
  if (current !== plan.baseProject || !plan.applicable) return undefined;
  return prepareStructureJsonImportPlan(current, plan, fallbackGroupName);
}

export function prepareStructureJsonImportPlan(current: ProjectDocument, plan: StructureJsonImportPlan, fallbackGroupName = 'Imported Structure'): ProjectDocument | undefined {
  if (current !== plan.baseProject || !plan.applicable) return undefined;
  if (plan.emptyImport && plan.mode !== 'replace') return undefined;
  if (plan.emptyImport && plan.mode === 'replace' && current.blocks.length === 0 && (current.decorations ?? []).length === 0) return undefined;
  const updatedAt = new Date().toISOString();
  if (plan.mode === 'replace') return { ...current, blocks: plan.importedBlocks, decorations: plan.importedDecorations, metadata: { ...current.metadata, updatedAt } };
  if (plan.mode === 'merge') return { ...current, blocks: [...current.blocks, ...plan.importedBlocks], decorations: [...(current.decorations ?? []), ...plan.importedDecorations], metadata: { ...current.metadata, updatedAt } };
  if (!plan.newGroup) return undefined;
  const group: ProjectGroup = { id: plan.newGroup.id, name: plan.newGroup.name, visible: true, locked: false };
  const blocks = plan.importedBlocks.map((block) => ({ ...block, groupIds: [group.id] }));
  const decorations = plan.importedDecorations.map((decoration) => ({ ...decoration, groupIds: [group.id] }));
  return { ...current, blocks: [...current.blocks, ...blocks], decorations: [...(current.decorations ?? []), ...decorations], groups: [...current.groups, group], metadata: { ...current.metadata, updatedAt } };
}

function toPlacedBlock(block: StructureJsonBlock, definition: BlockDefinition | undefined): PlacedBlock { const position = { x: block.x, y: block.y, z: block.z }; const blockEntityData = block.blockEntity ? projectBlockEntityDataFromStructureJson(block.blockEntity, block.id, definition) : undefined; return definition ? { kind: 'resolved', id: block.id, namespace: definition.namespace, position, state: { ...definition.defaultState, ...(block.state ?? {}) }, ...(blockEntityData ? { blockEntityData } : {}) } : { kind: 'missing', id: block.id, namespace: namespaceOf(block.id), position, state: { ...(block.state ?? {}) }, ...(blockEntityData ? { blockEntityData } : {}) }; }
function toPlacedDecoration(decoration: StructureJsonDecoration, index: number, usedIds: Set<string>): PlacedDecoration {
  const instanceId = nextDecorationId(index, usedIds);
  usedIds.add(instanceId);
  if (decoration.kind === 'painting') return { instanceId, kind: 'painting', entityTypeId: 'minecraft:painting', anchor: decoration.anchor, facing: decoration.facing, variantId: decoration.variantId };
  return { instanceId, kind: decoration.kind, entityTypeId: decoration.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow_item_frame', anchor: decoration.anchor, facing: decoration.facing, ...(decoration.item ? { item: { id: decoration.item.id, count: decoration.item.count ?? 1, ...(decoration.item.components === undefined ? {} : { components: decoration.item.components }) } } : {}), ...(decoration.rotation === undefined ? {} : { rotation: decoration.rotation as PlacedDecoration['rotation'] }), ...(decoration.invisible === undefined ? {} : { invisible: decoration.invisible }), ...(decoration.fixed === undefined ? {} : { fixed: decoration.fixed }), ...(decoration.itemDropChance === undefined ? {} : { itemDropChance: decoration.itemDropChance }) };
}
function nextDecorationId(index: number, used: ReadonlySet<string>): string { let id = `imported-decoration-${index + 1}`; let suffix = 2; while (used.has(id)) id = `imported-decoration-${index + 1}-${suffix++}`; return id; }
async function planCheckpoint(budget: CooperativeWorkBudget, processed: number, cancellation?: StructureJsonValidationCancellation): Promise<boolean> {
  if (cancellation?.signal?.aborted || cancellation?.isCancelled?.()) return true;
  if (!budget.shouldYieldNow()) return false;
  budget.reset(); await yieldToBrowser();
  return Boolean(cancellation?.signal?.aborted || cancellation?.isCancelled?.());
}
function namespaceOf(id: string): string { const separator = id.indexOf(':'); return separator > 0 ? id.slice(0, separator) : 'unknown'; }
