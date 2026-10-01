import { migrateProject } from '../../domain/migrations';
import { DEFAULT_MINECRAFT_VERSION, ProjectDocument } from '../../domain/project.types';
import { normalizeStructureModeForSize } from '../../domain/structure-size-policy';
import { ProjectStore, ProjectSummary } from './project-store.port';

const DATABASE_NAME = 'minecraft-builder';
const DATABASE_VERSION = 5;
const PROJECTS_STORE = 'projects';
const PROJECT_SUMMARIES_STORE = 'project-summaries';
const RECOVERY_STORE = 'recovery-snapshots';

interface StoredProject { readonly id: string; readonly name: string; readonly minecraftVersion?: string; readonly updatedAt: string; readonly document: ProjectDocument; }

export function projectSummaryFromStoredRecord(record: Pick<StoredProject, 'id' | 'name' | 'minecraftVersion' | 'updatedAt'> & Partial<Pick<ProjectSummary, 'size' | 'structureMode'>> & { readonly document?: ProjectDocument }): ProjectSummary {
  const migrated = record.document ? migrateProject(record.document) : undefined;
  const size = migrated?.size ?? record.size;
  const storedMode = migrated?.structureMode ?? record.structureMode;
  const structureMode = size && storedMode ? normalizeStructureModeForSize(size, storedMode) : undefined;
  if (!size || !structureMode) throw new Error('Stored project summary is missing size or structure mode');
  return { id: record.id, name: record.name, minecraftVersion: record.minecraftVersion ?? migrated?.metadata.minecraftVersion ?? DEFAULT_MINECRAFT_VERSION, size, structureMode, updatedAt: record.updatedAt };
}

export class IndexedDbProjectStore implements ProjectStore {
  private readonly database: Promise<IDBDatabase>;
  constructor(databaseName = DATABASE_NAME) { this.database = openDatabase(databaseName); }
  async create(project: ProjectDocument): Promise<void> { await this.writeProject(project, true); }
  async exists(id: string): Promise<boolean> {
    const database = await this.database;
    const key = await runRequest<IDBValidKey | undefined>(database, PROJECTS_STORE, 'readonly', (store) => store.getKey(id));
    return key !== undefined;
  }
  async open(id: string): Promise<ProjectDocument | undefined> { return this.read(PROJECTS_STORE, id); }
  async save(project: ProjectDocument): Promise<void> { await this.writeProject(project, false); }
  async delete(id: string): Promise<void> {
    const database = await this.database;
    await runTransaction(database, [PROJECTS_STORE, PROJECT_SUMMARIES_STORE, RECOVERY_STORE], 'readwrite', (transaction) => {
      transaction.objectStore(PROJECTS_STORE).delete(id);
      transaction.objectStore(PROJECT_SUMMARIES_STORE).delete(id);
      transaction.objectStore(RECOVERY_STORE).delete(id);
    });
  }
  async list(): Promise<readonly ProjectSummary[]> {
    const database = await this.database;
    const records = await readAll<ProjectSummary>(database, PROJECT_SUMMARIES_STORE);
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  async saveRecoverySnapshot(project: ProjectDocument): Promise<void> {
    const database = await this.database;
    await runRequest(database, RECOVERY_STORE, 'readwrite', (store) => store.put(toStoredProject(project)));
  }
  async openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> { return this.read(RECOVERY_STORE, id); }
  async deleteRecoverySnapshot(id: string): Promise<void> {
    const database = await this.database;
    await runRequest(database, RECOVERY_STORE, 'readwrite', (store) => store.delete(id));
  }
  private async writeProject(project: ProjectDocument, requireAbsent: boolean): Promise<void> {
    const database = await this.database;
    const normalized = migrateProject(project);
    const document = toStoredProject(normalized);
    await runTransaction(database, [PROJECTS_STORE, PROJECT_SUMMARIES_STORE], 'readwrite', (transaction) => {
      const projects = transaction.objectStore(PROJECTS_STORE);
      if (requireAbsent) projects.add(document); else projects.put(document);
      transaction.objectStore(PROJECT_SUMMARIES_STORE).put(toSummary(normalized));
    });
  }
  private async read(storeName: string, id: string): Promise<ProjectDocument | undefined> {
    const database = await this.database;
    const record = await runRequest<StoredProject | undefined>(database, storeName, 'readonly', (store) => store.get(id));
    return record ? migrateProject(record.document) : undefined;
  }
}

function toStoredProject(project: ProjectDocument): StoredProject {
  const normalized = migrateProject(project);
  return { id: normalized.id, name: normalized.metadata.name, minecraftVersion: normalized.metadata.minecraftVersion, updatedAt: normalized.metadata.updatedAt, document: normalized };
}
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
      if (projects && summaries) {
        projects.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const record = cursor.value as StoredProject;
          const normalized = normalizeStoredProject(record);
          cursor.update(normalized);
          summaries.put(projectSummaryFromStoredRecord(normalized));
          cursor.continue();
        };
      }
      if (recovery) {
        recovery.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          cursor.update(normalizeStoredProject(cursor.value as StoredProject));
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function normalizeStoredProject(record: StoredProject): StoredProject {
  const document = migrateProject(record.document);
  return { ...record, name: document.metadata.name, minecraftVersion: document.metadata.minecraftVersion, updatedAt: document.metadata.updatedAt, document };
}

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
