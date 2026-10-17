import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import type { ItemSlotData } from '../../../../core/block-entities/item-display/item-container';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { InventoryStorageInspectorComponent } from './inventory-storage-inspector.component';

describe('InventoryStorageInspectorComponent slot labels', () => {
  let injector: EnvironmentInjector;
  let component: InventoryStorageInspectorComponent;
  let locale: 'en' | 'vi';

  beforeEach(() => {
    locale = 'en';
    const translations: Readonly<Record<string, Readonly<Record<'en' | 'vi', string>>>> = {
      inventorySlot: { en: 'Inventory slot', vi: 'Ô kho' },
      emptySlot: { en: 'Empty slot', vi: 'Ô trống' },
      itemCount: { en: 'Count', vi: 'Số lượng' },
    };
    injector = createEnvironmentInjector(
      [
        {
          provide: I18nService,
          useValue: { t: (key: string) => translations[key]?.[locale] ?? key },
        },
        {
          provide: ItemCatalogService,
          useValue: {
            get: (id: string) =>
              id === 'minecraft:diamond' ? { displayName: 'Diamond', maxStackSize: 64 } : undefined,
          },
        },
        { provide: StructureEditorService, useValue: {} },
      ],
      TestBed.inject(EnvironmentInjector),
    );
    component = runInInjectionContext(injector, () => new InventoryStorageInspectorComponent());
  });

  afterEach(() => {
    if (!injector.destroyed) injector.destroy();
  });

  it('announces the item name and count instead of hiding them behind the slot label', () => {
    const state = component as unknown as {
      slotAriaLabel: (slot: ItemSlotData) => string;
    };

    expect(state.slotAriaLabel({ slot: 4, stack: { id: 'minecraft:diamond', count: 64 } })).toBe(
      'Inventory slot 5, Diamond, Count 64',
    );
  });

  it('announces empty slots with localized names and preserves unknown item IDs', () => {
    const state = component as unknown as {
      slotAriaLabel: (slot: ItemSlotData) => string;
    };

    locale = 'vi';
    expect(state.slotAriaLabel({ slot: 2 })).toBe('Ô kho 3, Ô trống');
    locale = 'en';
    expect(state.slotAriaLabel({ slot: 0, stack: { id: 'example:unknown_gem', count: 2 } })).toBe(
      'Inventory slot 1, example:unknown_gem, Count 2',
    );
  });
});
