import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import type { ProjectDocument, ProjectSize } from '../../domain/project.types';
import { CooperativeWorkBudget } from '../../assets/cooperative-yield';
import { collectDuplicateCoordinates, createCoordinateConflictAccumulator, finalizeCoordinateConflicts, recordCoordinate } from './coordinate-conflict-validation';
import { validateBlockEntry } from './block-entry-validation';
import { normalizeValidationContentLimits } from './structure-json-content-limits';
import { validateDecorations, validateDecorationsAsync, validateStructureJsonDecorations, validateStructureJsonDecorationsAsync } from './decoration-validation';
import { appendSupportAndWarnings, appendSupportAndWarningsAsync } from './support-warning-validation';
import { cooperativeValidationCheckpoint, isStructureJsonValidationCancelled } from './structure-json-validation-scheduling';
import { emptyStructureJsonIssues, emptyStructureJsonPreview } from './structure-json-validation.types';
import type { NormalizedValidationContentLimits, StructureJsonValidationCancellation, StructureJsonValidationOptions, StructureJsonValidationPreview } from './structure-json-validation.types';
import { parseStructureJson } from './structure-json';
import type { StructureJson } from './structure-json';
import type { ItemMaxStackResolver } from '../../items/item-stack-validation';

export type { StructureJsonBlockIssue, StructureJsonCoordinateConflict, StructureJsonDecorationIssue, StructureJsonDecorationIssueCategory, StructureJsonIssueCategory, StructureJsonIssueReason, StructureJsonValidationCancellation, StructureJsonValidationOptions, StructureJsonValidationPreview, StructureJsonWorkerRequest, StructureJsonWorkerResponse } from './structure-json-validation.types';
export { parseStructureJsonWithWorker } from './structure-json-worker-parser';
export const STRUCTURE_JSON_VALIDATION_CHUNK_SIZE = 256;

export function validateStructureJsonPreview(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument, resolveMaxStackSize?: ItemMaxStackResolver, options?: StructureJsonValidationOptions): StructureJsonValidationPreview {
  const parsed = parseStructureJson(serialized);
  if (!parsed.valid || !parsed.value) return emptyStructureJsonPreview(parsed.code);
  return validateParsedStructureJsonPreview(parsed.value, size, getDefinition, onProgress, project, resolveMaxStackSize, options);
}

export function validateParsedStructureJsonPreview(parsed: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument, resolveMaxStackSize?: ItemMaxStackResolver, options?: StructureJsonValidationOptions): StructureJsonValidationPreview {
  const issues = emptyStructureJsonIssues();
  const limits = normalizeValidationContentLimits(options);
  const { duplicateIndexes, conflicts } = collectDuplicateCoordinates(parsed.blocks);
  issues.duplicate.push(...conflicts);
  let validBlocks = 0;
  for (let index = 0; index < parsed.blocks.length; index += 1) {
    validBlocks += validateBlockEntry(issues, parsed.blocks[index], index, size, getDefinition, duplicateIndexes, limits, options?.placeableItems, resolveMaxStackSize);
    onProgress?.(index + 1, parsed.blocks.length);
  }
  appendSupportAndWarnings(issues, parsed, size, getDefinition, project);
  const decorationResult = validateDecorations(parsed, project ?? emptyValidationProject(size), resolveMaxStackSize, limits);
  return completePreview(parsed, validBlocks, issues, decorationResult);
}

export async function validateStructureJsonPreviewAsync(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, cancellation?: StructureJsonValidationCancellation, project?: ProjectDocument, resolveMaxStackSize?: ItemMaxStackResolver, options?: StructureJsonValidationOptions): Promise<StructureJsonValidationPreview | undefined> {
  if (isStructureJsonValidationCancelled(cancellation)) return undefined;
  const parsed = parseStructureJson(serialized);
  if (!parsed.valid || !parsed.value) return emptyStructureJsonPreview(parsed.code);
  return validateParsedStructureJsonPreviewAsync(parsed.value, size, getDefinition, onProgress, cancellation, project, resolveMaxStackSize, options);
}

export async function validateParsedStructureJsonPreviewAsync(parsed: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, cancellation?: StructureJsonValidationCancellation, project?: ProjectDocument, resolveMaxStackSize?: ItemMaxStackResolver, options?: StructureJsonValidationOptions): Promise<StructureJsonValidationPreview | undefined> {
  if (isStructureJsonValidationCancelled(cancellation)) return undefined;
  const issues = emptyStructureJsonIssues();
  const limits = normalizeValidationContentLimits(options);
  const budget = new CooperativeWorkBudget(8, 4096);
  const coordinates = createCoordinateConflictAccumulator();
  for (let start = 0; start < parsed.blocks.length; start += STRUCTURE_JSON_VALIDATION_CHUNK_SIZE) {
    const end = Math.min(start + STRUCTURE_JSON_VALIDATION_CHUNK_SIZE, parsed.blocks.length);
    for (let index = start; index < end; index += 1) recordCoordinate(coordinates, parsed.blocks[index], index);
    if (end < parsed.blocks.length) {
      const checkpoint = cooperativeValidationCheckpoint(budget, end, cancellation);
      if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined;
    }
  }
  const { duplicateIndexes, conflicts } = finalizeCoordinateConflicts(coordinates);
  issues.duplicate.push(...conflicts);
  let validBlocks = 0;
  if (parsed.blocks.length === 0) onProgress?.(0, 0);
  for (let start = 0; start < parsed.blocks.length; start += STRUCTURE_JSON_VALIDATION_CHUNK_SIZE) {
    const end = Math.min(start + STRUCTURE_JSON_VALIDATION_CHUNK_SIZE, parsed.blocks.length);
    for (let index = start; index < end; index += 1) {
      validBlocks += validateBlockEntry(issues, parsed.blocks[index], index, size, getDefinition, duplicateIndexes, limits, options?.placeableItems, resolveMaxStackSize);
    }
    onProgress?.(end, parsed.blocks.length);
    if (end < parsed.blocks.length) {
      const checkpoint = cooperativeValidationCheckpoint(budget, end, cancellation);
      if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined;
    }
  }
  if (await appendSupportAndWarningsAsync(issues, parsed, size, getDefinition, project, cancellation, budget) === false) return undefined;
  const decorations = await validateDecorationsAsync(parsed, project ?? emptyValidationProject(size), resolveMaxStackSize, limits, cancellation, budget);
  if (!decorations) return undefined;
  return completePreview(parsed, validBlocks, issues, decorations);
}

function completePreview(parsed: StructureJson, validBlocks: number, issues: ReturnType<typeof emptyStructureJsonIssues>, decorations: Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'>): StructureJsonValidationPreview {
  return {
    structuralValid: true, parsed, totalBlocks: parsed.blocks.length, validBlocks,
    missingBlocks: issues.missing.length, outOfBounds: issues.bounds.length, invalidStates: issues.state.length,
    duplicateCoordinates: issues.duplicate.length,
    affectedDuplicateBlocks: issues.duplicate.reduce((count, conflict) => count + conflict.blockIndexes.length, 0),
    issues, ...decorations,
  };
}

function emptyValidationProject(size: ProjectSize): ProjectDocument {
  return { size, blocks: [], decorations: [] } as unknown as ProjectDocument;
}

export { validateStructureJsonDecorations, validateStructureJsonDecorationsAsync };
