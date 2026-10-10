import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import {
  itemContainerData,
  type ItemSlotData,
} from '../../../../core/block-entities/item-display/item-container';
import type { VerifiedInventoryContainerSchema } from '../../../../core/block-entities/item-display/inventory-storage-schema';
import type { PlacedBlock, VoxelCoordinate } from '../../../../core/domain/project.types';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ItemStackPickerComponent } from '../../../../shared/ui/item-stack-picker/item-stack-picker.component';
import { validateItemStack } from '../../../../core/items/item-stack-validation';

@Component({
  selector: 'app-inventory-storage-inspector',
  imports: [ItemStackPickerComponent],
  templateUrl: './inventory-storage-inspector.component.html',
  styleUrl: './inventory-storage-inspector.component.scss',
})
export class InventoryStorageInspectorComponent implements OnChanges {
  protected readonly i18n = inject(I18nService);
  protected readonly catalog = inject(ItemCatalogService);
  private readonly editor = inject(StructureEditorService);
  protected readonly selectedSlot = signal(0);
  protected readonly countFeedback = signal('');
  @Input({ required: true }) block!: PlacedBlock;
  @Input({ required: true }) position!: VoxelCoordinate;
  @Input({ required: true }) schema!: VerifiedInventoryContainerSchema;
  @Input() locked = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['block'] || changes['position'] || changes['schema']) {
      const first = this.slots().find((entry) => entry.stack)?.slot ?? 0;
      this.selectedSlot.set(first);
      this.countFeedback.set('');
    }
  }

  protected slots(): readonly ItemSlotData[] {
    return itemContainerData(
      this.block?.blockEntityData,
      'inventory-storage',
      this.schema.slotCount,
    ).slots;
  }
  protected columns(): number {
    return this.schema.slotCount === 5 ? 5 : 9;
  }
  protected selectedEntry(): ItemSlotData | undefined {
    return this.slots().find((entry) => entry.slot === this.selectedSlot());
  }
  protected selectedStack(): ItemStackData | undefined {
    return this.selectedEntry()?.stack;
  }
  protected maxStackSize(): number | undefined {
    const stack = this.selectedStack();
    return stack ? this.catalog.get(stack.id)?.maxStackSize : undefined;
  }
  protected displayName(stack: ItemStackData | undefined): string {
    return stack ? (this.catalog.get(stack.id)?.displayName ?? stack.id) : this.i18n.t('emptySlot');
  }
  protected selectSlot(slot: number): void {
    this.selectedSlot.set(slot);
    this.countFeedback.set('');
  }
  protected setStack(stack: ItemStackData | undefined): void {
    if (this.locked) return;
    this.countFeedback.set('');
    this.editor.setBlockItemSlot(this.position, this.selectedSlot(), stack);
  }
  protected changeCount(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const current = this.selectedStack();
    if (!current || this.locked) return;
    const result = validateItemStack(
      { ...current, count: value },
      (id) => this.catalog.get(id)?.maxStackSize,
    );
    if (!result.valid) {
      this.countFeedback.set(result.code ?? 'invalid');
      return;
    }
    this.countFeedback.set('');
    this.editor.setBlockItemSlot(this.position, this.selectedSlot(), { ...current, count: value });
  }
  protected clearSelected(): void {
    this.setStack(undefined);
  }
  protected hasRaw(): boolean {
    const raw =
      this.block?.blockEntityData && typeof this.block.blockEntityData === 'object'
        ? (this.block.blockEntityData as Record<string, unknown>)['raw']
        : undefined;
    return !!raw && typeof raw === 'object' && Object.keys(raw).length > 0;
  }
}
