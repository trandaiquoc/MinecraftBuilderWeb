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
  let provider: WritableSignal<VanillaAssetProvider | undefined>;
  let library: { catalogRevision: WritableSignal<number>; get: ReturnType<typeof vi.fn> };
  let component: {
    issues: () => readonly { readonly id?: string }[];
    setQuery: (event: Event) => void;
    runAudit: () => Promise<void>;
    auditing: () => boolean;
    audit: () => unknown;
  };
  let fixture: ComponentFixture<ProjectDiagnosticsDialogComponent>;

  beforeEach(async () => {
    workspace = new WorkspaceStateService();
    workspace.project.set(project('first'));
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
        { provide: I18nService, useValue: { t: (key: string) => key } },
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

  it('aborts and ignores an asset audit result after the project scope changes', async () => {
    const audit = component.runAudit();

    workspace.project.set(project('second'));
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
