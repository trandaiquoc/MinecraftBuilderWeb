import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BlockDefinition } from '../../../core/blocks/catalog/block-definition.types';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { HistoryService } from '../../../core/editor/history/history.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { SelectionService } from '../../../core/editor/selection/selection.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { DialogService } from '../../../core/ui/dialog/dialog.service';
import { I18nService, supplementalTranslations } from '../../../core/ui/localization/i18n.service';
import { StructureJsonImportDialogComponent } from './structure-json-import-dialog.component';

const project: ProjectDocument = { schemaVersion: 3, id: 'project', metadata: { name: 'Import Demo', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 2, y: 2, z: 2 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 } };
const stone: BlockDefinition = { id: 'minecraft:stone', namespace: 'minecraft', displayName: 'Stone', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'full', behaviorSupport: 'full', visualSupport: 'real', visualClassification: 'standard-json', defaultStateSource: 'authoritative-report' };

describe('StructureJsonImportDialogComponent', () => {
  it('supports editing, explicit validation, and stale preview clearing', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; preview: () => unknown };
    instance.setDraft('{');
    await instance.validate();
    expect(instance.preview()).toMatchObject({ structuralValid: false });
    instance.setDraft('{"format":"minecraftbuilder-structure","formatVersion":1,"minecraftVersion":"1.21.1","blocks":[]}');
    expect(instance.preview()).toBeUndefined();
    await instance.validate();
    expect(instance.preview()).toMatchObject({ structuralValid: true, totalBlocks: 0 });
  });

  it('translates structured diagnostic codes while keeping technical fields separate', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { reasonLabel: (issue: { reason: { code: string } }) => string };
    expect(instance.reasonLabel({ reason: { code: 'missing-block' } })).toBe('structureJsonReasonMissingBlock');
    expect(instance.reasonLabel({ reason: { code: 'out-of-bounds' } })).toBe('structureJsonReasonOutOfBounds');
    expect(instance.reasonLabel({ reason: { code: 'unsupported-state-value' } })).toBe('structureJsonReasonUnsupportedStateValue');
  });

  it('renders Vietnamese diagnostic reasons through the same reason-code mapping', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => (supplementalTranslations.vi as Record<string, string>)[key] ?? key } },
        { provide: BlockLibraryService, useValue: { get: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { reasonLabel: (issue: { reason: { code: string } }) => string };
    expect(instance.reasonLabel({ reason: { code: 'missing-block' } })).toBe(supplementalTranslations.vi.structureJsonReasonMissingBlock);
    expect(instance.reasonLabel({ reason: { code: 'out-of-bounds' } })).toBe(supplementalTranslations.vi.structureJsonReasonOutOfBounds);
    expect(instance.reasonLabel({ reason: { code: 'unsupported-state-value' } })).toBe(supplementalTranslations.vi.structureJsonReasonUnsupportedStateValue);
  });

  it('keeps Apply behind confirmation and records one history transaction', async () => {
    const initial: ProjectDocument = { ...project, blocks: [{ kind: 'resolved', id: stone.id, namespace: stone.namespace, position: { x: 1, y: 1, z: 1 }, state: {} }] };
    const dialogs = { confirm: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StructureJsonImportDialogComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: BlockLibraryService, useValue: { get: (id: string) => id === stone.id ? stone : undefined } },
        { provide: DialogService, useValue: dialogs },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(WorkspaceStateService); const history = TestBed.inject(HistoryService); const selection = TestBed.inject(SelectionService);
    workspace.project.set(initial); selection.select({ x: 1, y: 1, z: 1 });
    const fixture = TestBed.createComponent(StructureJsonImportDialogComponent);
    fixture.componentRef.setInput('project', initial); fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { setDraft: (value: string) => void; validate: () => Promise<void>; applyImport: () => Promise<void>; importPlan: () => { readonly applicable: boolean } | undefined };
    instance.setDraft(JSON.stringify({ format: 'minecraftbuilder-structure', formatVersion: 1, minecraftVersion: '1.21.1', blocks: [{ id: stone.id, x: 0, y: 0, z: 0 }] }));
    await instance.validate();
    expect(instance.importPlan()?.applicable).toBe(true);
    await instance.applyImport();
    expect(workspace.project()).toEqual(initial);
    await instance.applyImport();
    expect(workspace.project()?.blocks[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(selection.single()).toBeUndefined();
    expect(history.canUndo()).toBe(true);
    expect(dialogs.confirm).toHaveBeenCalledTimes(2);
  });
});
