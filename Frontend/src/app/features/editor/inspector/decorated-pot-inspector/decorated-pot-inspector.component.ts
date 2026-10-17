import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import {
  DECORATED_POT_DEFAULT_SHERD,
  decoratedPotData,
  decoratedPotSherdIds,
  isDecoratedPotSherd,
} from '../../../../core/block-entities/decorated-pot/decorated-pot';
import type { PlacedBlock, VoxelCoordinate } from '../../../../core/domain/project.types';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ItemStackPickerComponent } from '../../../../shared/ui/item-stack-picker/item-stack-picker.component';
import {
  SearchableDropdownComponent,
  type SearchableDropdownOption,
} from '../../../../shared/ui/searchable-dropdown/searchable-dropdown.component';
import {
  validateItemStack,
  type ItemStackValidationCode,
} from '../../../../core/items/item-stack-validation';
import type { TranslationKey } from '../../../../core/ui/localization/translation-catalogs';

type PotSide = 'back' | 'left' | 'right' | 'front';

@Component({
  selector: 'app-decorated-pot-inspector',
  imports: [ItemStackPickerComponent, SearchableDropdownComponent],
  templateUrl: './decorated-pot-inspector.component.html',
  styleUrl: './decorated-pot-inspector.component.scss',
})
export class DecoratedPotInspectorComponent implements OnChanges {
  protected readonly i18n = inject(I18nService);
  protected readonly catalog = inject(ItemCatalogService);
  private readonly editor = inject(StructureEditorService);
  protected readonly countFeedback = signal<ItemStackValidationCode | undefined>(undefined);
  @Input({ required: true }) block!: PlacedBlock;
  @Input({ required: true }) position!: VoxelCoordinate;
  @Input() locked = false;
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['block'] || changes['position']) this.countFeedback.set(undefined);
  }
  protected data() {
    return decoratedPotData(this.block?.blockEntityData);
  }
  protected sherdOptions(): readonly SearchableDropdownOption[] {
    return [DECORATED_POT_DEFAULT_SHERD, ...decoratedPotSherdIds].map((id) => ({
      id,
      label: this.catalog.get(id)?.displayName ?? id,
      secondary: id,
    }));
  }
  protected sideLabel(side: PotSide): string {
    return this.i18n.t(
      (
        {
          back: 'potBack',
          left: 'potLeft',
          right: 'potRight',
          front: 'potFront',
        } as const satisfies Record<PotSide, TranslationKey>
      )[side],
    );
  }
  protected selectedSherd(side: PotSide): string {
    return this.data().decorations[side];
  }
  protected maxStackSize(): number | undefined {
    const item = this.data().item;
    return item ? this.catalog.get(item.id)?.maxStackSize : undefined;
  }
  protected selectSherd(side: PotSide, id: string): void {
    if (!this.locked && isDecoratedPotSherd(id))
      this.editor.updateDecoratedPotDecoration(this.position, side, id);
  }
  protected setItem(stack: ItemStackData | undefined): void {
    if (this.locked) return;
    this.countFeedback.set(undefined);
    this.editor.setDecoratedPotItem(this.position, stack);
  }
  protected countFeedbackText(): string {
    switch (this.countFeedback()) {
      case 'invalid-count':
        return this.i18n.t('inventoryCountPositiveInteger');
      case 'exceeds-max-stack-size': {
        const max = this.maxStackSize();
        return max === undefined
          ? this.i18n.t('invalid')
          : `${this.i18n.t('inventoryCountMaximum')} ${max}.`;
      }
      case 'unknown-max-stack-size':
        return this.i18n.t('inventoryCountUnknownMaximum');
      case undefined:
        return '';
      default:
        return this.i18n.t('invalid');
    }
  }
  protected changeCount(event: Event): void {
    const current = this.data().item;
    const count = Number((event.target as HTMLInputElement).value);
    if (!current || this.locked) return;
    const result = validateItemStack(
      { ...current, count },
      (id) => this.catalog.get(id)?.maxStackSize,
    );
    if (!result.valid) {
      this.countFeedback.set(result.code);
      return;
    }
    this.countFeedback.set(undefined);
    this.editor.setDecoratedPotItem(this.position, { ...current, count });
  }
  protected clearItem(): void {
    this.setItem(undefined);
  }
  protected hasRaw(): boolean {
    const raw = this.data().raw;
    return !!raw && Object.keys(raw).length > 0;
  }
}
