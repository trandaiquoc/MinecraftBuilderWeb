import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import { VanillaAssetProvider } from '../../../../core/assets/vanilla/vanilla-asset-provider';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ProjectDiagnosticsDialogComponent } from './project-diagnostics-dialog.component';

const project = (id: string): ProjectDocument => ({
  schemaVersion: 3,
  id,
  metadata: { name: id, minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 8, y: 8, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [
    {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: {},
    },
    {
      kind: 'resolved',
      id: 'example:unknown',
      namespace: 'example',
      position: { x: 1, y: 0, z: 0 },
      state: {},
    },
  ],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
});

describe('ProjectDiagnosticsDialogComponent', () => {
  let workspace: WorkspaceStateService;
  let locale: WritableSignal<'en' | 'vi'>;
  let provider: WritableSignal<VanillaAssetProvider | undefined>;
  let assetStatus: WritableSignal<string>;
  let library: { catalogRevision: WritableSignal<number>; get: ReturnType<typeof vi.fn> };
  let component: {
    issues: () => readonly {
      readonly key: string;
      readonly code: string;
      readonly category: string;
      readonly severity: string;
      readonly title: string;
      readonly detail: string;
      readonly id?: string;
      readonly affectedBlocks: number;
    }[];
    primaryIssues: () => readonly { readonly code: string }[];
    compatibilityIssues: () => readonly { readonly code: string }[];
    visiblePrimaryIssues: () => readonly { readonly code: string }[];
    visibleCompatibilityIssues: () => readonly { readonly code: string }[];
    compatibilityDetailsExpanded: () => boolean;
    compatibilityIssueGroupCount: () => number;
    compatibilityAffectedBlockCount: () => number;
    filteredAffectedBlockCount: () => number;
    issueGroupCount: () => number;
    hasMoreIssues: () => boolean;
    severityGroupCounts: () => {
      readonly error: number;
      readonly warning: number;
      readonly info: number;
    };
    setQuery: (event: Event) => void;
    setSeverity: (event: Event) => void;
    setCategory: (event: Event) => void;
    toggleCompatibilityDetails: () => void;
    showMoreIssues: () => void;
    runAudit: () => Promise<void>;
    auditing: () => boolean;
    audit: () => unknown;
  };
  let fixture: ComponentFixture<ProjectDiagnosticsDialogComponent>;

  beforeEach(async () => {
    workspace = new WorkspaceStateService();
    workspace.publishProject(project('first'));
    locale = signal<'en' | 'vi'>('en');
    provider = signal(new VanillaAssetProvider('audit-fixture', {}, new Map()));
    assetStatus = signal('ready');
    library = {
      catalogRevision: signal(0),
      get: vi.fn((id: string) => {
        if (id === 'minecraft:stone') return { visualSupport: 'real', behaviorSupport: 'full' };
        if (id === 'example:partial') {
          return { visualSupport: 'partial', behaviorSupport: 'partial' };
        }
        if (id === 'minecraft:trapped_chest') {
          return { visualSupport: 'real', behaviorSupport: 'unknown' };
        }
        return undefined;
      }),
    };
    const assets = { status: assetStatus, provider };
    TestBed.configureTestingModule({
      imports: [ProjectDiagnosticsDialogComponent],
      providers: [
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: BlockLibraryService, useValue: library },
        { provide: ContentAssetRuntimeService, useValue: assets },
        {
          provide: I18nService,
          useValue: { t: (key: string) => `${locale()}:${key}` },
        },
      ],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProjectDiagnosticsDialogComponent);
    component = fixture.componentInstance as unknown as typeof component;
    fixture.detectChanges();
  });

  it('focuses the dialog title instead of the close control on open', () => {
    const dialog = fixture.nativeElement.querySelector('.tool-dialog');
    const title = fixture.nativeElement.querySelector('#project-diagnostics-title');
    const close = fixture.nativeElement.querySelector('.ui-close-button');

    expect(dialog.getAttribute('aria-labelledby')).toBe('project-diagnostics-title');
    expect(dialog.hasAttribute('autofocus')).toBe(false);
    expect(title.tabIndex).toBe(-1);
    expect(title.hasAttribute('cdkfocusinitial')).toBe(true);
    expect(close.hasAttribute('cdkfocusinitial')).toBe(false);
  });

  it('filters the collected project report without rescanning blocks for each query', () => {
    expect(component.issues().map((issue) => issue.id)).toEqual(['example:unknown']);
    expect(library.get).toHaveBeenCalledTimes(2);

    component.setQuery({ target: { value: 'not-found' } } as unknown as Event);
    expect(component.issues()).toEqual([]);
    component.setQuery({ target: { value: 'unknown' } } as unknown as Event);
    expect(component.issues().map((issue) => issue.id)).toEqual(['example:unknown']);

    expect(library.get).toHaveBeenCalledTimes(2);
  });

  it('announces filtered issue and affected-block counts through a polite status', () => {
    const status = fixture.nativeElement.querySelector('[role="status"]');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent.replace(/\s+/g, ' ').trim()).toContain(
      '1 en:diagnosticsIssueGroup; 1 en:diagnosticsAffectedBlock',
    );

    component.setQuery({ target: { value: 'not-found' } } as unknown as Event);
    fixture.detectChanges();

    expect(component.filteredAffectedBlockCount()).toBe(0);
    expect(status.textContent.trim()).toBe('en:diagnosticsEmpty');
  });

  it('updates localized issue messages without rescanning project content', () => {
    expect(component.issues()[0].detail).toBe('en:diagnosticsUnresolvedText');
    expect(library.get).toHaveBeenCalledTimes(2);
    const identity = component.issues()[0].key;

    locale.set('vi');
    fixture.detectChanges();

    expect(component.issues()[0].detail).toBe('vi:diagnosticsUnresolvedText');
    expect(component.issues()[0].key).toBe(identity);
    expect(library.get).toHaveBeenCalledTimes(2);
  });

  it('keeps actionable findings visible and collapses compatibility details by default', () => {
    const baseBlock = project('base').blocks[0];
    workspace.publishProject({
      ...project('diagnostics-contract'),
      blocks: [
        { ...baseBlock, kind: 'missing', id: 'example:missing', namespace: 'example' },
        { ...baseBlock, id: 'example:partial', namespace: 'example' },
        { ...baseBlock, id: 'minecraft:trapped_chest', namespace: 'minecraft' },
        { ...baseBlock, id: 'example:unknown', namespace: 'example' },
      ],
    });
    assetStatus.set('unavailable');
    fixture.detectChanges();

    expect(component.compatibilityDetailsExpanded()).toBe(false);
    expect(component.primaryIssues().map((issue) => issue.code)).toEqual([
      'missing-content',
      'unresolved-content',
      'assets-unavailable',
    ]);
    expect(component.compatibilityIssues().map((issue) => issue.code)).toEqual([
      'visual-support-partial',
      'behavior-support-partial',
      'behavior-support-unknown',
    ]);
    expect(component.visiblePrimaryIssues().map((issue) => issue.code)).toEqual(
      component.primaryIssues().map((issue) => issue.code),
    );
    expect(component.issueGroupCount()).toBe(6);
    expect(component.compatibilityIssueGroupCount()).toBe(3);
    expect(component.compatibilityAffectedBlockCount()).toBe(3);
    expect(
      fixture.nativeElement.querySelectorAll('#diagnostics-compatibility-issues .issue'),
    ).toHaveLength(0);

    component.toggleCompatibilityDetails();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('#diagnostics-compatibility-issues .issue'),
    ).toHaveLength(3);
  });

  it('opens compatibility details for search and filters without rescanning project content', () => {
    const baseBlock = project('base').blocks[0];
    workspace.publishProject({
      ...project('diagnostics-filters'),
      blocks: [
        { ...baseBlock, id: 'example:partial', namespace: 'example' },
        { ...baseBlock, id: 'minecraft:trapped_chest', namespace: 'minecraft' },
        { ...baseBlock, id: 'example:unknown', namespace: 'example' },
      ],
    });
    fixture.detectChanges();
    component.issues();
    const lookupsAfterCollection = library.get.mock.calls.length;

    expect(component.compatibilityDetailsExpanded()).toBe(false);
    component.setQuery({ target: { value: 'example:unknown' } } as unknown as Event);
    expect(component.issues().map((issue) => issue.code)).toEqual(['unresolved-content']);
    expect(component.compatibilityDetailsExpanded()).toBe(false);
    expect(library.get).toHaveBeenCalledTimes(lookupsAfterCollection);

    component.setQuery({ target: { value: 'trapped_chest' } } as unknown as Event);
    expect(component.compatibilityDetailsExpanded()).toBe(true);
    expect(component.visibleCompatibilityIssues().map((issue) => issue.code)).toEqual([
      'behavior-support-unknown',
    ]);
    expect(library.get).toHaveBeenCalledTimes(lookupsAfterCollection);

    component.setQuery({ target: { value: '' } } as unknown as Event);
    component.toggleCompatibilityDetails();
    expect(component.compatibilityDetailsExpanded()).toBe(false);
    component.setCategory({ target: { value: 'visual' } } as unknown as Event);
    expect(component.compatibilityDetailsExpanded()).toBe(true);
    expect(component.issues().map((issue) => issue.code)).toEqual(['visual-support-partial']);
    expect(library.get).toHaveBeenCalledTimes(lookupsAfterCollection);

    component.toggleCompatibilityDetails();
    component.setSeverity({ target: { value: 'warning' } } as unknown as Event);
    expect(component.compatibilityDetailsExpanded()).toBe(true);
    expect(library.get).toHaveBeenCalledTimes(lookupsAfterCollection);
  });

  it('groups repeated findings, filters them, and pages unique issue groups', () => {
    library.get.mockClear();
    const baseBlock = project('base').blocks[0];
    workspace.publishProject({
      ...project('many'),
      blocks: Array.from({ length: 100 }, () => ({ ...baseBlock, id: 'example:unknown' })),
    });
    fixture.detectChanges();

    expect(component.issues()).toHaveLength(1);
    expect(component.issues()[0]).toMatchObject({
      code: 'unresolved-content',
      id: 'example:unknown',
      affectedBlocks: 100,
    });
    expect(component.severityGroupCounts()).toEqual({ error: 1, warning: 0, info: 0 });
    expect(library.get).toHaveBeenCalledTimes(1);

    workspace.publishProject({
      ...project('many-unique'),
      blocks: Array.from({ length: 45 }, (_, index) => ({
        ...baseBlock,
        id: `example:unknown_${index}`,
      })),
    });
    fixture.detectChanges();

    expect(component.issues()).toHaveLength(45);
    expect(component.severityGroupCounts()).toEqual({ error: 45, warning: 0, info: 0 });
    expect(component.visiblePrimaryIssues()).toHaveLength(40);
    expect(component.hasMoreIssues()).toBe(true);
    expect(library.get).toHaveBeenCalledTimes(46);

    component.showMoreIssues();
    expect(component.visiblePrimaryIssues()).toHaveLength(45);
    expect(component.hasMoreIssues()).toBe(false);
    component.setSeverity({ target: { value: 'warning' } } as unknown as Event);
    expect(component.issues()).toEqual([]);
    expect(component.severityGroupCounts()).toEqual({ error: 45, warning: 0, info: 0 });
    expect(library.get).toHaveBeenCalledTimes(46);
  });

  it('aborts and ignores an asset audit result after the project scope changes', async () => {
    const audit = component.runAudit();

    workspace.publishProject(project('second'));
    fixture.detectChanges();
    expect(component.auditing()).toBe(false);

    await audit;
    expect(component.audit()).toBeUndefined();
  });

  it('aborts and ignores an asset audit result after the provider changes', async () => {
    const audit = component.runAudit();

    provider.set(new VanillaAssetProvider('next-audit-fixture', {}, new Map()));
    fixture.detectChanges();
    expect(component.auditing()).toBe(false);

    await audit;
    expect(component.audit()).toBeUndefined();
  });
});
