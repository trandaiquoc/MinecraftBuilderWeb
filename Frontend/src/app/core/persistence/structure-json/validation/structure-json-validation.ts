/** Semantic validation against item and block capabilities. */

import { verifiedInventoryContainerSchema } from '../../../block-entities/item-display/inventory-storage-schema';
import { validateItemStack } from '../../../items/item-stack-validation';
import type { BlockDefinition } from '../../../blocks/catalog/block-definition.types';
import { blockCapability } from '../../../blocks/capabilities/block-capability-resolver';
import { parseStructureJson } from '../import/structure-json-parser';
import { isStructureJsonSignHost } from '../block-entities/structure-json-block-entity-host';
import {
  DECORATED_POT_DEFAULT_SHERD,
  DECORATED_POT_ID,
} from '../../../block-entities/decorated-pot/decorated-pot';
import type {
  StructureJson,
  StructureJsonBlockEntity,
  StructureJsonDefinitionResolver,
  StructureJsonItem,
  StructureJsonValidationResult,
} from '../structure-json-contracts';

export function validateStructureJson(
  serialized: string,
  resolveDefinition?: StructureJsonDefinitionResolver,
  resolveMaxStackSize?: (id: string) => number | undefined,
): StructureJsonValidationResult {
  const parsed = parseStructureJson(serialized);
  return parsed.valid && parsed.value
    ? validateStructureJsonValue(parsed.value, resolveDefinition, resolveMaxStackSize)
    : parsed;
}

export function validateStructureJsonValue(
  value: StructureJson,
  resolveDefinition?: StructureJsonDefinitionResolver,
  resolveMaxStackSize?: (id: string) => number | undefined,
): StructureJsonValidationResult {
  for (let index = 0; index < value.blocks.length; index += 1) {
    const block = value.blocks[index];
    if (block.blockEntity) {
      const error = validateStructureJsonBlockEntity(
        block.blockEntity,
        block.id,
        resolveDefinition?.(block.id),
        resolveMaxStackSize,
      );
      if (error)
        return {
          valid: false,
          code: 'block-entity',
          path: `blocks[${index}].blockEntity.${error}`,
        };
    }
  }
  for (let index = 0; index < value.decorations.length; index += 1) {
    const decoration = value.decorations[index];
    const item = decoration.kind === 'painting' ? undefined : decoration.item;
    if (!item) continue;
    const result = validateItemForStructureJson(item, resolveMaxStackSize);
    if (!result.valid)
      return {
        valid: false,
        code: 'decoration',
        path: `decorations[${index}].item.${result.code}`,
      };
  }
  return { valid: true };
}

export function validateStructureJsonBlockEntity(
  value: StructureJsonBlockEntity,
  blockId: string,
  definition?: BlockDefinition,
  resolveMaxStackSize?: (id: string) => number | undefined,
): string | undefined {
  const itemError = (item: StructureJsonItem): string | undefined =>
    validateItemForStructureJson(item, resolveMaxStackSize).code;
  if (value.kind === 'sign')
    return isStructureJsonSignHost(blockId, definition) ? undefined : 'incompatible-sign';
  if (value.kind === 'decorated-pot')
    return blockId === DECORATED_POT_ID
      ? itemError(value.item ?? { id: DECORATED_POT_DEFAULT_SHERD })
      : 'incompatible-decorated-pot';
  const capability =
    blockCapability(definition, 'item-display') ??
    blockCapability(definition, 'item-storage-display');
  const schema = verifiedInventoryContainerSchema(blockId);
  const slotCount = capability?.slotCount ?? (schema?.editable ? schema.slotCount : undefined);
  if (slotCount === undefined || schema?.nbtSupported === false) return 'incompatible-container';
  for (const entry of value.items) {
    if (entry.slot >= slotCount) return 'slot-out-of-range';
    const error = itemError(entry.item);
    if (error) return error;
  }
  return undefined;
}

function validateItemForStructureJson(
  item: StructureJsonItem,
  resolveMaxStackSize?: (id: string) => number | undefined,
):
  | { readonly valid: true; readonly code?: undefined }
  | { readonly valid: false; readonly code: string } {
  const result = validateItemStack(
    {
      id: item.id,
      count: item.count ?? 1,
      ...(item.components ? { components: item.components } : {}),
    },
    resolveMaxStackSize,
  );
  return result.valid
    ? { valid: true }
    : { valid: false, code: result.code ?? 'invalid-item-stack' };
}
