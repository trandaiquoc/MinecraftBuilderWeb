import { VoxelCoordinate } from '../../domain/project.types';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import { isBlockLocked } from '../groups/group-membership';
import { decoratedPotData, defaultDecoratedPotData, isDecoratedPotSherd } from '../../block-entities/decorated-pot/decorated-pot';
import { ItemStackData } from '../../items/item-stack.types';
import { validateItemStack } from '../../items/item-stack-validation';
import { BlockEntityEditTransaction } from './block-entity-edit-transaction';

type PotSide = 'back' | 'left' | 'right' | 'front';

export class DecoratedPotBlockEntityEditor {
  constructor(private readonly transaction: BlockEntityEditTransaction, private readonly library: BlockLibraryService) {}

  defaultData(blockId: string) {
    return this.isPot(blockId) ? defaultDecoratedPotData() : undefined;
  }

  updateDecoration(position: VoxelCoordinate, side: PotSide, sherd: string): boolean {
    return this.transaction.execute('Decorated Pot pattern edit', position, (project, block) => {
      if (!this.isPot(block.id) || !isDecoratedPotSherd(sherd) || isBlockLocked(block, project.groups)) return undefined;
      const current = decoratedPotData(block.blockEntityData);
      return { ...block, blockEntityData: { ...current, decorations: { ...current.decorations, [side]: sherd } } };
    });
  }

  setItem(position: VoxelCoordinate, stack: ItemStackData | undefined): boolean {
    return this.transaction.execute('Decorated Pot item edit', position, (project, block) => {
      if (!this.isPot(block.id) || isBlockLocked(block, project.groups) || (stack !== undefined && !validateItemStack(stack, (id) => this.library.maxStackSizeFor(id)).valid)) return undefined;
      const current = decoratedPotData(block.blockEntityData);
      return { ...block, blockEntityData: { ...current, ...(stack ? { item: stack } : { item: undefined }) } };
    });
  }

  private isPot(id: string): boolean {
    return id === 'minecraft:decorated_pot' || blockCapability(this.library.get(id), 'block-entity')?.entityKind === 'decorated-pot';
  }
}
