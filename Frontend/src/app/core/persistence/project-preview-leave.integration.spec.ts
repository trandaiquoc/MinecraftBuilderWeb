import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../domain/project.types';
import { AssetActivityService } from '../assets/asset-activity.service';
import { DialogService } from '../ui/dialog/dialog.service';
import { I18nService } from '../ui/localization/i18n.service';
import { IndexedDbProjectStore } from './project-store/indexeddb-project-store';
import { EditorLeaveCoordinator } from './editor-leave-coordinator.service';
import { ProjectAutosaveService } from './autosave/project-autosave.service';

const project: ProjectDocument = {
  schemaVersion: 3,
  id: 'cancelled-preview-project',
  metadata: {
    name: 'Cancelled preview',
    minecraftVersion: '1.21.1',
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
  },
  size: { x: 4, y: 4, z: 4 },
  structureMode: 'vanilla-structure-block',
  blocks: [],
  groups: [],
  decorations: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
};

async function createIndexedDbBlob(): Promise<Blob> {
  const moduleName = ['node', 'buffer'].join(':');
  const bufferModule = (await import(moduleName)) as { Blob: typeof Blob };
  return new bufferModule.Blob(['preview'], { type: 'image/webp' });
}

describe('project preview leave integration', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('does not write a preview to IndexedDB when the user cancels navigation', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const store = new IndexedDbProjectStore('cancelled-preview-navigation');
    await store.create(project);
    const preview = await createIndexedDbBlob();
    let stillDirty = true;
    const autosave = {
      get isUnsafeDirty(): boolean {
        return stillDirty;
      },
      flush: vi.fn(async () => undefined),
    };
    const dialogs = { confirm: vi.fn(async () => false) };
    const capture = vi.fn(async () => {
      await store.savePreview(project.id, project.metadata.updatedAt, preview);
    });

    await TestBed.configureTestingModule({
      providers: [
        EditorLeaveCoordinator,
        { provide: ProjectAutosaveService, useValue: autosave },
        { provide: AssetActivityService, useValue: { hasProtectedOperation: () => false } },
        { provide: DialogService, useValue: dialogs },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
      ],
    }).compileComponents();

    const coordinator = TestBed.inject(EditorLeaveCoordinator);
    coordinator.registerProjectPreviewCapture(capture);
    expect(await coordinator.canLeave()).toBe(false);
    stillDirty = false;

    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
    expect(await store.openPreview(project.id, project.metadata.updatedAt)).toBeUndefined();
  });
});
