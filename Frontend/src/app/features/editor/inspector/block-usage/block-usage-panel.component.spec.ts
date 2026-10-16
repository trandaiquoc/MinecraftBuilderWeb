import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

describe('BlockUsagePanelComponent', () => {
  let fixture: ComponentFixture<BlockUsagePanelComponent> | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    TestBed.resetTestingModule();
  });

  it('presents compact project metrics and selectable usage rows', async () => {
    const highlightedBlockId = signal<string | undefined>(undefined);
    const toggleHighlight = vi.fn();
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

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.usage-metrics')?.textContent).toContain('17');
    expect(root.querySelector('.usage-metrics')?.textContent).toContain('2');
    expect(root.querySelector('.usage-metrics')?.textContent).toContain('5');
    expect(root.querySelector('input[type="search"]')?.getAttribute('aria-label')).toBe(
      'searchBlockUsage',
    );
    expect(root.querySelectorAll('.usage-sort option')).toHaveLength(4);
    expect(root.querySelector('.usage-list')?.getAttribute('role')).toBe('list');

    const presentation = fixture.componentInstance as unknown as {
      usageRows: () => readonly { entry: { id: string; count: number } }[];
      toggleHighlight: (id: string) => void;
    };
    expect(presentation.usageRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entry: expect.objectContaining({ id: 'example:missing_block', count: 5 }),
        }),
      ]),
    );
    presentation.toggleHighlight('example:missing_block');
    expect(toggleHighlight).toHaveBeenCalledWith('example:missing_block');
    expect(clearHighlight).not.toHaveBeenCalled();
  });
});
