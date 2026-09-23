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
      providers: [{ provide: I18nService, useValue: { t: (key: string) => ({ exportStructureJson: 'Export Structure JSON', exportStructureJsonDescription: 'Description', structureJsonProject: 'Project', structureJsonMinecraftVersion: 'Minecraft version', structureJsonBlockCount: 'Blocks', copyJson: 'Copy JSON', downloadJson: 'Download .json', copyExample: 'Copy Example', copyAiInstructions: 'Copy AI Instructions', structureJsonLimitations: 'Limitations', structureJsonPreview: 'Preview', cancel: 'Cancel' }[key] ?? key) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonExportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Export Structure JSON');
    expect(text).toContain('Copy JSON');
    expect(text).toContain('Copy Example');
    expect(text).not.toContain('Import Structure JSON');
    expect(fixture.nativeElement.querySelectorAll('button').length).toBeGreaterThan(3);
  });
});
