import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { coordinateKey, isWithinBounds } from '../../domain/coordinates';
import { ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import { parseStructureJsonV1, StructureJsonBlockV1, StructureJsonValidationCode, StructureJsonV1 } from './structure-json';
import type { ParsedStructureJsonV1Result } from './structure-json';

export type StructureJsonIssueCategory = 'missing' | 'bounds' | 'state' | 'duplicate';

export interface StructureJsonBlockIssue {
  readonly category: StructureJsonIssueCategory;
  readonly index: number;
  readonly id: string;
  readonly position: VoxelCoordinate;
  readonly reason: string;
  readonly property?: string;
  readonly value?: string;
}

export interface StructureJsonValidationPreview {
  readonly structuralValid: boolean;
  readonly structuralCode?: StructureJsonValidationCode;
  readonly parsed?: StructureJsonV1;
  readonly totalBlocks: number;
  readonly validBlocks: number;
  readonly missingBlocks: number;
  readonly outOfBounds: number;
  readonly invalidStates: number;
  readonly duplicateCoordinates: number;
  readonly issues: Readonly<Record<StructureJsonIssueCategory, readonly StructureJsonBlockIssue[]>>;
}

const emptyIssues = (): Record<StructureJsonIssueCategory, StructureJsonBlockIssue[]> => ({ missing: [], bounds: [], state: [], duplicate: [] });
const WORKER_THRESHOLD = 256 * 1024;

export interface StructureJsonWorkerRequest { readonly text: string; }
export interface StructureJsonWorkerResponse { readonly ok: boolean; readonly result: ParsedStructureJsonV1Result; }

export async function parseStructureJsonWithWorker(text: string): Promise<ParsedStructureJsonV1Result> {
  if (text.length < WORKER_THRESHOLD || typeof Worker === 'undefined' || typeof window === 'undefined') return parseStructureJsonV1(text);
  return new Promise((resolve) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./structure-json-import.worker', import.meta.url), { type: 'module' }); }
    catch { resolve(parseStructureJsonV1(text)); return; }
    const fallback = () => { worker.terminate(); resolve(parseStructureJsonV1(text)); };
    worker.onmessage = ({ data }: MessageEvent<StructureJsonWorkerResponse>) => { worker.terminate(); resolve(data.result); };
    worker.onerror = fallback;
    worker.postMessage({ text } satisfies StructureJsonWorkerRequest);
  });
}

export function validateStructureJsonPreview(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void): StructureJsonValidationPreview {
  return validateStructureJsonPreviewBase(serialized, size, getDefinition, onProgress);
}

export function validateParsedStructureJsonPreview(parsed: StructureJsonV1, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void): StructureJsonValidationPreview {
  return validateParsedStructureJsonPreviewBase(parsed, size, getDefinition, onProgress);
}

export async function validateStructureJsonPreviewAsync(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void): Promise<StructureJsonValidationPreview> {
  await yieldToBrowser();
  return validateStructureJsonPreview(serialized, size, getDefinition, onProgress);
}

function validateStructureJsonPreviewBase(serialized: string, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void): StructureJsonValidationPreview {
  const parsed = parseStructureJsonV1(serialized);
  if (!parsed.valid || !parsed.value) return emptyPreview(parsed.code);
  return validateParsedStructureJsonPreviewBase(parsed.value, size, getDefinition, onProgress);
}

function validateParsedStructureJsonPreviewBase(value: StructureJsonV1, size: ProjectSize, getDefinition: (id: string) => BlockDefinition | undefined, onProgress?: (completed: number, total: number) => void): StructureJsonValidationPreview {
  const issues = emptyIssues();
  const coordinates = new Map<string, number>();
  let validBlocks = 0;
  for (let index = 0; index < value.blocks.length; index += 1) {
    const block = value.blocks[index]; const position = { x: block.x, y: block.y, z: block.z }; const key = coordinateKey(position); const previous = coordinates.get(key);
    if (previous !== undefined) issues.duplicate.push(issue('duplicate', index, block, `Duplicate coordinate also used by block ${previous}.`)); else coordinates.set(key, index);
    if (!isWithinBounds(position, size)) issues.bounds.push(issue('bounds', index, block, 'Coordinate is outside the current project bounds.'));
    const definition = getDefinition(block.id);
    if (!definition) issues.missing.push(issue('missing', index, block, 'Block is not available in the current Block Library.'));
    else { const invalid = findInvalidState(block, definition); if (invalid) issues.state.push({ ...issue('state', index, block, invalid.reason), property: invalid.property, value: invalid.value }); else if (isWithinBounds(position, size) && previous === undefined) validBlocks += 1; }
    onProgress?.(index + 1, value.blocks.length);
  }
  return { structuralValid: true, parsed: value, totalBlocks: value.blocks.length, validBlocks, missingBlocks: issues.missing.length, outOfBounds: issues.bounds.length, invalidStates: issues.state.length, duplicateCoordinates: issues.duplicate.length, issues };
}

function findInvalidState(block: StructureJsonBlockV1, definition: BlockDefinition): { readonly property: string; readonly value: string; readonly reason: string } | undefined {
  const state = { ...definition.defaultState, ...(block.state ?? {}) };
  for (const property of Object.keys(block.state ?? {})) {
    const stateDefinition = definition.stateDefinitions.find((entry) => entry.name === property);
    if (!stateDefinition) return { property, value: block.state?.[property] ?? '', reason: `Unknown state property '${property}'.` };
    if (!stateDefinition.values.includes(state[property])) return { property, value: state[property], reason: `Unsupported value '${state[property]}' for '${property}'.` };
  }
  for (const definitionEntry of definition.stateDefinitions) if (state[definitionEntry.name] !== undefined && !definitionEntry.values.includes(state[definitionEntry.name])) return { property: definitionEntry.name, value: state[definitionEntry.name], reason: `Unsupported value '${state[definitionEntry.name]}' for '${definitionEntry.name}'.` };
  return undefined;
}

function issue(category: StructureJsonIssueCategory, index: number, block: StructureJsonBlockV1, reason: string): StructureJsonBlockIssue { return { category, index, id: block.id, position: { x: block.x, y: block.y, z: block.z }, reason }; }
function emptyPreview(code?: StructureJsonValidationCode): StructureJsonValidationPreview { return { structuralValid: false, structuralCode: code, totalBlocks: 0, validBlocks: 0, missingBlocks: 0, outOfBounds: 0, invalidStates: 0, duplicateCoordinates: 0, issues: emptyIssues() }; }
function yieldToBrowser(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }
