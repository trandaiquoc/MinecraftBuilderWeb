import { TestBed } from '@angular/core/testing';
import { InteractivityChecker } from '@angular/cdk/a11y';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ProjectDocument } from '../../../../core/domain/project.types';
import { StructureJsonExportDialogComponent } from './structure-json-export-dialog.component';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'project-id',
  metadata: { name: 'Export Demo', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size: { x: 2, y: 2, z: 2 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
};

describe('StructureJsonExportDialogComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exposes the export actions without adding an import action', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonExportDialogComponent],
      providers: [
        {
          provide: I18nService,
          useValue: {
            t: (key: string) =>
              ({
                exportStructureJson: 'Export Structure JSON',
                exportStructureJsonDescription: 'Description',
                structureJsonInfo: 'Structure info',
                structureJsonProject: 'Project',
                structureJsonMinecraftVersion: 'Minecraft version',
                structureJsonBlockCount: 'Blocks',
                structureJsonFormat: 'Format',
                structureJsonTab: 'Structure JSON',
                structureJsonSaved: 'Saved',
                structureJsonDirty: 'Unsaved changes',
                structureJsonDiscardChanges: 'Discard changes',
                structureJsonSaveChanges: 'Save changes',
                copyJson: 'Copy JSON',
                downloadJson: 'Download .json',
                structureJsonLimitations: 'Limitations',
                structureJsonCopySuccess: 'Copied',
                structureJsonCopyFailed: 'Failed',
                cancel: 'Cancel',
              })[key] ?? key,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonExportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Export Structure JSON');
    expect(text).toContain('Copy JSON');
    expect(text).toContain('Structure JSON');
    expect(text).not.toContain('Preview');
    expect(text).not.toContain('Import Structure JSON');
    expect(fixture.nativeElement.querySelectorAll('button').length).toBeGreaterThan(3);
    const tabs = fixture.nativeElement.querySelectorAll(
      '[role="tab"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(tabs.length).toBe(1);
  });

  it('keeps draft and saved JSON separate and guards only dirty downloads', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonExportDialogComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => key } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonExportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as {
      draftJson: () => string;
      savedJson: () => string;
      dirty: () => boolean;
      setDraftJson: (value: string) => void;
      saveChanges: () => boolean;
      discardChanges: () => void;
      download: () => void;
      downloadGuardOpen: () => boolean;
    };
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

  it('moves focus into the dirty-download guard and restores it when canceled', async () => {
    await TestBed.configureTestingModule({
      imports: [StructureJsonExportDialogComponent],
      providers: [{ provide: I18nService, useValue: { t: (key: string) => key } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StructureJsonExportDialogComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(InteractivityChecker), 'isVisible').mockReturnValue(true);

    const instance = fixture.componentInstance as unknown as {
      draftJson: () => string;
      setDraftJson: (value: string) => void;
      download: () => void;
    };
    const download = fixture.nativeElement.querySelector(
      '.structure-json-footer .ui-button--primary',
    ) as HTMLButtonElement;
    download.focus();
    instance.setDraftJson(`${instance.draftJson()} `);
    instance.download();
    fixture.detectChanges();

    const guard = fixture.nativeElement.querySelector('.download-guard') as HTMLElement;
    const cancel = guard.querySelector('button') as HTMLButtonElement;
    expect(guard.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(cancel);

    cancel.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.download-guard')).toBeNull();
    expect(document.activeElement).toBe(download);
    fixture.destroy();
  });
});
