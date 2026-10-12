/** Verified semantic block-entity to Minecraft NBT mappings. */

import { isValidNamespacedResourceLocation } from '../../../content/resources/resource-location';
import { isSignId } from '../../../block-entities/sign/sign-id';
import { isVanillaSignColor } from '../../../block-entities/sign/sign-nbt';
import type {
  DecoratedPotBlockEntityData,
  SignBlockEntityData,
  SignSide,
  PlacedBlock,
} from '../../../domain/project.types';
import type {
  ItemContainerBlockEntityData,
  ItemSlotData,
} from '../../../block-entities/item-display/item-container';
import type { ItemStackData } from '../../../items/item-stack.types';
import type { MinecraftNbtCompound, MinecraftNbtTag } from '../codec/minecraft-structure-types';
import { verifiedInventoryContainerSchema } from '../../../block-entities/item-display/inventory-storage-schema';
import { type ItemMaxStackResolver } from '../../../items/item-stack-validation';
import { failure, hasUnknownRaw, isRecord } from './minecraft-structure-semantic-mapping-result';
import type { SemanticMappingResult } from './minecraft-structure-semantic-mapping-result';
import {
  byteTag,
  compound,
  intTag,
  list,
  stringTag,
} from '../codec/minecraft-structure-nbt-primitives';
import { mapItemStack } from './minecraft-structure-item-stack-mapper';
import {
  DECORATED_POT_DEFAULT_SHERD,
  DECORATED_POT_ID,
} from '../../../block-entities/decorated-pot/decorated-pot';

export function mapBlockEntity(
  block: PlacedBlock,
  index: number,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<MinecraftNbtCompound | undefined> {
  const value = block.blockEntityData;
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value))
    return failure(
      'unsupported-raw-nbt',
      `Block entity data at blocks.${index} is not a supported semantic value.`,
      `blocks.${index}.blockEntityData`,
    );
  switch (value['kind']) {
    case 'sign':
      return mapSign(block.id, value as unknown as SignBlockEntityData, index);
    case 'decorated-pot':
      return mapPot(
        block.id,
        value as unknown as DecoratedPotBlockEntityData,
        index,
        resolveMaxStackSize,
      );
    case 'conduit':
      return failure(
        'unsupported-block-entity',
        'Conduit semantic data is not modeled by the current ProjectDocument export contract.',
        `blocks.${index}.blockEntityData`,
      );
    case 'item-container':
      return mapContainer(
        block.id,
        value as unknown as ItemContainerBlockEntityData,
        index,
        resolveMaxStackSize,
      );
    default:
      return failure(
        'unsupported-raw-nbt',
        `Block entity kind at blocks.${index} is not supported by the semantic 15.3 mapper.`,
        `blocks.${index}.blockEntityData`,
      );
  }
}

function mapSign(
  blockId: string,
  data: SignBlockEntityData,
  index: number,
): SemanticMappingResult<MinecraftNbtCompound> {
  if (!isSignId(blockId))
    return failure(
      'invalid-block-entity',
      'Sign data is attached to a block without a verified vanilla sign mapping.',
      `blocks.${index}.id`,
    );
  if (!isRecord(data) || data['kind'] !== 'sign' || typeof data['waxed'] !== 'boolean')
    return failure(
      'invalid-block-entity',
      'Sign semantic data is malformed.',
      `blocks.${index}.blockEntityData`,
    );
  if (hasUnknownRaw(data['raw']))
    return failure(
      'unsupported-raw-nbt',
      'Sign raw data cannot be represented without loss.',
      `blocks.${index}.blockEntityData.raw`,
    );
  const front = mapSignSide(data['front'], `blocks.${index}.blockEntityData.front`);
  if (!front.ok) return front;
  const back = mapSignSide(data['back'], `blocks.${index}.blockEntityData.back`);
  if (!back.ok) return back;
  return {
    ok: true,
    value: compound({
      id: stringTag(
        blockId.endsWith('_hanging_sign') ? 'minecraft:hanging_sign' : 'minecraft:sign',
      ),
      front_text: front.value,
      back_text: back.value,
      is_waxed: byteTag(data['waxed']),
    }),
  };
}

function mapSignSide(value: unknown, path: string): SemanticMappingResult<MinecraftNbtCompound> {
  if (!isRecord(value))
    return failure('invalid-block-entity', 'Sign side data is malformed.', path);
  const side = value as Partial<SignSide>;
  if (
    !Array.isArray(side.lines) ||
    side.lines.length !== 4 ||
    !side.lines.every((line) => typeof line === 'string')
  )
    return failure(
      'invalid-block-entity',
      'Sign messages must contain exactly four string lines.',
      `${path}.lines`,
    );
  if (typeof side.color !== 'string' || !isVanillaSignColor(side.color))
    return failure(
      'invalid-block-entity',
      `Unsupported sign color '${String(side.color)}'.`,
      `${path}.color`,
    );
  if (typeof side.glowing !== 'boolean')
    return failure(
      'invalid-block-entity',
      'Sign glowing value must be boolean.',
      `${path}.glowing`,
    );
  if (
    side.filteredMessages !== undefined &&
    (!Array.isArray(side.filteredMessages) ||
      side.filteredMessages.length !== 4 ||
      !side.filteredMessages.every((line) => typeof line === 'string'))
  )
    return failure(
      'invalid-block-entity',
      'Filtered sign messages must contain exactly four strings.',
      `${path}.filteredMessages`,
    );
  const fields: Record<string, MinecraftNbtTag> = {
    messages: list(
      'string',
      side.lines.map((line) => stringTag(JSON.stringify(line))),
    ),
    color: stringTag(side.color),
    has_glowing_text: byteTag(side.glowing),
  };
  if (side.filteredMessages !== undefined)
    fields['filtered_messages'] = list(
      'string',
      side.filteredMessages.map((line) => stringTag(line)),
    );
  return { ok: true, value: compound(fields) };
}

function mapPot(
  blockId: string,
  data: DecoratedPotBlockEntityData,
  index: number,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<MinecraftNbtCompound> {
  if (blockId !== DECORATED_POT_ID)
    return failure(
      'invalid-block-entity',
      'Decorated Pot data is attached to a non-pot block.',
      `blocks.${index}.id`,
    );
  if (!isRecord(data) || data['kind'] !== 'decorated-pot' || !isRecord(data['decorations']))
    return failure(
      'invalid-block-entity',
      'Decorated Pot semantic data is malformed.',
      `blocks.${index}.blockEntityData`,
    );
  if (hasUnknownRaw(data['raw']))
    return failure(
      'unsupported-raw-nbt',
      'Decorated Pot raw data cannot be represented without loss.',
      `blocks.${index}.blockEntityData.raw`,
    );
  const decorations = data['decorations'] as Readonly<Record<string, unknown>>;
  const sides = [
    decorations['back'],
    decorations['left'],
    decorations['right'],
    decorations['front'],
  ];
  if (
    !sides.every((value) => typeof value === 'string' && isValidNamespacedResourceLocation(value))
  )
    return failure(
      'invalid-block-entity',
      'Decorated Pot sherd IDs must be valid namespaced ResourceLocations.',
      `blocks.${index}.blockEntityData.decorations`,
    );
  const fields: Record<string, MinecraftNbtTag> = { id: stringTag(DECORATED_POT_ID) };
  if (!sides.every((value) => value === DECORATED_POT_DEFAULT_SHERD))
    fields['sherds'] = list(
      'string',
      sides.map((value) => stringTag(value as string)),
    );
  if (data.item !== undefined) {
    const item = mapItemStack(
      data.item,
      `blocks.${index}.blockEntityData.item`,
      undefined,
      resolveMaxStackSize,
    );
    if (!item.ok) return item;
    fields['item'] = item.value;
  }
  return { ok: true, value: compound(fields) };
}

function mapContainer(
  blockId: string,
  data: ItemContainerBlockEntityData,
  index: number,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<MinecraftNbtCompound> {
  const schema = verifiedInventoryContainerSchema(blockId);
  if (schema && !schema.nbtSupported)
    return failure(
      'unsupported-block-entity',
      'Furnace export is deferred because the current semantic model cannot represent its operational NBT (burn/cook timers and recipe-use data) losslessly.',
      `blocks.${index}.blockEntityData`,
    );
  if (!schema)
    return failure(
      'unsupported-block-entity',
      'Inventory block entity data is only supported for verified vanilla container IDs.',
      `blocks.${index}.id`,
    );
  if (
    !isRecord(data) ||
    data['kind'] !== 'item-container' ||
    data['hostKind'] !== 'inventory-storage' ||
    !Array.isArray(data['slots'])
  )
    return failure(
      'invalid-block-entity',
      'Inventory container data must use the inventory-storage host and a slot array.',
      `blocks.${index}.blockEntityData`,
    );
  const rawValidation = validateContainerRaw(
    data['raw'],
    schema.slotCount,
    `blocks.${index}.blockEntityData.raw`,
    resolveMaxStackSize,
  );
  if (!rawValidation.ok) return rawValidation;
  const slots = validateContainerSlots(
    data['slots'],
    schema.slotCount,
    `blocks.${index}.blockEntityData.slots`,
  );
  if (!slots.ok) return slots;
  const items = slots.value.flatMap((entry) =>
    entry.stack
      ? [
          mapItemStack(
            entry.stack,
            `blocks.${index}.blockEntityData.slots.${entry.slot}.stack`,
            entry.slot,
            resolveMaxStackSize,
          ),
        ]
      : [],
  );
  const mappedItems: MinecraftNbtTag[] = [];
  for (const item of items) {
    if (!item.ok) return item;
    mappedItems.push(item.value);
  }
  const fields: Record<string, MinecraftNbtTag> = {
    id: stringTag(schema.nbtId),
    Items: list('compound', mappedItems as MinecraftNbtCompound[]),
  };
  if (blockId === 'minecraft:hopper') fields['TransferCooldown'] = intTag(0);
  return { ok: true, value: compound(fields) };
}

function validateContainerSlots(
  value: readonly ItemSlotData[],
  slotCount: number,
  path: string,
): SemanticMappingResult<readonly ItemSlotData[]> {
  const seen = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (
      !isRecord(entry) ||
      !Number.isInteger(entry.slot) ||
      entry.slot < 0 ||
      entry.slot >= slotCount
    )
      return failure(
        'invalid-block-entity',
        `Container slot must be an integer from 0 to ${slotCount - 1}.`,
        `${path}.${index}.slot`,
      );
    if (seen.has(entry.slot))
      return failure(
        'invalid-block-entity',
        'Container slots must not contain duplicate slot numbers.',
        `${path}.${index}.slot`,
      );
    seen.add(entry.slot);
  }
  return { ok: true, value };
}

function validateContainerRaw(
  raw: unknown,
  slotCount: number,
  path: string,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (
    !isRecord(raw) ||
    Object.keys(raw).some((key) => key !== 'kind' && key !== 'hostKind' && key !== 'slots')
  )
    return failure(
      'unsupported-raw-nbt',
      'Container raw data cannot be represented without loss.',
      path,
    );
  if (raw['kind'] !== undefined && raw['kind'] !== 'item-container')
    return failure(
      'unsupported-raw-nbt',
      'Container raw data has an unsupported semantic kind.',
      `${path}.kind`,
    );
  if (raw['hostKind'] !== undefined && raw['hostKind'] !== 'inventory-storage')
    return failure(
      'unsupported-raw-nbt',
      'Container raw data has an unsupported host kind.',
      `${path}.hostKind`,
    );
  if (raw['slots'] === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(raw['slots']))
    return failure('unsupported-raw-nbt', 'Container raw slots must be an array.', `${path}.slots`);
  const slots = validateContainerSlots(
    raw['slots'] as readonly ItemSlotData[],
    slotCount,
    `${path}.slots`,
  );
  if (!slots.ok)
    return failure('unsupported-raw-nbt', slots.diagnostic.message, slots.diagnostic.path ?? path);
  for (const entry of raw['slots']) {
    if (!isRecord(entry) || entry['stack'] === undefined) continue;
    const stack = mapItemStack(
      entry['stack'] as ItemStackData,
      `${path}.slots.${String(entry['slot'])}.stack`,
      undefined,
      resolveMaxStackSize,
    );
    if (!stack.ok)
      return failure(
        'unsupported-raw-nbt',
        stack.diagnostic.message,
        stack.diagnostic.path ?? path,
      );
  }
  return { ok: true, value: undefined };
}
