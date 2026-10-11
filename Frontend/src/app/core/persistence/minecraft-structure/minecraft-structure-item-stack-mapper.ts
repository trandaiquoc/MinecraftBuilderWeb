/** Semantic ItemStack validation and typed NBT mapping. */

import { isValidNamespacedResourceLocation } from '../../content/resource-location';
import type { ItemStackData } from '../../items/item-stack.types';
import type { MinecraftNbtCompound } from './minecraft-structure-types';
import { validateItemStack, type ItemMaxStackResolver } from '../../items/item-stack-validation';
import { failure, isRecord } from './minecraft-structure-semantic-mapping-result';
import type { SemanticMappingResult } from './minecraft-structure-semantic-mapping-result';
import { byteTag, compound, intTag, stringTag } from './minecraft-structure-nbt-primitives';

export function mapItemStack(
  item: ItemStackData,
  path: string,
  slot?: number,
  resolveMaxStackSize?: ItemMaxStackResolver,
): SemanticMappingResult<MinecraftNbtCompound> {
  if (!isRecord(item)) return failure('invalid-entity-item', 'Item stack must be an object.', path);
  if (!isValidNamespacedResourceLocation(item.id))
    return failure(
      'invalid-entity-item',
      'Item ID must be a valid namespaced ResourceLocation.',
      `${path}.id`,
    );
  const validation = validateItemStack(item, resolveMaxStackSize, { rejectComponents: true });
  if (!validation.valid)
    return failure(
      validation.code === 'unsupported-components' ? 'unsupported-raw-nbt' : 'invalid-entity-item',
      validation.message ?? 'Item stack count is invalid.',
      `${path}.count`,
    );
  if (item.components !== undefined)
    return failure(
      'unsupported-raw-nbt',
      'Item components are not represented by the verified 15.3 ItemStack mapper.',
      `${path}.components`,
    );
  return {
    ok: true,
    value: compound({
      ...(slot === undefined ? {} : { Slot: byteTag(slot) }),
      id: stringTag(item.id),
      count: intTag(item.count),
    }),
  };
}
