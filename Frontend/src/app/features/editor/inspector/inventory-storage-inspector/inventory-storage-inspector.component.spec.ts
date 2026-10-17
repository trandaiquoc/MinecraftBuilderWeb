import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import type { ItemStackData } from '../../../../core/items/item-stack.types';
import { ItemVisualService } from '../../../../core/items/catalog/item-visual.service';
import type { ItemSlotData } from '../../../../core/block-entities/item-display/item-container';
import type { VerifiedInventoryContainerSchema } from '../../../../core/block-entities/item-display/inventory-storage-schema';
import type { PlacedBlock, VoxelCoordinate } from '../../../../core/domain/project.types';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import type { VisibilityEvent } from '../../../../shared/ui/thumbnail-visibility/thumbnail-visibility.directive';
import { InventoryStorageInspectorComponent } from './inventory-storage-inspector.component';

interface VisualTestState {
  readonly status: 'idle' | 'available';
  readonly diagnostics: readonly string[];
  readonly generation: number;
  readonly info?: { readonly previewUrls: readonly string[] };
}

function createItemVisualServiceStub() {
  let currentState: VisualTestState = { status: 'idle', diagnostics: [], generation: 0 };
  return {
    revision: signal(0),
    state: () => currentState,
    request: vi.fn(async () => undefined),
    setState(state: VisualTestState): void {
      currentState = state;
    },
  };
}

describe('InventoryStorageInspectorComponent', () => {
  let injector: EnvironmentInjector;
  let component: InventoryStorageInspectorComponent;
  let locale: 'en' | 'vi';
  let visuals: ReturnType<typeof createItemVisualServiceStub>;
  let setBlockItemSlot: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    locale = 'en';
    visuals = createItemVisualServiceStub();
    setBlockItemSlot = vi.fn();
    const translations: Readonly<Record<string, Readonly<Record<'en' | 'vi', string>>>> = {
      inventorySlot: { en: 'Inventory slot', vi: 'Ô kho' },
      emptySlot: { en: 'Empty slot', vi: 'Ô trống' },
      itemCount: { en: 'Count', vi: 'Số lượng' },
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
        { provide: StructureEditorService, useValue: { setBlockItemSlot } },
        { provide: ItemVisualService, useValue: visuals },
      ],
      TestBed.inject(EnvironmentInjector),
    );
    component = runInInjectionContext(injector, () => new InventoryStorageInspectorComponent());
  });

  function prepareSelectedStack(stack: ItemStackData): void {
    const position: VoxelCoordinate = { x: 0, y: 0, z: 0 };
    component.position = position;
    component.block = {
      kind: 'resolved',
      id: 'minecraft:chest',
      namespace: 'minecraft',
      position,
      state: {},
      blockEntityData: {
        kind: 'item-container',
        hostKind: 'inventory-storage',
        slots: [{ slot: 0, stack }],
      },
    } satisfies PlacedBlock;
    component.schema = {
      blockId: 'minecraft:chest',
      nbtId: 'minecraft:chest',
      slotCount: 27,
      editable: true,
      nbtSupported: true,
    } satisfies VerifiedInventoryContainerSchema;
  }

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

  it('requests item thumbnails when populated slots enter view', () => {
    const state = component as unknown as {
      requestThumbnail: (slot: ItemSlotData, event: VisibilityEvent) => void;
    };
    const slot: ItemSlotData = { slot: 0, stack: { id: 'minecraft:diamond', count: 1 } };

    state.requestThumbnail(slot, { priority: 'prefetch' });
    expect(visuals.request).not.toHaveBeenCalled();

    state.requestThumbnail(slot, { priority: 'visible' });
    expect(visuals.request).toHaveBeenCalledOnce();
    expect(visuals.request).toHaveBeenCalledWith(slot.stack, 'normal');

    visuals.setState({ status: 'available', diagnostics: [], generation: 0 });
    state.requestThumbnail(slot, { priority: 'visible' });
    expect(visuals.request).toHaveBeenCalledOnce();
  });

  it('renders layered URLs from the shared item visual cache', () => {
    const state = component as unknown as {
      previewUrls: (stack: ItemStackData) => readonly string[] | undefined;
      thumbnailEpoch: () => number;
    };
    const stack = { id: 'minecraft:diamond', count: 1 };
    expect(state.previewUrls(stack)).toBeUndefined();
    visuals.setState({
      status: 'available',
      info: { previewUrls: ['diamond-base.png', 'diamond-overlay.png'] },
      diagnostics: [],
      generation: 0,
    });

    expect(state.previewUrls(stack)).toEqual(['diamond-base.png', 'diamond-overlay.png']);
    expect(state.thumbnailEpoch()).toBe(0);
    visuals.revision.update((value) => value + 1);
    expect(state.thumbnailEpoch()).toBe(1);
  });

  it('explains count validation failures and keeps invalid values out of the project', () => {
    const state = component as unknown as {
      changeCount: (event: Event) => void;
      countFeedbackText: () => string;
    };
    prepareSelectedStack({ id: 'minecraft:diamond', count: 1 });

    state.changeCount({ target: { value: '65' } } as unknown as Event);

    expect(state.countFeedbackText()).toBe('Maximum count: 64.');
    expect(setBlockItemSlot).not.toHaveBeenCalled();

    locale = 'vi';
    expect(state.countFeedbackText()).toBe('Số lượng tối đa: 64.');
    state.changeCount({ target: { value: '' } } as unknown as Event);
    expect(state.countFeedbackText()).toBe('Nhập số nguyên từ 1 trở lên.');
  });

  it('explains when an unknown item can only be stored as a single item', () => {
    const state = component as unknown as {
      changeCount: (event: Event) => void;
      countFeedbackText: () => string;
    };
    prepareSelectedStack({ id: 'example:unknown_gem', count: 1 });

    state.changeCount({ target: { value: '2' } } as unknown as Event);

    expect(state.countFeedbackText()).toBe(
      'Only one item is allowed because its stack limit is unknown.',
    );
    expect(setBlockItemSlot).not.toHaveBeenCalled();
  });

  it('commits valid counts through the existing editor operation', () => {
    const state = component as unknown as { changeCount: (event: Event) => void };
    prepareSelectedStack({ id: 'minecraft:diamond', count: 1 });

    state.changeCount({ target: { value: '32' } } as unknown as Event);

    expect(setBlockItemSlot).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 }, 0, {
      id: 'minecraft:diamond',
      count: 32,
    });
  });
});
