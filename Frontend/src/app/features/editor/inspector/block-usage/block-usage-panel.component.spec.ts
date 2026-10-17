import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { BlockUsageHighlightService } from '../../../../core/editor/state/block-usage-highlight.service';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { BlockUsagePanelComponent } from './block-usage-panel.component';

const project = {
  schemaVersion: 3,
  id: 'usage-panel-test',
  metadata: { name: 'Usage panel', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 17, y: 1, z: 1 },
  structureMode: 'vanilla-structure-block',
  blocks: Array.from({ length: 17 }, (_, x) => ({
    kind: 'resolved' as const,
    id: 'minecraft:stone',
    namespace: 'minecraft',
    position: { x, y: 0, z: 0 },
    state: {},
  })),
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
} as ProjectDocument;

const usageEntries = [
  { id: 'minecraft:stone', namespace: 'minecraft', count: 12, resolvedCount: 12, missingCount: 0 },
  {
    id: 'example:missing_block',
    namespace: 'example',
    count: 5,
    resolvedCount: 0,
    missingCount: 5,
  },
];

let resizeCallbacks: (() => void)[] = [];
let disconnectObserver = vi.fn();

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(): void {
    resizeCallbacks.push(() => this.callback([], this as unknown as ResizeObserver));
  }

  unobserve(): void {}

  disconnect(): void {
    disconnectObserver();
  }
}

describe('BlockUsagePanelComponent', () => {
  let fixture: ComponentFixture<BlockUsagePanelComponent> | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('presents unified project metrics and selectable usage rows', async () => {
    resizeCallbacks = [];
    disconnectObserver = vi.fn();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const highlightedBlockId = signal<string | undefined>(undefined);
    const toggleHighlight = vi.fn((id: string) => {
      highlightedBlockId.set(highlightedBlockId() === id ? undefined : id);
    });
    const clearHighlight = vi.fn();

    await TestBed.configureTestingModule({
      imports: [BlockUsagePanelComponent],
      providers: [
        {
          provide: WorkspaceStateService,
          useValue: { project: signal(project) },
        },
        {
          provide: ProjectBlockRuntimeIndex,
          useValue: {
            usageRevision: signal(1),
            usageEntries: () => usageEntries,
            uniqueBlockIdCount: () => usageEntries.length,
            ensure: vi.fn(),
          },
        },
        {
          provide: BlockLibraryService,
          useValue: {
            catalogRevision: signal(1),
            itemForBlock: () => undefined,
            get: () => undefined,
          },
        },
        {
          provide: ContentAssetRuntimeService,
          useValue: {
            thumbnailEpoch: signal(0),
            thumbnailUrlForItem: () => undefined,
            requestItemThumbnail: vi.fn(),
          },
        },
        {
          provide: BlockUsageHighlightService,
          useValue: {
            highlightedBlockId,
            toggle: toggleHighlight,
            clear: clearHighlight,
          },
        },
        { provide: I18nService, useValue: { t: (key: string) => key, locale: () => 'en' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BlockUsagePanelComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const viewport = fixture.debugElement.query(By.directive(CdkVirtualScrollViewport))
      .componentInstance as CdkVirtualScrollViewport;
    const checkViewportSize = vi.spyOn(viewport, 'checkViewportSize');
    resizeCallbacks[0]?.();
    expect(resizeCallbacks).toHaveLength(1);
    expect(checkViewportSize).toHaveBeenCalled();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.usage-metrics')?.textContent).toContain('17');
    expect(root.querySelector('.usage-metrics')?.textContent).toContain('2');
    expect(root.querySelector('.usage-metrics')?.textContent).toContain('5');
    expect(root.querySelectorAll('.usage-metric')).toHaveLength(3);
    expect(root.querySelector('input[type="search"]')?.getAttribute('aria-label')).toBe(
      'searchBlockUsage',
    );
    expect(root.querySelectorAll('.usage-sort option')).toHaveLength(4);
    const usageList = root.querySelector<HTMLElement>('.usage-list');
    expect(usageList?.getAttribute('role')).toBe('listbox');
    expect(usageList?.getAttribute('tabindex')).toBe('0');
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-0');
    expect(usageList?.getAttribute('aria-keyshortcuts')).toBe(
      'ArrowDown ArrowUp Home End Enter Space',
    );
    expect(root.querySelector('#block-usage-keyboard-hint')?.textContent).toContain(
      'blockUsageKeyboardHint',
    );

    viewport.setRenderedRange({ start: 0, end: 1 });
    fixture.detectChanges();
    vi.spyOn(viewport, 'getRenderedRange').mockReturnValue({ start: 0, end: 1 });
    const scrollToIndex = vi.spyOn(viewport, 'scrollToIndex').mockImplementation((index) => {
      viewport.setRenderedRange({ start: index, end: index + 1 });
    });
    const endKey = new KeyboardEvent('keydown', {
      key: 'End',
      bubbles: true,
      cancelable: true,
    });
    usageList?.dispatchEvent(endKey);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(endKey.defaultPrevented).toBe(true);
    expect(scrollToIndex).toHaveBeenCalledWith(1);
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-1');
    const activeOption = root.querySelector<HTMLElement>('#block-usage-option-1');
    expect(activeOption?.getAttribute('role')).toBe('option');
    expect(activeOption?.getAttribute('aria-posinset')).toBe('2');
    expect(activeOption?.getAttribute('aria-setsize')).toBe('2');
    expect(activeOption?.getAttribute('aria-label')).toContain('example:missing_block');

    const enterKey = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    usageList?.dispatchEvent(enterKey);
    expect(enterKey.defaultPrevented).toBe(true);
    expect(toggleHighlight).toHaveBeenCalledWith('example:missing_block');
    fixture.detectChanges();
    expect(activeOption?.getAttribute('aria-selected')).toBe('true');

    const spaceKey = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    usageList?.dispatchEvent(spaceKey);
    fixture.detectChanges();
    expect(spaceKey.defaultPrevented).toBe(true);
    expect(activeOption?.getAttribute('aria-selected')).toBe('false');

    const homeKey = new KeyboardEvent('keydown', {
      key: 'Home',
      bubbles: true,
      cancelable: true,
    });
    usageList?.dispatchEvent(homeKey);
    fixture.detectChanges();
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-0');

    const arrowUpKey = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    usageList?.dispatchEvent(arrowUpKey);
    fixture.detectChanges();
    expect(arrowUpKey.defaultPrevented).toBe(true);
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-0');

    const arrowDownKey = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    usageList?.dispatchEvent(arrowDownKey);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(arrowDownKey.defaultPrevented).toBe(true);
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-1');

    const search = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Block Usage search field was not rendered.');
    search.value = 'missing';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-0');
    expect(root.querySelector('#block-usage-option-0')?.getAttribute('aria-setsize')).toBe('1');

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const sort = root.querySelector<HTMLSelectElement>('.usage-sort select');
    if (!sort) throw new Error('Block Usage sort control was not rendered.');
    sort.value = 'name-asc';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(usageList?.getAttribute('aria-activedescendant')).toBe('block-usage-option-0');

    const presentation = fixture.componentInstance as unknown as {
      usageRows: () => readonly { entry: { id: string; count: number } }[];
      toggleHighlight: (id: string) => void;
      usageShare: (count: number) => number;
    };
    expect(presentation.usageRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entry: expect.objectContaining({ id: 'example:missing_block', count: 5 }),
        }),
      ]),
    );
    expect(presentation.usageShare(12)).toBeCloseTo((12 / 17) * 100);
    expect(presentation.usageShare(20)).toBe(100);
    expect(presentation.usageShare(-1)).toBe(0);
    presentation.toggleHighlight('example:missing_block');
    expect(toggleHighlight).toHaveBeenCalledWith('example:missing_block');
    expect(clearHighlight).not.toHaveBeenCalled();
    fixture.destroy();
    fixture = undefined;
    expect(disconnectObserver).toHaveBeenCalledOnce();
  });
});
