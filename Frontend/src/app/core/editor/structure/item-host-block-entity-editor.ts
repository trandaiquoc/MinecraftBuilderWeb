import { VoxelCoordinate } from '../../domain/project.types';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { BlockCapability } from '../../blocks/capabilities/block-capability.types';
import { defaultItemContainerData, setItemContainerSlot } from '../../block-entities/item-display/item-container';
import { ItemStackData } from '../../items/item-stack.types';
import { validateItemStack } from '../../items/item-stack-validation';
import { verifiedInventoryContainerSchema } from '../../block-entities/item-display/inventory-storage-schema';
import { isBlockLocked } from '../groups/group-membership';
import { BlockEntityEditTransaction } from './block-entity-edit-transaction';

type EditableItemHost = Extract<BlockCapability, { kind: 'item-display' | 'item-storage-display' }> | (Extract<BlockCapability, { kind: 'inventory-storage' }> & { readonly slotCount: number });

export class ItemHostBlockEntityEditor {
  constructor(private readonly transaction: BlockEntityEditTransaction, private readonly library: BlockLibraryService) {}

  setSlot(position: VoxelCoordinate, slot: number, stack: ItemStackData | undefined): boolean {
    return this.transaction.execute('Item slot edit', position, (project, block) => {
      const host = this.host(block.id);
      if (!host || !Number.isInteger(slot) || slot < 0 || slot >= host.slotCount || isBlockLocked(block, project.groups) || (stack !== undefined && !validateItemStack(stack, (id) => this.library.maxStackSizeFor(id)).valid)) return undefined;
      return { ...block, blockEntityData: setItemContainerSlot(block.blockEntityData, host.kind, host.slotCount, slot, stack) };
    });
  }

  private host(blockId: string): EditableItemHost | undefined {
    const definition = this.library.get(blockId);
    const display = blockCapability(definition, 'item-storage-display') ?? blockCapability(definition, 'item-display');
    if (display) return display;
    const inventory = verifiedInventoryContainerSchema(blockId);
    return inventory?.editable ? { kind: 'inventory-storage', slotCount: inventory.slotCount, evidence: 'verified' } : undefined;
  }

  defaultData(blockId: string): ReturnType<typeof defaultItemContainerData> | undefined {
    const host = this.host(blockId);
    return host ? defaultItemContainerData(host.kind, host.slotCount) : undefined;
  }
}
