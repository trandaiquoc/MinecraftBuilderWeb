import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { ProjectDocument } from '../../../core/domain/project.types';
import { StructureJsonExportDialogComponent } from './structure-json-export-dialog.component';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'project-id',
  metadata: { name: 'Export Demo', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 2, y: 2, z: 2 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
};

describe('StructureJsonExportDialogComponent', () => {
  it('exposes the export actions without adding an import action', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonExportDialogComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => ({ exportStructureJson: 'Export Structure JSON', exportStructureJsonDescription: 'Description', structureJsonInfo: 'Structure info', structureJsonProject: 'Project', structureJsonMinecraftVersion: 'Minecraft version', structureJsonBlockCount: 'Blocks', structureJsonFormat: 'Format', structureJsonTab: 'Structure JSON', structureJsonExampleTab: 'Example', structureJsonAiTab: 'AI Instructions', structureJsonSaved: 'Saved', structureJsonDirty: 'Unsaved changes', structureJsonDiscardChanges: 'Discard changes', structureJsonSaveChanges: 'Save changes', copyJson: 'Copy JSON', downloadJson: 'Download .json', copyExample: 'Copy Example', copyAiInstructions: 'Copy AI Instructions', structureJsonLimitations: 'Limitations', structureJsonCopySuccess: 'Copied', structureJsonCopyFailed: 'Failed', structureJsonAiInstructions: 'Instructions', cancel: 'Cancel' }[key] ?? key) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonExportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Export Structure JSON');
    expect(text).toContain('Copy JSON');
    expect(text).toContain('Example');
    expect(text).toContain('AI Instructions');
    expect(text).not.toContain('Preview');
    expect(text).not.toContain('Import Structure JSON');
    expect(fixture.nativeElement.querySelectorAll('button').length).toBeGreaterThan(3);
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    expect(tabs.length).toBe(3);
    tabs[1].click();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Copy Example');
  });

  it('keeps draft and saved JSON separate and guards only dirty downloads', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonExportDialogComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => key } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonExportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { draftJson: () => string; savedJson: () => string; dirty: () => boolean; setDraftJson: (value: string) => void; saveChanges: () => boolean; discardChanges: () => void; download: () => void; downloadGuardOpen: () => boolean };
    const initial = instance.savedJson();
    instance.setDraftJson('{');
    expect(instance.dirty()).toBe(true);
    expect(instance.saveChanges()).toBe(false);
    expect(instance.savedJson()).toBe(initial);
    instance.discardChanges();
    expect(instance.dirty()).toBe(false);
    instance.setDraftJson(`${initial} `);
    instance.download();
    expect(instance.downloadGuardOpen()).toBe(true);
  });
});
