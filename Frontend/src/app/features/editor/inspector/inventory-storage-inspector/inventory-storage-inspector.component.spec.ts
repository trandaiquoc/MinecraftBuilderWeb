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

describe('InventoryStorageInspectorComponent slot labels', () => {
  let injector: EnvironmentInjector;
  let component: InventoryStorageInspectorComponent;
  let locale: 'en' | 'vi';
  let visuals: ReturnType<typeof createItemVisualServiceStub>;

  beforeEach(() => {
    locale = 'en';
    visuals = createItemVisualServiceStub();
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
        { provide: ItemVisualService, useValue: visuals },
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
});
