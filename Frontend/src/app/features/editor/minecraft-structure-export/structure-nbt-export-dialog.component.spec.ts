import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { WorkspaceStateService } from '../../../core/workspace/workspace-state.service';
import { MinecraftStructureExportService } from '../../../core/persistence/minecraft-structure/minecraft-structure-export.service';
import { preflightStructureExport } from '../../../core/persistence/minecraft-structure/minecraft-structure-export.service';
import { StructureNbtExportDialogComponent } from './structure-nbt-export-dialog.component';
import type { ProjectDocument } from '../../../core/domain/project.types';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'export-project',
  metadata: { name: 'Cresselia Sanctuary', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 },
};

describe('StructureNbtExportDialogComponent', () => {
  it('renders live semantic resource and filename values in separate summary cards', () => {
    const workspace = { project: signal(project) };
    const exporter = {
      defaults: () => ({ namespace: 'minecraftbuilder', structurePath: 'cresselia-crescent-moonfall-sanctuary', archiveName: 'sanctuary', archiveFilename: 'sanctuary.zip', description: '' }),
      preflight: (mode: 'datapack' | 'standalone', form: { namespace: string; structurePath: string; archiveName: string; description: string }) => preflightStructureExport(project, mode, form),
      download: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [StructureNbtExportDialogComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: MinecraftStructureExportService, useValue: exporter },
      ],
    });
    const fixture = TestBed.createComponent(StructureNbtExportDialogComponent);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.summary-card');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('.tone-namespace')?.textContent).toContain('minecraftbuilder');
    expect(cards[0].querySelector('.tone-structure-path')?.textContent).toContain('cresselia-crescent-moonfall-sanctuary');
    expect(cards[0].querySelector('.tone-separator')?.textContent).toBe(':');
    expect(cards[1].querySelector('.tone-file')?.textContent).toContain('sanctuary');
    expect(cards[1].querySelector('.tone-extension')?.textContent).toBe('.zip');
  });

  it('updates semantic values from the live export form', () => {
    const workspace = { project: signal(project) };
    const exporter = {
      defaults: () => ({ namespace: 'minecraftbuilder', structurePath: 'sanctuary', archiveName: 'sanctuary', archiveFilename: 'sanctuary.zip', description: '' }),
      preflight: (mode: 'datapack' | 'standalone', form: { namespace: string; structurePath: string; archiveName: string; description: string }) => preflightStructureExport(project, mode, form),
      download: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [StructureNbtExportDialogComponent],
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: MinecraftStructureExportService, useValue: exporter },
      ],
    });
    const fixture = TestBed.createComponent(StructureNbtExportDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as { setField: (field: 'namespace' | 'structurePath' | 'archiveName' | 'description', event: Event) => void };
    component.setField('namespace', { target: { value: 'custom' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tone-namespace')?.textContent).toContain('custom');
  });
});
