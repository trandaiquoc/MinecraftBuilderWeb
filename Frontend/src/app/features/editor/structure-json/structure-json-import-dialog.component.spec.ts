import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BlockLibraryService } from '../../../core/blocks/catalog/block-library.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { I18nService, supplementalTranslations } from '../../../core/ui/localization/i18n.service';
import { StructureJsonImportDialogComponent } from './structure-json-import-dialog.component';

const project: ProjectDocument = { schemaVersion: 3, id: 'project', metadata: { name: 'Import Demo', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' }, size: { x: 2, y: 2, z: 2 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 } };

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
});
