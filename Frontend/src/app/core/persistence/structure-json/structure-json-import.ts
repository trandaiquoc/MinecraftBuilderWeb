import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { coordinateKey, isWithinBounds } from '../../domain/coordinates';
import { ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { StructureJsonDecoration, StructureJson, parseStructureJson, StructureJsonBlock, StructureJsonValidationCode } from './structure-json';
import type { ParsedStructureJsonResult } from './structure-json';
import { decorationAabb, decorationInBounds, paintingSupportFootprint, supportsDecoration } from '../../decorations/placement/decoration-placement';
import { allPaintingVariants, paintingVariant } from '../../decorations/decoration.types';
import { materializeBlockState } from '../../blocks/catalog/block-state-compatibility';
import { addDecorationToSpatialIndex, blocksIntersectingAabb, buildDecorationSpatialIndex, buildStructureImportSpatialContext, queryDecorationSpatialIndex } from './structure-json-spatial';

export type StructureJsonIssueCategory = 'missing' | 'bounds' | 'state' | 'duplicate';
export type StructureJsonIssueReason =
  | { readonly code: 'missing-block' }
  | { readonly code: 'out-of-bounds' }
  | { readonly code: 'unknown-state-property'; readonly property: string }
  | { readonly code: 'unsupported-state-value'; readonly property: string; readonly value: string };

export interface StructureJsonBlockIssue {
  readonly category: StructureJsonIssueCategory;
  readonly index: number;
  readonly id: string;
  readonly position: VoxelCoordinate;
  readonly reason: StructureJsonIssueReason;
  readonly property?: string;
  readonly value?: string;
}

export interface StructureJsonCoordinateConflict {
  readonly category: 'duplicate';
  readonly coordinate: VoxelCoordinate;
  readonly blockIndexes: readonly number[];
  readonly blockIds: readonly string[];
}

export type StructureJsonDecorationIssueCategory = 'missing-asset' | 'bounds' | 'invalid' | 'conflict';
export interface StructureJsonDecorationIssue { readonly category: StructureJsonDecorationIssueCategory; readonly index: number; readonly kind: StructureJsonDecoration['kind']; readonly anchor: VoxelCoordinate; readonly reason: string; }

export interface StructureJsonValidationPreview {
  readonly structuralValid: boolean;
  readonly structuralCode?: StructureJsonValidationCode;
  readonly parsed?: StructureJson;
  readonly totalBlocks: number;
  readonly validBlocks: number;
  readonly missingBlocks: number;
  readonly outOfBounds: number;
  readonly invalidStates: number;
  readonly duplicateCoordinates: number;
  readonly issues: Readonly<{ readonly missing: readonly StructureJsonBlockIssue[]; readonly bounds: readonly StructureJsonBlockIssue[]; readonly state: readonly StructureJsonBlockIssue[]; readonly duplicate: readonly StructureJsonCoordinateConflict[] }>;
  readonly affectedDuplicateBlocks: number;
  readonly totalDecorations: number;
  readonly validDecorations: number;
  readonly missingDecorationAssets: number;
  readonly invalidDecorations: number;
  readonly decorationIssues: readonly StructureJsonDecorationIssue[];
}

const emptyIssues = (): { missing: StructureJsonBlockIssue[]; bounds: StructureJsonBlockIssue[]; state: StructureJsonBlockIssue[]; duplicate: StructureJsonCoordinateConflict[] } => ({ missing: [], bounds: [], state: [], duplicate: [] });
const WORKER_THRESHOLD = 256 * 1024;
export const STRUCTURE_JSON_VALIDATION_CHUNK_SIZE = 256;

export interface StructureJsonValidationCancellation {
  readonly signal?: AbortSignal;
  readonly isCancelled?: () => boolean;
}

export interface StructureJsonWorkerRequest { readonly text: string; }
export interface StructureJsonWorkerResponse { readonly ok: boolean; readonly result: ParsedStructureJsonResult; }

export async function parseStructureJsonWithWorker(text: string): Promise<ParsedStructureJsonResult> {
  if (text.length < WORKER_THRESHOLD || typeof Worker === 'undefined' || typeof window === 'undefined') return parseStructureJson(text);
  return new Promise((resolve) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./structure-json-import.worker', import.meta.url), { type: 'module' }); }
    catch { resolve(parseStructureJson(text)); return; }
    const fallback = () => { worker.terminate(); resolve(parseStructureJson(text)); };
    worker.onmessage = ({ data }: MessageEvent<StructureJsonWorkerResponse>) => { worker.terminate(); resolve(data.result); };
    worker.onerror = fallback;
    worker.postMessage({ text } satisfies StructureJsonWorkerRequest);
  });
}

export function validateStructureJsonPreview(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument): StructureJsonValidationPreview {
  return validateStructureJsonPreviewBase(serialized, size, getDefinition, onProgress, project);
}

export function validateParsedStructureJsonPreview(parsed: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument): StructureJsonValidationPreview {
  return validateParsedStructureJsonPreviewBase(parsed, size, getDefinition, onProgress, project);
}

export async function validateStructureJsonPreviewAsync(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, cancellation?: StructureJsonValidationCancellation): Promise<StructureJsonValidationPreview | undefined> {
  if (isCancelled(cancellation)) return undefined;
  const parsed = parseStructureJson(serialized);
  if (!parsed.valid || !parsed.value) return emptyPreview(parsed.code);
  return validateParsedStructureJsonPreviewAsync(parsed.value, size, getDefinition, onProgress, cancellation);
}

export async function validateParsedStructureJsonPreviewAsync(parsed: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, cancellation?: StructureJsonValidationCancellation, project?: ProjectDocument): Promise<StructureJsonValidationPreview | undefined> {
  if (isCancelled(cancellation)) return undefined;
  const issues = emptyIssues();
  const coordinates = new Map<string, { readonly position: VoxelCoordinate; readonly indexes: number[]; readonly ids: string[] }>();
  for (let start = 0; start < parsed.blocks.length; start += STRUCTURE_JSON_VALIDATION_CHUNK_SIZE) {
    const end = Math.min(start + STRUCTURE_JSON_VALIDATION_CHUNK_SIZE, parsed.blocks.length);
    for (let index = start; index < end; index += 1) {
      const block = parsed.blocks[index]; const position = { x: block.x, y: block.y, z: block.z }; const key = coordinateKey(position); const group = coordinates.get(key) ?? { position, indexes: [], ids: [] };
      group.indexes.push(index); group.ids.push(block.id); coordinates.set(key, group);
    }
    if (end < parsed.blocks.length) { await yieldToBrowser(); if (isCancelled(cancellation)) return undefined; }
  }
  const duplicateIndexes = new Set<number>();
  let groupsProcessed = 0;
  for (const group of coordinates.values()) {
    if (group.indexes.length > 1) { group.indexes.forEach((index) => duplicateIndexes.add(index)); issues.duplicate.push({ category: 'duplicate', coordinate: group.position, blockIndexes: group.indexes, blockIds: group.ids }); }
    groupsProcessed += 1;
    if (groupsProcessed % STRUCTURE_JSON_VALIDATION_CHUNK_SIZE === 0) { await yieldToBrowser(); if (isCancelled(cancellation)) return undefined; }
  }
  let validBlocks = 0;
  if (parsed.blocks.length === 0) onProgress?.(0, 0);
  for (let start = 0; start < parsed.blocks.length; start += STRUCTURE_JSON_VALIDATION_CHUNK_SIZE) {
    const end = Math.min(start + STRUCTURE_JSON_VALIDATION_CHUNK_SIZE, parsed.blocks.length);
    for (let index = start; index < end; index += 1) {
      const block = parsed.blocks[index]; const position = { x: block.x, y: block.y, z: block.z };
      if (!isWithinBounds(position, size)) issues.bounds.push(issue('bounds', index, block, { code: 'out-of-bounds' }));
      const definition = getDefinition(block.id);
      if (!definition) issues.missing.push(issue('missing', index, block, { code: 'missing-block' }));
      else { const invalid = findInvalidState(block, definition); if (invalid) issues.state.push({ ...issue('state', index, block, invalid.reason), property: invalid.property, value: invalid.value }); else if (isWithinBounds(position, size) && !duplicateIndexes.has(index)) validBlocks += 1; }
    }
    onProgress?.(end, parsed.blocks.length);
    if (end < parsed.blocks.length) { await yieldToBrowser(); if (isCancelled(cancellation)) return undefined; }
  }
  const decorationResult = validateDecorations(parsed, project ?? ({ size, blocks: [], decorations: [] } as unknown as ProjectDocument));
  return { structuralValid: true, parsed, totalBlocks: parsed.blocks.length, validBlocks, missingBlocks: issues.missing.length, outOfBounds: issues.bounds.length, invalidStates: issues.state.length, duplicateCoordinates: issues.duplicate.length, affectedDuplicateBlocks: issues.duplicate.reduce((count, conflict) => count + conflict.blockIndexes.length, 0), issues, ...decorationResult };
}

function validateStructureJsonPreviewBase(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument): StructureJsonValidationPreview {
  const parsed = parseStructureJson(serialized);
  if (!parsed.valid || !parsed.value) return emptyPreview(parsed.code);
  return validateParsedStructureJsonPreviewBase(parsed.value, size, getDefinition, onProgress, project);
}

function validateParsedStructureJsonPreviewBase(value: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument): StructureJsonValidationPreview {
  const issues = emptyIssues();
  const coordinates = new Map<string, { readonly position: VoxelCoordinate; readonly indexes: number[]; readonly ids: string[] }>();
  for (let index = 0; index < value.blocks.length; index += 1) {
    const block = value.blocks[index]; const position = { x: block.x, y: block.y, z: block.z }; const key = coordinateKey(position); const group = coordinates.get(key) ?? { position, indexes: [], ids: [] };
    group.indexes.push(index); group.ids.push(block.id); coordinates.set(key, group);
  }
  const duplicateIndexes = new Set<number>();
  for (const group of coordinates.values()) if (group.indexes.length > 1) { group.indexes.forEach((index) => duplicateIndexes.add(index)); issues.duplicate.push({ category: 'duplicate', coordinate: group.position, blockIndexes: group.indexes, blockIds: group.ids }); }
  let validBlocks = 0;
  for (let index = 0; index < value.blocks.length; index += 1) {
    const block = value.blocks[index]; const position = { x: block.x, y: block.y, z: block.z };
    if (!isWithinBounds(position, size)) issues.bounds.push(issue('bounds', index, block, { code: 'out-of-bounds' }));
    const definition = getDefinition(block.id);
    if (!definition) issues.missing.push(issue('missing', index, block, { code: 'missing-block' }));
    else { const invalid = findInvalidState(block, definition); if (invalid) issues.state.push({ ...issue('state', index, block, invalid.reason), property: invalid.property, value: invalid.value }); else if (isWithinBounds(position, size) && !duplicateIndexes.has(index)) validBlocks += 1; }
    onProgress?.(index + 1, value.blocks.length);
  }
  const decorationResult = validateDecorations(value, project ?? ({ size, blocks: [], decorations: [] } as unknown as ProjectDocument));
  return { structuralValid: true, parsed: value, totalBlocks: value.blocks.length, validBlocks, missingBlocks: issues.missing.length, outOfBounds: issues.bounds.length, invalidStates: issues.state.length, duplicateCoordinates: issues.duplicate.length, affectedDuplicateBlocks: issues.duplicate.reduce((count, conflict) => count + conflict.blockIndexes.length, 0), issues, ...decorationResult };
}

function findInvalidState(block: StructureJsonBlock, definition: BlockDefinition): { readonly property: string; readonly value: string; readonly reason: StructureJsonIssueReason } | undefined {
  const result = materializeBlockState(definition, block.state);
  if (result.valid) return undefined;
  return { property: result.issue.property, value: result.issue.value, reason: result.issue.code === 'unknown-state-property' ? { code: result.issue.code, property: result.issue.property } : { code: result.issue.code, property: result.issue.property, value: result.issue.value } };
}

function issue(category: StructureJsonIssueCategory, index: number, block: StructureJsonBlock, reason: StructureJsonIssueReason): StructureJsonBlockIssue { return { category, index, id: block.id, position: { x: block.x, y: block.y, z: block.z }, reason }; }
function validateDecorations(document: StructureJson, project: ProjectDocument): Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'> {
  const decorations = document.decorations; const issues: StructureJsonDecorationIssue[] = []; const variants = new Map(allPaintingVariants().map((entry) => [entry.id, entry]));
  const spatial = buildStructureImportSpatialContext(project.blocks, project.decorations ?? []);
  const candidateSpatial = buildDecorationSpatialIndex([]);
  for (let index = 0; index < decorations.length; index += 1) {
    const decoration = decorations[index]; const variant = decoration.kind === 'painting' ? variants.get(decoration.variantId.replace(/^minecraft:/, '')) ?? paintingVariant(decoration.variantId) : undefined;
    if (decoration.kind === 'painting' && !variant) { issues.push({ category: 'missing-asset', index, kind: decoration.kind, anchor: decoration.anchor, reason: 'missing-painting-variant' }); continue; }
    if (!decorationInBounds(decoration.anchor, project.size)) { issues.push({ category: 'bounds', index, kind: decoration.kind, anchor: decoration.anchor, reason: 'out-of-bounds' }); continue; }
    const direction = decoration.facing === 'up' ? { x: 0, y: 1, z: 0 } : decoration.facing === 'down' ? { x: 0, y: -1, z: 0 } : decoration.facing === 'north' ? { x: 0, y: 0, z: -1 } : decoration.facing === 'south' ? { x: 0, y: 0, z: 1 } : decoration.facing === 'west' ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
    const support = { x: decoration.anchor.x - direction.x, y: decoration.anchor.y - direction.y, z: decoration.anchor.z - direction.z };
    const supportExists = spatial.occupiedCoordinates.has(coordinateKey(support));
    if (!supportsDecoration(decoration.kind, decoration.facing, supportExists, decoration.kind === 'painting' ? false : decoration.fixed)) { issues.push({ category: 'invalid', index, kind: decoration.kind, anchor: decoration.anchor, reason: 'missing-support' }); continue; }
    if (variant && paintingSupportFootprint(decoration.anchor, decoration.facing, variant).some((position) => !spatial.occupiedCoordinates.has(coordinateKey(position)))) { issues.push({ category: 'invalid', index, kind: decoration.kind, anchor: decoration.anchor, reason: 'missing-painting-support' }); continue; }
    const aabb = decorationAabb({ ...decoration, ...(variant ? { variantId: variant.id } : {}) });
    if (blocksIntersectingAabb(aabb, spatial).some((block) => coordinateKey(block.position) !== coordinateKey(support))) { issues.push({ category: 'conflict', index, kind: decoration.kind, anchor: decoration.anchor, reason: 'blocked-by-block' }); continue; }
    if (queryDecorationSpatialIndex(spatial.decorations, aabb).length > 0 || queryDecorationSpatialIndex(candidateSpatial, aabb).length > 0) { issues.push({ category: 'conflict', index, kind: decoration.kind, anchor: decoration.anchor, reason: 'overlap-decoration' }); continue; }
    const candidate = { instanceId: `preview-${index}`, kind: decoration.kind, entityTypeId: decoration.kind === 'painting' ? 'minecraft:painting' : decoration.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow-item-frame', anchor: decoration.anchor, facing: decoration.facing, ...(decoration.kind === 'painting' ? { variantId: decoration.variantId } : {}) } as PlacedDecoration;
    addDecorationToSpatialIndex(candidateSpatial, candidate);
  }
  return { totalDecorations: decorations.length, validDecorations: decorations.length - issues.length, missingDecorationAssets: issues.filter((issue) => issue.category === 'missing-asset').length, invalidDecorations: issues.filter((issue) => issue.category !== 'missing-asset').length, decorationIssues: issues };
}
function emptyPreview(code?: StructureJsonValidationCode): StructureJsonValidationPreview { return { structuralValid: false, structuralCode: code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, affectedDuplicateBlocks: 0, issues: emptyIssues(), totalDecorations: 0, validDecorations: 0, missingDecorationAssets: 0, invalidDecorations: 0, decorationIssues: [] }; }
function isCancelled(cancellation?: StructureJsonValidationCancellation): boolean { return Boolean(cancellation?.signal?.aborted || cancellation?.isCancelled?.()); }
function yieldToBrowser(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }
