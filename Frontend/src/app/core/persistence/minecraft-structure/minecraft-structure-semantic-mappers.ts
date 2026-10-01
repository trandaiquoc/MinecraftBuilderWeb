import { isValidNamespacedResourceLocation } from '../../content/resource-location';
import type { DecoratedPotBlockEntityData, SignBlockEntityData, SignSide, PlacedBlock } from '../../domain/project.types';
import type { ItemContainerBlockEntityData, ItemSlotData } from '../../block-entities/item-display/item-container';
import type { ItemStackData } from '../../items/item-stack.types';
import { decorationAabb, paintingEntityPosition } from '../../decorations/placement/decoration-placement';
import { paintingVariant, type DecorationFacing, type PlacedDecoration } from '../../decorations/decoration.types';
import type { MinecraftStructureDiagnostic } from './minecraft-structure-contract';
import type { MinecraftNbtCompound, MinecraftNbtList, MinecraftNbtTag } from './minecraft-structure-types';
import { verifiedInventoryContainerSchema } from '../../block-entities/item-display/inventory-storage-schema';

export interface SemanticMappingSuccess<T> { readonly ok: true; readonly value: T; }
export interface SemanticMappingFailure { readonly ok: false; readonly diagnostic: MinecraftStructureDiagnostic; }
export type SemanticMappingResult<T> = SemanticMappingSuccess<T> | SemanticMappingFailure;

const signColors = new Set(['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']);
const horizontalPaintingFacing: Readonly<Record<'north' | 'south' | 'west' | 'east', number>> = { south: 0, west: 1, north: 2, east: 3 };
const entityFacing: Readonly<Record<DecorationFacing, number>> = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };

export function mapBlockEntity(block: PlacedBlock, index: number): SemanticMappingResult<MinecraftNbtCompound | undefined> {
  const value = block.blockEntityData;
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)) return failure('unsupported-raw-nbt', `Block entity data at blocks.${index} is not a supported semantic value.`, `blocks.${index}.blockEntityData`);
  switch (value['kind']) {
    case 'sign': return mapSign(block.id, value as unknown as SignBlockEntityData, index);
    case 'decorated-pot': return mapPot(block.id, value as unknown as DecoratedPotBlockEntityData, index);
    case 'conduit': return failure('unsupported-block-entity', 'Conduit semantic data is not modeled by the current ProjectDocument export contract.', `blocks.${index}.blockEntityData`);
    case 'item-container': return mapContainer(block.id, value as unknown as ItemContainerBlockEntityData, index);
    default: return failure('unsupported-raw-nbt', `Block entity kind at blocks.${index} is not supported by the semantic 15.3 mapper.`, `blocks.${index}.blockEntityData`);
  }
}

export function mapDecoration(decoration: PlacedDecoration, index: number): SemanticMappingResult<{ readonly pos: readonly [number, number, number]; readonly blockPos: readonly [number, number, number]; readonly nbt: MinecraftNbtCompound }> {
  if (hasUnknownRaw(decoration.raw)) return failure('unsupported-raw-nbt', 'Decoration raw data is outside the verified semantic mapper.', `decorations.${index}.raw`);
  const expectedEntityType = decoration.kind === 'painting' ? 'minecraft:painting' : decoration.kind === 'item-frame' ? 'minecraft:item_frame' : 'minecraft:glow_item_frame';
  if (decoration.entityTypeId !== expectedEntityType) return failure('invalid-decoration', 'Decoration kind and entityTypeId do not describe the same Minecraft entity.', `decorations.${index}.entityTypeId`);
  if (decoration.kind === 'painting') return mapPainting(decoration, index);
  return mapItemFrame(decoration, index);
}

function mapSign(blockId: string, data: SignBlockEntityData, index: number): SemanticMappingResult<MinecraftNbtCompound> {
  if (!isVanillaSignBlockId(blockId)) return failure('invalid-block-entity', 'Sign data is attached to a block without a verified vanilla sign mapping.', `blocks.${index}.id`);
  if (!isRecord(data) || data['kind'] !== 'sign' || typeof data['waxed'] !== 'boolean') return failure('invalid-block-entity', 'Sign semantic data is malformed.', `blocks.${index}.blockEntityData`);
  if (hasUnknownRaw(data['raw'])) return failure('unsupported-raw-nbt', 'Sign raw data cannot be represented without loss.', `blocks.${index}.blockEntityData.raw`);
  const front = mapSignSide(data['front'], `blocks.${index}.blockEntityData.front`);
  if (!front.ok) return front;
  const back = mapSignSide(data['back'], `blocks.${index}.blockEntityData.back`);
  if (!back.ok) return back;
  return { ok: true, value: compound({
    id: stringTag(blockId.endsWith('_hanging_sign') ? 'minecraft:hanging_sign' : 'minecraft:sign'),
    front_text: front.value,
    back_text: back.value,
    is_waxed: byteTag(data['waxed']),
  }) };
}

function mapSignSide(value: unknown, path: string): SemanticMappingResult<MinecraftNbtCompound> {
  if (!isRecord(value)) return failure('invalid-block-entity', 'Sign side data is malformed.', path);
  const side = value as Partial<SignSide>;
  if (!Array.isArray(side.lines) || side.lines.length !== 4 || !side.lines.every((line) => typeof line === 'string')) return failure('invalid-block-entity', 'Sign messages must contain exactly four string lines.', `${path}.lines`);
  if (typeof side.color !== 'string' || !signColors.has(side.color)) return failure('invalid-block-entity', `Unsupported sign color '${String(side.color)}'.`, `${path}.color`);
  if (typeof side.glowing !== 'boolean') return failure('invalid-block-entity', 'Sign glowing value must be boolean.', `${path}.glowing`);
  if (side.filteredMessages !== undefined && (!Array.isArray(side.filteredMessages) || side.filteredMessages.length !== 4 || !side.filteredMessages.every((line) => typeof line === 'string'))) return failure('invalid-block-entity', 'Filtered sign messages must contain exactly four strings.', `${path}.filteredMessages`);
  const fields: Record<string, MinecraftNbtTag> = {
    messages: list('string', side.lines.map((line) => stringTag(JSON.stringify(line)))),
    color: stringTag(side.color),
    has_glowing_text: byteTag(side.glowing),
  };
  if (side.filteredMessages !== undefined) fields['filtered_messages'] = list('string', side.filteredMessages.map((line) => stringTag(line)));
  return { ok: true, value: compound(fields) };
}

function mapPot(blockId: string, data: DecoratedPotBlockEntityData, index: number): SemanticMappingResult<MinecraftNbtCompound> {
  if (blockId !== 'minecraft:decorated_pot') return failure('invalid-block-entity', 'Decorated Pot data is attached to a non-pot block.', `blocks.${index}.id`);
  if (!isRecord(data) || data['kind'] !== 'decorated-pot' || !isRecord(data['decorations'])) return failure('invalid-block-entity', 'Decorated Pot semantic data is malformed.', `blocks.${index}.blockEntityData`);
  if (hasUnknownRaw(data['raw'])) return failure('unsupported-raw-nbt', 'Decorated Pot raw data cannot be represented without loss.', `blocks.${index}.blockEntityData.raw`);
  const decorations = data['decorations'] as Readonly<Record<string, unknown>>;
  const sides = [decorations['back'], decorations['left'], decorations['right'], decorations['front']];
  if (!sides.every((value) => typeof value === 'string' && isValidNamespacedResourceLocation(value))) return failure('invalid-block-entity', 'Decorated Pot sherd IDs must be valid namespaced ResourceLocations.', `blocks.${index}.blockEntityData.decorations`);
  const fields: Record<string, MinecraftNbtTag> = { id: stringTag('minecraft:decorated_pot') };
  if (!sides.every((value) => value === 'minecraft:brick')) fields['sherds'] = list('string', sides.map((value) => stringTag(value as string)));
  if (data.item !== undefined) {
    const item = mapItemStack(data.item, `blocks.${index}.blockEntityData.item`);
    if (!item.ok) return item;
    fields['item'] = item.value;
  }
  return { ok: true, value: compound(fields) };
}

function mapContainer(blockId: string, data: ItemContainerBlockEntityData, index: number): SemanticMappingResult<MinecraftNbtCompound> {
  const schema = verifiedInventoryContainerSchema(blockId);
  if (schema && !schema.nbtSupported) return failure('unsupported-block-entity', 'Furnace export is deferred because the current semantic model cannot represent its operational NBT (burn/cook timers and recipe-use data) losslessly.', `blocks.${index}.blockEntityData`);
  if (!schema) return failure('unsupported-block-entity', 'Inventory block entity data is only supported for verified vanilla container IDs.', `blocks.${index}.id`);
  if (!isRecord(data) || data['kind'] !== 'item-container' || data['hostKind'] !== 'inventory-storage' || !Array.isArray(data['slots'])) return failure('invalid-block-entity', 'Inventory container data must use the inventory-storage host and a slot array.', `blocks.${index}.blockEntityData`);
  const rawValidation = validateContainerRaw(data['raw'], schema.slotCount, `blocks.${index}.blockEntityData.raw`);
  if (!rawValidation.ok) return rawValidation;
  const slots = validateContainerSlots(data['slots'], schema.slotCount, `blocks.${index}.blockEntityData.slots`);
  if (!slots.ok) return slots;
  const items = slots.value.flatMap((entry) => entry.stack ? [mapItemStack(entry.stack, `blocks.${index}.blockEntityData.slots.${entry.slot}.stack`, entry.slot)] : []);
  const mappedItems: MinecraftNbtTag[] = [];
  for (const item of items) {
    if (!item.ok) return item;
    mappedItems.push(item.value);
  }
  const fields: Record<string, MinecraftNbtTag> = { id: stringTag(schema.nbtId), Items: list('compound', mappedItems as MinecraftNbtCompound[]) };
  if (blockId === 'minecraft:hopper') fields['TransferCooldown'] = intTag(0);
  return { ok: true, value: compound(fields) };
}

function validateContainerSlots(value: readonly ItemSlotData[], slotCount: number, path: string): SemanticMappingResult<readonly ItemSlotData[]> {
  const seen = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry) || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= slotCount) return failure('invalid-block-entity', `Container slot must be an integer from 0 to ${slotCount - 1}.`, `${path}.${index}.slot`);
    if (seen.has(entry.slot)) return failure('invalid-block-entity', 'Container slots must not contain duplicate slot numbers.', `${path}.${index}.slot`);
    seen.add(entry.slot);
  }
  return { ok: true, value };
}

function mapPainting(decoration: PlacedDecoration, index: number): SemanticMappingResult<{ readonly pos: readonly [number, number, number]; readonly blockPos: readonly [number, number, number]; readonly nbt: MinecraftNbtCompound }> {
  if (!decoration.variantId || !isHorizontal(decoration.facing)) return failure('invalid-decoration', 'Painting requires a known horizontal facing and variant.', `decorations.${index}`);
  const variant = paintingVariant(decoration.variantId);
  if (!variant) return failure('unknown-painting-variant', 'Painting variant dimensions are unavailable.', `decorations.${index}.variantId`);
  const resourceId = namespaced(decoration.variantId);
  if (!resourceId || horizontalPaintingFacing[decoration.facing] === undefined) return failure('invalid-decoration', 'Painting variant or facing is invalid.', `decorations.${index}`);
  const position = paintingEntityPosition(decoration.anchor, decoration.facing, variant);
  return { ok: true, value: { pos: tuple3(position.x, position.y, position.z), blockPos: tuple3i(decoration.anchor.x, decoration.anchor.y, decoration.anchor.z), nbt: compound({ id: stringTag('minecraft:painting'), Pos: doubleList(position), TileX: intTag(decoration.anchor.x), TileY: intTag(decoration.anchor.y), TileZ: intTag(decoration.anchor.z), variant: stringTag(resourceId), facing: byteTag(horizontalPaintingFacing[decoration.facing]) }) } };
}

function mapItemFrame(decoration: PlacedDecoration, index: number): SemanticMappingResult<{ readonly pos: readonly [number, number, number]; readonly blockPos: readonly [number, number, number]; readonly nbt: MinecraftNbtCompound }> {
  if (entityFacing[decoration.facing] === undefined) return failure('invalid-decoration', 'Item Frame requires a supported facing.', `decorations.${index}.facing`);
  if (decoration.rotation !== undefined && (!Number.isInteger(decoration.rotation) || decoration.rotation < 0 || decoration.rotation > 7)) return failure('invalid-decoration', 'Item Frame rotation must be an integer from 0 to 7.', `decorations.${index}.rotation`);
  if (decoration.itemDropChance !== undefined && (!Number.isFinite(decoration.itemDropChance) || decoration.itemDropChance < 0 || decoration.itemDropChance > 1)) return failure('invalid-decoration', 'Item Frame drop chance must be between 0 and 1.', `decorations.${index}.itemDropChance`);
  const bounds = decorationAabb(decoration); const position = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const fields: Record<string, MinecraftNbtTag> = { id: stringTag(decoration.entityTypeId), Pos: doubleList(position), TileX: intTag(decoration.anchor.x), TileY: intTag(decoration.anchor.y), TileZ: intTag(decoration.anchor.z), Facing: byteTag(entityFacing[decoration.facing]), ItemRotation: byteTag(decoration.rotation ?? 0), ItemDropChance: floatTag(decoration.itemDropChance ?? 1), Fixed: byteTag(decoration.fixed === true), Invisible: byteTag(decoration.invisible === true) };
  if (decoration.item !== undefined) {
    const item = mapItemStack(decoration.item, `decorations.${index}.item`);
    if (!item.ok) return item;
    fields['Item'] = item.value;
  }
  return { ok: true, value: { pos: tuple3(position.x, position.y, position.z), blockPos: tuple3i(decoration.anchor.x, decoration.anchor.y, decoration.anchor.z), nbt: compound(fields) } };
}

function mapItemStack(item: ItemStackData, path: string, slot?: number): SemanticMappingResult<MinecraftNbtCompound> {
  if (!isRecord(item)) return failure('invalid-entity-item', 'Item stack must be an object.', path);
  if (!isValidNamespacedResourceLocation(item.id)) return failure('invalid-entity-item', 'Item ID must be a valid namespaced ResourceLocation.', `${path}.id`);
  if (!Number.isInteger(item.count) || item.count < 1) return failure('invalid-entity-item', 'Item count must be a positive integer.', `${path}.count`);
  if (item.components !== undefined) return failure('unsupported-raw-nbt', 'Item components are not represented by the verified 15.3 ItemStack mapper.', `${path}.components`);
  return { ok: true, value: compound({ ...(slot === undefined ? {} : { Slot: byteTag(slot) }), id: stringTag(item.id), count: intTag(item.count) }) };
}

function isVanillaSignBlockId(id: string): boolean { return id.startsWith('minecraft:') && (/(?:^|_)(?:wall_)?sign$/.test(id.slice('minecraft:'.length)) || /(?:^|_)(?:wall_)?hanging_sign$/.test(id.slice('minecraft:'.length))); }
function isHorizontal(value: DecorationFacing): value is 'north' | 'south' | 'west' | 'east' { return value === 'north' || value === 'south' || value === 'west' || value === 'east'; }
function namespaced(value: string): string | undefined { const candidate = value.includes(':') ? value : `minecraft:${value}`; return isValidNamespacedResourceLocation(candidate) ? candidate : undefined; }
function hasUnknownRaw(raw: unknown): boolean { return raw !== undefined && (!isRecord(raw) || Object.keys(raw).length > 0); }
function validateContainerRaw(raw: unknown, slotCount: number, path: string): SemanticMappingResult<undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!isRecord(raw) || Object.keys(raw).some((key) => key !== 'kind' && key !== 'hostKind' && key !== 'slots')) return failure('unsupported-raw-nbt', 'Container raw data cannot be represented without loss.', path);
  if (raw['kind'] !== undefined && raw['kind'] !== 'item-container') return failure('unsupported-raw-nbt', 'Container raw data has an unsupported semantic kind.', `${path}.kind`);
  if (raw['hostKind'] !== undefined && raw['hostKind'] !== 'inventory-storage') return failure('unsupported-raw-nbt', 'Container raw data has an unsupported host kind.', `${path}.hostKind`);
  if (raw['slots'] === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(raw['slots'])) return failure('unsupported-raw-nbt', 'Container raw slots must be an array.', `${path}.slots`);
  const slots = validateContainerSlots(raw['slots'] as readonly ItemSlotData[], slotCount, `${path}.slots`);
  if (!slots.ok) return failure('unsupported-raw-nbt', slots.diagnostic.message, slots.diagnostic.path ?? path);
  for (const entry of raw['slots']) {
    if (!isRecord(entry) || entry['stack'] === undefined) continue;
    const stack = mapItemStack(entry['stack'] as ItemStackData, `${path}.slots.${String(entry['slot'])}.stack`);
    if (!stack.ok) return failure('unsupported-raw-nbt', stack.diagnostic.message, stack.diagnostic.path ?? path);
  }
  return { ok: true, value: undefined };
}
function failure(code: MinecraftStructureDiagnostic['code'], message: string, path: string): SemanticMappingFailure { return { ok: false, diagnostic: { code, message, path } }; }
function compound(value: Record<string, MinecraftNbtTag>): MinecraftNbtCompound { return { type: 'compound', value }; }
function stringTag(value: string): MinecraftNbtTag { return { type: 'string', value }; }
function intTag(value: number): MinecraftNbtTag { return { type: 'int', value }; }
function byteTag(value: boolean | number): MinecraftNbtTag { return { type: 'byte', value: typeof value === 'boolean' ? value ? 1 : 0 : value }; }
function floatTag(value: number): MinecraftNbtTag { return { type: 'float', value }; }
function doubleList(position: { readonly x: number; readonly y: number; readonly z: number }): MinecraftNbtList { return list('double', [position.x, position.y, position.z].map((value) => ({ type: 'double', value }))); }
function list<T extends MinecraftNbtTag['type']>(elementType: T, values: readonly Extract<MinecraftNbtTag, { type: T }>[]): MinecraftNbtList { return { type: 'list', elementType, value: values }; }
function tuple3(x: number, y: number, z: number): readonly [number, number, number] { return [x, y, z]; }
function tuple3i(x: number, y: number, z: number): readonly [number, number, number] { return [x, y, z]; }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
