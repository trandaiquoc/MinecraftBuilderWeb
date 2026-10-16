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
  let library: { catalogRevision: WritableSignal<number>; get: ReturnType<typeof vi.fn> };
  let component: {
    issues: () => readonly {
      readonly key: string;
      readonly code: string;
      readonly title: string;
      readonly detail: string;
      readonly id?: string;
      readonly affectedBlocks: number;
    }[];
    visibleIssues: () => readonly { readonly id?: string }[];
    hasMoreIssues: () => boolean;
    severityGroupCounts: () => {
      readonly error: number;
      readonly warning: number;
      readonly info: number;
    };
    setQuery: (event: Event) => void;
    setSeverity: (event: Event) => void;
    setCategory: (event: Event) => void;
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
    library = {
      catalogRevision: signal(0),
      get: vi.fn((id: string) =>
        id === 'minecraft:stone' ? { visualSupport: 'real', behaviorSupport: 'full' } : undefined,
      ),
    };
    const assets = { status: signal('ready'), provider };
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
    TestBed.overrideComponent(ProjectDiagnosticsDialogComponent, { set: { template: '' } });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProjectDiagnosticsDialogComponent);
    component = fixture.componentInstance as unknown as typeof component;
    fixture.detectChanges();
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
    expect(component.visibleIssues()).toHaveLength(40);
    expect(component.hasMoreIssues()).toBe(true);
    expect(library.get).toHaveBeenCalledTimes(46);

    component.showMoreIssues();
    expect(component.visibleIssues()).toHaveLength(45);
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
