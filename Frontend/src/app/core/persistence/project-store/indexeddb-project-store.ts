import { migrateProject } from '../../domain/migrations';
import { DEFAULT_MINECRAFT_VERSION, EditorSettings, ProjectDocument } from '../../domain/project.types';
import { normalizeStructureModeForSize } from '../../domain/structure-size-policy';
import { ProjectPersistenceMetadata, ProjectRecord, ProjectStore, ProjectSummary } from './project-store.port';

const DATABASE_NAME = 'minecraft-builder';
const DATABASE_VERSION = 6;
const PROJECTS_STORE = 'projects';
const PROJECT_SUMMARIES_STORE = 'project-summaries';
const RECOVERY_STORE = 'recovery-snapshots';
const EDITOR_SETTINGS_STORE = 'project-editor-settings';

type StoredProjectDocument = Omit<ProjectDocument, 'editorSettings'> & { readonly editorSettings?: EditorSettings };
interface StoredProject { readonly id: string; readonly name: string; readonly minecraftVersion?: string; readonly updatedAt: string; readonly document: StoredProjectDocument; readonly persistenceToken?: string; readonly persistedAt?: string; }
interface StoredEditorSettings { readonly id: string; readonly settings: EditorSettings; }

export function projectSummaryFromStoredRecord(record: Pick<StoredProject, 'id' | 'name' | 'minecraftVersion' | 'updatedAt'> & Partial<Pick<ProjectSummary, 'size' | 'structureMode'>> & { readonly document?: StoredProjectDocument }): ProjectSummary {
  const size = record.document?.size ?? record.size;
  const storedMode = record.document?.structureMode ?? record.structureMode;
  const structureMode = size && storedMode ? normalizeStructureModeForSize(size, storedMode) : undefined;
  if (!size || !structureMode) throw new Error('Stored project summary is missing size or structure mode');
  return { id: record.id, name: record.name, minecraftVersion: record.minecraftVersion ?? record.document?.metadata.minecraftVersion ?? DEFAULT_MINECRAFT_VERSION, size, structureMode, updatedAt: record.updatedAt };
}

export class IndexedDbProjectStore implements ProjectStore {
  private readonly database: Promise<IDBDatabase>;
  constructor(databaseName = DATABASE_NAME) { this.database = openDatabase(databaseName); }
  async create(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): Promise<void> { await this.writeProject(project, true, metadata); }
  async exists(id: string): Promise<boolean> {
    const database = await this.database;
    const key = await runRequest<IDBValidKey | undefined>(database, PROJECTS_STORE, 'readonly', (store) => store.getKey(id));
    return key !== undefined;
  }
  async open(id: string): Promise<ProjectDocument | undefined> { return this.read(PROJECTS_STORE, id); }
  async openRecord(id: string): Promise<ProjectRecord | undefined> { return this.readRecord(PROJECTS_STORE, id); }
  async save(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): Promise<void> { await this.writeProject(project, false, metadata); }
  async saveEditorSettings(projectId: string, settings: EditorSettings): Promise<void> {
    const database = await this.database;
    await runRequest(database, EDITOR_SETTINGS_STORE, 'readwrite', (store) => store.put({ id: projectId, settings } satisfies StoredEditorSettings));
  }
  async delete(id: string): Promise<void> {
    const database = await this.database;
    await runTransaction(database, [PROJECTS_STORE, PROJECT_SUMMARIES_STORE, RECOVERY_STORE, EDITOR_SETTINGS_STORE], 'readwrite', (transaction) => {
      transaction.objectStore(PROJECTS_STORE).delete(id);
      transaction.objectStore(PROJECT_SUMMARIES_STORE).delete(id);
      transaction.objectStore(RECOVERY_STORE).delete(id);
      transaction.objectStore(EDITOR_SETTINGS_STORE).delete(id);
    });
  }
  async list(): Promise<readonly ProjectSummary[]> {
    const database = await this.database;
    const records = await readAll<ProjectSummary>(database, PROJECT_SUMMARIES_STORE);
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  async saveRecoverySnapshot(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): Promise<void> {
    const database = await this.database;
    const normalized = migrateProject(project);
    await runTransaction(database, [RECOVERY_STORE, EDITOR_SETTINGS_STORE], 'readwrite', (transaction) => {
      transaction.objectStore(RECOVERY_STORE).put(toStoredProject(normalized, metadata));
      transaction.objectStore(EDITOR_SETTINGS_STORE).put(toStoredEditorSettings(normalized));
    });
  }
  async openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> { return this.read(RECOVERY_STORE, id); }
  async openRecoveryRecord(id: string): Promise<ProjectRecord | undefined> { return this.readRecord(RECOVERY_STORE, id, false); }
  async deleteRecoverySnapshot(id: string): Promise<void> {
    const database = await this.database;
    await runRequest(database, RECOVERY_STORE, 'readwrite', (store) => store.delete(id));
  }
  private async writeProject(project: ProjectDocument, requireAbsent: boolean, metadata?: ProjectPersistenceMetadata): Promise<void> {
    const database = await this.database;
    const normalized = migrateProject(project);
    const document = toStoredProject(normalized, metadata);
    await runTransaction(database, [PROJECTS_STORE, PROJECT_SUMMARIES_STORE, EDITOR_SETTINGS_STORE], 'readwrite', (transaction) => {
      const projects = transaction.objectStore(PROJECTS_STORE);
      if (requireAbsent) projects.add(document); else projects.put(document);
      transaction.objectStore(PROJECT_SUMMARIES_STORE).put(toSummary(normalized));
      transaction.objectStore(EDITOR_SETTINGS_STORE).put(toStoredEditorSettings(normalized));
    });
  }
  private async read(storeName: string, id: string): Promise<ProjectDocument | undefined> {
    return (await this.readRecord(storeName, id))?.project;
  }
  private async readRecord(storeName: string, id: string, migrate = true): Promise<ProjectRecord | undefined> {
    const database = await this.database;
    const [record, editorSettings] = await Promise.all([
      runRequest<StoredProject | undefined>(database, storeName, 'readonly', (store) => store.get(id)),
      runRequest<StoredEditorSettings | undefined>(database, EDITOR_SETTINGS_STORE, 'readonly', (store) => store.get(id)),
    ]);
    if (!record) return undefined;
    return { project: projectFromStoredRecord(record, editorSettings?.settings, migrate), metadata: { persistenceToken: record.persistenceToken, persistedAt: record.persistedAt } };
  }
}

function toStoredProject(project: ProjectDocument, metadata?: ProjectPersistenceMetadata): StoredProject {
  const normalized = migrateProject(project);
  const { editorSettings: _editorSettings, ...document } = normalized;
  return { id: normalized.id, name: normalized.metadata.name, minecraftVersion: normalized.metadata.minecraftVersion, updatedAt: normalized.metadata.updatedAt, document, ...metadata };
}
function toStoredEditorSettings(project: ProjectDocument): StoredEditorSettings { return { id: project.id, settings: project.editorSettings }; }
function toSummary(project: ProjectDocument): ProjectSummary {
  const normalized = migrateProject(project);
  return projectSummaryFromStoredRecord({ id: normalized.id, name: normalized.metadata.name, minecraftVersion: normalized.metadata.minecraftVersion, updatedAt: normalized.metadata.updatedAt, size: normalized.size, structureMode: normalized.structureMode });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this environment'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      const summaries = database.objectStoreNames.contains(PROJECT_SUMMARIES_STORE) ? request.transaction?.objectStore(PROJECT_SUMMARIES_STORE) : database.createObjectStore(PROJECT_SUMMARIES_STORE, { keyPath: 'id' });
      const projects = request.transaction?.objectStore(PROJECTS_STORE);
      const recovery = database.objectStoreNames.contains(RECOVERY_STORE) ? request.transaction?.objectStore(RECOVERY_STORE) : database.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
      const editorSettings = database.objectStoreNames.contains(EDITOR_SETTINGS_STORE) ? request.transaction?.objectStore(EDITOR_SETTINGS_STORE) : database.createObjectStore(EDITOR_SETTINGS_STORE, { keyPath: 'id' });
      if (projects && summaries) {
        projects.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const record = cursor.value as StoredProject;
          const normalized = normalizeStoredProject(record);
          const legacySettings = normalized.document.editorSettings;
          cursor.update(stripLegacyEditorSettings(normalized));
          if (legacySettings) editorSettings?.put({ id: record.id, settings: legacySettings } satisfies StoredEditorSettings);
          summaries.put(projectSummaryFromStoredRecord(normalized));
          cursor.continue();
        };
      }
      if (recovery) {
        recovery.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          cursor.update(stripLegacyEditorSettings(normalizeStoredProject(cursor.value as StoredProject)));
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function normalizeStoredProject(record: StoredProject): StoredProject {
  const legacySettings = record.document.editorSettings;
  const migrated = migrateProject({ ...record.document, editorSettings: legacySettings ?? DEFAULT_EDITOR_SETTINGS } as ProjectDocument);
  const document = legacySettings ? migrated : stripEditorSettings(migrated);
  return { ...record, name: document.metadata.name, minecraftVersion: document.metadata.minecraftVersion, updatedAt: document.metadata.updatedAt, document };
}

function projectFromStoredRecord(record: StoredProject, editorSettings: EditorSettings | undefined, shouldMigrate: boolean): ProjectDocument {
  const settings = editorSettings ?? record.document.editorSettings ?? DEFAULT_EDITOR_SETTINGS;
  const project = { ...record.document, editorSettings: settings } as ProjectDocument;
  return shouldMigrate ? migrateProject(project) : project;
}

function stripLegacyEditorSettings(record: StoredProject): StoredProject {
  return { ...record, document: stripEditorSettings(record.document as ProjectDocument) };
}

function stripEditorSettings(project: ProjectDocument): StoredProjectDocument {
  const { editorSettings: _editorSettings, ...document } = project;
  return document;
}

const DEFAULT_EDITOR_SETTINGS: EditorSettings = { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 };

function runRequest<T>(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    request.onsuccess = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function runTransaction(database: IDBDatabase, stores: readonly string[], mode: IDBTransactionMode, operation: (transaction: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(stores as string[], mode);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    try { operation(transaction); } catch (error) { transaction.abort(); reject(error); }
  });
}

function readAll<T>(database: IDBDatabase, storeName: string): Promise<T[]> { return runRequest<T[]>(database, storeName, 'readonly', (store) => store.getAll()); }
