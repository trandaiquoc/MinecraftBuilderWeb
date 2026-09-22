import { Component, Input, inject } from '@angular/core';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import { itemContainerData } from '../../../../core/block-entities/item-display/item-container';
import type { BlockCapability } from '../../../../core/blocks/capabilities/block-capability.types';
import type { PlacedBlock, VoxelCoordinate } from '../../../../core/domain/project.types';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ItemStackPickerComponent } from '../../../../shared/ui/item-stack-picker/item-stack-picker.component';

type ItemHostCapability = Extract<BlockCapability, { kind: 'item-display' | 'item-storage-display' }>;

@Component({
  selector: 'app-item-display-inspector',
  imports: [ItemStackPickerComponent],
  templateUrl: './item-display-inspector.component.html',
  styleUrl: './item-display-inspector.component.scss',
})
export class ItemDisplayInspectorComponent {
  @Input({ required: true }) block!: PlacedBlock;
  @Input({ required: true }) position!: VoxelCoordinate;
  @Input({ required: true }) capability!: ItemHostCapability;
  protected readonly i18n = inject(I18nService);
  protected readonly catalog = inject(ItemCatalogService);
  private readonly editor = inject(StructureEditorService);
  protected slots() { return itemContainerData(this.block.blockEntityData, this.capability.kind, this.capability.slotCount).slots; }

  protected setSlot(slot: number, stack: ItemStackData | undefined): void { this.editor.setBlockItemSlot(this.position, slot, stack); }
}
