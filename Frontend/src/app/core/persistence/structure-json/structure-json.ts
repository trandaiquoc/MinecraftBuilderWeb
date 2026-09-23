import type { ProjectDocument, PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { DecorationFacing, PlacedDecoration } from '../../decorations/decoration.types';

export const STRUCTURE_JSON_FORMAT = 'minecraftbuilder-structure' as const;
export const STRUCTURE_JSON_V1_VERSION = 1 as const;
export const CURRENT_STRUCTURE_JSON_VERSION = 2 as const;

export interface StructureJsonBlockV1 { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly state?: Readonly<Record<string, string>>; }
export interface StructureJsonV1 { readonly format: typeof STRUCTURE_JSON_FORMAT; readonly formatVersion: typeof STRUCTURE_JSON_V1_VERSION; readonly minecraftVersion: string; readonly name?: string; readonly blocks: readonly StructureJsonBlockV1[]; }
export interface StructureJsonItemV2 { readonly id: string; readonly count?: number; readonly components?: Readonly<Record<string, unknown>>; }
export interface StructureJsonPaintingV2 { readonly kind: 'painting'; readonly anchor: VoxelCoordinate; readonly facing: 'north' | 'south' | 'east' | 'west'; readonly variantId: string; }
export interface StructureJsonFrameV2 { readonly kind: 'item-frame' | 'glow-item-frame'; readonly anchor: VoxelCoordinate; readonly facing: DecorationFacing; readonly item?: StructureJsonItemV2; readonly rotation?: number; readonly invisible?: boolean; readonly fixed?: boolean; readonly itemDropChance?: number; }
export type StructureJsonDecorationV2 = StructureJsonPaintingV2 | StructureJsonFrameV2;
export interface StructureJsonV2 { readonly format: typeof STRUCTURE_JSON_FORMAT; readonly formatVersion: typeof CURRENT_STRUCTURE_JSON_VERSION; readonly minecraftVersion: string; readonly name?: string; readonly blocks: readonly StructureJsonBlockV1[]; readonly decorations: readonly StructureJsonDecorationV2[]; }
export type StructureJsonDocument = StructureJsonV1 | StructureJsonV2;

export type StructureJsonValidationCode = 'invalid-json' | 'shape' | 'format' | 'version' | 'minecraft-version' | 'blocks' | 'block' | 'decorations' | 'decoration';
export interface StructureJsonValidationResult { readonly valid: boolean; readonly code?: StructureJsonValidationCode; readonly path?: string; }
export interface ParsedStructureJsonV1Result extends StructureJsonValidationResult { readonly value?: StructureJsonV1; }
export interface ParsedStructureJsonV2Result extends StructureJsonValidationResult { readonly value?: StructureJsonV2; }
export interface ParsedStructureJsonResult extends StructureJsonValidationResult { readonly value?: StructureJsonDocument; }

const topLevelV1Keys = new Set(['format', 'formatVersion', 'minecraftVersion', 'name', 'blocks']);
const topLevelV2Keys = new Set(['format', 'formatVersion', 'minecraftVersion', 'name', 'blocks', 'decorations']);
const blockKeys = new Set(['id', 'x', 'y', 'z', 'state']);
const paintingKeys = new Set(['kind', 'anchor', 'facing', 'variantId']);
const frameKeys = new Set(['kind', 'anchor', 'facing', 'item', 'rotation', 'invisible', 'fixed', 'itemDropChance']);
const anchorKeys = new Set(['x', 'y', 'z']);
const itemKeys = new Set(['id', 'count', 'components']);
const namespacedId = /^[a-z0-9_.-]+:[a-z0-9/._-]+$/;
const stateKey = /^[a-z0-9_.-]+$/;
const facings = new Set<DecorationFacing>(['down', 'up', 'north', 'south', 'west', 'east']);
const wallFacings = new Set(['north', 'south', 'east', 'west']);

export function validateStructureJsonV1(serialized: string): StructureJsonValidationResult { return parseStructureJsonV1(serialized); }
export function validateStructureJson(serialized: string): StructureJsonValidationResult { return parseStructureJson(serialized); }

export function parseStructureJsonV1(serialized: string): ParsedStructureJsonV1Result {
  const raw = parseRaw(serialized); if (!raw.ok) return { valid: false, code: raw.result.code };
  if (!hasOnlyKeys(raw.value, topLevelV1Keys)) return { valid: false, code: 'shape' };
  if (raw.value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'format' };
  if (raw.value['formatVersion'] !== STRUCTURE_JSON_V1_VERSION) return { valid: false, code: 'version' };
  const common = validateCommonTopLevel(raw.value); if (!common.valid) return common;
  const blocks = parseBlocks(raw.value['blocks']); if (!isValid(blocks)) return blocks;
  return { valid: true, value: { format: STRUCTURE_JSON_FORMAT, formatVersion: STRUCTURE_JSON_V1_VERSION, minecraftVersion: raw.value['minecraftVersion'] as string, ...(raw.value['name'] === undefined ? {} : { name: raw.value['name'] as string }), blocks: blocks.value } };
}

export function parseStructureJsonV2(serialized: string): ParsedStructureJsonV2Result {
  const raw = parseRaw(serialized); if (!raw.ok) return { valid: false, code: raw.result.code };
  if (!hasOnlyKeys(raw.value, topLevelV2Keys)) return { valid: false, code: 'shape' };
  if (raw.value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'format' };
  if (raw.value['formatVersion'] !== CURRENT_STRUCTURE_JSON_VERSION) return { valid: false, code: 'version' };
  const common = validateCommonTopLevel(raw.value); if (!common.valid) return common;
  const blocks = parseBlocks(raw.value['blocks']); if (!isValid(blocks)) return blocks;
  if (!Array.isArray(raw.value['decorations'])) return { valid: false, code: 'decorations' };
  const decorations: StructureJsonDecorationV2[] = [];
  for (let index = 0; index < raw.value['decorations'].length; index += 1) {
    const parsed = parseDecoration(raw.value['decorations'][index]);
    if (!isValid(parsed)) return { valid: false, code: 'decoration', path: `decorations[${index}]${parsed.path ? `.${parsed.path}` : ''}` };
    decorations.push(parsed.value);
  }
  return { valid: true, value: { format: STRUCTURE_JSON_FORMAT, formatVersion: CURRENT_STRUCTURE_JSON_VERSION, minecraftVersion: raw.value['minecraftVersion'] as string, ...(raw.value['name'] === undefined ? {} : { name: raw.value['name'] as string }), blocks: blocks.value, decorations } };
}

export function parseStructureJson(serialized: string): ParsedStructureJsonResult {
  const raw = parseRaw(serialized); if (!raw.ok) return { valid: false, code: raw.result.code };
  if (raw.value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'format' };
  if (raw.value['formatVersion'] === STRUCTURE_JSON_V1_VERSION) return parseStructureJsonV1(serialized);
  if (raw.value['formatVersion'] === CURRENT_STRUCTURE_JSON_VERSION) return parseStructureJsonV2(serialized);
  return { valid: false, code: 'version' };
}

export function structureJsonFromProject(project: ProjectDocument): StructureJsonV2 {
  return { format: STRUCTURE_JSON_FORMAT, formatVersion: CURRENT_STRUCTURE_JSON_VERSION, minecraftVersion: project.metadata.minecraftVersion, name: project.metadata.name, blocks: [...project.blocks].sort(compareBlocks).map(toStructureJsonBlock), decorations: [...(project.decorations ?? [])].sort(compareDecorations).map(decorationToStructureJson) };
}
export function serializeStructureJson(project: ProjectDocument): string { return serializeStructureJsonValue(structureJsonFromProject(project)); }
export function serializeStructureJsonValue(value: StructureJsonDocument): string { return `${JSON.stringify(value, null, 2)}\n`; }

export function createStructureJsonExample(): StructureJsonV2 {
  return { format: STRUCTURE_JSON_FORMAT, formatVersion: CURRENT_STRUCTURE_JSON_VERSION, minecraftVersion: '1.21.1', name: 'Example Structure', blocks: [{ id: 'minecraft:stone_bricks', x: 0, y: 0, z: 0, state: {} }, { id: 'minecraft:oak_stairs', x: 1, y: 0, z: 0, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } }], decorations: [{ kind: 'painting', anchor: { x: 0, y: 1, z: 1 }, facing: 'north', variantId: 'minecraft:kebab' }, { kind: 'item-frame', anchor: { x: 1, y: 1, z: 1 }, facing: 'south', item: { id: 'minecraft:diamond', count: 1, components: {} }, rotation: 0, invisible: false, fixed: false, itemDropChance: 1 }] };
}

export function decorationToStructureJson(decoration: PlacedDecoration): StructureJsonDecorationV2 {
  if (decoration.kind === 'painting') return { kind: 'painting', anchor: decoration.anchor, facing: decoration.facing as StructureJsonPaintingV2['facing'], variantId: decoration.variantId ?? 'minecraft:kebab' };
  return { kind: decoration.kind, anchor: decoration.anchor, facing: decoration.facing, ...(decoration.item ? { item: { id: decoration.item.id, count: decoration.item.count, ...(decoration.item.components === undefined ? {} : { components: decoration.item.components }) } } : {}), ...(decoration.rotation === undefined ? {} : { rotation: decoration.rotation }), ...(decoration.invisible === undefined ? {} : { invisible: decoration.invisible }), ...(decoration.fixed === undefined ? {} : { fixed: decoration.fixed }), ...(decoration.itemDropChance === undefined ? {} : { itemDropChance: decoration.itemDropChance }) };
}

function parseRaw(serialized: string): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly result: ParsedStructureJsonResult } {
  let value: unknown; try { value = JSON.parse(serialized) as unknown; } catch { return { ok: false, result: { valid: false, code: 'invalid-json' } }; }
  return isRecord(value) && !Array.isArray(value) ? { ok: true, value } : { ok: false, result: { valid: false, code: 'shape' } };
}
function validateCommonTopLevel(value: Record<string, unknown>): StructureJsonValidationResult { if (typeof value['minecraftVersion'] !== 'string' || value['minecraftVersion'].length === 0) return { valid: false, code: 'minecraft-version' }; if (value['name'] !== undefined && typeof value['name'] !== 'string') return { valid: false, code: 'shape' }; return { valid: true }; }
function parseBlocks(raw: unknown): { readonly valid: true; readonly value: StructureJsonBlockV1[] } | StructureJsonValidationResult { if (!Array.isArray(raw)) return { valid: false, code: 'blocks' }; const blocks: StructureJsonBlockV1[] = []; for (let index = 0; index < raw.length; index += 1) { const block = raw[index]; if (!isRecord(block) || Array.isArray(block) || !hasOnlyKeys(block, blockKeys) || typeof block['id'] !== 'string' || !namespacedId.test(block['id']) || !Number.isInteger(block['x']) || !Number.isInteger(block['y']) || !Number.isInteger(block['z'])) return { valid: false, code: 'block', path: `blocks[${index}]` }; if (block['state'] !== undefined && (!isRecord(block['state']) || Array.isArray(block['state']) || Object.entries(block['state']).some(([key, stateValue]) => !stateKey.test(key) || typeof stateValue !== 'string'))) return { valid: false, code: 'block', path: `blocks[${index}].state` }; blocks.push({ id: block['id'] as string, x: block['x'] as number, y: block['y'] as number, z: block['z'] as number, ...(block['state'] === undefined ? {} : { state: block['state'] as Readonly<Record<string, string>> }) }); } return { valid: true, value: blocks }; }
function parseDecoration(raw: unknown): { readonly valid: true; readonly value: StructureJsonDecorationV2 } | StructureJsonValidationResult {
  if (!isRecord(raw) || Array.isArray(raw) || typeof raw['kind'] !== 'string' || !isRecord(raw['anchor']) || Array.isArray(raw['anchor']) || !hasOnlyKeys(raw['anchor'], anchorKeys) || !Number.isInteger(raw['anchor']['x']) || !Number.isInteger(raw['anchor']['y']) || !Number.isInteger(raw['anchor']['z']) || typeof raw['facing'] !== 'string' || !facings.has(raw['facing'] as DecorationFacing)) return { valid: false, code: 'decoration' };
  const anchor = { x: raw['anchor']['x'] as number, y: raw['anchor']['y'] as number, z: raw['anchor']['z'] as number };
  if (raw['kind'] === 'painting') { if (!hasOnlyKeys(raw, paintingKeys) || !wallFacings.has(raw['facing']) || typeof raw['variantId'] !== 'string' || !raw['variantId'].trim()) return { valid: false, code: 'decoration' }; return { valid: true, value: { kind: 'painting', anchor, facing: raw['facing'] as StructureJsonPaintingV2['facing'], variantId: raw['variantId'] } }; }
  if (raw['kind'] !== 'item-frame' && raw['kind'] !== 'glow-item-frame') return { valid: false, code: 'decoration' };
  const rotation = raw['rotation']; const invisible = raw['invisible']; const fixed = raw['fixed']; const itemDropChance = raw['itemDropChance'];
  if (!hasOnlyKeys(raw, frameKeys) || rotation !== undefined && (!Number.isInteger(rotation) || (rotation as number) < 0 || (rotation as number) > 7) || invisible !== undefined && typeof invisible !== 'boolean' || fixed !== undefined && typeof fixed !== 'boolean' || itemDropChance !== undefined && (typeof itemDropChance !== 'number' || !Number.isFinite(itemDropChance) || itemDropChance < 0 || itemDropChance > 1)) return { valid: false, code: 'decoration' };
  if (raw['item'] !== undefined) { const item = parseItem(raw['item']); if (!isValid(item)) return { valid: false, code: 'decoration', path: 'item' }; return { valid: true, value: { kind: raw['kind'], anchor, facing: raw['facing'] as DecorationFacing, item: item.value, ...(rotation === undefined ? {} : { rotation: rotation as number }), ...(invisible === undefined ? {} : { invisible: invisible as boolean }), ...(fixed === undefined ? {} : { fixed: fixed as boolean }), ...(itemDropChance === undefined ? {} : { itemDropChance: itemDropChance as number }) } }; }
  return { valid: true, value: { kind: raw['kind'], anchor, facing: raw['facing'] as DecorationFacing, ...(rotation === undefined ? {} : { rotation: rotation as number }), ...(invisible === undefined ? {} : { invisible: invisible as boolean }), ...(fixed === undefined ? {} : { fixed: fixed as boolean }), ...(itemDropChance === undefined ? {} : { itemDropChance: itemDropChance as number }) } };
}
function parseItem(raw: unknown): { readonly valid: true; readonly value: StructureJsonItemV2 } | StructureJsonValidationResult { if (!isRecord(raw) || Array.isArray(raw) || !hasOnlyKeys(raw, itemKeys) || typeof raw['id'] !== 'string' || !namespacedId.test(raw['id']) || raw['components'] !== undefined && (!isRecord(raw['components']) || Array.isArray(raw['components']))) return { valid: false, code: 'decoration' }; const count = raw['count']; if (count !== undefined && (!Number.isInteger(count) || (count as number) <= 0)) return { valid: false, code: 'decoration' }; return { valid: true, value: { id: raw['id'], ...(count === undefined ? {} : { count: count as number }), ...(raw['components'] === undefined ? {} : { components: raw['components'] as Readonly<Record<string, unknown>> }) } }; }
function toStructureJsonBlock(block: PlacedBlock): StructureJsonBlockV1 { const state = Object.fromEntries(Object.entries(block.state).sort(([left], [right]) => compareStrings(left, right))); return { id: block.id, x: block.position.x, y: block.position.y, z: block.position.z, state }; }
function compareBlocks(left: PlacedBlock, right: PlacedBlock): number { return left.position.x - right.position.x || left.position.y - right.position.y || left.position.z - right.position.z || compareStrings(left.id, right.id) || compareStrings(JSON.stringify(left.state), JSON.stringify(right.state)); }
function compareDecorations(left: PlacedDecoration, right: PlacedDecoration): number { return left.anchor.x - right.anchor.x || left.anchor.y - right.anchor.y || left.anchor.z - right.anchor.z || compareStrings(left.kind, right.kind) || compareStrings(left.facing, right.facing) || compareStrings(left.variantId ?? left.item?.id ?? '', right.variantId ?? right.item?.id ?? '') || (left.rotation ?? 0) - (right.rotation ?? 0); }
function compareStrings(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean { return Object.keys(value).every((key) => allowed.has(key)); }
function isValid<T>(value: { readonly valid: boolean; readonly value?: T }): value is { readonly valid: true; readonly value: T } { return value.valid === true && value.value !== undefined; }
