import { Component, Input, inject } from '@angular/core';
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
import { validateItemStack } from '../../../../core/items/item-stack-validation';
import type { TranslationKey } from '../../../../core/ui/localization/translation-catalogs';

type PotSide = 'back' | 'left' | 'right' | 'front';

@Component({
  selector: 'app-decorated-pot-inspector',
  imports: [ItemStackPickerComponent, SearchableDropdownComponent],
  templateUrl: './decorated-pot-inspector.component.html',
  styleUrl: './decorated-pot-inspector.component.scss',
})
export class DecoratedPotInspectorComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly catalog = inject(ItemCatalogService);
  private readonly editor = inject(StructureEditorService);
  @Input({ required: true }) block!: PlacedBlock;
  @Input({ required: true }) position!: VoxelCoordinate;
  @Input() locked = false;
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
    if (!this.locked) this.editor.setDecoratedPotItem(this.position, stack);
  }
  protected changeCount(event: Event): void {
    const current = this.data().item;
    const count = Number((event.target as HTMLInputElement).value);
    if (
      !current ||
      this.locked ||
      !validateItemStack({ ...current, count }, (id) => this.catalog.get(id)?.maxStackSize).valid
    )
      return;
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
