import { ProjectDocument, PlacedBlock } from '../../domain/project.types';

export const STRUCTURE_JSON_FORMAT = 'minecraftbuilder-structure' as const;
export const CURRENT_STRUCTURE_JSON_VERSION = 1 as const;

export interface StructureJsonBlockV1 {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly state: Readonly<Record<string, string>>;
}

export interface StructureJsonV1 {
  readonly format: typeof STRUCTURE_JSON_FORMAT;
  readonly formatVersion: typeof CURRENT_STRUCTURE_JSON_VERSION;
  readonly minecraftVersion: string;
  readonly name?: string;
  readonly blocks: readonly StructureJsonBlockV1[];
}

export type StructureJsonValidationCode = 'invalid-json' | 'shape' | 'format' | 'version' | 'minecraft-version' | 'blocks' | 'block';

export interface StructureJsonValidationResult {
  readonly valid: boolean;
  readonly code?: StructureJsonValidationCode;
  readonly path?: string;
}

const topLevelKeys = new Set(['format', 'formatVersion', 'minecraftVersion', 'name', 'blocks']);
const blockKeys = new Set(['id', 'x', 'y', 'z', 'state']);
const namespacedId = /^[a-z0-9_.-]+:[a-z0-9/._-]+$/;
const stateKey = /^[a-z0-9_.-]+$/;

export function validateStructureJsonV1(serialized: string): StructureJsonValidationResult {
  let value: unknown;
  try { value = JSON.parse(serialized) as unknown; } catch { return { valid: false, code: 'invalid-json' }; }
  if (!isRecord(value) || Array.isArray(value)) return { valid: false, code: 'shape' };
  if (!hasOnlyKeys(value, topLevelKeys)) return { valid: false, code: 'shape' };
  if (value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'format' };
  if (value['formatVersion'] !== CURRENT_STRUCTURE_JSON_VERSION) return { valid: false, code: 'version' };
  if (typeof value['minecraftVersion'] !== 'string' || value['minecraftVersion'].length === 0) return { valid: false, code: 'minecraft-version' };
  if (value['name'] !== undefined && typeof value['name'] !== 'string') return { valid: false, code: 'shape' };
  if (!Array.isArray(value['blocks'])) return { valid: false, code: 'blocks' };
  for (let index = 0; index < value['blocks'].length; index += 1) {
    const block = value['blocks'][index];
    if (!isRecord(block) || Array.isArray(block) || !hasOnlyKeys(block, blockKeys) || typeof block['id'] !== 'string' || !namespacedId.test(block['id']) || !Number.isInteger(block['x']) || !Number.isInteger(block['y']) || !Number.isInteger(block['z'])) {
      return { valid: false, code: 'block', path: `blocks[${index}]` };
    }
    if (block['state'] !== undefined) {
      if (!isRecord(block['state']) || Array.isArray(block['state']) || Object.entries(block['state']).some(([key, stateValue]) => !stateKey.test(key) || typeof stateValue !== 'string')) return { valid: false, code: 'block', path: `blocks[${index}].state` };
    }
  }
  return { valid: true };
}

export function structureJsonFromProject(project: ProjectDocument): StructureJsonV1 {
  return {
    format: STRUCTURE_JSON_FORMAT,
    formatVersion: CURRENT_STRUCTURE_JSON_VERSION,
    minecraftVersion: project.metadata.minecraftVersion,
    name: project.metadata.name,
    blocks: [...project.blocks].sort(compareBlocks).map(toStructureJsonBlock),
  };
}

export function serializeStructureJson(project: ProjectDocument): string {
  return serializeStructureJsonValue(structureJsonFromProject(project));
}

export function serializeStructureJsonValue(value: StructureJsonV1): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createStructureJsonExample(): StructureJsonV1 {
  return {
    format: STRUCTURE_JSON_FORMAT,
    formatVersion: CURRENT_STRUCTURE_JSON_VERSION,
    minecraftVersion: '1.21.1',
    name: 'Example Structure',
    blocks: [
      { id: 'minecraft:stone_bricks', x: 0, y: 0, z: 0, state: {} },
      { id: 'minecraft:oak_stairs', x: 1, y: 0, z: 0, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } },
    ],
  };
}

function toStructureJsonBlock(block: PlacedBlock): StructureJsonBlockV1 {
  const state = Object.fromEntries(Object.entries(block.state).sort(([left], [right]) => compareStrings(left, right)));
  return { id: block.id, x: block.position.x, y: block.position.y, z: block.position.z, state };
}

function compareBlocks(left: PlacedBlock, right: PlacedBlock): number {
  return left.position.x - right.position.x || left.position.y - right.position.y || left.position.z - right.position.z || compareStrings(left.id, right.id) || compareStrings(JSON.stringify(left.state), JSON.stringify(right.state));
}

function compareStrings(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean { return Object.keys(value).every(key => allowed.has(key)); }
