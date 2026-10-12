/** Conversion between Structure JSON block entities and project semantic data. */

import type { ProjectBlockEntityData, SignSide } from '../../../domain/project.types';
import { verifiedInventoryContainerSchema } from '../../../block-entities/item-display/inventory-storage-schema';
import type { ItemStackData } from '../../../items/item-stack.types';
import type { BlockDefinition } from '../../../blocks/catalog/block-definition.types';
import { blockCapability } from '../../../blocks/capabilities/block-capability-resolver';
import {
  defaultItemContainerData,
  setItemContainerSlot,
} from '../../../block-entities/item-display/item-container';
import { defaultDecoratedPotData } from '../../../block-entities/decorated-pot/decorated-pot';
import { isStructureJsonSignHost } from './structure-json-block-entity-host';
import type {
  StructureJsonBlockEntity,
  StructureJsonItem,
  StructureJsonSignSide,
} from '../structure-json-contracts';

export function projectBlockEntityDataFromStructureJson(
  value: StructureJsonBlockEntity,
  blockId: string,
  definition?: BlockDefinition,
): ProjectBlockEntityData | undefined {
  if (value.kind === 'sign')
    return {
      kind: 'sign',
      front: toProjectSignSide(value.front),
      back: toProjectSignSide(value.back),
      waxed: value.waxed,
    };
  if (value.kind === 'decorated-pot')
    return blockId === 'minecraft:decorated_pot'
      ? {
          ...defaultDecoratedPotData(),
          decorations: value.decorations,
          ...(value.item ? { item: toProjectItem(value.item) } : {}),
        }
      : undefined;
  const capability =
    blockCapability(definition, 'item-display') ??
    blockCapability(definition, 'item-storage-display');
  const schema = verifiedInventoryContainerSchema(blockId);
  if (capability) {
    const data = defaultItemContainerData(capability.kind, capability.slotCount);
    return value.items.reduce(
      (current, entry) =>
        setItemContainerSlot(
          current,
          capability.kind,
          capability.slotCount,
          entry.slot,
          toProjectItem(entry.item),
        ),
      data,
    );
  }
  if (schema?.editable) {
    const data = defaultItemContainerData('inventory-storage', schema.slotCount);
    return value.items.reduce(
      (current, entry) =>
        setItemContainerSlot(
          current,
          'inventory-storage',
          schema.slotCount,
          entry.slot,
          toProjectItem(entry.item),
        ),
      data,
    );
  }
  return undefined;
}

function toProjectSignSide(side: StructureJsonSignSide): SignSide {
  return {
    lines: side.lines,
    color: side.color,
    glowing: side.glowing,
    ...(side.filteredMessages ? { filteredMessages: side.filteredMessages } : {}),
  };
}

function toProjectItem(item: StructureJsonItem): ItemStackData {
  return {
    id: item.id,
    count: item.count ?? 1,
    ...(item.components ? { components: item.components } : {}),
  };
}

export function blockEntityToStructureJson(
  value: ProjectBlockEntityData | undefined,
  blockId: string,
  definition?: BlockDefinition,
): StructureJsonBlockEntity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (value.kind === 'sign') {
    const data = value as Extract<ProjectBlockEntityData, { kind: 'sign' }>;
    return isStructureJsonSignHost(blockId, definition)
      ? {
          kind: 'sign',
          front: signSideToJson(data.front),
          back: signSideToJson(data.back),
          waxed: data.waxed,
        }
      : undefined;
  }
  if (value.kind === 'decorated-pot' && blockId === 'minecraft:decorated_pot') {
    const data = value as Extract<ProjectBlockEntityData, { kind: 'decorated-pot' }>;
    return {
      kind: 'decorated-pot',
      decorations: data.decorations,
      ...(data.item ? { item: toStructureJsonItem(data.item) } : {}),
    };
  }
  if (value.kind === 'item-container') {
    const data =
      value as import('../../../block-entities/item-display/item-container').ItemContainerBlockEntityData;
    const capability =
      blockCapability(definition, 'item-display') ??
      blockCapability(definition, 'item-storage-display');
    const validHost =
      data.hostKind === 'inventory-storage'
        ? verifiedInventoryContainerSchema(blockId)?.editable === true
        : capability?.kind === data.hostKind;
    if (validHost)
      return {
        kind: 'container',
        items: data.slots
          .filter((slot) => slot.stack)
          .map((slot) => ({ slot: slot.slot, item: toStructureJsonItem(slot.stack!) }))
          .sort((a, b) => a.slot - b.slot),
      };
  }
  return undefined;
}

function signSideToJson(side: SignSide): StructureJsonSignSide {
  return {
    lines: side.lines,
    color: side.color,
    glowing: side.glowing,
    ...(side.filteredMessages ? { filteredMessages: side.filteredMessages } : {}),
  };
}

export function toStructureJsonItem(item: ItemStackData): StructureJsonItem {
  return {
    id: item.id,
    ...(item.count === 1 ? {} : { count: item.count }),
    ...(item.components === undefined ? {} : { components: item.components }),
  };
}
