import { migrateProject } from '../../domain/migrations';
import { DEFAULT_MINECRAFT_VERSION, ProjectDocument } from '../../domain/project.types';
import { ProjectStore, ProjectSummary } from './project-store.port';

const DATABASE_NAME = 'minecraft-builder';
const DATABASE_VERSION = 3;
const PROJECTS_STORE = 'projects';
const PROJECT_SUMMARIES_STORE = 'project-summaries';
const RECOVERY_STORE = 'recovery-snapshots';

interface StoredProject { readonly id: string; readonly name: string; readonly minecraftVersion?: string; readonly updatedAt: string; readonly document: ProjectDocument; }

export function projectSummaryFromStoredRecord(record: Pick<StoredProject, 'id' | 'name' | 'minecraftVersion' | 'updatedAt'>): ProjectSummary {
  return { id: record.id, name: record.name, minecraftVersion: record.minecraftVersion ?? DEFAULT_MINECRAFT_VERSION, updatedAt: record.updatedAt };
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
    const document = toStoredProject(project);
    await runTransaction(database, [PROJECTS_STORE, PROJECT_SUMMARIES_STORE], 'readwrite', (transaction) => {
      const projects = transaction.objectStore(PROJECTS_STORE);
      if (requireAbsent) projects.add(document); else projects.put(document);
      transaction.objectStore(PROJECT_SUMMARIES_STORE).put(toSummary(project));
    });
  }
  private async read(storeName: string, id: string): Promise<ProjectDocument | undefined> {
    const database = await this.database;
    const record = await runRequest<StoredProject | undefined>(database, storeName, 'readonly', (store) => store.get(id));
    return record ? migrateProject(record.document) : undefined;
  }
}

function toStoredProject(project: ProjectDocument): StoredProject { return { id: project.id, name: project.metadata.name, minecraftVersion: project.metadata.minecraftVersion, updatedAt: project.metadata.updatedAt, document: project }; }
function toSummary(project: ProjectDocument): ProjectSummary { return projectSummaryFromStoredRecord({ id: project.id, name: project.metadata.name, minecraftVersion: project.metadata.minecraftVersion, updatedAt: project.metadata.updatedAt }); }

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
      if (projects && summaries) {
        projects.openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const record = cursor.value as StoredProject;
          summaries.put(projectSummaryFromStoredRecord(record));
          cursor.continue();
        };
      }
      if (!database.objectStoreNames.contains(RECOVERY_STORE)) database.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
  });
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
