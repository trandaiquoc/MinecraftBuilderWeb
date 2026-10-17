import {
  EnvironmentInjector,
  SimpleChange,
  createEnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import type { PlacedBlock, VoxelCoordinate } from '../../../../core/domain/project.types';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { DecoratedPotInspectorComponent } from './decorated-pot-inspector.component';

describe('DecoratedPotInspectorComponent', () => {
  let injector: EnvironmentInjector;
  let component: DecoratedPotInspectorComponent;
  let locale: 'en' | 'vi';
  let setDecoratedPotItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    locale = 'en';
    setDecoratedPotItem = vi.fn();
    const translations: Readonly<Record<string, Readonly<Record<'en' | 'vi', string>>>> = {
      inventoryCountPositiveInteger: {
        en: 'Enter a whole number of at least 1.',
        vi: 'Nhập số nguyên từ 1 trở lên.',
      },
      inventoryCountMaximum: { en: 'Maximum count:', vi: 'Số lượng tối đa:' },
      inventoryCountUnknownMaximum: {
        en: 'Only one item is allowed because its stack limit is unknown.',
        vi: 'Chỉ có thể nhập 1 vật phẩm khi chưa biết giới hạn chồng vật phẩm.',
      },
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
        { provide: StructureEditorService, useValue: { setDecoratedPotItem } },
      ],
      TestBed.inject(EnvironmentInjector),
    );
    component = runInInjectionContext(injector, () => new DecoratedPotInspectorComponent());
  });

  afterEach(() => {
    if (!injector.destroyed) injector.destroy();
  });

  function prepareItem(item: ItemStackData): void {
    const position: VoxelCoordinate = { x: 0, y: 0, z: 0 };
    component.position = position;
    component.block = {
      kind: 'resolved',
      id: 'minecraft:decorated_pot',
      namespace: 'minecraft',
      position,
      state: {},
      blockEntityData: {
        kind: 'decorated-pot',
        decorations: {
          back: 'minecraft:brick',
          left: 'minecraft:brick',
          right: 'minecraft:brick',
          front: 'minecraft:brick',
        },
        item,
      },
    } satisfies PlacedBlock;
  }

  it('explains rejected counts in both supported locales', () => {
    const state = component as unknown as {
      changeCount: (event: Event) => void;
      countFeedbackText: () => string;
    };
    prepareItem({ id: 'minecraft:diamond', count: 1 });

    state.changeCount({ target: { value: '65' } } as unknown as Event);

    expect(state.countFeedbackText()).toBe('Maximum count: 64.');
    expect(setDecoratedPotItem).not.toHaveBeenCalled();

    locale = 'vi';
    expect(state.countFeedbackText()).toBe('Số lượng tối đa: 64.');
    state.changeCount({ target: { value: '' } } as unknown as Event);
    expect(state.countFeedbackText()).toBe('Nhập số nguyên từ 1 trở lên.');

    component.ngOnChanges({ block: new SimpleChange(undefined, component.block, true) });
    expect(state.countFeedbackText()).toBe('');
  });

  it('continues to save valid counts through the decorated pot editor operation', () => {
    const state = component as unknown as { changeCount: (event: Event) => void };
    prepareItem({ id: 'minecraft:diamond', count: 1 });

    state.changeCount({ target: { value: '32' } } as unknown as Event);

    expect(setDecoratedPotItem).toHaveBeenCalledWith(
      { x: 0, y: 0, z: 0 },
      {
        id: 'minecraft:diamond',
        count: 32,
      },
    );
  });
});
