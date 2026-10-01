import type { ProjectBlockEntityData, ProjectDocument, PlacedBlock, SignSide, VoxelCoordinate } from '../../domain/project.types';
import type { DecorationFacing, PlacedDecoration } from '../../decorations/decoration.types';
import { isValidNamespacedResourceLocation } from '../../content/resource-location';
import { verifiedInventoryContainerSchema } from '../../block-entities/item-display/inventory-storage-schema';
import type { ItemStackData } from '../../items/item-stack.types';
import { validateItemStack } from '../../items/item-stack-validation';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import { defaultItemContainerData, setItemContainerSlot } from '../../block-entities/item-display/item-container';
import { defaultDecoratedPotData } from '../../block-entities/decorated-pot/decorated-pot';

/** The current Structure JSON interchange contract is intentionally unversioned. */
export const STRUCTURE_JSON_FORMAT = 'minecraftbuilder-structure' as const;
export const LEGACY_STRUCTURE_JSON_VERSION = 2 as const;

export interface StructureJsonItem { readonly id: string; readonly count?: number; readonly components?: Readonly<Record<string, unknown>>; }
export interface StructureJsonContainerItem { readonly slot: number; readonly item: StructureJsonItem; }
export interface StructureJsonContainer { readonly kind: 'container'; readonly items: readonly StructureJsonContainerItem[]; }
export interface StructureJsonPot { readonly kind: 'decorated-pot'; readonly decorations: Readonly<{ back: string; left: string; right: string; front: string }>; readonly item?: StructureJsonItem; }
export interface StructureJsonSignSide { readonly lines: readonly [string, string, string, string]; readonly color: string; readonly glowing: boolean; readonly filteredMessages?: readonly [string, string, string, string]; }
export interface StructureJsonSign { readonly kind: 'sign'; readonly front: StructureJsonSignSide; readonly back: StructureJsonSignSide; readonly waxed: boolean; }
export type StructureJsonBlockEntity = StructureJsonContainer | StructureJsonPot | StructureJsonSign;
export interface StructureJsonBlock { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly state?: Readonly<Record<string, string>>; readonly blockEntity?: StructureJsonBlockEntity; }
export interface StructureJsonPainting { readonly kind: 'painting'; readonly anchor: VoxelCoordinate; readonly facing: 'north' | 'south' | 'east' | 'west'; readonly variantId: string; }
export interface StructureJsonFrame { readonly kind: 'item-frame' | 'glow-item-frame'; readonly anchor: VoxelCoordinate; readonly facing: DecorationFacing; readonly item?: StructureJsonItem; readonly rotation?: number; readonly invisible?: boolean; readonly fixed?: boolean; readonly itemDropChance?: number; }
export type StructureJsonDecoration = StructureJsonPainting | StructureJsonFrame;
export interface StructureJson { readonly format: typeof STRUCTURE_JSON_FORMAT; readonly minecraftVersion: string; readonly name?: string; readonly blocks: readonly StructureJsonBlock[]; readonly decorations: readonly StructureJsonDecoration[]; }
export type StructureJsonDocument = StructureJson;
export type StructureJsonDefinitionResolver = (id: string) => BlockDefinition | undefined;

export type StructureJsonValidationCode = 'invalid-json' | 'shape' | 'format' | 'version' | 'minecraft-version' | 'blocks' | 'block' | 'block-entity' | 'decorations' | 'decoration';
export interface StructureJsonValidationResult { readonly valid: boolean; readonly code?: StructureJsonValidationCode; readonly path?: string; }
export interface ParsedStructureJsonResult extends StructureJsonValidationResult { readonly value?: StructureJson; }

const topLevelKeys = new Set(['format', 'minecraftVersion', 'name', 'blocks', 'decorations']);
const legacyTopLevelKeys = new Set([...topLevelKeys, 'formatVersion']);
const blockKeys = new Set(['id', 'x', 'y', 'z', 'state', 'blockEntity']);
const paintingKeys = new Set(['kind', 'anchor', 'facing', 'variantId']);
const frameKeys = new Set(['kind', 'anchor', 'facing', 'item', 'rotation', 'invisible', 'fixed', 'itemDropChance']);
const anchorKeys = new Set(['x', 'y', 'z']);
const itemKeys = new Set(['id', 'count', 'components']);
const containerKeys = new Set(['kind', 'items']);
const containerItemKeys = new Set(['slot', 'item']);
const potKeys = new Set(['kind', 'decorations', 'item']);
const potDecorationKeys = new Set(['back', 'left', 'right', 'front']);
const signKeys = new Set(['kind', 'front', 'back', 'waxed']);
const signSideKeys = new Set(['lines', 'color', 'glowing', 'filteredMessages']);
const stateKey = /^[a-z0-9_.-]+$/;
const facings = new Set<DecorationFacing>(['down', 'up', 'north', 'south', 'west', 'east']);
const wallFacings = new Set(['north', 'south', 'east', 'west']);

export function validateStructureJson(serialized: string, resolveDefinition?: StructureJsonDefinitionResolver, resolveMaxStackSize?: (id: string) => number | undefined): StructureJsonValidationResult {
  const parsed = parseStructureJson(serialized);
  return parsed.valid && parsed.value ? validateStructureJsonValue(parsed.value, resolveDefinition, resolveMaxStackSize) : parsed;
}

/** Parse canonical JSON and the deliberately narrow legacy formatVersion=2 shape. */
export function parseStructureJson(serialized: string): ParsedStructureJsonResult {
  const raw = parseRaw(serialized); if (!raw.ok) return raw.result;
  if (raw.value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'format' };
  const legacy = raw.value['formatVersion'] !== undefined;
  if (legacy && raw.value['formatVersion'] !== LEGACY_STRUCTURE_JSON_VERSION) return { valid: false, code: 'version' };
  return parseValue(raw.value, legacy);
}

export function structureJsonFromProject(project: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, resolveDefinition?: StructureJsonDefinitionResolver): StructureJson {
  return { format: STRUCTURE_JSON_FORMAT, minecraftVersion: project.metadata.minecraftVersion, ...(project.metadata.name ? { name: project.metadata.name } : {}), blocks: [...project.blocks].sort(compareBlocks).map((block) => toStructureJsonBlock(block, resolveDefinition)), decorations: [...(project.decorations ?? [])].sort(compareDecorations).map(decorationToStructureJson) };
}
export function hasUnsupportedProjectBlockEntities(project: ProjectDocument, resolveDefinition?: StructureJsonDefinitionResolver): boolean { return project.blocks.some((block) => block.blockEntityData !== undefined && !blockEntityToStructureJson(block.blockEntityData, block.id, resolveDefinition?.(block.id))); }
export function serializeStructureJson(project: ProjectDocument, resolveMaxStackSize?: (id: string) => number | undefined, resolveDefinition?: StructureJsonDefinitionResolver): string { return serializeStructureJsonValue(structureJsonFromProject(project, resolveMaxStackSize, resolveDefinition)); }
export function serializeStructureJsonValue(value: StructureJson): string { return `${JSON.stringify(value, null, 2)}\n`; }

export function validateStructureJsonValue(value: StructureJson, resolveDefinition?: StructureJsonDefinitionResolver, resolveMaxStackSize?: (id: string) => number | undefined): StructureJsonValidationResult {
  for (let index = 0; index < value.blocks.length; index += 1) {
    const block = value.blocks[index];
    if (block.blockEntity) {
      const error = validateStructureJsonBlockEntity(block.blockEntity, block.id, resolveDefinition?.(block.id), resolveMaxStackSize);
      if (error) return { valid: false, code: 'block-entity', path: `blocks[${index}].blockEntity.${error}` };
    }
  }
  for (let index = 0; index < value.decorations.length; index += 1) {
    const decoration = value.decorations[index];
    const item = decoration.kind === 'painting' ? undefined : decoration.item;
    if (!item) continue;
    const result = validateItemForStructureJson(item, resolveMaxStackSize);
    if (!result.valid) return { valid: false, code: 'decoration', path: `decorations[${index}].item.${result.code}` };
  }
  return { valid: true };
}

export function projectBlockEntityDataFromStructureJson(value: StructureJsonBlockEntity, blockId: string, definition?: BlockDefinition): ProjectBlockEntityData | undefined {
  if (value.kind === 'sign') return { kind: 'sign', front: toProjectSignSide(value.front), back: toProjectSignSide(value.back), waxed: value.waxed };
  if (value.kind === 'decorated-pot') return blockId === 'minecraft:decorated_pot' ? { ...defaultDecoratedPotData(), decorations: value.decorations, ...(value.item ? { item: toProjectItem(value.item) } : {}) } : undefined;
  const capability = blockCapability(definition, 'item-display') ?? blockCapability(definition, 'item-storage-display');
  const schema = verifiedInventoryContainerSchema(blockId);
  if (capability) {
    const data = defaultItemContainerData(capability.kind, capability.slotCount);
    return value.items.reduce((current, entry) => setItemContainerSlot(current, capability.kind, capability.slotCount, entry.slot, toProjectItem(entry.item)), data);
  }
  if (schema?.editable) {
    const data = defaultItemContainerData('inventory-storage', schema.slotCount);
    return value.items.reduce((current, entry) => setItemContainerSlot(current, 'inventory-storage', schema.slotCount, entry.slot, toProjectItem(entry.item)), data);
  }
  return undefined;
}

export function validateStructureJsonBlockEntity(value: StructureJsonBlockEntity, blockId: string, definition?: BlockDefinition, resolveMaxStackSize?: (id: string) => number | undefined): string | undefined {
  const itemError = (item: StructureJsonItem): string | undefined => validateItemForStructureJson(item, resolveMaxStackSize).code;
  if (value.kind === 'sign') return isSignHost(blockId, definition) ? undefined : 'incompatible-sign';
  if (value.kind === 'decorated-pot') return blockId === 'minecraft:decorated_pot' ? itemError(value.item ?? { id: 'minecraft:brick' }) : 'incompatible-decorated-pot';
  const capability = blockCapability(definition, 'item-display') ?? blockCapability(definition, 'item-storage-display');
  const schema = verifiedInventoryContainerSchema(blockId);
  const slotCount = capability?.slotCount ?? (schema?.editable ? schema.slotCount : undefined);
  if (slotCount === undefined || schema?.nbtSupported === false) return 'incompatible-container';
  for (const entry of value.items) { if (entry.slot >= slotCount) return 'slot-out-of-range'; const error = itemError(entry.item); if (error) return error; }
  return undefined;
}

function validateItemForStructureJson(item: StructureJsonItem, resolveMaxStackSize?: (id: string) => number | undefined): { readonly valid: true; readonly code?: undefined } | { readonly valid: false; readonly code: string } {
  const result = validateItemStack({ id: item.id, count: item.count ?? 1, ...(item.components ? { components: item.components } : {}) }, resolveMaxStackSize);
  return result.valid ? { valid: true } : { valid: false, code: result.code ?? 'invalid-item-stack' };
}

function isSignHost(id: string, definition?: BlockDefinition): boolean { return blockCapability(definition, 'block-entity')?.entityKind === 'sign' || (id.startsWith('minecraft:') && (/(?:^|_)(?:wall_)?sign$/.test(id.slice(10)) || id.endsWith('_hanging_sign') || id.endsWith('_wall_hanging_sign'))); }
function toProjectSignSide(side: StructureJsonSignSide): SignSide { return { lines: side.lines, color: side.color, glowing: side.glowing, ...(side.filteredMessages ? { filteredMessages: side.filteredMessages } : {}) }; }
function toProjectItem(item: StructureJsonItem): ItemStackData { return { id: item.id, count: item.count ?? 1, ...(item.components ? { components: item.components } : {}) }; }
export function createStructureJsonExample(): StructureJson { return { format: STRUCTURE_JSON_FORMAT, minecraftVersion: '1.21.1', name: 'Example Structure', blocks: [{ id: 'minecraft:stone_bricks', x: 0, y: 0, z: 0 }, { id: 'minecraft:oak_stairs', x: 1, y: 0, z: 0, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } }], decorations: [{ kind: 'painting', anchor: { x: 0, y: 1, z: 1 }, facing: 'north', variantId: 'minecraft:kebab' }, { kind: 'item-frame', anchor: { x: 1, y: 1, z: 1 }, facing: 'south', item: { id: 'minecraft:diamond' }, rotation: 0, invisible: false, fixed: false, itemDropChance: 1 }] }; }
export function decorationToStructureJson(decoration: PlacedDecoration): StructureJsonDecoration { if (decoration.kind === 'painting') return { kind: 'painting', anchor: decoration.anchor, facing: decoration.facing as StructureJsonPainting['facing'], variantId: decoration.variantId ?? 'minecraft:kebab' }; return { kind: decoration.kind, anchor: decoration.anchor, facing: decoration.facing, ...(decoration.item ? { item: toStructureJsonItem(decoration.item) } : {}), ...(decoration.rotation === undefined ? {} : { rotation: decoration.rotation }), ...(decoration.invisible === undefined ? {} : { invisible: decoration.invisible }), ...(decoration.fixed === undefined ? {} : { fixed: decoration.fixed }), ...(decoration.itemDropChance === undefined ? {} : { itemDropChance: decoration.itemDropChance }) }; }

function parseValue(value: Record<string, unknown>, legacy: boolean): ParsedStructureJsonResult {
  const allowed = legacy ? legacyTopLevelKeys : topLevelKeys;
  if (!hasOnlyKeys(value, allowed) || value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'shape' };
  const common = validateCommonTopLevel(value); if (!common.valid) return common;
  const blocks = parseBlocks(value['blocks']); if (!isValid(blocks)) return blocks;
  if (!Array.isArray(value['decorations'])) return { valid: false, code: 'decorations' };
  const decorations: StructureJsonDecoration[] = [];
  for (let index = 0; index < value['decorations'].length; index += 1) { const parsed = parseDecoration(value['decorations'][index]); if (!isValid(parsed)) return { valid: false, code: 'decoration', path: `decorations[${index}]${parsed.path ? `.${parsed.path}` : ''}` }; decorations.push(parsed.value); }
  return { valid: true, value: { format: STRUCTURE_JSON_FORMAT, minecraftVersion: value['minecraftVersion'] as string, ...(value['name'] === undefined ? {} : { name: value['name'] as string }), blocks: blocks.value, decorations } };
}
function parseRaw(serialized: string): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly result: ParsedStructureJsonResult } { let value: unknown; try { value = JSON.parse(serialized) as unknown; } catch { return { ok: false, result: { valid: false, code: 'invalid-json' } }; } return isRecord(value) ? { ok: true, value } : { ok: false, result: { valid: false, code: 'shape' } }; }
function validateCommonTopLevel(value: Record<string, unknown>): StructureJsonValidationResult { if (typeof value['minecraftVersion'] !== 'string' || value['minecraftVersion'].length === 0) return { valid: false, code: 'minecraft-version' }; if (value['name'] !== undefined && typeof value['name'] !== 'string') return { valid: false, code: 'shape' }; return { valid: true }; }
function parseBlocks(raw: unknown): { readonly valid: true; readonly value: StructureJsonBlock[] } | StructureJsonValidationResult { if (!Array.isArray(raw)) return { valid: false, code: 'blocks' }; const blocks: StructureJsonBlock[] = []; for (let index = 0; index < raw.length; index += 1) { const block = raw[index]; if (!isRecord(block) || !hasOnlyKeys(block, blockKeys) || typeof block['id'] !== 'string' || !isValidNamespacedResourceLocation(block['id']) || !Number.isInteger(block['x']) || !Number.isInteger(block['y']) || !Number.isInteger(block['z'])) return { valid: false, code: 'block', path: `blocks[${index}]` }; if (block['state'] !== undefined && (!isRecord(block['state']) || Object.entries(block['state']).some(([key, stateValue]) => !stateKey.test(key) || typeof stateValue !== 'string'))) return { valid: false, code: 'block', path: `blocks[${index}].state` }; let blockEntity: StructureJsonBlockEntity | undefined; if (block['blockEntity'] !== undefined) { const parsed = parseBlockEntity(block['blockEntity']); if (!isValid(parsed)) return { valid: false, code: 'block-entity', path: `blocks[${index}].blockEntity${parsed.path ? `.${parsed.path}` : ''}` }; blockEntity = parsed.value; } blocks.push({ id: block['id'] as string, x: block['x'] as number, y: block['y'] as number, z: block['z'] as number, ...(block['state'] === undefined ? {} : { state: block['state'] as Readonly<Record<string, string>> }), ...(blockEntity ? { blockEntity } : {}) }); } return { valid: true, value: blocks }; }
function parseBlockEntity(raw: unknown): { readonly valid: true; readonly value: StructureJsonBlockEntity } | StructureJsonValidationResult { if (!isRecord(raw) || typeof raw['kind'] !== 'string') return { valid: false, code: 'block-entity' }; if (raw['kind'] === 'container') { if (!hasOnlyKeys(raw, containerKeys) || !Array.isArray(raw['items'])) return { valid: false, code: 'block-entity' }; const seen = new Set<number>(); const items: StructureJsonContainerItem[] = []; for (let index = 0; index < raw['items'].length; index += 1) { const entry = raw['items'][index]; if (!isRecord(entry) || !hasOnlyKeys(entry, containerItemKeys) || !Number.isInteger(entry['slot']) || (entry['slot'] as number) < 0 || seen.has(entry['slot'] as number)) return { valid: false, code: 'block-entity', path: `items[${index}].slot` }; const item = parseItem(entry['item']); if (!isValid(item)) return { valid: false, code: 'block-entity', path: `items[${index}].item` }; seen.add(entry['slot'] as number); items.push({ slot: entry['slot'] as number, item: item.value }); } return { valid: true, value: { kind: 'container', items } }; } if (raw['kind'] === 'decorated-pot') { const decorations = raw['decorations']; if (!hasOnlyKeys(raw, potKeys) || !isRecord(decorations) || !hasOnlyKeys(decorations, potDecorationKeys) || !['back', 'left', 'right', 'front'].every((key) => typeof decorations[key] === 'string' && isValidNamespacedResourceLocation(decorations[key] as string))) return { valid: false, code: 'block-entity' }; const item = raw['item'] === undefined ? undefined : parseItem(raw['item']); if (item && !isValid(item)) return { valid: false, code: 'block-entity', path: 'item' }; return { valid: true, value: { kind: 'decorated-pot', decorations: decorations as StructureJsonPot['decorations'], ...(item ? { item: item.value } : {}) } }; } if (raw['kind'] === 'sign') { if (!hasOnlyKeys(raw, signKeys) || typeof raw['waxed'] !== 'boolean') return { valid: false, code: 'block-entity' }; const front = parseSignSide(raw['front']); const back = parseSignSide(raw['back']); if (!isValid(front) || !isValid(back)) return { valid: false, code: 'block-entity' }; return { valid: true, value: { kind: 'sign', front: front.value, back: back.value, waxed: raw['waxed'] } }; } return { valid: false, code: 'block-entity' }; }
function parseSignSide(raw: unknown): { readonly valid: true; readonly value: StructureJsonSignSide } | StructureJsonValidationResult { if (!isRecord(raw) || !hasOnlyKeys(raw, signSideKeys) || !Array.isArray(raw['lines']) || raw['lines'].length !== 4 || !raw['lines'].every((line) => typeof line === 'string') || typeof raw['color'] !== 'string' || typeof raw['glowing'] !== 'boolean') return { valid: false, code: 'block-entity' }; const filtered = raw['filteredMessages']; if (filtered !== undefined && (!Array.isArray(filtered) || filtered.length !== 4 || !filtered.every((line) => typeof line === 'string'))) return { valid: false, code: 'block-entity' }; return { valid: true, value: { lines: raw['lines'] as unknown as StructureJsonSignSide['lines'], color: raw['color'], glowing: raw['glowing'], ...(filtered === undefined ? {} : { filteredMessages: filtered as unknown as StructureJsonSignSide['filteredMessages'] }) } }; }
function parseItem(raw: unknown): { readonly valid: true; readonly value: StructureJsonItem } | StructureJsonValidationResult { if (!isRecord(raw) || !hasOnlyKeys(raw, itemKeys) || typeof raw['id'] !== 'string' || !isValidNamespacedResourceLocation(raw['id']) || raw['components'] !== undefined && !isRecord(raw['components'])) return { valid: false, code: 'block-entity' }; const count = raw['count']; if (count !== undefined && (!Number.isInteger(count) || (count as number) <= 0)) return { valid: false, code: 'block-entity' }; return { valid: true, value: { id: raw['id'], ...(count === undefined ? {} : { count: count as number }), ...(raw['components'] === undefined ? {} : { components: raw['components'] as Readonly<Record<string, unknown>> }) } }; }
function parseDecoration(raw: unknown): { readonly valid: true; readonly value: StructureJsonDecoration } | StructureJsonValidationResult { if (!isRecord(raw) || typeof raw['kind'] !== 'string' || !isRecord(raw['anchor']) || !hasOnlyKeys(raw['anchor'], anchorKeys) || !Number.isInteger(raw['anchor']['x']) || !Number.isInteger(raw['anchor']['y']) || !Number.isInteger(raw['anchor']['z']) || typeof raw['facing'] !== 'string' || !facings.has(raw['facing'] as DecorationFacing)) return { valid: false, code: 'decoration' }; const anchor = { x: raw['anchor']['x'] as number, y: raw['anchor']['y'] as number, z: raw['anchor']['z'] as number }; if (raw['kind'] === 'painting') { if (!hasOnlyKeys(raw, paintingKeys) || !wallFacings.has(raw['facing']) || typeof raw['variantId'] !== 'string' || !raw['variantId'].trim()) return { valid: false, code: 'decoration' }; return { valid: true, value: { kind: 'painting', anchor, facing: raw['facing'] as StructureJsonPainting['facing'], variantId: raw['variantId'] } }; } if (raw['kind'] !== 'item-frame' && raw['kind'] !== 'glow-item-frame') return { valid: false, code: 'decoration' }; const rotation = raw['rotation']; const invisible = raw['invisible']; const fixed = raw['fixed']; const itemDropChance = raw['itemDropChance']; if (!hasOnlyKeys(raw, frameKeys) || rotation !== undefined && (!Number.isInteger(rotation) || (rotation as number) < 0 || (rotation as number) > 7) || invisible !== undefined && typeof invisible !== 'boolean' || fixed !== undefined && typeof fixed !== 'boolean' || itemDropChance !== undefined && (typeof itemDropChance !== 'number' || !Number.isFinite(itemDropChance) || itemDropChance < 0 || itemDropChance > 1)) return { valid: false, code: 'decoration' }; if (raw['item'] !== undefined) { const item = parseItem(raw['item']); if (!isValid(item)) return { valid: false, code: 'decoration', path: 'item' }; return { valid: true, value: { kind: raw['kind'], anchor, facing: raw['facing'] as DecorationFacing, item: item.value, ...(rotation === undefined ? {} : { rotation: rotation as number }), ...(invisible === undefined ? {} : { invisible: invisible as boolean }), ...(fixed === undefined ? {} : { fixed: fixed as boolean }), ...(itemDropChance === undefined ? {} : { itemDropChance: itemDropChance as number }) } }; } return { valid: true, value: { kind: raw['kind'], anchor, facing: raw['facing'] as DecorationFacing, ...(rotation === undefined ? {} : { rotation: rotation as number }), ...(invisible === undefined ? {} : { invisible: invisible as boolean }), ...(fixed === undefined ? {} : { fixed: fixed as boolean }), ...(itemDropChance === undefined ? {} : { itemDropChance: itemDropChance as number }) } }; }

function toStructureJsonBlock(block: PlacedBlock, resolveDefinition?: StructureJsonDefinitionResolver): StructureJsonBlock { const state = Object.fromEntries(Object.entries(block.state).sort(([left], [right]) => compareStrings(left, right))); const blockEntity = blockEntityToStructureJson(block.blockEntityData, block.id, resolveDefinition?.(block.id)); return { id: block.id, x: block.position.x, y: block.position.y, z: block.position.z, ...(Object.keys(state).length ? { state } : {}), ...(blockEntity ? { blockEntity } : {}) }; }
function blockEntityToStructureJson(value: ProjectBlockEntityData | undefined, blockId: string, definition?: BlockDefinition): StructureJsonBlockEntity | undefined { if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined; if (value.kind === 'sign') { const data = value as Extract<ProjectBlockEntityData, { kind: 'sign' }>; return isSignHost(blockId, definition) ? { kind: 'sign', front: signSideToJson(data.front), back: signSideToJson(data.back), waxed: data.waxed } : undefined; } if (value.kind === 'decorated-pot' && blockId === 'minecraft:decorated_pot') { const data = value as Extract<ProjectBlockEntityData, { kind: 'decorated-pot' }>; return { kind: 'decorated-pot', decorations: data.decorations, ...(data.item ? { item: toStructureJsonItem(data.item) } : {}) }; } if (value.kind === 'item-container') { const data = value as import('../../block-entities/item-display/item-container').ItemContainerBlockEntityData; const capability = blockCapability(definition, 'item-display') ?? blockCapability(definition, 'item-storage-display'); const validHost = data.hostKind === 'inventory-storage' ? verifiedInventoryContainerSchema(blockId)?.editable === true : capability?.kind === data.hostKind; if (validHost) return { kind: 'container', items: data.slots.filter((slot) => slot.stack).map((slot) => ({ slot: slot.slot, item: toStructureJsonItem(slot.stack!) })).sort((a, b) => a.slot - b.slot) }; } return undefined; }
function signSideToJson(side: SignSide): StructureJsonSignSide { return { lines: side.lines, color: side.color, glowing: side.glowing, ...(side.filteredMessages ? { filteredMessages: side.filteredMessages } : {}) }; }
function toStructureJsonItem(item: ItemStackData): StructureJsonItem { return { id: item.id, ...(item.count === 1 ? {} : { count: item.count }), ...(item.components === undefined ? {} : { components: item.components }) }; }
function compareBlocks(left: PlacedBlock, right: PlacedBlock): number { return left.position.x - right.position.x || left.position.y - right.position.y || left.position.z - right.position.z || compareStrings(left.id, right.id) || compareStrings(JSON.stringify(left.state), JSON.stringify(right.state)); }
function compareDecorations(left: PlacedDecoration, right: PlacedDecoration): number { return left.anchor.x - right.anchor.x || left.anchor.y - right.anchor.y || left.anchor.z - right.anchor.z || compareStrings(left.kind, right.kind) || compareStrings(left.facing, right.facing) || compareStrings(left.variantId ?? left.item?.id ?? '', right.variantId ?? right.item?.id ?? '') || (left.rotation ?? 0) - (right.rotation ?? 0); }
function compareStrings(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean { return Object.keys(value).every((key) => allowed.has(key)); }
function isValid<T>(value: { readonly valid: boolean; readonly value?: T }): value is { readonly valid: true; readonly value: T } { return value.valid === true && value.value !== undefined; }
