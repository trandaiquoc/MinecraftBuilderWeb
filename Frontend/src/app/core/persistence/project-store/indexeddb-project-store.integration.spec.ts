import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { EditorSettings, ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { IndexedDbProjectStore } from './indexeddb-project-store';

const editorSettings: EditorSettings = {
  currentY: 3,
  layerVisibility: 'current-next',
  referenceLayerOpacity: 0.7,
};

function project(id: string, updatedAt: string): ProjectDocument {
  return {
    schemaVersion: 3,
    id,
    metadata: {
      name: `Project ${id}`,
      minecraftVersion: '1.21.1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt,
    },
    size: { x: 8, y: 8, z: 8 },
    structureMode: 'vanilla-structure-block',
    blocks: [],
    groups: [],
    decorations: [],
    editorSettings: { ...editorSettings },
  };
}

function legacyRecord(value: ProjectDocument): Record<string, unknown> {
  const { editorSettings: settings, ...document } = value;
  return {
    id: value.id,
    name: value.metadata.name,
    minecraftVersion: value.metadata.minecraftVersion,
    updatedAt: value.metadata.updatedAt,
    document: { ...document, editorSettings: settings },
  };
}

async function createIndexedDbBlob(content: string, type: string): Promise<Blob> {
  const moduleName = ['node', 'buffer'].join(':');
  const bufferModule = (await import(moduleName)) as { Blob: typeof Blob };
  return new bufferModule.Blob([content], { type });
}

function seedVersionSixDatabase(
  factory: IDBFactory,
  databaseName: string,
  records: {
    readonly projects: readonly Record<string, unknown>[];
    readonly recoveries: readonly Record<string, unknown>[];
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 6);
    request.onupgradeneeded = () => {
      const database = request.result;
      const projects = database.createObjectStore('projects', { keyPath: 'id' });
      database.createObjectStore('project-summaries', { keyPath: 'id' });
      const recoveries = database.createObjectStore('recovery-snapshots', { keyPath: 'id' });
      database.createObjectStore('project-editor-settings', { keyPath: 'id' });
      for (const record of records.projects) projects.put(record);
      for (const record of records.recoveries) recoveries.put(record);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to seed schema version 6'));
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

describe('IndexedDbProjectStore integration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('migrates schema version 6 project and recovery data without losing editor settings', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    const databaseName = 'project-store-schema-six-migration';
    const savedProject = project('saved-project', '2026-10-01T00:00:00.000Z');
    const recoveryProject = project('recovery-only', '2026-10-02T00:00:00.000Z');
    const recoveryForSavedProject = {
      ...project(savedProject.id, '2026-10-03T00:00:00.000Z'),
      editorSettings: { ...editorSettings, currentY: 7 },
    };
    await seedVersionSixDatabase(factory, databaseName, {
      projects: [legacyRecord(savedProject)],
      recoveries: [legacyRecord(recoveryProject), legacyRecord(recoveryForSavedProject)],
    });

    const store = new IndexedDbProjectStore(databaseName);
    const [summaries, migratedProject, recovery, recoveryForSaved] = await Promise.all([
      store.list(),
      store.openRecord(savedProject.id),
      store.openRecoveryRecord(recoveryProject.id),
      store.openRecoveryRecord(savedProject.id),
    ]);

    expect(summaries).toHaveLength(1);
    expect(migratedProject?.project.schemaVersion).toBe(3);
    expect(migratedProject?.project.editorSettings).toEqual(editorSettings);
    expect(recovery?.project.editorSettings).toEqual(editorSettings);
    expect(recoveryForSaved?.project.editorSettings).toEqual(editorSettings);
    expect(recovery?.project.metadata.updatedAt).toBe(recoveryProject.metadata.updatedAt);

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    expect(database.objectStoreNames.contains('project-previews')).toBe(true);
    database.close();
  });

  it('keeps previews revision-bound and project data, settings, recovery, and deletion in IndexedDB', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const store = new IndexedDbProjectStore('project-store-write-workflow');
    const initial = project('workflow-project', '2026-10-01T00:00:00.000Z');
    const preview = await createIndexedDbBlob('webp preview', 'image/webp');
    await store.create(initial, { persistenceToken: 'revision-one' });

    expect(await store.exists(initial.id)).toBe(true);
    expect((await store.open(initial.id))?.id).toBe(initial.id);
    expect((await store.list())[0]?.updatedAt).toBe(initial.metadata.updatedAt);
    await store.savePreview(initial.id, initial.metadata.updatedAt, preview);
    const storedPreview = await store.openPreview(initial.id, initial.metadata.updatedAt);
    expect(storedPreview?.type).toBe('image/webp');
    expect(await storedPreview?.text()).toBe('webp preview');
    expect(await store.open(initial.id)).not.toHaveProperty('preview');

    const saved = {
      ...initial,
      metadata: { ...initial.metadata, updatedAt: '2026-10-02T00:00:00.000Z' },
    };
    await store.save(saved, { persistenceToken: 'revision-two' });
    expect(await store.openPreview(initial.id, saved.metadata.updatedAt)).toBeUndefined();
    await store.savePreview(initial.id, initial.metadata.updatedAt, preview);
    expect(await store.openPreview(initial.id, saved.metadata.updatedAt)).toBeUndefined();

    const previewFirst = project('preview-first-race', '2026-10-01T00:00:00.000Z');
    const saveFirst = project('save-first-race', '2026-10-01T00:00:00.000Z');
    await Promise.all([store.create(previewFirst), store.create(saveFirst)]);
    const previewFirstSaved = {
      ...previewFirst,
      metadata: { ...previewFirst.metadata, updatedAt: '2026-10-02T00:00:00.000Z' },
    };
    const saveFirstSaved = {
      ...saveFirst,
      metadata: { ...saveFirst.metadata, updatedAt: '2026-10-02T00:00:00.000Z' },
    };
    await Promise.all([
      store.savePreview(previewFirst.id, previewFirst.metadata.updatedAt, preview),
      store.save(previewFirstSaved),
    ]);
    await Promise.all([
      store.save(saveFirstSaved),
      store.savePreview(saveFirst.id, saveFirst.metadata.updatedAt, preview),
    ]);
    expect(
      await store.openPreview(previewFirst.id, previewFirstSaved.metadata.updatedAt),
    ).toBeUndefined();
    expect(
      await store.openPreview(saveFirst.id, saveFirstSaved.metadata.updatedAt),
    ).toBeUndefined();

    const changedSettings = { ...editorSettings, currentY: 6 };
    await store.saveEditorSettings(initial.id, changedSettings);
    expect((await store.openRecord(initial.id))?.project.editorSettings).toEqual(changedSettings);

    const recovery = {
      ...saved,
      blocks: [
        {
          kind: 'missing' as const,
          id: 'example:unknown',
          namespace: 'example',
          position: { x: 1, y: 2, z: 3 },
          state: { variant: 'kept' },
        },
      ],
    };
    await store.saveRecoverySnapshot(recovery, { persistenceToken: 'recovery-two' });
    expect((await store.openRecoveryRecord(initial.id))?.project.blocks).toEqual(recovery.blocks);
    const workspace = new WorkspaceStateService();
    await workspace.restore(store, {
      getItem: () => initial.id,
      setItem: () => undefined,
    });
    expect(workspace.restoreStatus()).toBe('recovery-pending');
    await workspace.restoreRecovery();
    expect(workspace.project()?.blocks).toEqual(recovery.blocks);
    expect(await store.openRecoverySnapshot(initial.id)).toBeUndefined();

    await store.delete(initial.id);
    await store.delete(previewFirst.id);
    await store.delete(saveFirst.id);
    expect(await store.exists(initial.id)).toBe(false);
    expect(await store.list()).toEqual([]);
    expect(await store.openPreview(initial.id, saved.metadata.updatedAt)).toBeUndefined();
  });
});
