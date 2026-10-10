import { VoxelCoordinate } from '../../domain/project.types';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { isBlockLocked } from '../groups/group-membership';
import { BlockEntityEditTransaction } from './block-entity-edit-transaction';
import {
  defaultSignData,
  isSignDefinition,
  isSignId,
  signData,
  signLines,
} from '../../block-entities/sign/sign-block-entity';
import { isVanillaSignColor } from '../../block-entities/sign/sign-nbt';

export class SignBlockEntityEditor {
  constructor(
    private readonly transaction: BlockEntityEditTransaction,
    private readonly library: BlockLibraryService,
  ) {}

  defaultData(blockId: string): ReturnType<typeof defaultSignData> | undefined {
    return isSignDefinition(this.library.get(blockId)) || isSignId(blockId)
      ? defaultSignData()
      : undefined;
  }

  updateText(position: VoxelCoordinate, side: 'front' | 'back', value: string): boolean {
    return this.transaction.execute('Sign text edit', position, (project, block) => {
      if (
        (!isSignDefinition(this.library.get(block.id)) && !isSignId(block.id)) ||
        isBlockLocked(block, project.groups)
      )
        return undefined;
      const current = signData(block.blockEntityData);
      return {
        ...block,
        blockEntityData: { ...current, [side]: { ...current[side], lines: signLines(value) } },
      };
    });
  }

  updateAppearance(
    position: VoxelCoordinate,
    side: 'front' | 'back',
    patch: { readonly color?: string; readonly glowing?: boolean },
  ): boolean {
    return this.transaction.execute('Sign appearance edit', position, (project, block) => {
      if (
        (!isSignDefinition(this.library.get(block.id)) && !isSignId(block.id)) ||
        isBlockLocked(block, project.groups)
      )
        return undefined;
      const current = signData(block.blockEntityData);
      const target = current[side];
      const color = patch.color === undefined ? target.color : patch.color;
      if (!isVanillaSignColor(color)) return undefined;
      return {
        ...block,
        blockEntityData: {
          ...current,
          [side]: { ...target, color, glowing: patch.glowing ?? target.glowing },
        },
      };
    });
  }

  updateWaxed(position: VoxelCoordinate, waxed: boolean): boolean {
    return this.transaction.execute('Sign wax edit', position, (project, block) => {
      if (
        (!isSignDefinition(this.library.get(block.id)) && !isSignId(block.id)) ||
        isBlockLocked(block, project.groups)
      )
        return undefined;
      return { ...block, blockEntityData: { ...signData(block.blockEntityData), waxed } };
    });
  }
}
