import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item';
import { canonicalPlaceableItemId } from '../../blocks/placement-palette/placeable-item';
import { BlockRuleEngine } from '../../block-behavior/rules/block-rule-engine';
import { coordinateKey, isWithinBounds } from '../../domain/coordinates';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { ProjectBlockSpatialIndex } from '../../domain/project-block-spatial-index';
import type { PlacedDecoration } from '../../decorations/decoration.types';
import { StructureJsonDecoration, StructureJson, parseStructureJson, StructureJsonBlock, StructureJsonValidationCode, validateStructureJsonBlockEntity } from './structure-json';
import type { ParsedStructureJsonResult } from './structure-json';
import { decorationAabb, decorationInBounds, paintingSupportFootprint, supportsDecoration } from '../../decorations/placement/decoration-placement';
import { allPaintingVariants, paintingVariant } from '../../decorations/decoration.types';
import { materializeBlockState } from '../../blocks/catalog/block-state-compatibility';
import { addDecorationToSpatialIndex, blocksIntersectingAabb, buildDecorationSpatialIndex, buildStructureImportSpatialContext, buildStructureImportSpatialContextAsync, queryDecorationSpatialIndex } from './structure-json-spatial';
import { validateItemStack, type ItemMaxStackResolver } from '../../items/item-stack-validation';
import type { ExternalAiContentLimits } from './external-ai-content-limits';
import { normalizeExternalAiContentLimits } from './external-ai-content-limits';
import { CooperativeWorkBudget, yieldToBrowser } from '../../assets/cooperative-yield';

export type StructureJsonIssueCategory = 'missing' | 'bounds' | 'state' | 'duplicate' | 'content-limit' | 'support' | 'warning';
export type StructureJsonIssueReason =
  | { readonly code: 'missing-block' }
  | { readonly code: 'out-of-bounds' }
  | { readonly code: 'unknown-state-property'; readonly property: string }
  | { readonly code: 'unsupported-state-value'; readonly property: string; readonly value: string }
  | { readonly code: 'invalid-block-entity'; readonly detail: string }
  | { readonly code: 'content-limit'; readonly restrictedId: string; readonly path?: string }
  | { readonly code: 'missing-support'; readonly detail?: string }
  | { readonly code: 'origin-offset'; readonly axis: 'x' | 'y' | 'z'; readonly value: number }
  | { readonly code: 'possible-floating'; readonly detail?: string }
  | { readonly code: 'tree-grounding'; readonly detail?: string };

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

export type StructureJsonDecorationIssueCategory = 'missing-asset' | 'bounds' | 'invalid' | 'conflict' | 'content-limit';
export interface StructureJsonDecorationIssue { readonly category: StructureJsonDecorationIssueCategory; readonly index: number; readonly kind: StructureJsonDecoration['kind']; readonly anchor: VoxelCoordinate; readonly reason: string; readonly restrictedId?: string; readonly path?: string; }

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
  readonly issues: Readonly<{ readonly missing: readonly StructureJsonBlockIssue[]; readonly bounds: readonly StructureJsonBlockIssue[]; readonly state: readonly StructureJsonBlockIssue[]; readonly duplicate: readonly StructureJsonCoordinateConflict[]; readonly contentLimit: readonly StructureJsonBlockIssue[]; readonly support: readonly StructureJsonBlockIssue[]; readonly warning: readonly StructureJsonBlockIssue[] }>;
  readonly affectedDuplicateBlocks: number;
  readonly totalDecorations: number;
  readonly validDecorations: number;
  readonly missingDecorationAssets: number;
  readonly invalidDecorations: number;
  readonly decorationIssues: readonly StructureJsonDecorationIssue[];
}

export interface StructureJsonValidationOptions {
  readonly contentLimitsEnabled?: boolean;
  readonly contentLimits?: ExternalAiContentLimits;
  readonly placeableItems?: readonly PlaceableItemDefinition[];
}

interface NormalizedValidationContentLimits {
  readonly enabled: boolean;
  readonly blocks: ReadonlySet<string>;
  readonly items: ReadonlySet<string>;
  readonly decorations: ReadonlySet<string>;
}

const emptyIssues = (): { missing: StructureJsonBlockIssue[]; bounds: StructureJsonBlockIssue[]; state: StructureJsonBlockIssue[]; duplicate: StructureJsonCoordinateConflict[]; contentLimit: StructureJsonBlockIssue[]; support: StructureJsonBlockIssue[]; warning: StructureJsonBlockIssue[] } => ({ missing: [], bounds: [], state: [], duplicate: [], contentLimit: [], support: [], warning: [] });
const WORKER_THRESHOLD = 256 * 1024;
export const STRUCTURE_JSON_VALIDATION_CHUNK_SIZE = 256;

export interface StructureJsonValidationCancellation {
  readonly signal?: AbortSignal;
  readonly isCancelled?: () => boolean;
}

export interface StructureJsonWorkerRequest { readonly text: string; }
export interface StructureJsonWorkerResponse { readonly ok: boolean; readonly result: ParsedStructureJsonResult; }

export async function parseStructureJsonWithWorker(text: string, cancellation?: StructureJsonValidationCancellation): Promise<ParsedStructureJsonResult> {
  if (isCancelled(cancellation)) return { valid: false, code: 'invalid-json' };
  if (text.length < WORKER_THRESHOLD || typeof Worker === 'undefined' || typeof window === 'undefined') return parseStructureJson(text);
  return new Promise((resolve) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./structure-json-import.worker', import.meta.url), { type: 'module' }); }
    catch { resolve(parseStructureJson(text)); return; }
    let settled = false;
    const finish = (result: ParsedStructureJsonResult): void => { if (settled) return; settled = true; worker.terminate(); resolve(result); };
    const fallback = () => finish(parseStructureJson(text));
    const cancellationTimer = typeof cancellation?.isCancelled === 'function' || cancellation?.signal ? setInterval(() => { if (isCancelled(cancellation)) { settled = true; worker.terminate(); clearInterval(cancellationTimer); resolve({ valid: false, code: 'invalid-json' }); } }, 16) : undefined;
    worker.onmessage = ({ data }: MessageEvent<StructureJsonWorkerResponse>) => { if (cancellationTimer) clearInterval(cancellationTimer); finish(data.result); };
    worker.onerror = () => { if (cancellationTimer) clearInterval(cancellationTimer); fallback(); };
    worker.postMessage({ text } satisfies StructureJsonWorkerRequest);
  });
}

export function validateStructureJsonPreview(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, options?: StructureJsonValidationOptions): StructureJsonValidationPreview {
  return validateStructureJsonPreviewBase(serialized, size, getDefinition, onProgress, project, resolveMaxStackSize, options);
}

export function validateParsedStructureJsonPreview(parsed: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, options?: StructureJsonValidationOptions): StructureJsonValidationPreview {
  return validateParsedStructureJsonPreviewBase(parsed, size, getDefinition, onProgress, project, resolveMaxStackSize, options);
}

export async function validateStructureJsonPreviewAsync(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, cancellation?: StructureJsonValidationCancellation, project?: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, options?: StructureJsonValidationOptions): Promise<StructureJsonValidationPreview | undefined> {
  if (isCancelled(cancellation)) return undefined;
  const parsed = parseStructureJson(serialized);
  if (!parsed.valid || !parsed.value) return emptyPreview(parsed.code);
  return validateParsedStructureJsonPreviewAsync(parsed.value, size, getDefinition, onProgress, cancellation, project, resolveMaxStackSize, options);
}

export async function validateParsedStructureJsonPreviewAsync(parsed: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, cancellation?: StructureJsonValidationCancellation, project?: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, options?: StructureJsonValidationOptions): Promise<StructureJsonValidationPreview | undefined> {
  if (isCancelled(cancellation)) return undefined;
  const issues = emptyIssues();
  const contentLimits = normalizeValidationContentLimits(options);
  const budget = new CooperativeWorkBudget(8, 4096);
  const coordinates = new Map<string, { readonly position: VoxelCoordinate; readonly indexes: number[]; readonly ids: string[] }>();
  for (let start = 0; start < parsed.blocks.length; start += STRUCTURE_JSON_VALIDATION_CHUNK_SIZE) {
    const end = Math.min(start + STRUCTURE_JSON_VALIDATION_CHUNK_SIZE, parsed.blocks.length);
    for (let index = start; index < end; index += 1) {
      recordCoordinate(coordinates, parsed.blocks[index], index);
    }
    if (end < parsed.blocks.length) { const checkpoint = cooperativeCheckpoint(budget, end, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined; }
  }
  const duplicateIndexes = new Set<number>();
  let groupsProcessed = 0;
  for (const group of coordinates.values()) {
    appendDuplicateGroup(issues, duplicateIndexes, group);
    groupsProcessed += 1;
    const checkpoint = cooperativeCheckpoint(budget, groupsProcessed, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined;
  }
  let validBlocks = 0;
  if (parsed.blocks.length === 0) onProgress?.(0, 0);
  for (let start = 0; start < parsed.blocks.length; start += STRUCTURE_JSON_VALIDATION_CHUNK_SIZE) {
    const end = Math.min(start + STRUCTURE_JSON_VALIDATION_CHUNK_SIZE, parsed.blocks.length);
    for (let index = start; index < end; index += 1) {
      validBlocks += validateBlockEntry(issues, parsed.blocks[index], index, size, getDefinition, duplicateIndexes, contentLimits, options?.placeableItems, resolveMaxStackSize);
    }
    onProgress?.(end, parsed.blocks.length);
    if (end < parsed.blocks.length) { const checkpoint = cooperativeCheckpoint(budget, end, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined; }
  }
  if (await appendSupportAndWarningsAsync(issues, parsed, size, getDefinition, project, cancellation, budget) === false) return undefined;
  const decorationResult = await validateDecorationsAsync(parsed, project ?? ({ size, blocks: [], decorations: [] } as unknown as ProjectDocument), resolveMaxStackSize, contentLimits, cancellation, budget);
  if (!decorationResult) return undefined;
  return { structuralValid: true, parsed, totalBlocks: parsed.blocks.length, validBlocks, missingBlocks: issues.missing.length, outOfBounds: issues.bounds.length, invalidStates: issues.state.length, duplicateCoordinates: issues.duplicate.length, affectedDuplicateBlocks: issues.duplicate.reduce((count, conflict) => count + conflict.blockIndexes.length, 0), issues, ...decorationResult };
}

function validateStructureJsonPreviewBase(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, options?: StructureJsonValidationOptions): StructureJsonValidationPreview {
  const parsed = parseStructureJson(serialized);
  if (!parsed.valid || !parsed.value) return emptyPreview(parsed.code);
  return validateParsedStructureJsonPreviewBase(parsed.value, size, getDefinition, onProgress, project, resolveMaxStackSize, options);
}

function validateParsedStructureJsonPreviewBase(value: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void, project?: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, options?: StructureJsonValidationOptions): StructureJsonValidationPreview {
  const issues = emptyIssues();
  const contentLimits = normalizeValidationContentLimits(options);
  const coordinates = collectCoordinates(value.blocks);
  const duplicateIndexes = new Set<number>();
  for (const group of coordinates.values()) appendDuplicateGroup(issues, duplicateIndexes, group);
  let validBlocks = 0;
  for (let index = 0; index < value.blocks.length; index += 1) {
    const block = value.blocks[index];
    validBlocks += validateBlockEntry(issues, block, index, size, getDefinition, duplicateIndexes, contentLimits, options?.placeableItems, resolveMaxStackSize);
    onProgress?.(index + 1, value.blocks.length);
  }
  appendSupportAndWarnings(issues, value, size, getDefinition, project);
  const decorationResult = validateDecorations(value, project ?? ({ size, blocks: [], decorations: [] } as unknown as ProjectDocument), resolveMaxStackSize, contentLimits);
  return { structuralValid: true, parsed: value, totalBlocks: value.blocks.length, validBlocks, missingBlocks: issues.missing.length, outOfBounds: issues.bounds.length, invalidStates: issues.state.length, duplicateCoordinates: issues.duplicate.length, affectedDuplicateBlocks: issues.duplicate.reduce((count, conflict) => count + conflict.blockIndexes.length, 0), issues, ...decorationResult };
}

type CoordinateGroup = { readonly position: VoxelCoordinate; readonly indexes: number[]; readonly ids: string[] };
function recordCoordinate(coordinates: Map<string, CoordinateGroup>, block: StructureJsonBlock, index: number): void {
  const position = { x: block.x, y: block.y, z: block.z };
  const key = coordinateKey(position);
  const group = coordinates.get(key) ?? { position, indexes: [], ids: [] };
  group.indexes.push(index); group.ids.push(block.id); coordinates.set(key, group);
}
function collectCoordinates(blocks: readonly StructureJsonBlock[]): Map<string, CoordinateGroup> {
  const coordinates = new Map<string, CoordinateGroup>();
  for (let index = 0; index < blocks.length; index += 1) recordCoordinate(coordinates, blocks[index], index);
  return coordinates;
}
function appendDuplicateGroup(issues: ReturnType<typeof emptyIssues>, duplicateIndexes: Set<number>, group: CoordinateGroup): void {
  if (group.indexes.length <= 1) return;
  group.indexes.forEach((index) => duplicateIndexes.add(index));
  issues.duplicate.push({ category: 'duplicate', coordinate: group.position, blockIndexes: group.indexes, blockIds: group.ids });
}
function validateBlockEntry(issues: ReturnType<typeof emptyIssues>, block: StructureJsonBlock, index: number, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, duplicateIndexes: ReadonlySet<number>, contentLimits: NormalizedValidationContentLimits, placeableItems: readonly PlaceableItemDefinition[] | undefined, resolveMaxStackSize: ((id: string) => number | undefined) | undefined): number {
  const position = { x: block.x, y: block.y, z: block.z };
  const inBounds = isWithinBounds(position, size);
  if (!inBounds) issues.bounds.push(issue('bounds', index, block, { code: 'out-of-bounds' }));
  const definition = getDefinition(block.id);
  appendContentLimitIssues(issues, index, block, contentLimits, placeableItems);
  if (!definition) {
    issues.missing.push(issue('missing', index, block, { code: 'missing-block' }));
    if (block.blockEntity) issues.state.push(issue('state', index, block, { code: 'invalid-block-entity', detail: 'missing-host' }));
    return 0;
  }
  const invalid = findInvalidState(block, definition);
  const entityError = block.blockEntity ? validateStructureJsonBlockEntity(block.blockEntity, block.id, definition, resolveMaxStackSize) : undefined;
  if (invalid) issues.state.push({ ...issue('state', index, block, invalid.reason), property: invalid.property, value: invalid.value });
  else if (entityError) issues.state.push(issue('state', index, block, { code: 'invalid-block-entity', detail: entityError }));
  else if (inBounds && !duplicateIndexes.has(index)) return 1;
  return 0;
}

function findInvalidState(block: StructureJsonBlock, definition: BlockDefinition): { readonly property: string; readonly value: string; readonly reason: StructureJsonIssueReason } | undefined {
  const result = materializeBlockState(definition, block.state);
  if (result.valid) return undefined;
  return { property: result.issue.property, value: result.issue.value, reason: result.issue.code === 'unknown-state-property' ? { code: result.issue.code, property: result.issue.property } : { code: result.issue.code, property: result.issue.property, value: result.issue.value } };
}

function issue(category: StructureJsonIssueCategory, index: number, block: StructureJsonBlock, reason: StructureJsonIssueReason): StructureJsonBlockIssue { return { category, index, id: block.id, position: { x: block.x, y: block.y, z: block.z }, reason }; }

function normalizeValidationContentLimits(options?: StructureJsonValidationOptions): NormalizedValidationContentLimits {
  const normalized = normalizeExternalAiContentLimits(options?.contentLimits, options?.placeableItems);
  return { enabled: options?.contentLimitsEnabled === true, blocks: new Set(normalized.blocks), items: new Set(normalized.items), decorations: new Set(normalized.decorations) };
}

function appendContentLimitIssues(issues: ReturnType<typeof emptyIssues>, index: number, block: StructureJsonBlock, limits: NormalizedValidationContentLimits, placeableItems?: readonly PlaceableItemDefinition[]): void {
  if (!limits.enabled) return;
  const logicalId = canonicalPlaceableItemId(block.id, placeableItems);
  if (limits.blocks.has(logicalId)) issues.contentLimit.push(issue('content-limit', index, block, { code: 'content-limit', restrictedId: logicalId, path: 'id' }));
  const entity = block.blockEntity;
  if (!entity || entity.kind === 'sign') return;
  const items = entity.kind === 'container'
    ? entity.items.map((entry) => ({ id: entry.item.id, path: `blockEntity.items[${entry.slot}].item.id` }))
    : entity.kind === 'decorated-pot' && entity.item
      ? [{ id: entity.item.id, path: 'blockEntity.item.id' }]
      : [];
  for (const item of items) if (limits.items.has(item.id)) issues.contentLimit.push(issue('content-limit', index, block, { code: 'content-limit', restrictedId: item.id, path: item.path }));
}

function appendSupportAndWarnings(issues: ReturnType<typeof emptyIssues>, document: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, project?: ProjectDocument): void {
  const importedBlocks = document.blocks.map((block) => toPlacedBlockForValidation(block, getDefinition(block.id)));
  const source = new ProjectBlockSpatialIndex(importedBlocks);
  const supportProject = project ? { ...project, size, blocks: importedBlocks } : ({ size, blocks: importedBlocks, groups: [], decorations: [] } as unknown as ProjectDocument);
  const engine = new BlockRuleEngine(getDefinition);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendSupportIssue(issues, document.blocks[index], index, size, getDefinition, importedBlocks[index], supportProject, source, engine);
  }
  appendOriginWarnings(issues, document);
  appendTreeWarnings(issues, document, source);
}

async function appendSupportAndWarningsAsync(issues: ReturnType<typeof emptyIssues>, document: StructureJson, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, project: ProjectDocument | undefined, cancellation: StructureJsonValidationCancellation | undefined, budget: CooperativeWorkBudget): Promise<boolean> {
  const importedBlocks: PlacedBlock[] = [];
  for (let index = 0; index < document.blocks.length; index += 1) {
    importedBlocks.push(toPlacedBlockForValidation(document.blocks[index], getDefinition(document.blocks[index].id)));
    const checkpoint = cooperativeCheckpoint(budget, index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return false;
  }
  const source = new ProjectBlockSpatialIndex([]);
  for (let index = 0; index < importedBlocks.length; index += 1) {
    source.add(importedBlocks[index]);
    const checkpoint = cooperativeCheckpoint(budget, index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return false;
  }
  const supportProject = project ? { ...project, size, blocks: importedBlocks } : ({ size, blocks: importedBlocks, groups: [], decorations: [] } as unknown as ProjectDocument);
  const engine = new BlockRuleEngine(getDefinition);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendSupportIssue(issues, document.blocks[index], index, size, getDefinition, importedBlocks[index], supportProject, source, engine);
    const checkpoint = cooperativeCheckpoint(budget, index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return false;
  }
  if (await appendOriginWarningsAsync(issues, document, cancellation, budget) === false) return false;
  return appendTreeWarningsAsync(issues, document, source, cancellation, budget);
}

function appendSupportIssue(issues: ReturnType<typeof emptyIssues>, block: StructureJsonBlock, index: number, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, placed: PlacedBlock, supportProject: ProjectDocument, source: ProjectBlockSpatialIndex, engine: BlockRuleEngine): void {
  const position = { x: block.x, y: block.y, z: block.z };
  const definition = getDefinition(block.id);
  if (!definition || !isWithinBounds(position, size) || !definition.behavior || definition.behaviorSupport === 'unknown') return;
  if (!materializeBlockState(definition, block.state).valid) return;
  const result = engine.validateSupportOnly(supportProject, placed, definition, source);
  if (result.status === 'invalid' && result.reason === 'missing-support') issues.support.push(issue('support', index, block, { code: 'missing-support' }));
}

async function appendOriginWarningsAsync(issues: ReturnType<typeof emptyIssues>, document: StructureJson, cancellation: StructureJsonValidationCancellation | undefined, budget: CooperativeWorkBudget): Promise<boolean> {
  const positions: VoxelCoordinate[] = [];
  const total = document.blocks.length + document.decorations.length;
  for (let index = 0; index < document.blocks.length; index += 1) {
    const block = document.blocks[index]; positions.push({ x: block.x, y: block.y, z: block.z });
    const checkpoint = cooperativeCheckpoint(budget, index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return false;
  }
  for (let index = 0; index < document.decorations.length; index += 1) {
    positions.push(document.decorations[index].anchor);
    const checkpoint = cooperativeCheckpoint(budget, document.blocks.length + index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return false;
  }
  appendOriginWarningValues(issues, minimumCoordinate(positions), total);
  return true;
}

async function appendTreeWarningsAsync(issues: ReturnType<typeof emptyIssues>, document: StructureJson, source: ProjectBlockSpatialIndex, cancellation: StructureJsonValidationCancellation | undefined, budget: CooperativeWorkBudget): Promise<boolean> {
  const saplings = new Set(['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry']);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendTreeWarning(issues, document.blocks[index], index, source, saplings);
    const checkpoint = cooperativeCheckpoint(budget, index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return false;
  }
  return true;
}

function appendOriginWarnings(issues: ReturnType<typeof emptyIssues>, document: StructureJson): void {
  const positions = [...document.blocks.map(({ x, y, z }) => ({ x, y, z })), ...document.decorations.map(({ anchor }) => anchor)];
  appendOriginWarningValues(issues, minimumCoordinate(positions), positions.length);
}

function minimumCoordinate(positions: readonly VoxelCoordinate[]): VoxelCoordinate | undefined {
  if (!positions.length) return undefined;
  return positions.reduce((current, position) => ({ x: Math.min(current.x, position.x), y: Math.min(current.y, position.y), z: Math.min(current.z, position.z) }), positions[0]);
}

function appendOriginWarningValues(issues: ReturnType<typeof emptyIssues>, min: VoxelCoordinate | undefined, total: number): void {
  if (!min || total === 0) return;
  for (const axis of ['x', 'y', 'z'] as const) if (min[axis] > 0) issues.warning.push({ category: 'warning', index: -1, id: '__structure__', position: min, reason: { code: 'origin-offset', axis, value: min[axis] } });
  if (min.y > 0) issues.warning.push({ category: 'warning', index: -1, id: '__structure__', position: min, reason: { code: 'possible-floating' } });
}

function appendTreeWarnings(issues: ReturnType<typeof emptyIssues>, document: StructureJson, source: ProjectBlockSpatialIndex): void {
  const saplings = new Set(['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry']);
  for (let index = 0; index < document.blocks.length; index += 1) {
    appendTreeWarning(issues, document.blocks[index], index, source, saplings);
  }
}

function appendTreeWarning(issues: ReturnType<typeof emptyIssues>, block: StructureJsonBlock, index: number, source: ProjectBlockSpatialIndex, saplings: ReadonlySet<string>): void {
  const name = block.id.startsWith('minecraft:') ? block.id.slice('minecraft:'.length) : '';
  if (!name.endsWith('_sapling') || !saplings.has(name.slice(0, -'_sapling'.length)) || block.y <= 0) return;
  if (!source.has({ x: block.x, y: block.y - 1, z: block.z })) issues.warning.push(issue('warning', index, block, { code: 'tree-grounding' }));
}

function toPlacedBlockForValidation(block: StructureJsonBlock, definition: BlockDefinition | undefined): PlacedBlock {
  return definition
    ? { kind: 'resolved', id: block.id, namespace: definition.namespace, position: { x: block.x, y: block.y, z: block.z }, state: { ...definition.defaultState, ...(block.state ?? {}) } }
    : { kind: 'missing', id: block.id, namespace: namespaceOf(block.id), position: { x: block.x, y: block.y, z: block.z }, state: { ...(block.state ?? {}) } };
}

function namespacedDecorationId(id: string): string { return id.includes(':') ? id : `minecraft:${id}`; }
function namespaceOf(id: string): string { const separator = id.indexOf(':'); return separator > 0 ? id.slice(0, separator) : 'unknown'; }

function validateDecorations(document: StructureJson, project: ProjectDocument, resolveMaxStackSize?: ItemMaxStackResolver, limits?: NormalizedValidationContentLimits): Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'> {
  const decorations = document.decorations; const issues: StructureJsonDecorationIssue[] = []; const variants = paintingVariantsById();
  const spatial = buildStructureImportSpatialContext(project.blocks, project.decorations ?? []);
  const candidateSpatial = buildDecorationSpatialIndex([]);
  for (let index = 0; index < decorations.length; index += 1) {
    validateDecorationEntry(decorations[index], index, project.size, resolveMaxStackSize, limits, variants, spatial, candidateSpatial, issues);
  }
  return summarizeDecorationIssues(decorations.length, issues);
}

async function validateDecorationsAsync(document: StructureJson, project: ProjectDocument, resolveMaxStackSize: ItemMaxStackResolver | undefined, limits: NormalizedValidationContentLimits, cancellation: StructureJsonValidationCancellation | undefined, budget: CooperativeWorkBudget): Promise<Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'> | undefined> {
  const decorations = document.decorations; const issues: StructureJsonDecorationIssue[] = []; const variants = paintingVariantsById();
  const spatial = await buildStructureImportSpatialContextAsync(project.blocks, project.decorations ?? [], cancellation); if (!spatial) return undefined; const candidateSpatial = buildDecorationSpatialIndex([]);
  for (let index = 0; index < decorations.length; index += 1) {
    validateDecorationEntry(decorations[index], index, project.size, resolveMaxStackSize, limits, variants, spatial, candidateSpatial, issues);
    const checkpoint = cooperativeCheckpoint(budget, index + 1, cancellation); if (checkpoint === true || checkpoint instanceof Promise && await checkpoint) return undefined;
  }
  return summarizeDecorationIssues(decorations.length, issues);
}

function paintingVariantsById(): Map<string, ReturnType<typeof paintingVariant>> { return new Map(allPaintingVariants().map((entry) => [entry.id, entry])); }
function validateDecorationEntry(decoration: StructureJsonDecoration, index: number, size: ProjectSize, resolveMaxStackSize: ItemMaxStackResolver | undefined, limits: NormalizedValidationContentLimits | undefined, variants: ReadonlyMap<string, ReturnType<typeof paintingVariant>>, spatial: ReturnType<typeof buildStructureImportSpatialContext>, candidateSpatial: ReturnType<typeof buildDecorationSpatialIndex>, issues: StructureJsonDecorationIssue[]): void {
  const variant = decoration.kind === 'painting' ? variants.get(decoration.variantId.replace(/^minecraft:/, '')) ?? paintingVariant(decoration.variantId) : undefined;
  if (decoration.kind !== 'painting' && decoration.item && limits?.enabled && limits.items.has(decoration.item.id)) { appendDecorationIssue(issues, decoration, index, 'content-limit', 'content-limit', decoration.item.id, 'item.id'); return; }
  if (decoration.kind !== 'painting' && decoration.item && !validateItemStack({ id: decoration.item.id, count: decoration.item.count ?? 1, ...(decoration.item.components ? { components: decoration.item.components } : {}) }, resolveMaxStackSize).valid) { appendDecorationIssue(issues, decoration, index, 'invalid', 'invalid-item-stack'); return; }
  const paintingId = decoration.kind === 'painting' ? namespacedDecorationId(decoration.variantId) : undefined;
  if (paintingId && limits?.enabled && limits.decorations.has(paintingId)) { appendDecorationIssue(issues, decoration, index, 'content-limit', 'content-limit', paintingId, 'variantId'); return; }
  if (decoration.kind === 'painting' && !variant) { appendDecorationIssue(issues, decoration, index, 'missing-asset', 'missing-painting-variant'); return; }
  if (!decorationInBounds(decoration.anchor, size)) { appendDecorationIssue(issues, decoration, index, 'bounds', 'out-of-bounds'); return; }
  const direction = decorationDirection(decoration.facing);
  const support = { x: decoration.anchor.x - direction.x, y: decoration.anchor.y - direction.y, z: decoration.anchor.z - direction.z };
  if (!supportsDecoration(decoration.kind, decoration.facing, spatial.occupiedCoordinates.has(coordinateKey(support)), decoration.kind === 'painting' ? false : decoration.fixed)) { appendDecorationIssue(issues, decoration, index, 'invalid', 'missing-support'); return; }
  if (variant && paintingSupportFootprint(decoration.anchor, decoration.facing, variant).some((position) => !spatial.occupiedCoordinates.has(coordinateKey(position)))) { appendDecorationIssue(issues, decoration, index, 'invalid', 'missing-painting-support'); return; }
  const aabb = decorationAabb({ ...decoration, ...(variant ? { variantId: variant.id } : {}) });
  if (blocksIntersectingAabb(aabb, spatial).some((block) => coordinateKey(block.position) !== coordinateKey(support))) { appendDecorationIssue(issues, decoration, index, 'conflict', 'blocked-by-block'); return; }
  if (queryDecorationSpatialIndex(spatial.decorations, aabb).length > 0 || queryDecorationSpatialIndex(candidateSpatial, aabb).length > 0) { appendDecorationIssue(issues, decoration, index, 'conflict', 'overlap-decoration'); return; }
  addDecorationToSpatialIndex(candidateSpatial, { instanceId: `preview-${index}`, kind: decoration.kind, entityTypeId: decoration.kind === 'painting' ? 'minecraft:painting' : decoration.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow-item-frame', anchor: decoration.anchor, facing: decoration.facing, ...(decoration.kind === 'painting' ? { variantId: decoration.variantId } : {}) } as PlacedDecoration);
}
function appendDecorationIssue(issues: StructureJsonDecorationIssue[], decoration: StructureJsonDecoration, index: number, category: StructureJsonDecorationIssueCategory, reason: string, restrictedId?: string, path?: string): void {
  issues.push({ category, index, kind: decoration.kind, anchor: decoration.anchor, reason, ...(restrictedId ? { restrictedId } : {}), ...(path ? { path } : {}) });
}
function decorationDirection(facing: StructureJsonDecoration['facing']): VoxelCoordinate {
  return facing === 'up' ? { x: 0, y: 1, z: 0 } : facing === 'down' ? { x: 0, y: -1, z: 0 } : facing === 'north' ? { x: 0, y: 0, z: -1 } : facing === 'south' ? { x: 0, y: 0, z: 1 } : facing === 'west' ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 };
}
function summarizeDecorationIssues(totalDecorations: number, issues: StructureJsonDecorationIssue[]): Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'> {
  return { totalDecorations, validDecorations: totalDecorations - issues.length, missingDecorationAssets: issues.filter((entry) => entry.category === 'missing-asset').length, invalidDecorations: issues.filter((entry) => entry.category !== 'missing-asset').length, decorationIssues: issues };
}
/** Reuses the decoration-only pass when an import mode changes without rechecking every block. */
export function validateStructureJsonDecorations(document: StructureJson, project: ProjectDocument, options?: StructureJsonValidationOptions): Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'> {
  return validateDecorations(document, project, undefined, normalizeValidationContentLimits(options));
}
export async function validateStructureJsonDecorationsAsync(document: StructureJson, project: ProjectDocument, options?: StructureJsonValidationOptions, cancellation?: StructureJsonValidationCancellation): Promise<Pick<StructureJsonValidationPreview, 'totalDecorations' | 'validDecorations' | 'missingDecorationAssets' | 'invalidDecorations' | 'decorationIssues'> | undefined> {
  return validateDecorationsAsync(document, project, undefined, normalizeValidationContentLimits(options), cancellation, new CooperativeWorkBudget(8, 4096));
}
function emptyPreview(code?: StructureJsonValidationCode): StructureJsonValidationPreview { return { structuralValid: false, structuralCode: code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, affectedDuplicateBlocks: 0, issues: emptyIssues(), totalDecorations: 0, validDecorations: 0, missingDecorationAssets: 0, invalidDecorations: 0, decorationIssues: [] }; }
function isCancelled(cancellation?: StructureJsonValidationCancellation): boolean { return Boolean(cancellation?.signal?.aborted || cancellation?.isCancelled?.()); }
function cooperativeCheckpoint(budget: CooperativeWorkBudget, processed: number, cancellation?: StructureJsonValidationCancellation): boolean | Promise<boolean> {
  if (isCancelled(cancellation)) return true;
  if (!budget.shouldYieldNow()) return false;
  budget.reset();
  return yieldToBrowser().then(() => isCancelled(cancellation));
}
